// Test d'intégration : file de travail du tableau de bord agent.
// Les tâches dépendent des permissions (APPROUVER, VALIDER…) et sont limitées aux
// directions de l'agent ; un rôle système (ADMIN) voit toutes les directions.
const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage, RenouvellementStage, Role, Permission } = require('../../models');
const { construireDashboard } = require('../agentDashboard.controller');

const creerRole = async (permissions) => {
  const role = await Role.create({ accronyme: `R-${Date.now()}-${Math.random()}`, description: 'Rôle test' });
  for (const [module, action] of permissions) {
    await Permission.create({ role_idrole: role.idrole, module, action });
  }
  return role;
};

let d1, d2, candidat, agent;

const creerStage = (directionId, statusStage, extra = {}) => Stage.create({
  candidats_idcandidats: candidat.idcandidats,
  typeStage: 'SOUTENANCE',
  domaineStage: 'Informatique',
  dureeStage: 2,
  dateDebutSouhaitee: '2026-01-01',
  direction_iddirection: directionId,
  statusStage,
  ...extra,
});

const tache = (data, cle) => data.taches.find(t => t.cle === cle);

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

  await creerStage(d1.iddirection, 'EN_ATTENTE');
  await creerStage(d1.iddirection, 'EN_ATTENTE');
  await creerStage(d2.iddirection, 'EN_ATTENTE');
  await creerStage(d1.iddirection, 'PROGRAMMATION_EN_COURS');
  await creerStage(d1.iddirection, 'EN_COURS');
  await creerStage(d2.iddirection, 'EN_COURS');

  const parent = await creerStage(d1.iddirection, 'EXPIRE');
  const enfant = await creerStage(d1.iddirection, 'PROGRAMMATION_EN_COURS', { stage_parent_idstage: parent.idstage });
  await RenouvellementStage.create({
    stage_actuel_idstage: parent.idstage,
    stage_nouveau_idstage: enfant.idstage,
    dureeDemandee: 2,
    statusRenouvellement: 'PROGRAMMATION_EN_COURS',
    dateRenouvellement: new Date(),
  });
});

describe('construireDashboard — file de travail agent', () => {
  test('APPROUVER seul : demandes à approuver de sa direction uniquement', async () => {
    const role = await creerRole([['STAGE', 'CONSULTER'], ['STAGE', 'APPROUVER']]);
    const data = await construireDashboard({ role: role.accronyme, roleIds: [role.idrole], agentId: agent.idagents });

    expect(tache(data, 'STAGES_A_APPROUVER').count).toBe(2);
    expect(tache(data, 'STAGES_A_ACCEPTER')).toBeUndefined();
    expect(tache(data, 'RENOUVELLEMENTS_A_ACCEPTER')).toBeUndefined();
    expect(data.kpis.enStage).toBe(1);
    expect(data.directions.map(d => d.iddirection)).toEqual([d1.iddirection]);
  });

  test('VALIDER : stages et renouvellements à accepter (stages enfants exclus des demandes)', async () => {
    const role = await creerRole([['STAGE', 'CONSULTER'], ['STAGE', 'VALIDER']]);
    const data = await construireDashboard({ role: role.accronyme, roleIds: [role.idrole], agentId: agent.idagents });

    expect(tache(data, 'STAGES_A_APPROUVER')).toBeUndefined();
    expect(tache(data, 'STAGES_A_ACCEPTER').count).toBe(1);
    expect(tache(data, 'RENOUVELLEMENTS_A_ACCEPTER').count).toBe(1);
    expect(data.kpis.aTraiter).toBe(2);
  });

  test('agent sans direction : aucune tâche de stage', async () => {
    const sansDirection = await Agent.create({
      nom: 'Sans', prenom: 'Direction',
      matricule: `MAT-${Date.now()}-${Math.random()}`,
      email: `sans.${Date.now()}.${Math.random()}@example.com`,
    });
    const role = await creerRole([['STAGE', 'APPROUVER']]);
    const data = await construireDashboard({ role: role.accronyme, roleIds: [role.idrole], agentId: sansDirection.idagents });
    expect(data.taches).toEqual([]);
  });

  test('ADMIN : toutes les directions', async () => {
    const data = await construireDashboard({ role: 'ADMIN', roles: ['ADMIN'], agentId: null });
    expect(data.porteeGlobale).toBe(true);
    expect(tache(data, 'STAGES_A_APPROUVER').count).toBe(3);
    expect(data.kpis.enStage).toBe(2);
  });
});
