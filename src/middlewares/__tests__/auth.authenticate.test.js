// Test d'intégration : authenticate — extraction du JWT (cookie prioritaire,
// header Bearer en fallback), et surtout la vérification de blacklist (un
// token révoqué à la déconnexion ne doit plus jamais être accepté).
const { resetDb } = require('../../__tests__/helpers/testDb');
const { generateToken } = require('../../utils/jwt.util');
const { addToBlacklist } = require('../../utils/tokenBlacklist');
const { authenticate } = require('../auth.middleware');

const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

beforeEach(async () => {
  await resetDb();
});

describe('authenticate', () => {
  test('refuse une requête sans token', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('refuse un token invalide', async () => {
    const req = { headers: { authorization: 'Bearer token-invalide' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('accepte un token valide via le header Authorization Bearer', async () => {
    const token = generateToken({ id: 1, username: 'jane', role: 'CANDIDAT', candidatId: 42 });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.candidatId).toBe(42);
    expect(req.user.role).toBe('CANDIDAT');
  });

  test('accepte un token valide via le cookie HttpOnly (prioritaire sur le header)', async () => {
    const token = generateToken({ id: 2, username: 'agent.x', role: 'AGENT' });
    const req = { headers: { cookie: `token=${token}; autre=valeur` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.username).toBe('agent.x');
  });

  test('normalise un token multi-rôles', async () => {
    const token = generateToken({ id: 3, username: 'multi', roles: ['STAGE_MANAGER', 'AGENT'], roleIds: [10, 20] });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.user.roles).toEqual(['STAGE_MANAGER', 'AGENT']);
    expect(req.user.roleIds).toEqual([10, 20]);
  });

  test('refuse un token révoqué (blacklisté à la déconnexion)', async () => {
    const token = generateToken({ id: 4, username: 'deconnecte', role: 'AGENT' });
    await addToBlacklist(token);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
