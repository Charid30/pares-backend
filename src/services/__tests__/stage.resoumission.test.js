// Test d'intégration : resoumettreStage (IDOR + garde sur les documents non
// conformes) et evaluateRenouvellement (calcul des dates effectives du nouveau
// stage à l'acceptation — début = lendemain de la fin de l'actuel, fin via
// calculerDateFin déjà testé en isolation ; rejet simple sinon), passage
// ACCEPTE → EN_COURS selon la date de début, filtrage par direction de la liste.
// Pas d'envoi réel d'e-mail / de notification pendant les tests (évite les timeouts SMTP)
jest.mock('../email.service');
jest.mock('../notification.service');
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn((buffer, name, subfolder) => `uploads/${subfolder}/fake-path.pdf`),
  readFile: jest.fn(() => Buffer.from('pdf')),
  deleteFile: jest.fn(),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage, RenouvellementStage, DocumentStage } = require('../../models');
const stageService = require('../stage.service');

const fauxPdf = { buffer: Buffer.from('pdf'), originalname: 'doc.pdf', size: 3 };

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
  statusStage: 'EN_ATTENTE',
  ...overrides,
});

beforeEach(async () => {
  await resetDb();
});

describe('resoumettreStage', () => {
  test('repasse un stage REJETE sans documents non conformes en EN_ATTENTE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, { statusStage: 'REJETE', motifRefus: 'Incomplet' });

    const result = await stageService.resoumettreStage(stage.idstage, candidat.idcandidats);

    expect(result.statusStage).toBe('EN_ATTENTE');
    expect(result.motifRefus).toBeNull();
  });

  test('refuse si le stage n\'est pas REJETE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, { statusStage: 'EN_ATTENTE' });

    await expect(stageService.resoumettreStage(stage.idstage, candidat.idcandidats)).rejects.toThrow('Seules les demandes rejetées');
  });

  test('refuse tant que des documents rejetés n\'ont pas été remplacés', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, {
      statusStage: 'REJETE',
      documentsRejetes: JSON.stringify(['cv', 'cnib']),
    });

    await expect(stageService.resoumettreStage(stage.idstage, candidat.idcandidats)).rejects.toThrow('doivent être remplacés');
  });

  test('refuse un candidat qui n\'est pas propriétaire du stage (IDOR)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const proprietaire = await creerCandidat();
    const attaquant = await creerCandidat();
    const stage = await creerStage(direction, proprietaire.idcandidats, { statusStage: 'REJETE' });

    await expect(stageService.resoumettreStage(stage.idstage, attaquant.idcandidats)).rejects.toThrow('Action non autorisée');
  });
});

const isoDansNJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Un renouvellement ne peut être accepté qu'après approbation (PROGRAMMATION_EN_COURS)
const creerRenouvellement = async (direction, candidatId, dateFinStageActuel, statusRenouvellement = 'PROGRAMMATION_EN_COURS') => {
  const stageActuel = await creerStage(direction, candidatId, { statusStage: 'EN_COURS', dateFinEffective: dateFinStageActuel });
  const stageNouveau = await creerStage(direction, candidatId, { statusStage: 'EN_ATTENTE', estRenouvellement: 1, stage_parent_idstage: stageActuel.idstage });
  const renouvellement = await RenouvellementStage.create({
    stage_actuel_idstage: stageActuel.idstage,
    stage_nouveau_idstage: stageNouveau.idstage,
    dureeDemandee: 2,
    statusRenouvellement,
  });
  return { stageActuel, stageNouveau, renouvellement };
};

const joindreConvention = (stageId) => DocumentStage.create({
  stage_idstage: stageId,
  typeDocument: 'CONVENTION',
  document_path: 'uploads/documents-stage/convention.pdf',
  document_filename: 'convention.pdf',
  document_size: 3,
  dateEmission: '2026-01-01',
});

