// Rappel au candidat de la fin de son stage : 14 jours avant la fin, puis tous les deux jours.
jest.mock('../../services/push.service', () => ({ sendPushToUser: jest.fn(() => Promise.resolve()) }));
jest.mock('../../services/email.service');
jest.mock('../../services/notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { Direction, Stage, Notification } = require('../../models');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const pushService = require('../../services/push.service');
const { runRenouvellementRappelJob, TYPE_NOTIF } = require('../renouvellementRappelJob');

const JOUR = 24 * 60 * 60 * 1000;
const aHeure = (h, decalageJours = 0) => { const d = new Date(Date.now() + decalageJours * JOUR); d.setHours(h, 0, 0, 0); return d; };
const isoDansNJours = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };

let direction;
const creerStage = async (finDansJours, extra = {}) => {
  const candidat = await creerCandidat();
  return Stage.create({
    candidats_idcandidats: candidat.idcandidats, typeStage: 'SOUTENANCE', domaineStage: 'Informatique', dureeStage: 2,
    dateDebutSouhaitee: isoDansNJours(finDansJours - 60), dateDebutEffective: isoDansNJours(finDansJours - 60),
    dateFinEffective: isoDansNJours(finDansJours), direction_iddirection: direction.iddirection, statusStage: 'EN_COURS', ...extra,
  });
};
const rappels = (stage) => Notification.findAll({ where: { recipient_id: stage.candidats_idcandidats, type: TYPE_NOTIF } });

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
  direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
});

test('stage qui finit dans 10 jours : un rappel (notification + push)', async () => {
  const stage = await creerStage(10);
  const bilan = await runRenouvellementRappelJob(aHeure(10));
  expect(bilan.envoyes).toBe(1);
  const [notif] = await rappels(stage);
  expect(notif.message).toContain('dans 10 jours');
  expect(notif.link).toContain('/dashboard/candidat/mes-stages');
  expect(pushService.sendPushToUser).toHaveBeenCalledTimes(1);
});

test('pas de second rappel avant deux jours, puis un nouveau rappel deux jours plus tard', async () => {
  const stage = await creerStage(10);
  await runRenouvellementRappelJob(aHeure(10));
  expect((await runRenouvellementRappelJob(aHeure(15))).envoyes).toBe(0);
  expect((await runRenouvellementRappelJob(aHeure(10, 1))).envoyes).toBe(0);
  expect((await runRenouvellementRappelJob(aHeure(10, 2))).envoyes).toBe(1);
  expect(await rappels(stage)).toHaveLength(2);
});

test('rappel dès 14 jours avant la fin, pas avant', async () => {
  await creerStage(14);
  await creerStage(15);
  expect((await runRenouvellementRappelJob(aHeure(10))).envoyes).toBe(1);
});

test('dernier jour du stage : message « aujourd\'hui »', async () => {
  const stage = await creerStage(0);
  await runRenouvellementRappelJob(aHeure(10));
  const [notif] = await rappels(stage);
  expect(notif.titre).toBe('Dernier jour pour renouveler votre stage');
  expect(notif.message).toContain('aujourd\'hui');
});

test('aucun envoi la nuit', async () => {
  await creerStage(10);
  expect((await runRenouvellementRappelJob(aHeure(22))).envoyes).toBe(0);
  expect((await runRenouvellementRappelJob(aHeure(6))).envoyes).toBe(0);
});

test('pas de rappel pour un stage déjà renouvelé ni pour un stage qui n\'est pas en cours', async () => {
  const stage = await creerStage(10);
  await Stage.create({
    candidats_idcandidats: stage.candidats_idcandidats, typeStage: 'SOUTENANCE', domaineStage: 'Informatique', dureeStage: 2,
    dateDebutSouhaitee: isoDansNJours(11), direction_iddirection: direction.iddirection, statusStage: 'EN_ATTENTE',
    stage_parent_idstage: stage.idstage,
  });
  await creerStage(10, { statusStage: 'ACCEPTE' });
  expect((await runRenouvellementRappelJob(aHeure(10))).envoyes).toBe(0);
});

test('pas de rappel quand la limite de 6 mois continus est atteinte', async () => {
  await creerStage(5, { dureeStage: 6, dateDebutEffective: isoDansNJours(5 - 186), dateDebutSouhaitee: isoDansNJours(5 - 186) });
  expect((await runRenouvellementRappelJob(aHeure(10))).envoyes).toBe(0);
});
