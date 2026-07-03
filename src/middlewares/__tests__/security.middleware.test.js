// Test d'intégration : securityMiddleware — détection d'injection (SQL, XSS,
// path traversal, commandes) et bannissement automatique d'IP après 2
// tentatives. C'est le seul rempart entre une requête malveillante et
// l'application : un faux négatif laisse passer une attaque, un faux positif
// bloque un utilisateur légitime.
const { resetDb } = require('../../__tests__/helpers/testDb');
const BannedIp = require('../../models/BannedIp');
const AuditLog = require('../../models/AuditLog');
const securityMiddleware = require('../security.middleware');

const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const requete = (overrides = {}) => ({
  ip: `10.0.0.${Math.floor(Math.random() * 250)}`,
  body: {},
  params: {},
  query: {},
  originalUrl: '/api/test',
  method: 'POST',
  ...overrides,
});

beforeEach(async () => {
  await resetDb();
});

// recordAttempt() n'est jamais "await" par securityMiddleware (fire-and-forget
// volontaire, pour ne pas ralentir la réponse) : il faut attendre activement que
// l'écriture en base apparaisse avant de passer au test suivant (qui appelle
// resetDb()), sinon l'écriture en arrière-plan du test précédent atterrit pendant
// que le schéma est en train d'être recréé.
const attendreBannedIp = async (ip, predicate, timeoutMs = 1000) => {
  const debut = Date.now();
  while (Date.now() - debut < timeoutMs) {
    const record = await BannedIp.findOne({ where: { ip_address: ip } });
    if (record && predicate(record)) return record;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`Timeout en attendant BannedIp pour ${ip}`);
};

describe('securityMiddleware — requêtes légitimes', () => {
  test('laisse passer une requête sans contenu suspect', async () => {
    const req = requete({ body: { titre: 'Demande de stage en développement web' } });
    const res = mockRes();
    const next = jest.fn();

    await securityMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('ne bloque pas un texte légitime contenant des mots du champ lexical SQL', async () => {
    // "Sélection" et "Update" en français ne doivent pas matcher les patterns SQL stricts.
    const req = requete({ body: { domaineStage: 'Mise à jour des bases de données et sélection de candidats' } });
    const res = mockRes();
    const next = jest.fn();

    await securityMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('securityMiddleware — détection d\'injection', () => {
  test.each([
    ['SQL UNION SELECT', { q: "1 UNION SELECT username, password FROM users" }],
    ["SQL OR tautologie", { username: "admin' OR '1'='1" }],
    ['SQL stacked query', { id: "1; DROP TABLE users" }],
    ['XSS script tag', { commentaire: '<script>alert(1)</script>' }],
    ['XSS javascript: URI', { lien: 'javascript:alert(document.cookie)' }],
    ['XSS event handler', { html: '<img src=x onerror=alert(1)>' }],
    ['Path traversal', { fichier: '../../../../etc/passwd' }],
    ['Command injection', { nom: 'test; rm -rf /' }],
  ])('détecte et bloque : %s', async (_label, payload) => {
    const ip = requete().ip;
    const req = requete({ ip, body: payload });
    const res = mockRes();
    const next = jest.fn();

    await securityMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    await attendreBannedIp(ip, (r) => r.attempts >= 1);
  });

  test('détecte le contenu suspect aussi bien dans params et query que dans body', async () => {
    const ip = requete().ip;
    const req = requete({ ip, body: {}, params: { id: "1 UNION SELECT * FROM users" } });
    const res = mockRes();
    const next = jest.fn();

    await securityMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    await attendreBannedIp(ip, (r) => r.attempts >= 1);
  });

  test('détecte un payload imbriqué dans un objet niché', async () => {
    const ip = requete().ip;
    const req = requete({ ip, body: { adresse: { ville: 'Ouaga', rue: '<script>alert(1)</script>' } } });
    const res = mockRes();
    const next = jest.fn();

    await securityMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    await attendreBannedIp(ip, (r) => r.attempts >= 1);
  });
});

describe('securityMiddleware — bannissement automatique', () => {
  test('la 1ère tentative ne bannit pas l\'IP', async () => {
    const ip = '203.0.113.10';
    const req = requete({ ip, body: { x: "1 UNION SELECT * FROM users" } });
    await securityMiddleware(req, mockRes(), jest.fn());

    const record = await attendreBannedIp(ip, (r) => r.attempts >= 1);
    expect(record.attempts).toBe(1);
    expect(record.banned_until).toBeNull();

    // Une requête légitime suivante depuis la même IP doit donc encore passer.
    const reqSuivante = requete({ ip, body: { titre: 'Stage normal' } });
    const next = jest.fn();
    await securityMiddleware(reqSuivante, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('bannit l\'IP après 2 tentatives (BAN_THRESHOLD)', async () => {
    const ip = '203.0.113.20';
    await securityMiddleware(requete({ ip, body: { x: "1 UNION SELECT * FROM users" } }), mockRes(), jest.fn());
    await attendreBannedIp(ip, (r) => r.attempts >= 1);
    await securityMiddleware(requete({ ip, body: { x: '<script>alert(1)</script>' } }), mockRes(), jest.fn());
    const record = await attendreBannedIp(ip, (r) => r.attempts >= 2);

    expect(record.attempts).toBe(2);
    expect(record.banned_until).not.toBeNull();
    expect(new Date(record.banned_until).getTime()).toBeGreaterThan(Date.now());
  });

  test('une IP bannie reçoit 403 même pour une requête parfaitement légitime', async () => {
    const ip = '203.0.113.30';
    await BannedIp.create({ ip_address: ip, attempts: 2, banned_until: new Date(Date.now() + 3600000) });

    const req = requete({ ip, body: { titre: 'Demande tout à fait normale' } });
    const res = mockRes();
    const next = jest.fn();

    await securityMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('une IP dont le bannissement est expiré n\'est plus bloquée', async () => {
    const ip = '203.0.113.40';
    await BannedIp.create({ ip_address: ip, attempts: 2, banned_until: new Date(Date.now() - 1000) });

    const req = requete({ ip, body: { titre: 'Demande normale' } });
    const res = mockRes();
    const next = jest.fn();

    await securityMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  test('journalise chaque tentative dans AuditLog avec le module SECURITE', async () => {
    const ip = '203.0.113.50';
    await securityMiddleware(requete({ ip, body: { x: '<script>alert(1)</script>' } }), mockRes(), jest.fn());
    await attendreBannedIp(ip, (r) => r.attempts >= 1);

    const log = await AuditLog.findOne({ where: { module: 'SECURITE', ip_address: ip } });
    expect(log).not.toBeNull();
    expect(log.action).toBe('INJECTION_TENTATIVE');
  });
});
