// Test d'intégration : transfererStage et approuverStage — toutes les deux
// protégées par le même cloisonnement par direction (assertAgentOwnsDirection)
// que les autres actions de stage, plus leurs propres règles de transition
// (statuts non transférables, direction inchangée, statut EN_ATTENTE requis).
const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Service, Agent, Stage } = require('../../models');
const stageService = require('../stage.service');

const creerAgent = (directionId, overrides = {}) => Agent.create({
  direction_iddirection: directionId,
  nom: 'Agent', prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
  ...overrides,
});

const creerStage = async (direction, overrides = {}) => {
  const candidat = await creerCandidat();
  return Stage.create({
    candidats_idcandidats: candidat.idcandidats,
    typeStage: 'SOUTENANCE',
    domaineStage: 'Développement web',
    dureeStage: 2,
    dateDebutSouhaitee: '2026-01-01',
    direction_iddirection: direction.iddirection,
    statusStage: 'EN_ATTENTE',
    ...overrides,
  });
};

beforeEach(async () => {
  await resetDb();
});

describe('transfererStage', () => {
  test('transfère un stage EN_ATTENTE vers une nouvelle direction', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const stage = await creerStage(direction1);
    const agent = await creerAgent(direction1.iddirection);

    const result = await stageService.transfererStage(stage.idstage, direction2.iddirection, { agentId: agent.idagents, isSystemRole: false });

    expect(result.direction_iddirection).toBe(direction2.iddirection);
    expect(result.service_idservice).toBeNull();
  });

  test('refuse le transfert si la nouvelle direction est la même que l\'actuelle', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const stage = await creerStage(direction1);
    const agent = await creerAgent(direction1.iddirection);

    await expect(
      stageService.transfererStage(stage.idstage, direction1.iddirection, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('déjà rattaché à cette direction');
  });

  test('refuse un agent d\'une autre direction (cloisonnement)', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const direction3 = await Direction.create({ nom: 'D3', accronyme: 'D3' });
    const stage = await creerStage(direction1);
    const agent = await creerAgent(direction2.iddirection); // n'est pas dans direction1

    await expect(
      stageService.transfererStage(stage.idstage, direction3.iddirection, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne relève pas de votre direction');
  });

  test.each(['EN_COURS', 'TERMINE', 'ANNULE', 'SUSPENDU', 'REJETE'])(
    'refuse de transférer un stage au statut non-transférable : %s',
    async (statut) => {
      const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
      const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
      const stage = await creerStage(direction1, { statusStage: statut, dateDebutEffective: '2026-01-01' });
      const agent = await creerAgent(direction1.iddirection);

      await expect(
        stageService.transfererStage(stage.idstage, direction2.iddirection, { agentId: agent.idagents, isSystemRole: false })
      ).rejects.toThrow('ne peut pas être transféré');
    }
  );

  test('un rôle système peut transférer même hors de sa direction', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const stage = await creerStage(direction1);

    const result = await stageService.transfererStage(stage.idstage, direction2.iddirection, { isSystemRole: true });
    expect(result.direction_iddirection).toBe(direction2.iddirection);
  });
});

describe('approuverStage', () => {
  test('passe un stage EN_ATTENTE à PROGRAMMATION_EN_COURS', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const stage = await creerStage(direction);
    const agent = await creerAgent(direction.iddirection);

    const result = await stageService.approuverStage(stage.idstage, agent.matricule, { agentId: agent.idagents, isSystemRole: false });
    expect(result.statusStage).toBe('PROGRAMMATION_EN_COURS');
  });

  test('refuse d\'approuver un stage qui n\'est pas EN_ATTENTE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const stage = await creerStage(direction, { statusStage: 'ACCEPTE' });
    const agent = await creerAgent(direction.iddirection);

    await expect(
      stageService.approuverStage(stage.idstage, agent.matricule, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne peut pas être approuvé');
  });

  test('refuse un agent d\'une autre direction', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const stage = await creerStage(direction1);
    const agent = await creerAgent(direction2.iddirection);

    await expect(
      stageService.approuverStage(stage.idstage, agent.matricule, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne relève pas de votre direction');
  });
});
