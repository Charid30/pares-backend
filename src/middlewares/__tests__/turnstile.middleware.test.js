// Captcha Turnstile de l'inscription : inactif sans clés, refus sans jeton valide, une panne de Cloudflare ne bloque personne.
const env = require('../../config/env');
const turnstile = require('../turnstile.middleware');

const { cleSiteTurnstile } = turnstile;

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

const appeler = async (turnstileToken) => {
  const res = mockRes();
  const next = jest.fn();
  await turnstile({ ip: '102.180.1.1', body: { turnstileToken } }, res, next);
  return { res, next, corps: res.json.mock.calls[0]?.[0] };
};

const cloudflareRepond = (corps) => {
  global.fetch = jest.fn().mockResolvedValue({ json: async () => corps });
};

describe('turnstile.middleware', () => {
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    env.TURNSTILE_SITE_KEY = 'cle-site';
    env.TURNSTILE_SECRET_KEY = 'cle-secrete';
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete env.TURNSTILE_SITE_KEY;
    delete env.TURNSTILE_SECRET_KEY;
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  test('sans les deux clés : inactif, aucun appel à Cloudflare, pas de clé pour le formulaire', async () => {
    global.fetch = jest.fn();
    delete env.TURNSTILE_SECRET_KEY;

    const { next } = await appeler(undefined);

    expect(next).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(cleSiteTurnstile()).toBeNull();
  });

  test('actif : la clé publique est transmise au formulaire, jamais la clé secrète', () => {
    expect(cleSiteTurnstile()).toBe('cle-site');
  });

  test('jeton absent : refusé sans appeler Cloudflare', async () => {
    global.fetch = jest.fn();

    const { res, next, corps } = await appeler('');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(corps.code).toBe('TURNSTILE_REFUSE');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('jeton accepté : envoie le secret, le jeton et l\'IP à Cloudflare, puis laisse passer', async () => {
    cloudflareRepond({ success: true });

    const { next } = await appeler('jeton-valide');

    expect(next).toHaveBeenCalled();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(JSON.parse(options.body)).toEqual({ secret: 'cle-secrete', response: 'jeton-valide', remoteip: '102.180.1.1' });
  });

  test.each(['invalid-input-response', 'timeout-or-duplicate'])('jeton faux ou déjà utilisé (%s) : refusé', async (code) => {
    cloudflareRepond({ success: false, 'error-codes': [code] });

    const { next, corps } = await appeler('jeton-faux');

    expect(next).not.toHaveBeenCalled();
    expect(corps.code).toBe('TURNSTILE_REFUSE');
  });

  test('Cloudflare injoignable : l\'inscription passe et la panne est journalisée', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));

    const { next } = await appeler('jeton');

    expect(next).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('injoignable'));
  });

  test.each(['invalid-input-secret', 'internal-error'])('erreur hors candidat (%s) : l\'inscription passe et l\'erreur est journalisée', async (code) => {
    cloudflareRepond({ success: false, 'error-codes': [code] });

    const { next } = await appeler('jeton');

    expect(next).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(code));
  });

  test('une panne ne dispense pas du jeton : sans jeton, toujours refusé', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));

    const { next } = await appeler(undefined);

    expect(next).not.toHaveBeenCalled();
  });
});
