// Test d'intégration : service.service.js — validation des champs requis et
// unicité de l'acronyme, à la création comme à la modification.
const { resetDb } = require('../../__tests__/helpers/testDb');
const serviceService = require('../service.service');

beforeEach(async () => {
  await resetDb();
});

describe('createService', () => {
  test('refuse sans acronyme', async () => {
    await expect(serviceService.createService({ description: 'Un service' }, 'admin')).rejects.toThrow('L\'acronyme est requis');
  });

  test('refuse sans description', async () => {
    await expect(serviceService.createService({ accronyme: 'SVC' }, 'admin')).rejects.toThrow('La description est requise');
  });

  test('refuse un acronyme déjà utilisé', async () => {
    await serviceService.createService({ accronyme: 'SVC', description: 'Premier' }, 'admin');
    await expect(
      serviceService.createService({ accronyme: 'svc', description: 'Doublon' }, 'admin')
    ).rejects.toThrow('existe déjà');
  });

  test('normalise l\'acronyme en majuscules', async () => {
    const service = await serviceService.createService({ accronyme: 'svc', description: 'Un service' }, 'admin');
    expect(service.accronyme).toBe('SVC');
  });
});

describe('updateService', () => {
  test('refuse de renommer vers un acronyme déjà pris par un autre service', async () => {
    await serviceService.createService({ accronyme: 'SVC1', description: 'Premier' }, 'admin');
    const s2 = await serviceService.createService({ accronyme: 'SVC2', description: 'Second' }, 'admin');

    await expect(
      serviceService.updateService(s2.idservice, { accronyme: 'SVC1' }, 'admin')
    ).rejects.toThrow('existe déjà');
  });

  test('autorise de garder le même acronyme', async () => {
    const s1 = await serviceService.createService({ accronyme: 'SVC1', description: 'Premier' }, 'admin');
    const updated = await serviceService.updateService(s1.idservice, { accronyme: 'svc1', description: 'Renommé' }, 'admin');
    expect(updated.description).toBe('Renommé');
  });
});
