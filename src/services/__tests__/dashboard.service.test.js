// Test d'intégration : chiffres du tableau de bord admin (dossiers à traiter, taux de validation, répartition).
jest.mock('../email.service');
jest.mock('../notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, AgentDirection, Stage } = require('../../models');
const dashboardService = require('../dashboard.service');

const ilYa = (jours) => new Date(Date.now() - jours * 24 * 60 * 60 * 1000);
const dansJours = (jours) => ilYa(-jours).toISOString().slice(0, 10);

let direction, directionSansAgent, candidat;

const creerStage = (statusStage, champs = {}) => Stage.create({
  candidats_idcandidats: candidat.idcandidats,
  typeStage: 'SOUTENANCE',
  domaineStage: 'Développement web',
  dureeStage: 2,
  dateDebutSouhaitee: '2026-01-01',
  direction_iddirection: direction.iddirection,
  statusStage,
  ...champs,
});

beforeEach(async () => {
  await resetDb();
  direction = await Direction.create({ nom: 'Ressources humaines', accronyme: 'DRH' });
  directionSansAgent = await Direction.create({ nom: 'Transport et logistique', accronyme: 'DTL' });
  candidat = await creerCandidat();
});

describe('getATraiter', () => {
  it('compte les demandes en attente et en traitement, séparées des conventions à joindre', async () => {
    await creerStage('EN_ATTENTE');
    await creerStage('EN_COURS_DE_TRAITEMENT');
    await creerStage('PROGRAMMATION_EN_COURS');
    await creerStage('EN_COURS');
    await creerStage('REJETE');

    const aTraiter = await dashboardService.getATraiter();

    expect(aTraiter.stages).toBe(2);
    expect(aTraiter.conventions).toBe(1);
    expect(aTraiter.total).toBe(3);
  });

  it('ne compte pas le stage enfant d\'un renouvellement comme une demande', async () => {
    const parent = await creerStage('EXPIRE');
    await creerStage('EN_COURS_DE_TRAITEMENT', { stage_parent_idstage: parent.idstage });

    expect((await dashboardService.getATraiter()).stages).toBe(0);
  });

  it('signale les demandes qui attendent depuis plus de 7 jours', async () => {
    const ancienne = await creerStage('EN_COURS_DE_TRAITEMENT');
    await Stage.update({ createdDate: ilYa(10) }, { where: { idstage: ancienne.idstage }, silent: true });
    await creerStage('EN_COURS_DE_TRAITEMENT');

    expect((await dashboardService.getATraiter()).stagesEnRetard).toBe(1);
  });
});

describe('getSecondaryStats', () => {
  it('calcule le taux sur les demandes décidées, sans les demandes en attente', async () => {
    await creerStage('EN_COURS');
    await creerStage('EXPIRE');
    await creerStage('REJETE');
    await creerStage('REJETE');
    await creerStage('EN_COURS_DE_TRAITEMENT');

    expect((await dashboardService.getSecondaryStats()).tauxValidation).toBe(50);
  });

  it('donne 0 quand aucune demande n\'est décidée', async () => {
    await creerStage('EN_ATTENTE');

    expect((await dashboardService.getSecondaryStats()).tauxValidation).toBe(0);
  });
});

describe('getRepartitionStages', () => {
  it('compte toutes les demandes, y compris expirées et rapport soumis', async () => {
    for (const statut of ['EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'PROGRAMMATION_EN_COURS', 'ACCEPTE', 'EN_COURS', 'EXPIRE', 'RAPPORT_SOUMIS', 'TERMINE', 'REJETE']) {
      await creerStage(statut);
    }

    const { values } = await dashboardService.getRepartitionStages();

    expect(values.reduce((somme, valeur) => somme + valeur, 0)).toBe(9);
  });
});

describe('getStagesParDirection', () => {
  it('classe les directions et signale celles sans agent', async () => {
    const agent = await Agent.create({
      direction_iddirection: direction.iddirection,
      nom: 'Agent', prenom: 'Test',
      matricule: `MAT-${Date.now()}`,
      email: `agent.${Date.now()}@example.com`,
    });
    await AgentDirection.create({ agent_idagents: agent.idagents, direction_iddirection: direction.iddirection });
    await creerStage('EN_COURS_DE_TRAITEMENT');
    await creerStage('EN_COURS_DE_TRAITEMENT', { direction_iddirection: directionSansAgent.iddirection });
    await creerStage('EN_ATTENTE', { direction_iddirection: directionSansAgent.iddirection });

    const directions = await dashboardService.getStagesParDirection();

    expect(directions).toEqual([
      { direction: 'DTL', nombre: 2, agents: 0 },
      { direction: 'DRH', nombre: 1, agents: 1 },
    ]);
  });
});

describe('getStagesBientotTermines', () => {
  it('compte les stages en cours qui finissent dans les 7 jours', async () => {
    await creerStage('EN_COURS', { dateFinEffective: dansJours(3) });
    await creerStage('EN_COURS', { dateFinEffective: dansJours(30) });
    await creerStage('EXPIRE', { dateFinEffective: dansJours(3) });

    expect(await dashboardService.getStagesBientotTermines()).toBe(1);
  });
});

describe('getChartData', () => {
  it('renvoie les inscriptions et les demandes des 6 derniers mois', async () => {
    await creerStage('EN_ATTENTE');

    const chart = await dashboardService.getChartData();

    expect(chart.labels).toHaveLength(6);
    expect(chart.stagesSoumis[5]).toBe(1);
    expect(chart).not.toHaveProperty('stagesValides');
  });
});
