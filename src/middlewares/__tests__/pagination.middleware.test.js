// Test unitaire : paginationMiddleware — assainit page/limit/sortOrder/sortBy.
// C'est la seule barrière contre un "limit=999999" (DoS sur une requête non
// paginée) ou un "sortBy" arbitraire injecté tel quel dans une clause ORDER BY.
const paginationMiddleware = require('../pagination.middleware');

const runMiddleware = (query, allowedSortFields = []) => {
  const req = { query };
  const next = jest.fn();
  paginationMiddleware(allowedSortFields)(req, {}, next);
  expect(next).toHaveBeenCalled();
  return req.query;
};

describe('page', () => {
  test('défaut à 1 si absent', () => {
    expect(runMiddleware({}).page).toBe(1);
  });

  test('défaut à 1 si négatif ou zéro', () => {
    expect(runMiddleware({ page: '-5' }).page).toBe(1);
    expect(runMiddleware({ page: '0' }).page).toBe(1);
  });

  test('défaut à 1 si non numérique', () => {
    expect(runMiddleware({ page: 'abc' }).page).toBe(1);
  });

  test('accepte une valeur valide', () => {
    expect(runMiddleware({ page: '3' }).page).toBe(3);
  });
});

describe('limit', () => {
  test('défaut à 10 si absent', () => {
    expect(runMiddleware({}).limit).toBe(10);
  });

  test('plafonne à 100 (anti-DoS)', () => {
    expect(runMiddleware({ limit: '999999' }).limit).toBe(100);
  });

  test('défaut à 10 si négatif ou nul', () => {
    expect(runMiddleware({ limit: '-1' }).limit).toBe(10);
    expect(runMiddleware({ limit: '0' }).limit).toBe(10);
  });

  test('accepte une valeur valide dans la plage', () => {
    expect(runMiddleware({ limit: '50' }).limit).toBe(50);
  });
});

describe('sortOrder', () => {
  test('défaut à DESC si absent', () => {
    expect(runMiddleware({}).sortOrder).toBe('DESC');
  });

  test('accepte ASC/DESC insensible à la casse', () => {
    expect(runMiddleware({ sortOrder: 'asc' }).sortOrder).toBe('ASC');
    expect(runMiddleware({ sortOrder: 'desc' }).sortOrder).toBe('DESC');
  });

  test('retombe sur DESC pour une valeur arbitraire (anti-injection)', () => {
    expect(runMiddleware({ sortOrder: "ASC; DROP TABLE stage" }).sortOrder).toBe('DESC');
  });
});

describe('sortBy', () => {
  test('ne touche pas sortBy si aucune liste blanche n\'est fournie', () => {
    expect(runMiddleware({ sortBy: 'nimporte_quoi' }, []).sortBy).toBe('nimporte_quoi');
  });

  test('accepte un champ présent dans la liste blanche', () => {
    expect(runMiddleware({ sortBy: 'nom' }, ['nom', 'createdDate']).sortBy).toBe('nom');
  });

  test('retombe sur le premier champ autorisé si la valeur n\'est pas dans la liste (anti-injection ORDER BY)', () => {
    expect(runMiddleware({ sortBy: "nom; DROP TABLE stage" }, ['nom', 'createdDate']).sortBy).toBe('nom');
  });
});
