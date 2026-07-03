// Test d'intégration : inapp.service.js — push ne doit jamais lever d'exception
// (appelé en fire-and-forget), et surtout markRead/markAllRead doivent rester
// strictement scopés au destinataire (recipientType+recipientId) : sans ça,
// un agent pourrait marquer comme lue la notification d'un autre destinataire
// simplement en devinant son ID.
const { resetDb } = require('../../__tests__/helpers/testDb');
const { Notification } = require('../../models');
const inappService = require('../inapp.service');

beforeEach(async () => {
  await resetDb();
});

describe('push', () => {
  test('crée la notification avec read=0', async () => {
    await inappService.push({ recipientType: 'AGENT', recipientId: 1, type: 'STAGE', titre: 'Titre', message: 'Message' });

    const notif = await Notification.findOne({ where: { recipient_id: 1 } });
    expect(notif.read).toBe(0);
    expect(notif.titre).toBe('Titre');
  });

  test('n\'échoue jamais même avec des données invalides', async () => {
    await expect(inappService.push({ recipientType: 'AGENT', recipientId: null, type: null, titre: null, message: null })).resolves.not.toThrow();
  });
});

describe('pushToAgents', () => {
  test('pousse la même notification à tous les agents listés', async () => {
    await inappService.pushToAgents({ agentIds: [1, 2, 3], type: 'STAGE', titre: 'T', message: 'M' });

    const count = await Notification.count({ where: { recipient_type: 'AGENT' } });
    expect(count).toBe(3);
  });

  test('ne fait rien si la liste est vide', async () => {
    await inappService.pushToAgents({ agentIds: [], type: 'STAGE', titre: 'T', message: 'M' });
    const count = await Notification.count();
    expect(count).toBe(0);
  });
});

describe('countUnread / markRead / markAllRead', () => {
  test('countUnread ne compte que les notifications du bon destinataire', async () => {
    await Notification.create({ recipient_type: 'AGENT', recipient_id: 1, type: 'STAGE', titre: 'A', message: 'A', read: 0 });
    await Notification.create({ recipient_type: 'AGENT', recipient_id: 2, type: 'STAGE', titre: 'B', message: 'B', read: 0 });

    const count = await inappService.countUnread({ recipientType: 'AGENT', recipientId: 1 });
    expect(count).toBe(1);
  });

  test('markRead ne marque que la notification du destinataire correspondant (pas celle d\'un autre)', async () => {
    const notifAgent1 = await Notification.create({ recipient_type: 'AGENT', recipient_id: 1, type: 'STAGE', titre: 'A', message: 'A', read: 0 });

    // Un agent 2 tente de marquer comme lue la notification de l'agent 1, en devinant son ID.
    await inappService.markRead({ id: notifAgent1.id, recipientType: 'AGENT', recipientId: 2 });

    await notifAgent1.reload();
    expect(notifAgent1.read).toBe(0); // toujours non lue : la tentative IDOR a échoué
  });

  test('markRead marque correctement la notification de son propre destinataire', async () => {
    const notif = await Notification.create({ recipient_type: 'AGENT', recipient_id: 1, type: 'STAGE', titre: 'A', message: 'A', read: 0 });

    await inappService.markRead({ id: notif.id, recipientType: 'AGENT', recipientId: 1 });

    await notif.reload();
    expect(notif.read).toBe(1);
  });

  test('markAllRead ne touche pas les notifications d\'un autre destinataire', async () => {
    await Notification.create({ recipient_type: 'AGENT', recipient_id: 1, type: 'STAGE', titre: 'A', message: 'A', read: 0 });
    await Notification.create({ recipient_type: 'AGENT', recipient_id: 2, type: 'STAGE', titre: 'B', message: 'B', read: 0 });

    await inappService.markAllRead({ recipientType: 'AGENT', recipientId: 1 });

    const nonLuesAgent2 = await Notification.count({ where: { recipient_id: 2, read: 0 } });
    expect(nonLuesAgent2).toBe(1);
  });

  test('markAllRead ne distingue pas un CANDIDAT d\'un AGENT portant le même id numérique', async () => {
    await Notification.create({ recipient_type: 'AGENT', recipient_id: 5, type: 'STAGE', titre: 'A', message: 'A', read: 0 });
    await Notification.create({ recipient_type: 'CANDIDAT', recipient_id: 5, type: 'STAGE', titre: 'B', message: 'B', read: 0 });

    await inappService.markAllRead({ recipientType: 'AGENT', recipientId: 5 });

    const candidatNotif = await Notification.findOne({ where: { recipient_type: 'CANDIDAT', recipient_id: 5 } });
    expect(candidatNotif.read).toBe(0);
  });
});
