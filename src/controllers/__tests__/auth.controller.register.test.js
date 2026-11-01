// Test d'intégration : l'inscription garde l'adresse IP dans le journal d'audit.
jest.mock('../../services/email.service');
jest.mock('../../services/notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { AuditLog, Role, Candidat } = require('../../models');
const { register } = require('../auth.controller');

const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  cookie: jest.fn(),
});

const donnees = () => ({
  username: 'nouveau.candidat',
  password: 'MotDePasse123!',
  nom: 'Doe',
  prenom: 'Jane',
  email: 'jane.doe@example.com',
  telephone: '70112233',
});

beforeEach(async () => {
  await resetDb();
  await Role.create({ idrole: 6, accronyme: 'CANDIDAT', description: 'Candidat' });
});

describe('register', () => {
  test('note l\'adresse IP de l\'inscription dans le journal d\'audit', async () => {
    const res = mockRes();

    await register({ body: donnees(), ip: '203.0.113.20' }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const candidat = await Candidat.findOne({ where: { email: 'jane.doe@example.com' } });
    const log = await AuditLog.findOne({ where: { action: 'CANDIDAT_INSCRIT' } });
    expect(log.module).toBe('CANDIDAT');
    expect(log.entity_id).toBe(candidat.idcandidats);
    expect(log.ip_address).toBe('203.0.113.20');
    expect(log.agent_nom).toBe('nouveau.candidat');
  });

  test('ne note rien quand l\'inscription est refusée', async () => {
    const premiere = mockRes();
    await register({ body: donnees(), ip: '203.0.113.20' }, premiere);

    const res = mockRes();
    await register({ body: donnees(), ip: '203.0.113.21' }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(await AuditLog.count({ where: { action: 'CANDIDAT_INSCRIT' } })).toBe(1);
  });
});
