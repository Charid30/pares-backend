// Admin : ramener une demande « En cours de programmation » au statut « En traitement ».
jest.mock('../email.service');
jest.mock('../notification.service');
jest.mock('../inapp.service', () => ({ push: jest.fn(() => Promise.resolve()) }));
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/test/fake.pdf'),
  readFile: jest.fn(() => Buffer.from('pdf')),
  deleteFile: jest.fn(),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Stage, DocumentStage } = require('../../models');
const stageService = require('../stage.service');

let direction;
let candidat;
const creer = (statusStage, extra = {}) => Stage.create({
  candidats_idcandidats: candidat.idcandidats, typeStage: 'SOUTENANCE', domaineStage: 'Informatique',
  dureeStage: 2, dateDebutSouhaitee: '2026-12-01', direction_iddirection: direction.iddirection, statusStage, ...extra,
});

beforeEach(async () => {
  await resetDb();
  direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
  candidat = await creerCandidat();
});

test('une demande en programmation revient « En traitement », approbation effacée', async () => {
  const stage = await creer('PROGRAMMATION_EN_COURS', { dateDebutProposee: '2026-12-01', nomMaitreStage: 'KABORE Paul' });
  const r = await stageService.annulerApprobationStage(stage.idstage);
  expect(r.statusStage).toBe('EN_COURS_DE_TRAITEMENT');
  expect(r.dateDebutProposee).toBeNull();
  expect(r.nomMaitreStage).toBeNull();
});

test('elle peut ensuite être approuvée de nouveau', async () => {
  const stage = await creer('PROGRAMMATION_EN_COURS');
  await stageService.annulerApprobationStage(stage.idstage);
  const r = await stageService.approuverStage(stage.idstage, 'admin', null, null, 'OUEDRAOGO Awa');
  expect(r.statusStage).toBe('PROGRAMMATION_EN_COURS');
});

test.each(['EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'ACCEPTE', 'EN_COURS', 'REJETE'])('refusée au statut %s', async (statut) => {
  const stage = await creer(statut);
  await expect(stageService.annulerApprobationStage(stage.idstage)).rejects.toThrow('En cours de programmation');
});

test('refusée si une convention est jointe', async () => {
  const stage = await creer('PROGRAMMATION_EN_COURS');
  await DocumentStage.create({
    stage_idstage: stage.idstage, typeDocument: 'CONVENTION', document_path: 'uploads/c.pdf',
    document_filename: 'c.pdf', document_size: 3, dateEmission: '2026-11-01',
  });
  await expect(stageService.annulerApprobationStage(stage.idstage)).rejects.toThrow('convention');
});

test('refusée pour un stage de renouvellement', async () => {
  const parent = await creer('EN_COURS');
  const enfant = await creer('PROGRAMMATION_EN_COURS', { stage_parent_idstage: parent.idstage });
  await expect(stageService.annulerApprobationStage(enfant.idstage)).rejects.toThrow('Renouvellements');
});
