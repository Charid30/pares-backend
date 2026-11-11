// Suppression d'un stage par l'admin : à tout statut, avec la suite de sa chaîne de renouvellements.
jest.mock('../email.service');
jest.mock('../notification.service');
jest.mock('../inapp.service', () => ({ push: jest.fn() }));
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/test/fake.pdf'),
  readFile: jest.fn(() => Buffer.from('pdf')),
  deleteFile: jest.fn(),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Stage, RenouvellementStage } = require('../../models');
const stageService = require('../stage.service');

const creerChaine = async () => {
  const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
  const candidat = await creerCandidat();
  const base = {
    candidats_idcandidats: candidat.idcandidats, typeStage: 'SOUTENANCE', domaineStage: 'Informatique',
    dureeStage: 1, dateDebutSouhaitee: '2026-01-01', direction_iddirection: direction.iddirection,
  };
  const racine = await Stage.create({ ...base, statusStage: 'EXPIRE', dateDebutEffective: '2026-01-01', dateFinEffective: '2026-01-31' });
  const r1 = await Stage.create({ ...base, statusStage: 'EXPIRE', stage_parent_idstage: racine.idstage });
  const r2 = await Stage.create({ ...base, statusStage: 'EN_COURS', stage_parent_idstage: r1.idstage });
  const ren1 = await RenouvellementStage.create({ stage_actuel_idstage: racine.idstage, stage_nouveau_idstage: r1.idstage, statusRenouvellement: 'EXPIRE', dureeDemandee: 1, dateRenouvellement: new Date() });
  const ren2 = await RenouvellementStage.create({ stage_actuel_idstage: r1.idstage, stage_nouveau_idstage: r2.idstage, statusRenouvellement: 'EN_COURS', dureeDemandee: 1, dateRenouvellement: new Date() });
  return { racine, r1, r2, ren1, ren2 };
};

beforeEach(async () => {
  await resetDb();
});

test('un stage en cours se supprime', async () => {
  const { r2, ren2, ren1 } = await creerChaine();
  const res = await stageService.deleteStage(r2.idstage, 'admin');
  expect(res.stagesSupprimes).toBe(1);
  expect((await Stage.findByPk(r2.idstage)).del).toBe(1);
  const ren = await RenouvellementStage.findByPk(ren2.idrenouvellement);
  expect(ren.del).toBe(1);
  expect(ren.deletedBy).toBe('admin');
  // Le renouvellement précédent n'est pas touché
  expect((await RenouvellementStage.findByPk(ren1.idrenouvellement)).del).toBe(0);
});

test('supprimer la demande initiale supprime toute la suite de la chaîne', async () => {
  const { racine, r1, r2 } = await creerChaine();
  const res = await stageService.deleteStage(racine.idstage);
  expect(res.stagesSupprimes).toBe(3);
  for (const s of [racine, r1, r2]) expect((await Stage.findByPk(s.idstage)).del).toBe(1);
  expect(await RenouvellementStage.count({ where: { del: 0 } })).toBe(0);
});

test('un stage déjà supprimé est refusé', async () => {
  const { r2 } = await creerChaine();
  await stageService.deleteStage(r2.idstage);
  await expect(stageService.deleteStage(r2.idstage)).rejects.toThrow('Stage non trouvé');
});
