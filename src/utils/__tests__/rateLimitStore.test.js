// Limiteurs de requêtes (store MySQL commun) : chaque limiteur a son propre compteur.
// Bug du 2026-10-24 : tous les limiteurs écrivaient sous la clé « IP » seule → la navigation remplissait le
// compteur de la connexion (10) et le premier essai de connexion répondait « Trop de tentatives… 15 minutes ».
const express = require('express');
const rateLimit = require('express-rate-limit');
const { resetDb } = require('../../__tests__/helpers/testDb');
const { RateLimitEntry } = require('../../models');
const MySQLRateLimitStore = require('../rateLimitStore');

const FENETRE = 15 * 60 * 1000;

/** Mini application avec la même configuration que src/app.js (limite générale + connexion). */
const creerApp = () => {
  const app = express();
  app.use('/api', rateLimit({
    windowMs: FENETRE, max: 300, standardHeaders: true, legacyHeaders: false,
    store: new MySQLRateLimitStore({ windowMs: FENETRE, prefix: 'general:' }),
    skip: (req) => req.originalUrl.startsWith('/api/auth/login'),
  }));
  app.use('/api/auth/login', rateLimit({
    windowMs: FENETRE, max: 20, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
    store: new MySQLRateLimitStore({ windowMs: FENETRE, prefix: 'login:' }),
  }));
  app.get('/api/stages', (req, res) => res.json({ ok: true }));
  app.post('/api/auth/login', (req, res) => (req.query.ok ? res.json({ ok: true }) : res.status(401).json({ ok: false })));
  return app;
};

let serveur;
let base;
beforeEach(async () => {
  await resetDb();
  serveur = creerApp().listen(0);
  base = `http://127.0.0.1:${serveur.address().port}`;
});
afterEach(() => new Promise((r) => serveur.close(r)));

const appeler = (chemin, methode = 'GET') => fetch(base + chemin, { method: methode });

describe('limiteurs de requêtes', () => {
  test('naviguer sur le site ne consomme pas le compteur de la connexion', async () => {
    for (let i = 0; i < 30; i++) await appeler('/api/stages');
    const res = await appeler('/api/auth/login', 'POST'); // mot de passe erroné, une seule fois
    expect(res.status).toBe(401); // et non 429 « Trop de tentatives »
  });

  test('les connexions réussies ne comptent pas ; 20 échecs bloquent la 21e tentative', async () => {
    for (let i = 0; i < 25; i++) expect((await appeler('/api/auth/login?ok=1', 'POST')).status).toBe(200);
    for (let i = 0; i < 20; i++) expect((await appeler('/api/auth/login', 'POST')).status).toBe(401);
    expect((await appeler('/api/auth/login', 'POST')).status).toBe(429);
  });

  test('chaque limiteur écrit sous sa propre clé', async () => {
    await appeler('/api/stages');
    await appeler('/api/auth/login', 'POST');
    const cles = (await RateLimitEntry.findAll()).map((e) => e.key);
    expect(cles.some((k) => k.startsWith('general:'))).toBe(true);
    expect(cles.some((k) => k.startsWith('login:'))).toBe(true);
    expect(cles.every((k) => /^(general|login):/.test(k))).toBe(true);
  });
});
