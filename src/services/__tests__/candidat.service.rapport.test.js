// Test d'intégration : rapport de stage — point d'entrée unique pour la chaîne
// (demande de stage + renouvellements). Un seul rapport, porté par la racine, soumis
// après la fin du dernier stage de la chaîne, ou plus tôt sur autorisation de l'admin.
// + cloisonnement par direction de la modification des dates et du remplacement de convention.
jest.mock('../email.service');
jest.mock('../notification.service');
jest.mock('../inapp.service');
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn((buffer, name, sousDossier) => `uploads/${sousDossier}/fake.pdf`),
  readFile: jest.fn(() => Buffer.from('pdf')),
  deleteFile: jest.fn(),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage, RenouvellementStage, RapportStage, AutorisationRapportStage } = require('../../models');
const candidatService = require('../candidat.service');
const stageService = require('../stage.service');

const fauxPdf = { buffer: Buffer.from('pdf'), originalname: 'rapport.pdf', size: 3 };
const donneesRapport = { titreRapport: 'Mon rapport', natureRapport: 'RAPPORT_STAGE' };

let direction, candidat;

const creerStage = (overrides = {}) => Stage.create({
  candidats_idcandidats: candidat.idcandidats,
  typeStage: 'SOUTENANCE',
  domaineStage: 'Développement web',
  dureeStage: 2,
  dateDebutSouhaitee: '2026-01-01',
  direction_iddirection: direction.iddirection,
  statusStage: 'EXPIRE',
  dateDebutEffective: '2026-01-01',
  dateFinEffective: '2026-02-28',
  ...overrides,
});

const creerRenouvellement = async (racine, statusStage, statusRenouvellement, overrides = {}) => {
  const enfant = await creerStage({
    statusStage, estRenouvellement: 1, stage_parent_idstage: racine.idstage, dureeStage: 1,
    dateDebutEffective: '2026-03-01', dateFinEffective: '2026-03-31', ...overrides,
  });
  const renouvellement = await RenouvellementStage.create({
    stage_actuel_idstage: racine.idstage,
    stage_nouveau_idstage: enfant.idstage,
    dureeDemandee: 1,
    statusRenouvellement,
  });
  return { enfant, renouvellement };
};

const creerAgent = (directionId) => Agent.create({
  direction_iddirection: directionId,
  nom: 'Agent', prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
});

beforeEach(async () => {
  await resetDb();
  direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
  candidat = await creerCandidat();
});

describe('getEtatRapportChaine / soumettreRapportStage', () => {
  test('stage seul expiré : rapport possible, porté par le stage, statut RAPPORT_SOUMIS', async () => {
    const racine = await creerStage();
    const etat = await candidatService.getEtatRapportChaine(racine.idstage, candidat.idcandidats);
    expect(etat.peutSoumettre).toBe(true);

    await candidatService.soumettreRapportStage(candidat.idcandidats, racine.idstage, donneesRapport, fauxPdf);
    await racine.reload();
    expect(racine.statusStage).toBe('RAPPORT_SOUMIS');
    expect(await RapportStage.count({ where: { stage_idstage: racine.idstage } })).toBe(1);
  });

  test('renouvellement en cours : rapport refusé, le renouvellement n\'est pas clôturé', async () => {
    const racine = await creerStage();
    const { enfant, renouvellement } = await creerRenouvellement(racine, 'EN_COURS', 'EN_COURS');

    const etat = await candidatService.getEtatRapportChaine(racine.idstage, candidat.idcandidats);
    expect(etat.peutSoumettre).toBe(false);
    expect(etat.message).toContain('prolongé');

    await expect(
      candidatService.soumettreRapportStage(candidat.idcandidats, racine.idstage, donneesRapport, fauxPdf)
    ).rejects.toThrow('prolongé');

    await enfant.reload();
    await renouvellement.reload();
    expect(enfant.statusStage).toBe('EN_COURS');
    expect(renouvellement.statusRenouvellement).toBe('EN_COURS');
  });

  test('renouvellement demandé (en attente) : rapport refusé', async () => {
    const racine = await creerStage();
    await creerRenouvellement(racine, 'EN_ATTENTE', 'EN_ATTENTE');
    const etat = await candidatService.getEtatRapportChaine(racine.idstage, candidat.idcandidats);
    expect(etat.peutSoumettre).toBe(false);
  });

  test('chaîne finie : un seul rapport, même soumis depuis le stage du renouvellement', async () => {
    const racine = await creerStage();
    const { enfant, renouvellement } = await creerRenouvellement(racine, 'EXPIRE', 'EXPIRE');

    await candidatService.soumettreRapportStage(candidat.idcandidats, enfant.idstage, donneesRapport, fauxPdf);

    expect(await RapportStage.count({ where: { stage_idstage: racine.idstage } })).toBe(1);
    await racine.reload(); await enfant.reload(); await renouvellement.reload();
    expect(racine.statusStage).toBe('RAPPORT_SOUMIS');
    expect(enfant.statusStage).toBe('RAPPORT_SOUMIS');
    expect(renouvellement.statusRenouvellement).toBe('TERMINE');

    await expect(
      candidatService.soumettreRapportStage(candidat.idcandidats, racine.idstage, donneesRapport, fauxPdf)
    ).rejects.toThrow('déjà été soumis');
  });

  test('un renouvellement rejeté n\'empêche pas le rapport', async () => {
    const racine = await creerStage();
    await creerRenouvellement(racine, 'REJETE', 'REJETE');
    const etat = await candidatService.getEtatRapportChaine(racine.idstage, candidat.idcandidats);
    expect(etat.peutSoumettre).toBe(true);
  });

  test('stage encore en cours : refusé, sauf autorisation de l\'admin (le stage n\'est pas interrompu)', async () => {
    const racine = await creerStage({ statusStage: 'EN_COURS', dateFinEffective: '2026-12-31' });
    let etat = await candidatService.getEtatRapportChaine(racine.idstage, candidat.idcandidats);
    expect(etat.peutSoumettre).toBe(false);

    await stageService.autoriserRapportStage(racine.idstage, null, { isSystemRole: true });
    etat = await candidatService.getEtatRapportChaine(racine.idstage, candidat.idcandidats);
    expect(etat.peutSoumettre).toBe(true);

    await candidatService.soumettreRapportStage(candidat.idcandidats, racine.idstage, donneesRapport, fauxPdf);
    await racine.reload();
    expect(racine.statusStage).toBe('EN_COURS');
    const autorisation = await AutorisationRapportStage.findOne({ where: { stage_idstage: racine.idstage } });
    expect(autorisation.usedAt).not.toBeNull();
  });

  test('« Mes stages » : état du rapport uniquement sur la demande initiale', async () => {
    const racine = await creerStage();
    // Date de fin future : la liste candidat recalcule les statuts selon les dates
    await creerRenouvellement(racine, 'EN_COURS', 'EN_COURS', { dateDebutEffective: '2026-03-01', dateFinEffective: '2099-12-31' });
    const items = await candidatService.getMesDemandesStage(candidat.idcandidats);
    const itemRacine = items.find(i => i.idstage === racine.idstage);
    const itemEnfant = items.find(i => i.stage_parent_idstage === racine.idstage);
    expect(itemRacine.rapportInfo.peutSoumettre).toBe(false);
    expect(itemEnfant.rapportInfo).toBeNull();
  });
});