describe('evaluateRenouvellement', () => {

  test('ACCEPTER calcule les dates effectives du nouveau stage (début = lendemain de la fin de l\'actuel)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31');
    const agent = await creerAgent(direction.iddirection);

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { agentId: agent.idagents, isSystemRole: false }, fauxPdf);

    await stageNouveau.reload();
    expect(stageNouveau.dateDebutEffective).toBe('2026-04-01'); // lendemain du 31 mars
    expect(stageNouveau.statusStage).toBe('EN_COURS'); // convention jointe et date de début passée
    const convention = await DocumentStage.findOne({ where: { stage_idstage: stageNouveau.idstage, typeDocument: 'CONVENTION' } });
    expect(convention.document_path).toBe('uploads/conventions/fake-path.pdf');
    expect(convention.agents_idagents).toBe(agent.idagents);
  });

  test('ACCEPTER avec la convention et une date de début future : reste ACCEPTE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, isoDansNJours(5));

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { isSystemRole: true }, fauxPdf);

    await stageNouveau.reload();
    expect(stageNouveau.statusStage).toBe('ACCEPTE');
  });

  test('ACCEPTER sans convention est refusé et ne modifie rien', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31');

    await expect(
      stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { isSystemRole: true })
    ).rejects.toThrow('convention du renouvellement est obligatoire');

    await renouvellement.reload();
    await stageNouveau.reload();
    expect(renouvellement.statusRenouvellement).toBe('PROGRAMMATION_EN_COURS');
    expect(stageNouveau.statusStage).toBe('EN_ATTENTE');
  });

  test('ACCEPTER avec une date de début et une durée accordée : fin calculée sur la durée accordée', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31');

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, {
      statusRenouvellement: 'ACCEPTE', dateDebutEffective: '2026-05-01', dureeAccordee: 3,
    }, { isSystemRole: true, isAdmin: true }, fauxPdf);

    await stageNouveau.reload();
    await renouvellement.reload();
    expect(stageNouveau.dateDebutEffective).toBe('2026-05-01');
    expect(stageNouveau.dureeStage).toBe(3);
    expect(stageNouveau.dateFinEffective).toBe(stageService.calculerDateFin('2026-05-01', 3));
    expect(renouvellement.dureeDemandee).toBe(2); // la demande du candidat reste tracée
  });

  test('REJETER met le nouveau stage en REJETE avec le motif, sans toucher aux dates', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31');
    const agent = await creerAgent(direction.iddirection);

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'REJETE', motifRefus: 'Direction saturée' }, { agentId: agent.idagents, isSystemRole: false });

    await stageNouveau.reload();
    expect(stageNouveau.statusStage).toBe('REJETE');
    expect(stageNouveau.motifRefus).toBe('Direction saturée');
    expect(stageNouveau.dateDebutEffective).toBeNull();
  });

  test('refuse un agent d\'une autre direction', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const candidat = await creerCandidat();
    const { renouvellement } = await creerRenouvellement(direction1, candidat.idcandidats, '2026-03-31');
    const agent = await creerAgent(direction2.iddirection);

    await expect(
      stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne relève pas de votre direction');
  });

  test('ACCEPTER avec convention déjà jointe : reste ACCEPTE si la date de début n\'est pas arrivée', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    // Le stage actuel se termine dans 5 jours → le renouvellement débute dans 6 jours
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, isoDansNJours(5));
    await joindreConvention(stageNouveau.idstage);

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { isSystemRole: true });

    await stageNouveau.reload();
    expect(stageNouveau.dateDebutEffective).toBe(isoDansNJours(6));
    expect(stageNouveau.statusStage).toBe('ACCEPTE');
  });

  test('ACCEPTER avec convention déjà jointe : passe EN_COURS si la date de début est arrivée', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, isoDansNJours(-1));
    await joindreConvention(stageNouveau.idstage);

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { isSystemRole: true });

    await stageNouveau.reload();
    expect(stageNouveau.statusStage).toBe('EN_COURS');
  });

  test('REJETER ignore « convention non conforme » (la convention est jointe par l\'agent)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31', 'EN_ATTENTE');

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, {
      statusRenouvellement: 'REJETE', motifRefus: 'Lettre illisible', lettreNonConforme: true, conventionNonConforme: true,
    }, { isSystemRole: true });

    await renouvellement.reload();
    expect(renouvellement.lettreNonConforme).toBe(1);
    expect(renouvellement.conventionNonConforme).toBe(0);
  });
});

