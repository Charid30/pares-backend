// Test d'intégration : admin-candidat.service.js — création de compte côté
// admin (génération automatique du username, mot de passe temporaire,
// résolution du rôle CANDIDAT) et garde d'unicité email sur la mise à jour.
const { resetDb } = require('../../__tests__/helpers/testDb');
const { Role, Candidat, User } = require('../../models');
const adminCandidatService = require('../admin-candidat.service');

beforeEach(async () => {
  await resetDb();
  await Role.create({ accronyme: 'CANDIDAT', description: 'Candidat' });
});

describe('createCandidat', () => {
  test('génère automatiquement le username (prenom.nom) si non fourni', async () => {
    const result = await adminCandidatService.createCandidat({
      nom: 'Doe', prenom: 'Jane', email: 'jane.doe@example.com', telephone: '70000000',
    });

    expect(result.user.username).toBe('jane.doe');
    expect(result.tempPassword).toMatch(/^PARES@\d{4}$/);
  });

  test('utilise le username fourni s\'il est disponible', async () => {
    const result = await adminCandidatService.createCandidat({
      nom: 'Doe', prenom: 'Jane', email: 'jane2@example.com', telephone: '70000001', username: 'jdoe.custom',
    });

    expect(result.user.username).toBe('jdoe.custom');
  });

  test('refuse un email déjà utilisé par un autre candidat', async () => {
    await adminCandidatService.createCandidat({ nom: 'Doe', prenom: 'Jane', email: 'jane@example.com', telephone: '70000000' });

    await expect(
      adminCandidatService.createCandidat({ nom: 'Smith', prenom: 'John', email: 'jane@example.com', telephone: '70000002' })
    ).rejects.toThrow('Cet email est déjà utilisé');
  });

  test('refuse un username généré qui collisionne avec un compte existant', async () => {
    await adminCandidatService.createCandidat({ nom: 'Doe', prenom: 'Jane', email: 'jane@example.com', telephone: '70000000' });

    await expect(
      adminCandidatService.createCandidat({ nom: 'Doe', prenom: 'Jane', email: 'jane.autre@example.com', telephone: '70000003' })
    ).rejects.toThrow('jane.doe\' est déjà pris');
  });

  test('attribue bien le rôle CANDIDAT au compte créé', async () => {
    const roleCandidat = await Role.findOne({ where: { accronyme: 'CANDIDAT' } });
    const result = await adminCandidatService.createCandidat({
      nom: 'Doe', prenom: 'Jane', email: 'jane@example.com', telephone: '70000000',
    });

    const user = await User.findByPk(result.user.idusers);
    expect(user.role_idrole).toBe(roleCandidat.idrole);
  });
});

describe('updateCandidat', () => {
  test('refuse un email déjà utilisé par un AUTRE candidat', async () => {
    const c1 = await adminCandidatService.createCandidat({ nom: 'Doe', prenom: 'Jane', email: 'jane@example.com', telephone: '70000000' });
    const c2 = await adminCandidatService.createCandidat({ nom: 'Smith', prenom: 'John', email: 'john@example.com', telephone: '70000001' });

    await expect(
      adminCandidatService.updateCandidat(c2.idcandidats, { email: 'jane@example.com' })
    ).rejects.toThrow('Cet email est déjà utilisé');
  });

  test('autorise de garder le même email (pas de conflit avec soi-même)', async () => {
    const c1 = await adminCandidatService.createCandidat({ nom: 'Doe', prenom: 'Jane', email: 'jane@example.com', telephone: '70000000' });

    const updated = await adminCandidatService.updateCandidat(c1.idcandidats, { email: 'jane@example.com', nom: 'Doe-Updated' });
    expect(updated.nom).toBe('Doe-Updated');
  });
});
