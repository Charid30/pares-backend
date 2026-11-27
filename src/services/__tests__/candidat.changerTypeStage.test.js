// Le candidat change le type de sa demande de stage (soutenance ↔ perfectionnement), avant l'approbation (2026-11-27).
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/stages/lettre-reco.pdf'),
  deleteFile: jest.fn(),
}));
jest.mock('../email.service');
jest.mock('../notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Stage } = require('../../models');
const notifService = require('../notification.service');
const candidatService = require('../candidat.service');

const lettre = { buffer: Buffer.from('pdf'), originalname: 'recommandation.pdf', size: 3 };
let candidat, direction;

const creerDemande = (overrides = {}) => Stage.create({
  candidats_idcandidats: candidat.idcandidats, typeStage: 'PERFECTIONNEMENT', niveau: 'LICENCE',
  domaineStage: 'Informatique', dureeStage: 2, dateDebutSouhaitee: '2027-02-01',
  direction_iddirection: direction.iddirection, statusStage: 'EN_ATTENTE', ...overrides,
});

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
  notifService.onTypeStageModifie = jest.fn(() => Promise.resolve());
  candidat = await creerCandidat();
  direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
});

test('perfectionnement → soutenance : la lettre de recommandation est exigée', async () => {
  const stage = await creerDemande();
  await expect(candidatService.changerTypeStage(candidat.idcandidats, stage.idstage, { typeStage: 'SOUTENANCE' }))
    .rejects.toThrow('La lettre de recommandation est requise');

  const { stage: maj, ancienType } = await candidatService.changerTypeStage(
    candidat.idcandidats, stage.idstage, { typeStage: 'SOUTENANCE' }, lettre
  );
  expect(ancienType).toBe('PERFECTIONNEMENT');
  expect(maj.typeStage).toBe('SOUTENANCE');
  expect(maj.lettreRecommandation_filename).toBe('recommandation.pdf');
  expect(notifService.onTypeStageModifie).toHaveBeenCalledTimes(1);
});

test('soutenance → perfectionnement : la lettre est conservée mais masquée, puis réapparaît au retour', async () => {
  const stage = await creerDemande({
    typeStage: 'SOUTENANCE', niveau: 'MASTER',
    lettreRecommandation_filename: 'reco.pdf', lettreRecommandation_path: 'uploads/stages/reco.pdf',
  });

  const { stage: maj } = await candidatService.changerTypeStage(candidat.idcandidats, stage.idstage, { typeStage: 'PERFECTIONNEMENT' });
  expect(maj.lettreRecommandation_filename).toBeNull();
  expect(maj.aLettreRecommandation).toBe(true);
  const enBase = await Stage.findByPk(stage.idstage);
  expect(enBase.lettreRecommandation_filename).toBeNull();          // masquée pour tous les écrans
  expect(enBase.getDataValue('lettreRecommandation_path')).toBe('uploads/stages/reco.pdf'); // conservée

  // Retour en soutenance : pas besoin de redéposer la lettre
  const { stage: retour } = await candidatService.changerTypeStage(candidat.idcandidats, stage.idstage, { typeStage: 'SOUTENANCE' });
  expect(retour.lettreRecommandation_filename).toBe('reco.pdf');
});

test('le niveau doit appartenir au nouveau type', async () => {
  const stage = await creerDemande({ niveau: 'BAC' });
  await expect(candidatService.changerTypeStage(candidat.idcandidats, stage.idstage, { typeStage: 'SOUTENANCE' }, lettre))
    .rejects.toThrow('Choisissez un niveau valable pour un stage de soutenance');
  const { stage: maj } = await candidatService.changerTypeStage(
    candidat.idcandidats, stage.idstage, { typeStage: 'SOUTENANCE', niveau: 'BAC_PRO' }, lettre
  );
  expect(maj.niveau).toBe('BAC_PRO');
});

test('possible en traitement, refusé après l\'approbation', async () => {
  const enTraitement = await creerDemande({ statusStage: 'EN_COURS_DE_TRAITEMENT' });
  await expect(candidatService.changerTypeStage(candidat.idcandidats, enTraitement.idstage, { typeStage: 'SOUTENANCE' }, lettre))
    .resolves.toBeTruthy();

  const approuvee = await creerDemande({ statusStage: 'PROGRAMMATION_EN_COURS' });
  await expect(candidatService.changerTypeStage(candidat.idcandidats, approuvee.idstage, { typeStage: 'SOUTENANCE' }, lettre))
    .rejects.toThrow('déjà été examinée');
});

test('refusé sur la demande d\'un autre candidat et sur un renouvellement', async () => {
  const autre = await creerCandidat();
  const stage = await creerDemande();
  await expect(candidatService.changerTypeStage(autre.idcandidats, stage.idstage, { typeStage: 'SOUTENANCE' }, lettre))
    .rejects.toThrow('Demande de stage non trouvée');

  const renouvellement = await creerDemande({ stage_parent_idstage: stage.idstage, estRenouvellement: 1 });
  await expect(candidatService.changerTypeStage(candidat.idcandidats, renouvellement.idstage, { typeStage: 'SOUTENANCE' }, lettre))
    .rejects.toThrow('renouvellement');
});
