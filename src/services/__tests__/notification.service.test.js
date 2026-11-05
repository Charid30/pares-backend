// Test d'intégration : notifyAgents — décide QUI reçoit une notification de
// nouvelle demande. Filtre sur le type, le flag enabled, et exclut les agents
// supprimés ; un agent dont l'envoi d'email échoue ne doit jamais empêcher les
// autres d'être notifiés, et la fonction ne doit jamais lever d'exception
// (elle est appelée en fire-and-forget par les services métier).
jest.mock('../email.service');
jest.mock('../inapp.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const {
  Agent, AgentNotificationPref, Direction, Permission, Role, Service, User, UserAgent,
} = require('../../models');
const emailService = require('../email.service');
const inapp = require('../inapp.service');
const notificationService = require('../notification.service');
const { runAideReminderJob } = require('../../jobs/aideReminderJob');

let roleAdmin;
let compteur = 0;

const lierRole = async (agent, role) => {
  compteur += 1;
  const user = await User.create({ username: `user${compteur}`, password: 'motdepasse123', role_idrole: role.idrole });
  await UserAgent.create({ users_idusers: user.idusers, agents_idagents: agent.idagents });
};

// Par défaut un agent administrateur : ces tests portent sur les préférences, pas sur les droits
const creerAgent = async ({ role, ...overrides } = {}) => {
  const agent = await Agent.create({
    nom: 'Agent', prenom: 'Test',
    matricule: `MAT-${Date.now()}-${Math.random()}`,
    email: `agent-${Date.now()}-${Math.random()}@example.com`,
    ...overrides,
  });
  await lierRole(agent, role ?? roleAdmin);
  return agent;
};

const creerRole = async (accronyme, permissions = [], lectureGlobale = false) => {
  const role = await Role.create({ accronyme, description: accronyme, lectureGlobale });
  for (const [module, action] of permissions) {
    await Permission.create({ role_idrole: role.idrole, module, action });
  }
  return role;
};

const creerDirection = (accronyme) => Direction.create({ nom: accronyme, accronyme });

const avecPref = async (agent, notificationType = 'STAGE') => {
  await AgentNotificationPref.create({ agent_idagents: agent.idagents, notificationType, enabled: 1 });
  return agent;
};

const destinataires = async (type, directionId) => (await notificationService.agentsDestinataires(type, directionId))
  .map(a => a.idagents).sort((a, b) => a - b);

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
  emailService.sendEmail.mockResolvedValue();
  inapp.push.mockResolvedValue();
  roleAdmin = await Role.create({ accronyme: 'ADMIN', description: 'Admin' });
});

describe('agentsDestinataires', () => {
  test('une demande de la DSI ne va qu\'aux agents de la DSI ayant un droit sur le module', async () => {
    const dsi = await creerDirection('DSI');
    const drh = await creerDirection('DRH');
    const approbateur = await creerRole('APPROBATEUR', [['STAGE', 'APPROUVER']]);
    const sansStage = await creerRole('COURRIER', [['OFFRE', 'CONSULTER']]);

    const agentDsi = await avecPref(await creerAgent({ role: approbateur, direction_iddirection: dsi.iddirection }));
    await avecPref(await creerAgent({ role: approbateur, direction_iddirection: drh.iddirection }));
    await avecPref(await creerAgent({ role: sansStage, direction_iddirection: dsi.iddirection }));

    expect(await destinataires('STAGE', dsi.iddirection)).toEqual([agentDsi.idagents]);
  });

  test('consulter suffit pour un dossier de sa direction', async () => {
    const dsi = await creerDirection('DSI');
    const lecteur = await creerRole('LECTEUR', [['STAGE', 'CONSULTER']]);
    const agent = await avecPref(await creerAgent({ role: lecteur, direction_iddirection: dsi.iddirection }));

    expect(await destinataires('STAGE', dsi.iddirection)).toEqual([agent.idagents]);
  });

  test('prend la direction du service de l\'agent', async () => {
    const dsi = await creerDirection('DSI');
    const service = await Service.create({ nom: 'Réseaux', accronyme: 'RES', description: 'Réseaux' });
    await service.addDirection(dsi);
    const approbateur = await creerRole('APPROBATEUR', [['STAGE', 'APPROUVER']]);
    const agent = await avecPref(await creerAgent({ role: approbateur, service_idservice: service.idservice }));

    expect(await destinataires('STAGE', dsi.iddirection)).toEqual([agent.idagents]);
  });

  test('un rôle à lecture globale ne reçoit que ses propres directions', async () => {
    const dsi = await creerDirection('DSI');
    const drh = await creerDirection('DRH');
    const rh = await creerRole('SOUS_ADMIN RH', [['STAGE', 'VALIDER']], true);
    const agent = await avecPref(await creerAgent({ role: rh, direction_iddirection: drh.iddirection }));

    expect(await destinataires('STAGE', drh.iddirection)).toEqual([agent.idagents]);
    expect(await destinataires('STAGE', dsi.iddirection)).toEqual([]);
  });

  test('un administrateur reçoit tout, sauf s\'il a désactivé la notification', async () => {
    const dsi = await creerDirection('DSI');
    const admin = await avecPref(await creerAgent());
    await creerAgent();

    expect(await destinataires('STAGE', dsi.iddirection)).toEqual([admin.idagents]);
    expect(await destinataires('STAGE', null)).toEqual([admin.idagents]);
  });

  test('sans direction : seuls les rôles globaux avec un droit d\'action (et les admins)', async () => {
    const dsi = await creerDirection('DSI');
    const global = await creerRole('SOUS-ADMIN', [['OFFRE', 'VALIDER']], true);
    const globalLecture = await creerRole('LECTURE', [['OFFRE', 'CONSULTER']], true);
    const local = await creerRole('LOCAL', [['OFFRE', 'VALIDER']]);
    const agentGlobal = await avecPref(await creerAgent({ role: global }), 'OFFRE');
    await avecPref(await creerAgent({ role: globalLecture }), 'OFFRE');
    await avecPref(await creerAgent({ role: local, direction_iddirection: dsi.iddirection }), 'OFFRE');

    expect(await destinataires('OFFRE', null)).toEqual([agentGlobal.idagents]);
  });

  test('les audiences suivent le module DEMANDE_AUDIENCE', async () => {
    const dsi = await creerDirection('DSI');
    const audience = await creerRole('DEMAUD', [['DEMANDE_AUDIENCE', 'CONSULTER']]);
    const agent = await avecPref(await creerAgent({ role: audience, direction_iddirection: dsi.iddirection }), 'AUDIENCE');

    expect(await destinataires('AUDIENCE', dsi.iddirection)).toEqual([agent.idagents]);
  });

  test('exclut un agent désactivé', async () => {
    await avecPref(await creerAgent({ actif: false }));

    expect(await destinataires('STAGE', null)).toEqual([]);
  });
});

