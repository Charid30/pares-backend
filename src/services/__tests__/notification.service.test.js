// Test d'intégration : notifyAgents — décide QUI reçoit une notification de
// nouvelle demande. Filtre sur le type, le flag enabled, et exclut les agents
// supprimés ; un agent dont l'envoi d'email échoue ne doit jamais empêcher les
// autres d'être notifiés, et la fonction ne doit jamais lever d'exception
// (elle est appelée en fire-and-forget par les services métier).
jest.mock('../email.service');
jest.mock('../inapp.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { Agent, AgentNotificationPref } = require('../../models');
const emailService = require('../email.service');
const inapp = require('../inapp.service');
const notificationService = require('../notification.service');

const creerAgent = (overrides = {}) => Agent.create({
  nom: 'Agent', prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent-${Date.now()}-${Math.random()}@example.com`,
  ...overrides,
});

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
  emailService.sendEmail.mockResolvedValue();
  inapp.push.mockResolvedValue();
});

describe('notifyAgents', () => {
  test('notifie uniquement les agents ayant activé ce type précis de notification', async () => {
    const agentStage = await creerAgent();
    const agentOffre = await creerAgent();
    await AgentNotificationPref.create({ agent_idagents: agentStage.idagents, notificationType: 'STAGE', enabled: 1 });
    await AgentNotificationPref.create({ agent_idagents: agentOffre.idagents, notificationType: 'OFFRE', enabled: 1 });

    await notificationService.notifyAgents('STAGE', 'Sujet', '<p>html</p>');

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: agentStage.email }));
  });

  test('ignore un agent ayant désactivé la notification (enabled=0)', async () => {
    const agent = await creerAgent();
    await AgentNotificationPref.create({ agent_idagents: agent.idagents, notificationType: 'STAGE', enabled: 0 });

    await notificationService.notifyAgents('STAGE', 'Sujet', '<p>html</p>');

    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  test('exclut un agent supprimé même s\'il a la préférence activée', async () => {
    const agent = await creerAgent({ del: 1 });
    await AgentNotificationPref.create({ agent_idagents: agent.idagents, notificationType: 'STAGE', enabled: 1 });

    await notificationService.notifyAgents('STAGE', 'Sujet', '<p>html</p>');

    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  test('continue de notifier les autres agents même si un envoi échoue', async () => {
    const agentA = await creerAgent();
    const agentB = await creerAgent();
    await AgentNotificationPref.create({ agent_idagents: agentA.idagents, notificationType: 'STAGE', enabled: 1 });
    await AgentNotificationPref.create({ agent_idagents: agentB.idagents, notificationType: 'STAGE', enabled: 1 });
    emailService.sendEmail.mockImplementation(({ to }) => {
      if (to === agentA.email) return Promise.reject(new Error('SMTP down'));
      return Promise.resolve();
    });

    await notificationService.notifyAgents('STAGE', 'Sujet', '<p>html</p>');

    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: agentB.email }));
  });

  test('envoie aussi une notification in-app quand un payload est fourni', async () => {
    const agent = await creerAgent();
    await AgentNotificationPref.create({ agent_idagents: agent.idagents, notificationType: 'STAGE', enabled: 1 });

    await notificationService.notifyAgents('STAGE', 'Sujet', '<p>html</p>', { type: 'STAGE', titre: 'X', message: 'Y', link: '/x' });

    expect(inapp.push).toHaveBeenCalledWith(expect.objectContaining({ recipientType: 'AGENT', recipientId: agent.idagents }));
  });

  test('ne lève jamais d\'exception même si la requête DB échoue', async () => {
    // notificationType invalide pour l'ENUM : la requête sous-jacente peut échouer,
    // mais notifyAgents doit l'absorber silencieusement (try/catch englobant).
    await expect(notificationService.notifyAgents('TYPE_INEXISTANT', 'Sujet', '<p>html</p>')).resolves.not.toThrow();
  });
});
