// src/__tests__/helpers/fixtures.js
// Fixtures partagées entre les tests d'intégration de services.
const { Role, User, Candidat } = require('../../models');

// Candidat.users_idusers est une vraie clé étrangère vers users (et users.role_idrole
// vers role) — SQLite applique les contraintes FK, donc il faut créer la chaîne complète.
const creerCandidat = async (overrides = {}) => {
  const role = await Role.create({ accronyme: `CANDIDAT-${Date.now()}-${Math.random()}`, description: 'Candidat' });
  const user = await User.create({
    username: `user.${Date.now()}.${Math.random()}`,
    password: 'motdepasse',
    role_idrole: role.idrole,
  });
  return Candidat.create({
    users_idusers: user.idusers,
    nom: 'Doe',
    prenom: 'Jane',
    email: `jane.${Date.now()}.${Math.random()}@example.com`,
    telephone: `7000${Math.floor(Math.random() * 10000)}`,
    ...overrides,
  });
};

module.exports = { creerCandidat };
