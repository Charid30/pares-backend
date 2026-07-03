// Test d'intégration : direction.service.js — unicité de l'acronyme à la
// création et à la modification (en excluant la direction elle-même).
const { resetDb } = require('../../__tests__/helpers/testDb');
const { Service } = require('../../models');
const directionService = require('../direction.service');

beforeEach(async () => {
  await resetDb();
});

describe('createDirection', () => {
  test('refuse sans nom', async () => {
    await expect(directionService.createDirection({ accronyme: 'DT' }, 'admin')).rejects.toThrow('Le nom est requis');
  });

  test('refuse sans acronyme', async () => {
    await expect(directionService.createDirection({ nom: 'Direction Test' }, 'admin')).rejects.toThrow('L\'acronyme est requis');
  });

  test('normalise l\'acronyme en majuscules', async () => {
    const direction = await directionService.createDirection({ nom: 'Direction Test', accronyme: 'dt' }, 'admin');
    expect(direction.accronyme).toBe('DT');
  });

  test('refuse un acronyme déjà utilisé', async () => {
    await directionService.createDirection({ nom: 'D1', accronyme: 'DT' }, 'admin');
    await expect(directionService.createDirection({ nom: 'D2', accronyme: 'dt' }, 'admin')).rejects.toThrow('existe déjà');
  });

  test('rattache les services fournis', async () => {
    const service = await Service.create({ accronyme: 'SVC', description: 'Service test' });
    const direction = await directionService.createDirection({ nom: 'D1', accronyme: 'DT', serviceIds: [service.idservice] }, 'admin');
    expect(direction.services).toHaveLength(1);
    expect(direction.services[0].idservice).toBe(service.idservice);
  });
});

describe('updateDirection', () => {
  test('refuse de renommer vers un acronyme déjà pris par une autre direction', async () => {
    await directionService.createDirection({ nom: 'D1', accronyme: 'D1A' }, 'admin');
    const d2 = await directionService.createDirection({ nom: 'D2', accronyme: 'D2A' }, 'admin');

    await expect(
      directionService.updateDirection(d2.iddirection, { accronyme: 'D1A' }, 'admin')
    ).rejects.toThrow('existe déjà');
  });

  test('autorise de garder le même acronyme (pas de conflit avec soi-même)', async () => {
    const d1 = await directionService.createDirection({ nom: 'D1', accronyme: 'D1A' }, 'admin');

    const updated = await directionService.updateDirection(d1.iddirection, { accronyme: 'd1a', nom: 'D1 renommée' }, 'admin');
    expect(updated.nom).toBe('D1 renommée');
  });
});