describe('autoriserRapportStage', () => {
  test('autorisation portée par la racine même si demandée depuis le renouvellement', async () => {
    const racine = await creerStage();
    const { enfant } = await creerRenouvellement(racine, 'EN_COURS', 'EN_COURS');
    const auth = await stageService.autoriserRapportStage(enfant.idstage, null, { isSystemRole: true });
    expect(auth.stage_idstage).toBe(racine.idstage);
  });

  test('refusée à un agent d\'une autre direction', async () => {
    const racine = await creerStage({ statusStage: 'EN_COURS' });
    const autreDirection = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const agent = await creerAgent(autreDirection.iddirection);
    await expect(
      stageService.autoriserRapportStage(racine.idstage, agent.idagents, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne relève pas de votre direction');
  });

  test('refusée si le rapport est déjà soumis', async () => {
    const racine = await creerStage();
    await candidatService.soumettreRapportStage(candidat.idcandidats, racine.idstage, donneesRapport, fauxPdf);
    await expect(stageService.autoriserRapportStage(racine.idstage, null, { isSystemRole: true })).rejects.toThrow('déjà été soumis');
  });
});

describe('cloisonnement par direction', () => {
  test('modification des dates refusée à un agent d\'une autre direction', async () => {
    const stage = await creerStage({ statusStage: 'ACCEPTE' });
    const autreDirection = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const agent = await creerAgent(autreDirection.iddirection);
    await expect(
      stageService.updateStage(stage.idstage, { dateDebutEffective: '2026-05-01', dureeStage: 2 }, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne relève pas de votre direction');
  });

  test('modification des dates acceptée pour un agent de la direction', async () => {
    const stage = await creerStage({ statusStage: 'ACCEPTE' });
    const agent = await creerAgent(direction.iddirection);
    const maj = await stageService.updateStage(stage.idstage, { dateDebutEffective: '2026-05-01', dureeStage: 2 }, { agentId: agent.idagents, isSystemRole: false });
    expect(maj.dateDebutEffective).toBe('2026-05-01');
  });

  test('accès global MODIFIER : dates oui, changement de direction non', async () => {
    const stage = await creerStage({ statusStage: 'ACCEPTE' });
    await expect(
      stageService.updateStage(stage.idstage, { direction_iddirection: direction.iddirection }, { isSystemRole: true, accesGlobalModifier: true })
    ).rejects.toThrow('Action non autorisée');
  });

  test('remplacement de convention refusé à un agent d\'une autre direction', async () => {
    const stage = await creerStage({ statusStage: 'EN_COURS' });
    const autreDirection = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const agent = await creerAgent(autreDirection.iddirection);
    await expect(
      stageService.remplacerConventionStage(stage.idstage, agent.idagents, fauxPdf, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne relève pas de votre direction');
  });
});