describe('onNouvelleDemandeStage et onStageTransfere', () => {
  const candidat = { nom: 'Doe', prenom: 'Jane' };

  test('une nouvelle demande de stage ne part que vers sa direction', async () => {
    const dsi = await creerDirection('DSI');
    const drh = await creerDirection('DRH');
    const approbateur = await creerRole('APPROBATEUR', [['STAGE', 'APPROUVER']]);
    const agentDsi = await avecPref(await creerAgent({ role: approbateur, direction_iddirection: dsi.iddirection }));
    await avecPref(await creerAgent({ role: approbateur, direction_iddirection: drh.iddirection }));

    await notificationService.onNouvelleDemandeStage(candidat, {
      typeStage: 'SOUTENANCE', domaineStage: 'Informatique', dureeStage: 3,
      dateDebutSouhaitee: '2026-12-01', direction_iddirection: dsi.iddirection,
    });

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: agentDsi.email }));
    expect(inapp.push).toHaveBeenCalledTimes(1);
    expect(inapp.push).toHaveBeenCalledWith(expect.objectContaining({ recipientId: agentDsi.idagents, type: 'NOUVEAU_STAGE' }));
  });

  test('un transfert prévient la nouvelle direction, pas l\'ancienne', async () => {
    const dsi = await creerDirection('DSI');
    const drh = await creerDirection('DRH');
    const approbateur = await creerRole('APPROBATEUR', [['STAGE', 'APPROUVER']]);
    const agentDrh = await avecPref(await creerAgent({ role: approbateur, direction_iddirection: drh.iddirection }));
    await avecPref(await creerAgent({ role: approbateur, direction_iddirection: dsi.iddirection }));

    await notificationService.onStageTransfere(candidat, { domaineStage: 'RH' }, drh);

    expect(inapp.push).toHaveBeenCalledTimes(1);
    expect(inapp.push).toHaveBeenCalledWith(expect.objectContaining({ recipientId: agentDrh.idagents, type: 'STAGE_TRANSFERE' }));
  });
});

describe('runAideReminderJob', () => {
  test('chaque agent ne reçoit que les aides de sa direction', async () => {
    const { Aide } = require('../../models');
    emailService.buildBaseTemplate = jest.fn(contenu => contenu);
    const dsi = await creerDirection('DSI');
    const drh = await creerDirection('DRH');
    const roleAide = await creerRole('AIDESOC', [['AIDE', 'VALIDER']]);
    const agentDsi = await avecPref(await creerAgent({ role: roleAide, direction_iddirection: dsi.iddirection }), 'AIDE');
    await avecPref(await creerAgent({ role: roleAide, direction_iddirection: drh.iddirection }), 'AIDE');
    jest.spyOn(Aide, 'findAll').mockResolvedValue([
      { idaide: 1, titre: 'Aide DSI', typeAide: 'SOCIALE', createdDate: new Date(), direction_iddirection: dsi.iddirection },
    ]);

    await runAideReminderJob();

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: agentDsi.email }));
    expect(inapp.push).toHaveBeenCalledTimes(1);
  });
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
