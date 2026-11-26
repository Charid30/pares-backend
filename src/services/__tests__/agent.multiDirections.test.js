// Agent rattaché à plusieurs directions (2026-11-26) : il voit et traite les dossiers de TOUTES ses directions,
// dans tous les modules. Règle commune (agentDirections.util) : directions cochées, sinon celles de son service,
// sinon la direction historique. Avant, les stages ne lisaient que le service ou la 1re direction.
jest.mock('../email.service');
jest.mock('../notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Service, DirectionService, Agent, AgentDirection, Stage } = require('../../models');
const { resolveAgentDirectionIds } = require('../../utils/agentDirections.util');
const stageService = require('../stage.service');

let d1, d2, d3;

const creerAgent = (overrides = {}) => Agent.create({
  nom: 'Agent', prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
  ...overrides,
});

const agentMultiDirections = async () => {
  const agent = await creerAgent({ direction_iddirection: d1.iddirection });
  await AgentDirection.bulkCreate([d1, d2].map(d => ({ agent_idagents: agent.idagents, direction_iddirection: d.iddirection })));
  return agent;
};

const creerStage = async (direction, overrides = {}) => {
  const candidat = await creerCandidat();
  return Stage.create({
    candidats_idcandidats: candidat.idcandidats, typeStage: 'SOUTENANCE', domaineStage: 'Informatique', dureeStage: 2,
    dateDebutSouhaitee: '2027-01-01', direction_iddirection: direction.iddirection, statusStage: 'EN_ATTENTE', ...overrides,
  });
};

beforeEach(async () => {
  await resetDb();
  d1 = await Direction.create({ nom: 'Direction 1', accronyme: 'D1' });
  d2 = await Direction.create({ nom: 'Direction 2', accronyme: 'D2' });
  d3 = await Direction.create({ nom: 'Direction 3', accronyme: 'D3' });
});

describe('resolveAgentDirectionIds', () => {
  test('agent à plusieurs directions : toutes ses directions', async () => {
    const agent = await agentMultiDirections();
    expect((await resolveAgentDirectionIds(agent.idagents)).sort()).toEqual([d1.iddirection, d2.iddirection].sort());
  });

  test('agent rattaché à un service : les directions du service', async () => {
    const service = await Service.create({ accronyme: 'SVC', description: 'Service' });
    await DirectionService.create({ service_idservice: service.idservice, direction_iddirection: d3.iddirection });
    const agent = await creerAgent({ service_idservice: service.idservice });
    expect(await resolveAgentDirectionIds(agent.idagents)).toEqual([d3.iddirection]);
  });

  test('ancien agent sans ligne agents_directions : la direction historique', async () => {
    const agent = await creerAgent({ direction_iddirection: d2.iddirection });
    expect(await resolveAgentDirectionIds(agent.idagents)).toEqual([d2.iddirection]);
  });
});

describe('stages et renouvellements d\'un agent à plusieurs directions', () => {
  test('la liste contient les demandes de ses deux directions, pas celles des autres', async () => {
    const agent = await agentMultiDirections();
    const s1 = await creerStage(d1);
    const s2 = await creerStage(d2);
    await creerStage(d3);

    const { items } = await stageService.getAllStages({ limit: 50 }, { agentId: agent.idagents, isSystemRole: false });
    const ids = items.map(s => s.idstage).sort();
    expect(ids).toEqual([s1.idstage, s2.idstage].sort());
    expect(items.every(s => s.peutAgir)).toBe(true);
  });

  test('il peut agir sur une demande de sa 2e direction (transfert)', async () => {
    const agent = await agentMultiDirections();
    const stage = await creerStage(d2);
    const result = await stageService.transfererStage(stage.idstage, d3.iddirection, { agentId: agent.idagents, isSystemRole: false });
    expect(result.direction_iddirection).toBe(d3.iddirection);
  });

  test('il ne peut pas agir hors de ses directions', async () => {
    const agent = await agentMultiDirections();
    const stage = await creerStage(d3);
    await expect(
      stageService.transfererStage(stage.idstage, d1.iddirection, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne relève pas de votre direction');
  });
});
