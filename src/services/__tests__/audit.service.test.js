// Test d'intégration : audit.service.js — getAuditLogs (filtres module/action/
// date) et log() qui ne doit jamais lever d'exception (l'audit ne doit jamais
// faire planter l'action métier qu'il journalise).
const { resetDb } = require('../../__tests__/helpers/testDb');
const { AuditLog } = require('../../models');
const auditService = require('../audit.service');

beforeEach(async () => {
  await resetDb();
});

describe('log', () => {
  test('enregistre une entrée correctement', async () => {
    await auditService.log({ agentId: 1, agentNom: 'Jane Doe', action: 'STAGE_ACCEPTE', module: 'STAGE', entityId: 5 });

    const entry = await AuditLog.findOne({ where: { action: 'STAGE_ACCEPTE' } });
    expect(entry.agent_nom).toBe('Jane Doe');
    expect(entry.entity_id).toBe(5);
  });

  test('n\'échoue jamais même avec un champ requis manquant', async () => {
    await expect(auditService.log({ module: 'STAGE' })).resolves.not.toThrow(); // action manquant (NOT NULL)
  });
});

describe('getAuditLogs', () => {
  const creerLog = (overrides = {}) => AuditLog.create({
    action: 'ACTION', module: 'STAGE', agent_nom: 'Jane Doe', ...overrides,
  });

  test('filtre par module', async () => {
    await creerLog({ module: 'STAGE' });
    await creerLog({ module: 'OFFRE' });

    const result = await auditService.getAuditLogs({ module: 'STAGE' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].module).toBe('STAGE');
  });

  test('filtre par recherche sur agent_nom (alias search OU agentNom)', async () => {
    await creerLog({ agent_nom: 'Jane Doe' });
    await creerLog({ agent_nom: 'John Smith' });

    const resultViaSearch = await auditService.getAuditLogs({ search: 'Jane' });
    expect(resultViaSearch.items).toHaveLength(1);

    const resultViaAlias = await auditService.getAuditLogs({ agentNom: 'Smith' });
    expect(resultViaAlias.items).toHaveLength(1);
    expect(resultViaAlias.items[0].agent_nom).toBe('John Smith');
  });

  test('filtre par plage de dates en incluant toute la journée de fin', async () => {
    await creerLog({ createdAt: new Date('2026-01-15T08:00:00Z') });
    await creerLog({ createdAt: new Date('2026-01-15T23:30:00Z') });
    await creerLog({ createdAt: new Date('2026-01-16T01:00:00Z') });

    const result = await auditService.getAuditLogs({ dateDebut: '2026-01-15', dateFin: '2026-01-15' });

    // Les deux logs du 15 janvier doivent être inclus (même celui à 23h30, donc
    // la borne de fin doit couvrir 23:59:59.999 et pas juste minuit).
    expect(result.items).toHaveLength(2);
  });

  test('pagine correctement', async () => {
    for (let i = 0; i < 5; i++) await creerLog();

    const result = await auditService.getAuditLogs({ page: 2, limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.totalPages).toBe(3);
  });
});

describe('getModules / getActions', () => {
  test('retourne les valeurs distinctes triées', async () => {
    await AuditLog.create({ action: 'B_ACTION', module: 'OFFRE', agent_nom: 'X' });
    await AuditLog.create({ action: 'A_ACTION', module: 'STAGE', agent_nom: 'X' });
    await AuditLog.create({ action: 'A_ACTION', module: 'STAGE', agent_nom: 'X' }); // doublon

    expect(await auditService.getModules()).toEqual(['OFFRE', 'STAGE']);
    expect(await auditService.getActions()).toEqual(['A_ACTION', 'B_ACTION']);
  });
});
