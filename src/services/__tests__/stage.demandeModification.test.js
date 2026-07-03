// Test d'intégration : createDemandeModification (suspension/annulation d'un
// stage en cours) et son évaluation — même cloisonnement par direction que les
// autres actions de stage, plus la règle métier la plus fragile ici : APPROUVER
// une demande doit faire basculer le stage vers LE BON statut selon le type
// (SUSPENSION → SUSPENDU, ANNULATION → ANNULE), jamais l'inverse.
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/stages/modifications/fake-path.pdf'),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage } = require('../../models');
const stageService = require('../stage.service');

const fauxFichier = { lettreManuscrite: [{ buffer: Buffer.from('pdf'), originalname: 'lettre.pdf', size: 3 }] };

const creerAgent = (directionId, overrides = {}) => Agent.create({
  direction_iddirection: directionId,
  nom: 'Agent', prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
  ...overrides,
});

const creerStage = async (direction, candidatId, overrides = {}) => Stage.create({
  candidats_idcandidats: candidatId,
  typeStage: 'SOUTENANCE',
  domaineStage: 'Développement web',
  dureeStage: 2,
  dateDebutSouhaitee: '2026-01-01',
  direction_iddirection: direction.iddirection,
  statusStage: 'EN_COURS',
  ...overrides,
});

beforeEach(async () => {
  await resetDb();
});

describe('createDemandeModification', () => {
  test('crée une demande de suspension pour un stage EN_COURS', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats);

    const demande = await stageService.createDemandeModification(candidat.idcandidats, stage.idstage, {
      type: 'SUSPENSION', motif: 'Raison médicale', dateDebut: '2026-02-01',
    }, fauxFichier);

    expect(demande.status).toBe('EN_ATTENTE');
    expect(demande.type).toBe('SUSPENSION');
  });

  test('refuse une suspension sur un stage qui n\'est pas EN_COURS', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, { statusStage: 'EN_ATTENTE' });

    await expect(
      stageService.createDemandeModification(candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier)
    ).rejects.toThrow('n\'est possible que pour un stage EN_COURS');
  });

  test('autorise une annulation pour un stage SUSPENDU (pas seulement EN_COURS)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, { statusStage: 'SUSPENDU' });

    const demande = await stageService.createDemandeModification(candidat.idcandidats, stage.idstage, {
      type: 'ANNULATION', motif: 'Un motif', dateDebut: '2026-02-01',
    }, fauxFichier);

    expect(demande.type).toBe('ANNULATION');
  });

  test('refuse une seconde demande tant qu\'une est en attente', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats);
    await stageService.createDemandeModification(candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier);

    await expect(
      stageService.createDemandeModification(candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier)
    ).rejects.toThrow('déjà en attente');
  });

  test('refuse sans lettre manuscrite', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats);

    await expect(
      stageService.createDemandeModification(candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, {})
    ).rejects.toThrow('La demande manuscrite est requise');
  });

  test('refuse l\'accès à un stage qui n\'appartient pas au candidat (IDOR)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidatProprietaire = await creerCandidat();
    const candidatAttaquant = await creerCandidat();
    const stage = await creerStage(direction, candidatProprietaire.idcandidats);

    await expect(
      stageService.createDemandeModification(candidatAttaquant.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier)
    ).rejects.toThrow('ne vous appartient pas');
  });
});

describe('annulerDemandeModification', () => {
  test('le candidat peut annuler sa propre demande EN_ATTENTE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats);
    const demande = await stageService.createDemandeModification(
      candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier
    );

    const result = await stageService.annulerDemandeModification(candidat.idcandidats, demande.id);

    expect(result.del).toBe(1);
  });

  test('refuse un candidat qui n\'est pas propriétaire de la demande (IDOR)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const proprietaire = await creerCandidat();
    const attaquant = await creerCandidat();
    const stage = await creerStage(direction, proprietaire.idcandidats);
    const demande = await stageService.createDemandeModification(
      proprietaire.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier
    );

    await expect(
      stageService.annulerDemandeModification(attaquant.idcandidats, demande.id)
    ).rejects.toThrow('Action non autorisée');
  });

  test('refuse l\'annulation d\'une demande déjà traitée', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const agent = await creerAgent(direction.iddirection);
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats);
    const demande = await stageService.createDemandeModification(
      candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier
    );
    await stageService.evaluerDemandeModification(demande.id, { status: 'APPROUVEE' }, agent.matricule, { agentId: agent.idagents, isSystemRole: false });

    await expect(
      stageService.annulerDemandeModification(candidat.idcandidats, demande.id)
    ).rejects.toThrow('Seules les demandes en attente peuvent être annulées');
  });
});

describe('evaluerDemandeModification', () => {
  test('APPROUVER une SUSPENSION fait passer le stage en SUSPENDU', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats);
    const demande = await stageService.createDemandeModification(candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier);
    const agent = await creerAgent(direction.iddirection);

    await stageService.evaluerDemandeModification(demande.id, { status: 'APPROUVEE' }, agent.matricule, { agentId: agent.idagents, isSystemRole: false });

    await stage.reload();
    expect(stage.statusStage).toBe('SUSPENDU');
  });

  test('APPROUVER une ANNULATION fait passer le stage en ANNULE (pas SUSPENDU)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, { statusStage: 'SUSPENDU' });
    const demande = await stageService.createDemandeModification(candidat.idcandidats, stage.idstage, { type: 'ANNULATION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier);
    const agent = await creerAgent(direction.iddirection);

    await stageService.evaluerDemandeModification(demande.id, { status: 'APPROUVEE' }, agent.matricule, { agentId: agent.idagents, isSystemRole: false });

    await stage.reload();
    expect(stage.statusStage).toBe('ANNULE');
  });

  test('REJETER une demande ne change pas le statut du stage', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats);
    const demande = await stageService.createDemandeModification(candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier);
    const agent = await creerAgent(direction.iddirection);

    await stageService.evaluerDemandeModification(demande.id, { status: 'REJETEE', reponse_drh: 'Motif insuffisant' }, agent.matricule, { agentId: agent.idagents, isSystemRole: false });

    await stage.reload();
    expect(stage.statusStage).toBe('EN_COURS');
  });

  test('refuse de réévaluer une demande déjà traitée', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats);
    const demande = await stageService.createDemandeModification(candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier);
    const agent = await creerAgent(direction.iddirection);
    await stageService.evaluerDemandeModification(demande.id, { status: 'APPROUVEE' }, agent.matricule, { agentId: agent.idagents, isSystemRole: false });

    await expect(
      stageService.evaluerDemandeModification(demande.id, { status: 'REJETEE' }, agent.matricule, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('déjà été traitée');
  });

  test('refuse un agent d\'une autre direction', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction1, candidat.idcandidats);
    const demande = await stageService.createDemandeModification(candidat.idcandidats, stage.idstage, { type: 'SUSPENSION', motif: 'Un motif', dateDebut: '2026-02-01' }, fauxFichier);
    const agent = await creerAgent(direction2.iddirection);

    await expect(
      stageService.evaluerDemandeModification(demande.id, { status: 'APPROUVEE' }, agent.matricule, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne relève pas de votre direction');
  });
});
