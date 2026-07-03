// Test d'intégration : hasGlobalReadAccess / hasGlobalActionAccess — le cœur
// du bypass "lecture globale" (sous-admin voit/agit sur tous les stages malgré
// le cloisonnement par direction). Construit et testé plus tôt dans le projet ;
// c'est la logique la plus sensible en termes de sécurité de tout le module STAGE.
const { resetDb } = require('../../__tests__/helpers/testDb');
const { Role, Permission } = require('../../models');
const { hasGlobalReadAccess, hasGlobalActionAccess } = require('../stage.controller');

beforeEach(async () => {
  await resetDb();
});

const creerRoleLectureGlobale = async (module, action) => {
  const role = await Role.create({
    accronyme: `RG-${Date.now()}-${Math.random()}`,
    description: 'Rôle lecture globale',
    lectureGlobale: true,
  });
  await Permission.create({ role_idrole: role.idrole, module, action });
  return role;
};

describe('hasGlobalReadAccess', () => {
  test('vrai pour un rôle système, même sans permission DB', async () => {
    const result = await hasGlobalReadAccess({ roles: ['ADMIN'], roleIds: [999] }, 'STAGE');
    expect(result).toBe(true);
  });

  test('vrai pour un rôle lectureGlobale ayant CONSULTER sur le module', async () => {
    const role = await creerRoleLectureGlobale('STAGE', 'CONSULTER');
    const result = await hasGlobalReadAccess({ roles: [role.accronyme], roleIds: [role.idrole] }, 'STAGE');
    expect(result).toBe(true);
  });

  test('faux pour un rôle lectureGlobale ayant CONSULTER sur un AUTRE module', async () => {
    const role = await creerRoleLectureGlobale('OFFRE', 'CONSULTER');
    const result = await hasGlobalReadAccess({ roles: [role.accronyme], roleIds: [role.idrole] }, 'STAGE');
    expect(result).toBe(false);
  });

  test('faux pour un rôle normal (lectureGlobale=false) même avec CONSULTER sur STAGE', async () => {
    const role = await Role.create({ accronyme: `RN-${Date.now()}`, description: 'Rôle normal', lectureGlobale: false });
    await Permission.create({ role_idrole: role.idrole, module: 'STAGE', action: 'CONSULTER' });

    const result = await hasGlobalReadAccess({ roles: [role.accronyme], roleIds: [role.idrole] }, 'STAGE');
    expect(result).toBe(false);
  });

  test('faux pour un rôle lectureGlobale ayant seulement VALIDER (pas CONSULTER)', async () => {
    const role = await creerRoleLectureGlobale('STAGE', 'VALIDER');
    const result = await hasGlobalReadAccess({ roles: [role.accronyme], roleIds: [role.idrole] }, 'STAGE');
    expect(result).toBe(false);
  });

  test('faux pour un utilisateur sans roleIds', async () => {
    const result = await hasGlobalReadAccess({ roles: ['CANDIDAT'] }, 'STAGE');
    expect(result).toBe(false);
  });
});

describe('hasGlobalActionAccess', () => {
  test('vrai pour un rôle lectureGlobale ayant une des actions demandées', async () => {
    const role = await creerRoleLectureGlobale('STAGE', 'VALIDER');
    const result = await hasGlobalActionAccess({ roleIds: [role.idrole] }, 'STAGE', ['VALIDER', 'REJETER']);
    expect(result).toBe(true);
  });

  test('faux pour un rôle lectureGlobale n\'ayant aucune des actions demandées', async () => {
    const role = await creerRoleLectureGlobale('STAGE', 'CONSULTER');
    const result = await hasGlobalActionAccess({ roleIds: [role.idrole] }, 'STAGE', ['VALIDER', 'REJETER']);
    expect(result).toBe(false);
  });

  test('faux pour un rôle ayant l\'action mais SANS le flag lectureGlobale', async () => {
    // C'est la garantie de sécurité centrale : un rôle d'action classique (ex. "Approbateur
    // de stage" direction-scoped) ne doit JAMAIS obtenir un accès toutes-directions ici,
    // même s'il a explicitement la permission VALIDER sur STAGE.
    const role = await Role.create({ accronyme: `RA-${Date.now()}`, description: 'Approbateur', lectureGlobale: false });
    await Permission.create({ role_idrole: role.idrole, module: 'STAGE', action: 'VALIDER' });

    const result = await hasGlobalActionAccess({ roleIds: [role.idrole] }, 'STAGE', ['VALIDER', 'REJETER']);
    expect(result).toBe(false);
  });

  test('ne bypass pas automatiquement pour un rôle système (contrairement à hasGlobalReadAccess)', async () => {
    // hasGlobalActionAccess ne fait AUCUN raccourci ADMIN : il vérifie strictement
    // la table Permission/Role, par design (voir le commentaire dans stage.controller.js).
    const result = await hasGlobalActionAccess({ roles: ['ADMIN'], roleIds: [] }, 'STAGE', ['VALIDER']);
    expect(result).toBe(false);
  });
});