describe('circuit « comme les stages » (Traiter / Accepter dès EN_ATTENTE pour l\'admin)', () => {
  test('l\'admin peut accepter directement un renouvellement EN_ATTENTE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31', 'EN_ATTENTE');

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { isSystemRole: true, isAdmin: true }, fauxPdf);

    await stageNouveau.reload();
    expect(stageNouveau.statusStage).toBe('EN_COURS'); // convention jointe, début (01/04) passé
  });

  test('un agent ne peut pas accepter un renouvellement non approuvé', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31', 'EN_ATTENTE');
    const agent = await creerAgent(direction.iddirection);

    await expect(
      stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('doit être approuvé');
  });

  test('Traiter passe EN_ATTENTE → EN_COURS_DE_TRAITEMENT, puis le refus reste possible', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31', 'EN_ATTENTE');

    const traite = await stageService.mettreEnTraitementRenouvellement(renouvellement.idrenouvellement, { isSystemRole: true });
    expect(traite.statusRenouvellement).toBe('EN_COURS_DE_TRAITEMENT');

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'REJETE', motifRefus: 'Incomplet' }, { isSystemRole: true });
    await renouvellement.reload();
    expect(renouvellement.statusRenouvellement).toBe('REJETE');
  });

  test('Approuver est possible après Traiter (EN_COURS_DE_TRAITEMENT → PROGRAMMATION_EN_COURS)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31', 'EN_ATTENTE');

    await stageService.mettreEnTraitementRenouvellement(renouvellement.idrenouvellement, { isSystemRole: true });
    await stageService.approuverRenouvellement(renouvellement.idrenouvellement, { isSystemRole: true });

    await renouvellement.reload();
    expect(renouvellement.statusRenouvellement).toBe('PROGRAMMATION_EN_COURS');
    // Déjà approuvé : une seconde approbation est refusée
    await expect(stageService.approuverRenouvellement(renouvellement.idrenouvellement, { isSystemRole: true }))
      .rejects.toThrow('ne peut pas être approuvé');
  });

  test('la convention affichée est celle de la demande de stage (stage actuel)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageActuel, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31', 'EN_ATTENTE');
    await joindreConvention(stageActuel.idstage);

    const doc = await stageService.downloadConventionDemandeRenouvellement(renouvellement.idrenouvellement);
    expect(doc.filename).toBe('convention.pdf');

    const liste = await stageService.getAllRenouvellements({}, { isSystemRole: true, isActionSystemRole: true });
    expect(liste.rows[0].stageActuel.documents[0].document_filename).toBe('convention.pdf');
  });
});

describe('createDocumentStage (convention)', () => {
  test('convention jointe sur un stage ACCEPTE dont la date de début est future : reste ACCEPTE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, { statusStage: 'ACCEPTE', dateDebutEffective: isoDansNJours(3) });

    await stageService.createDocumentStage(null, { stage_idstage: stage.idstage, typeDocument: 'CONVENTION', dateEmission: '2026-01-01' }, fauxPdf);

    await stage.reload();
    expect(stage.statusStage).toBe('ACCEPTE');
  });

  test('convention jointe sur un stage ACCEPTE dont la date de début est atteinte : passe EN_COURS', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, { statusStage: 'ACCEPTE', dateDebutEffective: isoDansNJours(0) });

    await stageService.createDocumentStage(null, { stage_idstage: stage.idstage, typeDocument: 'CONVENTION', dateEmission: '2026-01-01' }, fauxPdf);

    await stage.reload();
    expect(stage.statusStage).toBe('EN_COURS');
  });
});

describe('getAllRenouvellements', () => {
  test('un agent non-système ne voit que les renouvellements de ses directions (liste et compteurs)', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const candidat = await creerCandidat();
    await creerRenouvellement(direction1, candidat.idcandidats, '2026-03-31', 'EN_ATTENTE');
    await creerRenouvellement(direction2, candidat.idcandidats, '2026-03-31', 'EN_ATTENTE');
    const agent = await creerAgent(direction1.iddirection);

    const result = await stageService.getAllRenouvellements({}, { agentId: agent.idagents, isSystemRole: false });

    expect(result.total).toBe(1);
    expect(result.rows[0].stageNouveau.direction_iddirection).toBe(direction1.iddirection);
    expect(result.rows[0].peutAgir).toBe(true);
    expect(result.stats.total).toBe(1);
    expect(result.stats.enAttente).toBe(1);
  });

  test('un rôle système voit tous les renouvellements', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const candidat = await creerCandidat();
    await creerRenouvellement(direction1, candidat.idcandidats, '2026-03-31', 'EN_ATTENTE');
    await creerRenouvellement(direction2, candidat.idcandidats, '2026-03-31', 'REJETE');

    const result = await stageService.getAllRenouvellements({}, { isSystemRole: true, isActionSystemRole: true });

    expect(result.total).toBe(2);
    expect(result.stats).toMatchObject({ total: 2, enAttente: 1, rejete: 1 });
  });
});

