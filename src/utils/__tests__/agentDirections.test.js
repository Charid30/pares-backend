const { getAgentDirections, getAgentDirectionIds } = require('../agentDirections.util');

describe('getAgentDirections', () => {
  test('agent sans service ni direction directe -> aucune direction', () => {
    expect(getAgentDirections(null)).toEqual([]);
    expect(getAgentDirections({})).toEqual([]);
  });

  test('agent rattaché à un service couvrant plusieurs directions', () => {
    const agent = {
      service: {
        directions: [
          { iddirection: 1, nom: 'Direction A', accronyme: 'DA' },
          { iddirection: 2, nom: 'Direction B', accronyme: 'DB' },
        ],
      },
    };
    expect(getAgentDirections(agent)).toEqual([
      { iddirection: 1, nom: 'Direction A', accronyme: 'DA' },
      { iddirection: 2, nom: 'Direction B', accronyme: 'DB' },
    ]);
  });

  test('agent rattaché directement à une direction (pas de service)', () => {
    const agent = {
      directionDirecte: { iddirection: 3, nom: 'Direction C', accronyme: 'DC' },
    };
    expect(getAgentDirections(agent)).toEqual([
      { iddirection: 3, nom: 'Direction C', accronyme: 'DC' },
    ]);
  });

  test('le service (avec directions) est prioritaire sur la direction directe', () => {
    const agent = {
      service: { directions: [{ iddirection: 1, nom: 'A', accronyme: 'A' }] },
      directionDirecte: { iddirection: 9, nom: 'Z', accronyme: 'Z' },
    };
    expect(getAgentDirections(agent)).toEqual([{ iddirection: 1, nom: 'A', accronyme: 'A' }]);
  });

  test('service présent mais sans direction associée -> retombe sur la direction directe', () => {
    const agent = {
      service: { directions: [] },
      directionDirecte: { iddirection: 9, nom: 'Z', accronyme: 'Z' },
    };
    expect(getAgentDirections(agent)).toEqual([{ iddirection: 9, nom: 'Z', accronyme: 'Z' }]);
  });
});

describe('getAgentDirectionIds', () => {
  test('retourne uniquement les ids', () => {
    const agent = {
      service: {
        directions: [
          { iddirection: 1, nom: 'A', accronyme: 'A' },
          { iddirection: 2, nom: 'B', accronyme: 'B' },
        ],
      },
    };
    expect(getAgentDirectionIds(agent)).toEqual([1, 2]);
  });

  test('agent vide -> tableau vide', () => {
    expect(getAgentDirectionIds(null)).toEqual([]);
  });
});