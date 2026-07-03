// Test d'intégration : createAgent — unicité (matricule/email/username), règle
// XOR service/direction, validation des rôles, et surtout le comportement
// transactionnel : un échec en cours de création (ex. rôle introuvable) ne doit
// laisser AUCUNE trace en base (pas d'Agent ni de User orphelin).
jest.mock('../notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { Role, User, Agent, Service, Direction } = require('../../models');
const notifService = require('../notification.service');
const userService = require('../user.service');

// initAgentNotificationPrefs est appelé avec un .catch() direct sur la promesse
// (fire-and-forget) : l'auto-mock par défaut renvoie undefined, ce qui plante.
notifService.initAgentNotificationPrefs.mockResolvedValue();

const creerRole = (accronyme) => Role.create({ accronyme, description: accronyme });

const donneesAgentValides = async (overrides = {}) => {
  const role = await creerRole(`ROLE-${Date.now()}-${Math.random()}`);
  const direction = await Direction.create({ nom: 'Direction Test', accronyme: `DT-${Date.now()}` });
  return {
    nom: 'Agent', prenom: 'Test',
    matricule: `MAT-${Date.now()}-${Math.random()}`,
    email: `agent-${Date.now()}-${Math.random()}@example.com`,
    username: `agent.user.${Date.now()}.${Math.random()}`,
    password: 'motdepasse123',
    direction_iddirection: direction.iddirection,
    role_idrole: role.idrole,
    ...overrides,
  };
};

beforeEach(async () => {
  await resetDb();
});

describe('createAgent', () => {
  test('crée l\'agent, son compte utilisateur, et les lie', async () => {
    const data = await donneesAgentValides();

    const agent = await userService.createAgent(data, 'admin');

    expect(agent.matricule).toBe(data.matricule);
    const userCree = await User.findOne({ where: { username: data.username } });
    expect(userCree).not.toBeNull();
    expect(userCree.role_idrole).toBe(data.role_idrole);
  });

  test('refuse un matricule déjà utilisé', async () => {
    const data1 = await donneesAgentValides();
    await userService.createAgent(data1, 'admin');
    const data2 = await donneesAgentValides({ matricule: data1.matricule });

    await expect(userService.createAgent(data2, 'admin')).rejects.toThrow('Ce matricule est déjà utilisé');
  });

  test('refuse un email déjà utilisé par un autre agent', async () => {
    const data1 = await donneesAgentValides();
    await userService.createAgent(data1, 'admin');
    const data2 = await donneesAgentValides({ email: data1.email });

    await expect(userService.createAgent(data2, 'admin')).rejects.toThrow('Cette adresse email est déjà utilisée');
  });

  test('refuse de renseigner à la fois un service ET une direction', async () => {
    const role = await creerRole(`ROLE-${Date.now()}`);
    const direction = await Direction.create({ nom: 'D', accronyme: `D-${Date.now()}` });
    const service = await Service.create({ accronyme: `S-${Date.now()}`, description: 'Service' });
    const data = await donneesAgentValides({
      role_idrole: role.idrole,
      direction_iddirection: direction.iddirection,
      service_idservice: service.idservice,
    });

    await expect(userService.createAgent(data, 'admin')).rejects.toThrow('soit un service, soit une direction');
  });

  test('refuse de ne renseigner ni service ni direction', async () => {
    const data = await donneesAgentValides({ direction_iddirection: undefined });

    await expect(userService.createAgent(data, 'admin')).rejects.toThrow('Un service ou une direction doit être renseigné');
  });

  test('refuse un rôle inexistant', async () => {
    const data = await donneesAgentValides({ role_idrole: 999999 });

    await expect(userService.createAgent(data, 'admin')).rejects.toThrow('Un ou plusieurs rôles sont introuvables');
  });

  test('annule entièrement la transaction si la création échoue (pas d\'Agent ni de User orphelin)', async () => {
    const data = await donneesAgentValides({ role_idrole: 999999 }); // rôle invalide → échec après ses propres vérifications

    await expect(userService.createAgent(data, 'admin')).rejects.toThrow();

    const agentEnBase = await Agent.findOne({ where: { matricule: data.matricule } });
    const userEnBase = await User.findOne({ where: { username: data.username } });
    expect(agentEnBase).toBeNull();
    expect(userEnBase).toBeNull();
  });

  test('accepte plusieurs rôles (principal + additionnels)', async () => {
    const rolePrincipal = await creerRole(`PRINCIPAL-${Date.now()}`);
    const roleAdditionnel = await creerRole(`ADDITIONNEL-${Date.now()}`);
    const data = await donneesAgentValides({ role_idrole: undefined, roleIds: [rolePrincipal.idrole, roleAdditionnel.idrole] });

    const agent = await userService.createAgent(data, 'admin');

    const user = await User.findOne({ where: { username: data.username } });
    expect(user.role_idrole).toBe(rolePrincipal.idrole);
    const { UserRole } = require('../../models');
    const additionnels = await UserRole.count({ where: { users_idusers: user.idusers, role_idrole: roleAdditionnel.idrole } });
    expect(additionnels).toBe(1);
  });
});
