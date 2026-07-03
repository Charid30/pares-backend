// Test d'intégration : la couche de permissions HTTP (authorizeModule,
// authorizeAction, authorizeAnyAction) — le dernier rempart avant qu'un agent
// puisse exécuter une action métier. Appelle les middlewares directement avec
// req/res/next simulés, mais contre de vraies lignes Permission en base.
const { resetDb } = require('../../__tests__/helpers/testDb');
const { Role, Permission } = require('../../models');
const { authorizeModule, authorizeAction, authorizeAnyAction } = require('../auth.middleware');

const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const creerRoleAvecPermission = async (module, action) => {
  const role = await Role.create({ accronyme: `ROLE-${Date.now()}-${Math.random()}`, description: 'Rôle test' });
  if (module) {
    await Permission.create({ role_idrole: role.idrole, module, action });
  }
  return role;
};

beforeEach(async () => {
  await resetDb();
});

describe('authorizeModule', () => {
  test('laisse passer un rôle ADMIN sans vérification DB', async () => {
    const req = { user: { roles: ['ADMIN'], roleIds: [999] } };
    const res = mockRes();
    const next = jest.fn();

    await authorizeModule('STAGE')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('laisse passer un rôle personnalisé ayant la permission sur le module', async () => {
    const role = await creerRoleAvecPermission('STAGE', 'CONSULTER');
    const req = { user: { roles: [role.accronyme], roleIds: [role.idrole] } };
    const res = mockRes();
    const next = jest.fn();

    await authorizeModule('STAGE')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('refuse un rôle personnalisé sans aucune permission sur le module', async () => {
    const role = await creerRoleAvecPermission('OFFRE', 'CONSULTER'); // permission sur un AUTRE module
    const req = { user: { roles: [role.accronyme], roleIds: [role.idrole] } };
    const res = mockRes();
    const next = jest.fn();

    await authorizeModule('STAGE')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('refuse un utilisateur non authentifié', async () => {
    const req = { user: null };
    const res = mockRes();
    const next = jest.fn();

    await authorizeModule('STAGE')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('ignore une permission soft-deletée (del=1)', async () => {
    const role = await Role.create({ accronyme: `ROLE-${Date.now()}`, description: 'Rôle test' });
    await Permission.create({ role_idrole: role.idrole, module: 'STAGE', action: 'CONSULTER', del: 1 });
    const req = { user: { roles: [role.accronyme], roleIds: [role.idrole] } };
    const res = mockRes();
    const next = jest.fn();

    await authorizeModule('STAGE')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('authorizeAction', () => {
  test('refuse un rôle ayant le module mais pas l\'action précise', async () => {
    const role = await creerRoleAvecPermission('STAGE', 'CONSULTER');
    const req = { user: { roles: [role.accronyme], roleIds: [role.idrole] } };
    const res = mockRes();
    const next = jest.fn();

    await authorizeAction('STAGE', 'VALIDER')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('laisse passer un rôle ayant exactement l\'action requise', async () => {
    const role = await creerRoleAvecPermission('STAGE', 'VALIDER');
    const req = { user: { roles: [role.accronyme], roleIds: [role.idrole] } };
    const res = mockRes();
    const next = jest.fn();

    await authorizeAction('STAGE', 'VALIDER')(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('authorizeAnyAction', () => {
  test('laisse passer si le rôle a au moins une des actions listées', async () => {
    const role = await creerRoleAvecPermission('STAGE', 'REJETER');
    const req = { user: { roles: [role.accronyme], roleIds: [role.idrole] } };
    const res = mockRes();
    const next = jest.fn();

    await authorizeAnyAction('STAGE', ['VALIDER', 'REJETER'])(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('refuse si le rôle n\'a aucune des actions listées', async () => {
    const role = await creerRoleAvecPermission('STAGE', 'CONSULTER');
    const req = { user: { roles: [role.accronyme], roleIds: [role.idrole] } };
    const res = mockRes();
    const next = jest.fn();

    await authorizeAnyAction('STAGE', ['VALIDER', 'REJETER'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('un agent multi-rôles passe si UN SEUL de ses rôles a la permission', async () => {
    const roleSansPermission = await Role.create({ accronyme: `ROLE-A-${Date.now()}`, description: 'Sans permission' });
    const roleAvecPermission = await creerRoleAvecPermission('STAGE', 'VALIDER');
    const req = { user: { roles: [roleSansPermission.accronyme, roleAvecPermission.accronyme], roleIds: [roleSansPermission.idrole, roleAvecPermission.idrole] } };
    const res = mockRes();
    const next = jest.fn();

    await authorizeAnyAction('STAGE', ['VALIDER', 'REJETER'])(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
