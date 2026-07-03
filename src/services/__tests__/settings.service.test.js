// Test d'intégration : changePassword — vérifie le mot de passe actuel avant
// d'autoriser le changement (sinon n'importe quelle session active pourrait
// changer le mot de passe sans le connaître).
const { resetDb } = require('../../__tests__/helpers/testDb');
const { Role, User } = require('../../models');
const settingsService = require('../settings.service');

beforeEach(async () => {
  await resetDb();
});

const creerUtilisateur = async (password) => {
  const role = await Role.create({ accronyme: `R-${Date.now()}-${Math.random()}`, description: 'Rôle' });
  return User.create({ username: `user-${Date.now()}-${Math.random()}`, password, role_idrole: role.idrole });
};

describe('changePassword', () => {
  test('refuse si le mot de passe actuel est incorrect', async () => {
    const user = await creerUtilisateur('ancien-mot-de-passe');

    await expect(
      settingsService.changePassword(user.idusers, 'mauvais-mot-de-passe', 'nouveau-mot-de-passe')
    ).rejects.toThrow('Mot de passe actuel incorrect');
  });

  test('refuse pour un utilisateur inexistant', async () => {
    await expect(
      settingsService.changePassword(999999, 'peu-importe', 'nouveau-mot-de-passe')
    ).rejects.toThrow('Utilisateur introuvable');
  });

  test('change le mot de passe quand l\'ancien est correct', async () => {
    const user = await creerUtilisateur('ancien-mot-de-passe');

    const result = await settingsService.changePassword(user.idusers, 'ancien-mot-de-passe', 'nouveau-mot-de-passe');
    expect(result).toBe(true);

    const userMisAJour = await User.findByPk(user.idusers);
    expect(await userMisAJour.comparePassword('nouveau-mot-de-passe')).toBe(true);
    expect(await userMisAJour.comparePassword('ancien-mot-de-passe')).toBe(false);
  });
});