describe('resoumettreRenouvellement', () => {
  test('remplace la lettre (stockée sur disque) et repasse EN_ATTENTE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { renouvellement, stageNouveau } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31', 'REJETE');
    await renouvellement.update({ lettreNonConforme: 1 });

    await stageService.resoumettreRenouvellement(renouvellement.idrenouvellement, candidat.idcandidats, { lettre: fauxPdf });

    await renouvellement.reload();
    await stageNouveau.reload();
    expect(renouvellement.statusRenouvellement).toBe('EN_ATTENTE');
    expect(renouvellement.lettreMotivationRenouvellement_path).toBe('uploads/renouvellements/fake-path.pdf');
    expect(renouvellement.resoumis).toBe(1);
    expect(stageNouveau.statusStage).toBe('EN_ATTENTE');
  });

  test('exige une nouvelle lettre si elle a été signalée non conforme', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31', 'REJETE');
    await renouvellement.update({ lettreNonConforme: 1 });

    await expect(
      stageService.resoumettreRenouvellement(renouvellement.idrenouvellement, candidat.idcandidats, {})
    ).rejects.toThrow('La lettre de motivation doit être remplacée');
  });
});

describe('getStagesArchives (le renouvellement prolonge le stage initial)', () => {
  test('n\'archive pas un stage expiré dont le renouvellement est en cours', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const initial = await creerStage(direction, candidat.idcandidats, { statusStage: 'EXPIRE' });
    await creerStage(direction, candidat.idcandidats, { statusStage: 'EN_COURS', estRenouvellement: 1, stage_parent_idstage: initial.idstage });

    const res = await stageService.getStagesArchives({}, { isSystemRole: true });
    expect(res.items.map(s => s.idstage)).not.toContain(initial.idstage);
  });

  test('archive le stage initial une fois son renouvellement terminé', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const initial = await creerStage(direction, candidat.idcandidats, { statusStage: 'EXPIRE' });
    await creerStage(direction, candidat.idcandidats, { statusStage: 'EXPIRE', estRenouvellement: 1, stage_parent_idstage: initial.idstage });

    const res = await stageService.getStagesArchives({}, { isSystemRole: true });
    expect(res.items.map(s => s.idstage)).toEqual([initial.idstage]);
  });

  test('remonte toute la chaîne : un 2e renouvellement actif garde le stage initial hors archives', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const initial = await creerStage(direction, candidat.idcandidats, { statusStage: 'EXPIRE' });
    const r1 = await creerStage(direction, candidat.idcandidats, { statusStage: 'EXPIRE', estRenouvellement: 1, stage_parent_idstage: initial.idstage });
    await creerStage(direction, candidat.idcandidats, { statusStage: 'ACCEPTE', estRenouvellement: 1, stage_parent_idstage: r1.idstage });

    const res = await stageService.getStagesArchives({}, { isSystemRole: true });
    expect(res.items).toHaveLength(0);
  });
});

describe('chaîne de stage : statut « Prolongé » et durée totale', () => {
  test('un stage expiré dont le renouvellement est en cours s\'affiche PROLONGE, durée = stage + renouvellement', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const initial = await creerStage(direction, candidat.idcandidats, { statusStage: 'EXPIRE', dureeStage: 2 });
    await creerStage(direction, candidat.idcandidats, {
      statusStage: 'EN_COURS', dureeStage: 1, estRenouvellement: 1, stage_parent_idstage: initial.idstage, dateFinEffective: '2026-10-31',
    });

    const res = await stageService.getAllStages({}, { isSystemRole: true });
    const s = res.items.find(i => i.idstage === initial.idstage);
    expect(s.statusStage).toBe('EXPIRE');
    expect(s.statutAffiche).toBe('PROLONGE');
    expect(s.chaine).toMatchObject({ dureeTotaleMois: 3, nbRenouvellements: 1, finProlongation: '2026-10-31', prolonge: true });
  });

  test('après la fin du renouvellement : statut EXPIRE, durée totale conservée ; renouvellement en attente non compté', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const initial = await creerStage(direction, candidat.idcandidats, { statusStage: 'EXPIRE', dureeStage: 2 });
    const r1 = await creerStage(direction, candidat.idcandidats, { statusStage: 'EXPIRE', dureeStage: 1, estRenouvellement: 1, stage_parent_idstage: initial.idstage });
    await creerStage(direction, candidat.idcandidats, { statusStage: 'EN_ATTENTE', dureeStage: 2, estRenouvellement: 1, stage_parent_idstage: r1.idstage });

    const res = await stageService.getAllStages({}, { isSystemRole: true });
    const s = res.items.find(i => i.idstage === initial.idstage);
    expect(s.statutAffiche).toBe('EXPIRE');
    expect(s.chaine.dureeTotaleMois).toBe(3);
  });
});
