// Test d'intégration : GET /stages/renouvellements — portée par direction.
// Comme la liste « Stage [DIRECTION] », scope=direction limite la liste aux directions
// de l'agent, même s'il a un rôle « lecture globale » (qui, sans scope, voit tout).
jest.mock('../../services/email.service');
jest.mock('../../services/notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage, RenouvellementStage, Role, Permission } = require('../../models');
const { getAllRenouvellements } = require('../stage.controller');
const { authorizeActionSurStage } = require('../../middlewares/auth.middleware');

let d1, d2, candidat, agent, role;

const creerRenouvellement = async (directionId) => {
  const base = {
    candidats_idcandidats: candidat.idcandidats,
    typeStage: 'SOUTENANCE',
    domaineStage: 'Informatique',
    dureeStage: 2,
    dateDebutSouhaitee: '2026-01-01',
    direction_iddirection: directionId,
  };
  const actuel = await Stage.create({ ...base, statusStage: 'EXPIRE' });
  const nouveau = await Stage.create({ ...base, statusStage: 'EN_ATTENTE', stage_parent_idstage: actuel.idstage });
  return RenouvellementStage.create({
    stage_actuel_idstage: actuel.idstage,
    stage_nouveau_idstage: nouveau.idstage,
    dureeDemandee: 2,
    statusRenouvellement: 'EN_ATTENTE',
    dateRenouvellement: new Date(),
  });
};

const appeler = async (query) => {
  const req = {
    query,
    user: { role: role.accronyme, roles: [role.accronyme], roleId: role.idrole, roleIds: [role.idrole], agentId: agent.idagents },
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await getAllRenouvellements(req, res);
  return res.json.mock.calls[0][0].data;
};

beforeEach(async () => {
  await resetDb();
  d1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
  d2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
  candidat = await creerCandidat();
  agent = await Agent.create({
    direction_iddirection: d1.iddirection,
    nom: 'Agent', prenom: 'Test',
    matricule: `MAT-${Date.now()}-${Math.random()}`,
    email: `agent.${Date.now()}.${Math.random()}@example.com`,
  });
  role = await Role.create({ accronyme: `RG-${Date.now()}`, description: 'Sous-admin', lectureGlobale: true });
  await Permission.create({ role_idrole: role.idrole, module: 'RENOUVELLEMENT', action: 'CONSULTER' });
  await creerRenouvellement(d1.iddirection);
  await creerRenouvellement(d2.iddirection);
});

describe('getAllRenouvellements — portée par direction', () => {
  test('scope=direction : seulement les renouvellements des directions de l\'agent', async () => {
    const data = await appeler({ scope: 'direction' });
    expect(data.total).toBe(1);
    expect(data.rows[0].stageNouveau.direction_iddirection).toBe(d1.iddirection);
    expect(data.stats.total).toBe(1);
  });

  test('plusieurs statuts séparés par une virgule (onglets)', async () => {
    expect((await appeler({ scope: 'direction', statusRenouvellement: 'EN_ATTENTE,EN_COURS_DE_TRAITEMENT' })).total).toBe(1);
    expect((await appeler({ scope: 'direction', statusRenouvellement: 'ACCEPTE,EN_COURS' })).total).toBe(0);
  });

  test('sans scope : un rôle lecture globale voit toutes les directions', async () => {
    const data = await appeler({});
    expect(data.total).toBe(2);
  });

  test('lecture globale sur STAGE seulement : pas de vue globale des renouvellements', async () => {
    const roleStage = await Role.create({ accronyme: `RS-${Date.now()}`, description: 'Sous-admin stage', lectureGlobale: true });
    await Permission.create({ role_idrole: roleStage.idrole, module: 'STAGE', action: 'CONSULTER' });
    role = roleStage;
    const data = await appeler({});
    expect(data.total).toBe(1);
  });
});

describe('authorizeActionSurStage — module selon le stage', () => {
  const verifier = async (stageId, permissions) => {
    const r = await Role.create({ accronyme: `RA-${Date.now()}-${Math.random()}`, description: 'Agent' });
    for (const [module, action] of permissions) await Permission.create({ role_idrole: r.idrole, module, action });
    const req = { params: { id: String(stageId) }, user: { role: r.accronyme, roles: [r.accronyme], roleIds: [r.idrole] } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await authorizeActionSurStage('MODIFIER')(req, res, next);
    return { passe: next.mock.calls.length === 1, module: req.permissionModule };
  };

  test('stage de renouvellement : MODIFIER sur RENOUVELLEMENT requis', async () => {
    const enfant = await Stage.findOne({ where: { stage_parent_idstage: { [require('sequelize').Op.ne]: null } } });
    expect(await verifier(enfant.idstage, [['RENOUVELLEMENT', 'MODIFIER']])).toEqual({ passe: true, module: 'RENOUVELLEMENT' });
    expect((await verifier(enfant.idstage, [['STAGE', 'MODIFIER']])).passe).toBe(false);
  });

  test('demande de stage : MODIFIER sur STAGE requis', async () => {
    const racine = await Stage.findOne({ where: { stage_parent_idstage: null } });
    expect(await verifier(racine.idstage, [['STAGE', 'MODIFIER']])).toEqual({ passe: true, module: 'STAGE' });
    expect((await verifier(racine.idstage, [['RENOUVELLEMENT', 'MODIFIER']])).passe).toBe(false);
  });
});
