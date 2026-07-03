// Test d'intégration : permission.service.js — gestion des rôles et permissions.
// Zone critique en sécurité : protection des rôles système (ADMIN/CANDIDAT),
// garde de suppression (pas de rôle en cours d'utilisation), validation stricte
// des modules/actions, et déduplication lors du remplacement complet des permissions.
const { resetDb } = require('../../__tests__/helpers/testDb');
const { Role, Permission, User } = require('../../models');
const permissionService = require('../permission.service');

beforeEach(async () => {
  await resetDb();
});

describe('createRole', () => {
  test('refuse un acronyme réservé à un rôle système', async () => {
    await expect(
      permissionService.createRole('admin', 'Tentative usurpation')
    ).rejects.toThrow('réservé à un rôle système');
  });

  test('refuse un acronyme déjà utilisé', async () => {
    await permissionService.createRole('AGENT_RH', 'Agent RH');
    await expect(
      permissionService.createRole('agent_rh', 'Doublon')
    ).rejects.toThrow('existe déjà');
  });

  test('normalise l\'acronyme en majuscules', async () => {
    const role = await permissionService.createRole('  agent_commercial  ', 'Agent Commercial');
    expect(role.accronyme).toBe('AGENT_COMMERCIAL');
  });

  test('lectureGlobale par défaut à false', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');
    expect(role.lectureGlobale).toBe(false);
  });
});

describe('updateRole', () => {
  test('refuse de modifier un rôle système', async () => {
    const admin = await Role.create({ accronyme: 'ADMIN', description: 'Administrateur' });
    await expect(
      permissionService.updateRole(admin.idrole, 'ADMIN', 'Nouvelle description')
    ).rejects.toThrow('Les rôles système ne peuvent pas être modifiés');
  });

  test('refuse de renommer un rôle vers un acronyme système', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');
    await expect(
      permissionService.updateRole(role.idrole, 'CANDIDAT', 'Usurpation')
    ).rejects.toThrow('réservé à un rôle système');
  });

  test('refuse un acronyme déjà pris par un autre rôle', async () => {
    await permissionService.createRole('AGENT_A', 'Agent A');
    const roleB = await permissionService.createRole('AGENT_B', 'Agent B');
    await expect(
      permissionService.updateRole(roleB.idrole, 'AGENT_A', 'Conflit')
    ).rejects.toThrow('existe déjà');
  });

  test('met à jour normalement un rôle non-système', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Ancienne description');
    const updated = await permissionService.updateRole(role.idrole, 'AGENT_X', 'Nouvelle description', true);
    expect(updated.description).toBe('Nouvelle description');
    expect(updated.lectureGlobale).toBe(true);
  });
});

describe('deleteRole', () => {
  test('refuse de supprimer un rôle système', async () => {
    const candidatRole = await Role.create({ accronyme: 'CANDIDAT', description: 'Candidat' });
    await expect(permissionService.deleteRole(candidatRole.idrole)).rejects.toThrow('ne peuvent pas être supprimés');
  });

  test('refuse de supprimer un rôle encore utilisé par un utilisateur', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');
    await User.create({ username: `user-${Date.now()}`, password: 'x', role_idrole: role.idrole });

    await expect(permissionService.deleteRole(role.idrole)).rejects.toThrow('Impossible de supprimer');
  });

  test('supprime un rôle inutilisé et soft-delete ses permissions', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');
    await permissionService.addPermission(role.idrole, 'STAGE', 'CONSULTER');

    await permissionService.deleteRole(role.idrole);

    const roleEnBase = await Role.findByPk(role.idrole);
    expect(roleEnBase.del).toBe(1);
    const permissionsActives = await Permission.count({ where: { role_idrole: role.idrole, del: 0 } });
    expect(permissionsActives).toBe(0);
  });
});

describe('addPermission', () => {
  test('refuse un module invalide', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');
    await expect(
      permissionService.addPermission(role.idrole, 'MODULE_INEXISTANT', 'CONSULTER')
    ).rejects.toThrow('Module invalide');
  });

  test('refuse une action invalide', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');
    await expect(
      permissionService.addPermission(role.idrole, 'STAGE', 'ACTION_INEXISTANTE')
    ).rejects.toThrow('Action invalide');
  });

  test('refuse une permission déjà existante (pas de doublon)', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');
    await permissionService.addPermission(role.idrole, 'STAGE', 'CONSULTER');

    await expect(
      permissionService.addPermission(role.idrole, 'STAGE', 'CONSULTER')
    ).rejects.toThrow('existe déjà');
  });
});

describe('updateRolePermissions (remplacement complet)', () => {
  test('refuse si un module ou une action est invalide', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');
    await expect(
      permissionService.updateRolePermissions(role.idrole, [{ module: 'STAGE', action: 'INVALIDE' }])
    ).rejects.toThrow('Action invalide');
  });

  test('déduplique les permissions identiques envoyées en double', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');

    const result = await permissionService.updateRolePermissions(role.idrole, [
      { module: 'STAGE', action: 'CONSULTER' },
      { module: 'STAGE', action: 'CONSULTER' }, // doublon
      { module: 'STAGE', action: 'VALIDER' },
    ]);

    expect(result.permissions).toHaveLength(2);
  });

  test('remplace entièrement les anciennes permissions (soft delete) par les nouvelles', async () => {
    const role = await permissionService.createRole('AGENT_X', 'Agent X');
    await permissionService.addPermission(role.idrole, 'OFFRE', 'CONSULTER');

    const result = await permissionService.updateRolePermissions(role.idrole, [
      { module: 'STAGE', action: 'VALIDER' },
    ]);

    expect(result.permissions).toHaveLength(1);
    expect(result.permissions[0].module).toBe('STAGE');
    // L'ancienne permission OFFRE doit être soft-deletée, pas juste ignorée.
    const ancienneActive = await Permission.findOne({ where: { role_idrole: role.idrole, module: 'OFFRE', del: 0 } });
    expect(ancienneActive).toBeNull();
  });
});
