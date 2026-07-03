// Test d'intégration : vérifie que le cloisonnement par direction (un agent ne
// peut pas agir sur les stages d'une autre direction, sauf rôle système) est
// réellement appliqué de bout en bout — création en base SQLite en mémoire,
// vraies requêtes Sequelize, vraies associations.
//
// Les emails/notifications sont mockés : ce ne sont que des effets de bord
// "fire and forget" (voir stage.service.js) sans rapport avec ce qu'on teste ici,
// et on ne veut surtout pas qu'un test déclenche un vrai envoi SMTP.
jest.mock('../email.service');
jest.mock('../notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage } = require('../../models');
const stageService = require('../stage.service');

const creerAgent = (directionId, overrides = {}) => Agent.create({
  direction_iddirection: directionId,
  nom: 'Agent',
  prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
  ...overrides,
});

const creerStageEnAttente = (candidatId, directionId) => Stage.create({
  candidats_idcandidats: candidatId,
  typeStage: 'SOUTENANCE',
  domaineStage: 'Développement web',
  dureeStage: 2,
  dateDebutSouhaitee: '2026-09-01',
  direction_iddirection: directionId,
  statusStage: 'EN_ATTENTE',
});

describe('getAllStages — cloisonnement par direction (peutAgir)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  test('un agent voit "peutAgir: true" sur un stage de sa propre direction', async () => {
    const directionA = await Direction.create({ nom: 'Direction A', accronyme: 'DA' });
    const candidat = await creerCandidat();
    const agentA = await creerAgent(directionA.iddirection);
    await creerStageEnAttente(candidat.idcandidats, directionA.iddirection);

    const result = await stageService.getAllStages({}, {
      agentId: agentA.idagents,
      isSystemRole: false,
      isActionSystemRole: false,
      ignoreOwnDirection: false,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].peutAgir).toBe(true);
  });

  test('un agent normal (filtré par direction) ne voit même pas la liste des stages d\'une autre direction', async () => {
    const directionA = await Direction.create({ nom: 'Direction A', accronyme: 'DA' });
    const directionB = await Direction.create({ nom: 'Direction B', accronyme: 'DB' });
    const candidat = await creerCandidat();
    const agentB = await creerAgent(directionB.iddirection);
    await creerStageEnAttente(candidat.idcandidats, directionA.iddirection);

    const result = await stageService.getAllStages({}, {
      agentId: agentB.idagents,
      isSystemRole: false,
      isActionSystemRole: false,
      ignoreOwnDirection: false,
    });

    expect(result.items).toHaveLength(0);
  });

  test('un sous-admin "vue globale" voit le stage mais "peutAgir: false" car hors de sa direction', async () => {
    const directionA = await Direction.create({ nom: 'Direction A', accronyme: 'DA' });
    const directionB = await Direction.create({ nom: 'Direction B', accronyme: 'DB' });
    const candidat = await creerCandidat();
    const agentB = await creerAgent(directionB.iddirection);
    await creerStageEnAttente(candidat.idcandidats, directionA.iddirection);

    // Lecture globale (isSystemRole: true -> pas de filtrage par direction sur la liste)
    // mais sans permission d'action globale (isActionSystemRole: false) et écran "Vue
    // globale" (ignoreOwnDirection: true) -> on voit le stage, mais on ne peut pas agir.
    const result = await stageService.getAllStages({}, {
      agentId: agentB.idagents,
      isSystemRole: true,
      isActionSystemRole: false,
      ignoreOwnDirection: true,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].peutAgir).toBe(false);
  });

  test('l\'écran "Vue globale" (ignoreOwnDirection) masque l\'action même pour la propre direction de l\'agent', async () => {
    const directionA = await Direction.create({ nom: 'Direction A', accronyme: 'DA' });
    const candidat = await creerCandidat();
    const agentA = await creerAgent(directionA.iddirection);
    await creerStageEnAttente(candidat.idcandidats, directionA.iddirection);

    const result = await stageService.getAllStages({}, {
      agentId: agentA.idagents,
      isSystemRole: false,
      isActionSystemRole: false,
      ignoreOwnDirection: true,
    });

    expect(result.items[0].peutAgir).toBe(false);
  });
});

describe('updateStatusStage — un agent ne peut pas rejeter un stage hors de sa direction', () => {
  beforeEach(async () => {
    await resetDb();
  });

  test('l\'agent propriétaire de la direction peut rejeter le stage', async () => {
    const directionA = await Direction.create({ nom: 'Direction A', accronyme: 'DA' });
    const candidat = await creerCandidat();
    const agentA = await creerAgent(directionA.iddirection);
    const stage = await creerStageEnAttente(candidat.idcandidats, directionA.iddirection);

    const updated = await stageService.updateStatusStage(
      stage.idstage,
      { statusStage: 'REJETE', motifRefus: 'Dossier incomplet' },
      null,
      agentA.idagents,
      { agentId: agentA.idagents, isSystemRole: false }
    );

    expect(updated.statusStage).toBe('REJETE');
  });

  test('un agent d\'une autre direction se voit refuser l\'action', async () => {
    const directionA = await Direction.create({ nom: 'Direction A', accronyme: 'DA' });
    const directionB = await Direction.create({ nom: 'Direction B', accronyme: 'DB' });
    const candidat = await creerCandidat();
    const agentB = await creerAgent(directionB.iddirection);
    const stage = await creerStageEnAttente(candidat.idcandidats, directionA.iddirection);

    await expect(
      stageService.updateStatusStage(
        stage.idstage,
        { statusStage: 'REJETE', motifRefus: 'Dossier incomplet' },
        null,
        agentB.idagents,
        { agentId: agentB.idagents, isSystemRole: false }
      )
    ).rejects.toThrow('ne relève pas de votre direction');

    // Le stage ne doit pas avoir été modifié
    const stageInchange = await Stage.findByPk(stage.idstage);
    expect(stageInchange.statusStage).toBe('EN_ATTENTE');
  });

  test('un rôle système (isSystemRole) peut rejeter un stage hors de sa direction', async () => {
    const directionA = await Direction.create({ nom: 'Direction A', accronyme: 'DA' });
    const candidat = await creerCandidat();
    const stage = await creerStageEnAttente(candidat.idcandidats, directionA.iddirection);

    const updated = await stageService.updateStatusStage(
      stage.idstage,
      { statusStage: 'REJETE', motifRefus: 'Dossier incomplet' },
      null,
      null,
      { agentId: null, isSystemRole: true }
    );

    expect(updated.statusStage).toBe('REJETE');
  });
});
