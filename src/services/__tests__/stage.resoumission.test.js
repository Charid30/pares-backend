// Test d'intégration : resoumettreStage (IDOR + garde sur les documents non
// conformes) et evaluateRenouvellement (calcul des dates effectives du nouveau
// stage à l'acceptation — début = lendemain de la fin de l'actuel, fin via
// calculerDateFin déjà testé en isolation ; rejet simple sinon).
const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage, RenouvellementStage } = require('../../models');
const stageService = require('../stage.service');

const creerAgent = (directionId, overrides = {}) => Agent.create({
  direction_iddirection: directionId,
  nom: 'Agent', prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
  ...overrides,
});

const creerStage = async (direction, candidatId, overrides = {}) => Stage.create({
  candidats_idcandidats: candidatId,
  typeStage: 'SOUTENANCE',
  domaineStage: 'Développement web',
  dureeStage: 2,
  dateDebutSouhaitee: '2026-01-01',
  direction_iddirection: direction.iddirection,
  statusStage: 'EN_ATTENTE',
  ...overrides,
});

beforeEach(async () => {
  await resetDb();
});

describe('resoumettreStage', () => {
  test('repasse un stage REJETE sans documents non conformes en EN_ATTENTE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, { statusStage: 'REJETE', motifRefus: 'Incomplet' });

    const result = await stageService.resoumettreStage(stage.idstage, candidat.idcandidats);

    expect(result.statusStage).toBe('EN_ATTENTE');
    expect(result.motifRefus).toBeNull();
  });

  test('refuse si le stage n\'est pas REJETE', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, { statusStage: 'EN_ATTENTE' });

    await expect(stageService.resoumettreStage(stage.idstage, candidat.idcandidats)).rejects.toThrow('Seules les demandes rejetées');
  });

  test('refuse tant que des documents rejetés n\'ont pas été remplacés', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const stage = await creerStage(direction, candidat.idcandidats, {
      statusStage: 'REJETE',
      documentsRejetes: JSON.stringify(['cv', 'cnib']),
    });

    await expect(stageService.resoumettreStage(stage.idstage, candidat.idcandidats)).rejects.toThrow('doivent être remplacés');
  });

  test('refuse un candidat qui n\'est pas propriétaire du stage (IDOR)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const proprietaire = await creerCandidat();
    const attaquant = await creerCandidat();
    const stage = await creerStage(direction, proprietaire.idcandidats, { statusStage: 'REJETE' });

    await expect(stageService.resoumettreStage(stage.idstage, attaquant.idcandidats)).rejects.toThrow('Action non autorisée');
  });
});

describe('evaluateRenouvellement', () => {
  const creerRenouvellement = async (direction, candidatId, dateFinStageActuel) => {
    const stageActuel = await creerStage(direction, candidatId, { statusStage: 'EN_COURS', dateFinEffective: dateFinStageActuel });
    const stageNouveau = await creerStage(direction, candidatId, { statusStage: 'EN_ATTENTE', estRenouvellement: 1, stage_parent_idstage: stageActuel.idstage });
    const renouvellement = await RenouvellementStage.create({
      stage_actuel_idstage: stageActuel.idstage,
      stage_nouveau_idstage: stageNouveau.idstage,
      dureeDemandee: 2,
      statusRenouvellement: 'EN_ATTENTE',
    });
    return { stageActuel, stageNouveau, renouvellement };
  };

  test('ACCEPTER calcule les dates effectives du nouveau stage (début = lendemain de la fin de l\'actuel)', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31');
    const agent = await creerAgent(direction.iddirection);

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { agentId: agent.idagents, isSystemRole: false });

    await stageNouveau.reload();
    expect(stageNouveau.statusStage).toBe('ACCEPTE');
    expect(stageNouveau.dateDebutEffective).toBe('2026-04-01'); // lendemain du 31 mars
  });

  test('REJETER met le nouveau stage en REJETE avec le motif, sans toucher aux dates', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const { stageNouveau, renouvellement } = await creerRenouvellement(direction, candidat.idcandidats, '2026-03-31');
    const agent = await creerAgent(direction.iddirection);

    await stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'REJETE', motifRefus: 'Direction saturée' }, { agentId: agent.idagents, isSystemRole: false });

    await stageNouveau.reload();
    expect(stageNouveau.statusStage).toBe('REJETE');
    expect(stageNouveau.motifRefus).toBe('Direction saturée');
    expect(stageNouveau.dateDebutEffective).toBeNull();
  });

  test('refuse un agent d\'une autre direction', async () => {
    const direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const candidat = await creerCandidat();
    const { renouvellement } = await creerRenouvellement(direction1, candidat.idcandidats, '2026-03-31');
    const agent = await creerAgent(direction2.iddirection);

    await expect(
      stageService.evaluateRenouvellement(renouvellement.idrenouvellement, { statusRenouvellement: 'ACCEPTE' }, { agentId: agent.idagents, isSystemRole: false })
    ).rejects.toThrow('ne relève pas de votre direction');
  });
});
