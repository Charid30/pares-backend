// Test d'intégration : le cron de transition automatique des statuts de stage
// (ACCEPTE → EN_COURS à la date de début, EN_COURS → EXPIRE à la date de fin).
// Logique sensible aux fuseaux/bornes de date, qui tourne sans supervision humaine —
// une erreur silencieuse ici fait dériver le statut réel de centaines de stages.
const { resetDb } = require('../../__tests__/helpers/testDb');
const { Direction, Service, Stage } = require('../../models');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { activerStagesAcceptes, expirerStagesEnCours, updateAllStageStatuses } = require('../stageStatusJob');

const creerDirectionEtService = async () => {
  const direction = await Direction.create({ nom: 'Direction Test', accronyme: 'DT' });
  const service = await Service.create({ accronyme: 'SVC', description: 'Service test' });
  return { direction, service };
};

const isoDansNJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

const creerStage = async (direction, service, overrides = {}) => {
  const candidat = await creerCandidat();
  return Stage.create({
    candidats_idcandidats: candidat.idcandidats,
    typeStage: 'SOUTENANCE',
    domaineStage: 'Développement web',
    dureeStage: 2,
    dateDebutSouhaitee: '2026-01-01',
    direction_iddirection: direction.iddirection,
    service_idservice: service.idservice,
    ...overrides,
  });
};

beforeEach(async () => {
  await resetDb();
});

describe('activerStagesAcceptes', () => {
  test('active un stage ACCEPTE dont la date de début est aujourd\'hui', async () => {
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStage(direction, service, { statusStage: 'ACCEPTE', dateDebutEffective: isoDansNJours(0) });

    const count = await activerStagesAcceptes();

    expect(count).toBe(1);
    await stage.reload();
    expect(stage.statusStage).toBe('EN_COURS');
  });

  test('active un stage ACCEPTE dont la date de début est dans le passé', async () => {
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStage(direction, service, { statusStage: 'ACCEPTE', dateDebutEffective: isoDansNJours(-3) });

    await activerStagesAcceptes();

    await stage.reload();
    expect(stage.statusStage).toBe('EN_COURS');
  });

  test('ne touche pas un stage ACCEPTE dont la date de début est dans le futur', async () => {
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStage(direction, service, { statusStage: 'ACCEPTE', dateDebutEffective: isoDansNJours(5) });

    const count = await activerStagesAcceptes();

    expect(count).toBe(0);
    await stage.reload();
    expect(stage.statusStage).toBe('ACCEPTE');
  });

  test('ne touche pas un stage dans un autre statut, même avec une date de début passée', async () => {
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStage(direction, service, { statusStage: 'EN_ATTENTE', dateDebutEffective: isoDansNJours(-3) });

    await activerStagesAcceptes();

    await stage.reload();
    expect(stage.statusStage).toBe('EN_ATTENTE');
  });
});

describe('expirerStagesEnCours', () => {
  test('n\'expire PAS un stage EN_COURS dont la date de fin est aujourd\'hui (dernier jour actif)', async () => {
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStage(direction, service, { statusStage: 'EN_COURS', dateFinEffective: isoDansNJours(0) });

    const count = await expirerStagesEnCours();

    expect(count).toBe(0);
    await stage.reload();
    expect(stage.statusStage).toBe('EN_COURS'); // encore actif aujourd'hui
  });

  test('expire un stage EN_COURS dont la date de fin était hier', async () => {
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStage(direction, service, { statusStage: 'EN_COURS', dateFinEffective: isoDansNJours(-1) });

    const count = await expirerStagesEnCours();

    expect(count).toBe(1);
    await stage.reload();
    expect(stage.statusStage).toBe('EXPIRE');
  });

  test('ne touche pas un stage EN_COURS dont la date de fin est dans le futur', async () => {
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStage(direction, service, { statusStage: 'EN_COURS', dateFinEffective: isoDansNJours(1) });

    const count = await expirerStagesEnCours();

    expect(count).toBe(0);
    await stage.reload();
    expect(stage.statusStage).toBe('EN_COURS');
  });

  test('ne fait pas expirer un stage déjà TERMINE (rapport validé)', async () => {
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStage(direction, service, { statusStage: 'TERMINE', dateFinEffective: isoDansNJours(-10) });

    await expirerStagesEnCours();

    await stage.reload();
    expect(stage.statusStage).toBe('TERMINE');
  });
});

describe('updateAllStageStatuses', () => {
  test('applique les deux transitions en une seule passe', async () => {
    const { direction, service } = await creerDirectionEtService();
    const aActiver = await creerStage(direction, service, { statusStage: 'ACCEPTE', dateDebutEffective: isoDansNJours(-1) });
    const aExpirer = await creerStage(direction, service, { statusStage: 'EN_COURS', dateFinEffective: isoDansNJours(-1) });

    const result = await updateAllStageStatuses();

    expect(result).toEqual({ activated: 1, expired: 1 });
    await aActiver.reload();
    await aExpirer.reload();
    expect(aActiver.statusStage).toBe('EN_COURS');
    expect(aExpirer.statusStage).toBe('EXPIRE');
  });
});
