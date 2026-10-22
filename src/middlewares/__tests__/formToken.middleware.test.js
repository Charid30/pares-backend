// Jeton de formulaire d'inscription : 15 min, lié à l'IP et au navigateur, délai minimal de remplissage,
// consommé seulement quand il est accepté (placé après la validation des données dans auth.routes.js).
const formToken = require('../formToken.middleware');
const { generate, DELAI_MINIMUM_MS, TOKEN_TTL_MS } = require('../../utils/formTokenStore');

const CLIENT = { ip: '102.180.1.1', userAgent: 'Mozilla/5.0 Test' };

const requete = (token, client = CLIENT) => ({
  ip: client.ip,
  body: { formToken: token },
  get: (h) => (h.toLowerCase() === 'user-agent' ? client.userAgent : undefined),
});
const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

const appeler = (token, client) => {
  const res = mockRes();
  const next = jest.fn();
  formToken(requete(token, client), res, next);
  return { res, next, corps: res.json.mock.calls[0]?.[0] };
};

describe('formToken.middleware', () => {
  let maintenant;
  beforeEach(() => {
    maintenant = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => maintenant);
  });
  afterEach(() => jest.restoreAllMocks());

  test('accepte un jeton du même client après le délai minimal, puis le refuse (usage unique)', () => {
    const token = generate(CLIENT);
    maintenant += DELAI_MINIMUM_MS + 1000;
    expect(appeler(token).next).toHaveBeenCalled();

    const second = appeler(token);
    expect(second.next).not.toHaveBeenCalled();
    expect(second.corps.code).toBe('FORM_TOKEN_INCONNU');
  });

  test('envoi trop rapide : refusé avec retryAfter, le jeton reste valable', () => {
    const token = generate(CLIENT);
    maintenant += 2000;
    const { res, corps } = appeler(token);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(corps.code).toBe('FORM_TOKEN_TROP_RAPIDE');
    expect(corps.retryAfter).toBe(Math.ceil((DELAI_MINIMUM_MS - 2000) / 1000));

    maintenant += DELAI_MINIMUM_MS;
    expect(appeler(token).next).toHaveBeenCalled();
  });

  test('refuse un jeton utilisé depuis une autre IP ou un autre navigateur', () => {
    const t1 = generate(CLIENT);
    const t2 = generate(CLIENT);
    maintenant += DELAI_MINIMUM_MS + 1000;
    expect(appeler(t1, { ...CLIENT, ip: '10.0.0.9' }).corps.code).toBe('FORM_TOKEN_AUTRE_CLIENT');
    expect(appeler(t2, { ...CLIENT, userAgent: 'curl/8.0' }).corps.code).toBe('FORM_TOKEN_AUTRE_CLIENT');
  });

  test('refuse un jeton expiré (15 min) ou absent', () => {
    const token = generate(CLIENT);
    maintenant += TOKEN_TTL_MS + 1000;
    expect(appeler(token).corps.code).toBe('FORM_TOKEN_EXPIRE');
    expect(appeler(undefined).corps.code).toBe('FORM_TOKEN_ABSENT');
  });
});
