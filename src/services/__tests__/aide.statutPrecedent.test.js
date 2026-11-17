// Retour d'une demande d'aide au statut précédent (admin) : rouvre la redirection vers une autre direction.
jest.mock('../notification.service', () => ({ onDemandeTransferee: jest.fn(() => Promise.resolve()) }));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Aide, Direction } = require('../../models');
const aideService = require('../aide.service');

let d1;
let d2;
const creer = async (statusAide, extra = {}) => {
  const candidat = await creerCandidat();
  return Aide.create({
    creePar: 'CANDIDAT', candidats_idcandidats: candidat.idcandidats, typeAide: 'SANTE', titre: 'Soins',
    statusAide, direction_iddirection: d1.iddirection, ...extra,
  });
};

beforeEach(async () => {
  await resetDb();
  d1 = await Direction.create({ nom: 'Direction 1', accronyme: 'D1' });
  d2 = await Direction.create({ nom: 'Direction 2', accronyme: 'D2' });
});

test('une aide validée revient « En traitement » et sa décision est effacée', async () => {
  const aide = await creer('VALIDEE', { dateTraitement: '2026-12-01', heureTraitement: '09:00' });
  const r = await aideService.revenirStatutPrecedentAide(aide.idaide);
  expect(r).toEqual(expect.objectContaining({ ancien: 'VALIDEE', nouveau: 'EN_TRAITEMENT' }));
  const relue = await Aide.findByPk(aide.idaide);
  expect(relue.statusAide).toBe('EN_TRAITEMENT');
  expect(relue.dateTraitement).toBeNull();
  expect(relue.heureTraitement).toBeNull();
});

test('une aide rejetée perd son motif ; « En traitement » revient « En attente »', async () => {
  const aide = await creer('REJETEE', { motifRefus: 'Mauvaise direction' });
  await aideService.revenirStatutPrecedentAide(aide.idaide);
  expect((await Aide.findByPk(aide.idaide)).motifRefus).toBeNull();
  await aideService.revenirStatutPrecedentAide(aide.idaide);
  expect((await Aide.findByPk(aide.idaide)).statusAide).toBe('EN_ATTENTE');
});

test('une aide « En attente » n\'a pas de statut précédent', async () => {
  const aide = await creer('EN_ATTENTE');
  await expect(aideService.revenirStatutPrecedentAide(aide.idaide)).rejects.toThrow('pas de statut précédent');
});

test('après le retour, la redirection vers une autre direction est possible', async () => {
  const aide = await creer('VALIDEE');
  await expect(aideService.transfererAide(aide.idaide, d2.iddirection)).rejects.toThrow('ne peut plus être redirigée');
  await aideService.revenirStatutPrecedentAide(aide.idaide);
  const transferee = await aideService.transfererAide(aide.idaide, d2.iddirection);
  expect(transferee.direction_iddirection).toBe(d2.iddirection);
  expect(transferee.statusAide).toBe('EN_ATTENTE');
});
