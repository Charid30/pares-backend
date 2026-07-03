const { calculerDateFin, calculerPeutAgir, calculerDureeEtRepos } = require('../stageCalculs.util');

describe('calculerDateFin', () => {
  test('1 mois à partir du 1er du mois finit le dernier jour du mois (inclusif)', () => {
    expect(calculerDateFin('2026-03-01', 1)).toBe('2026-03-31');
  });

  test('1 mois à partir du 1er février (28/29 jours)', () => {
    expect(calculerDateFin('2026-02-01', 1)).toBe('2026-02-28');
  });

  test('3 mois', () => {
    expect(calculerDateFin('2026-01-15', 3)).toBe('2026-04-14');
  });

  test('12 mois (1 an) reste sur la même date -1 jour', () => {
    expect(calculerDateFin('2026-06-10', 12)).toBe('2027-06-09');
  });

  test('franchissement de fin d\'année', () => {
    expect(calculerDateFin('2025-12-01', 1)).toBe('2025-12-31');
  });
});

describe('calculerPeutAgir', () => {
  test('aucun agentContext (ex: appel candidat) -> toujours autorisé', () => {
    expect(calculerPeutAgir(5, { agentContext: null, agentDirectionIds: [] })).toBe(true);
  });

  test('rôle système/action globale -> toujours autorisé, même hors direction', () => {
    expect(calculerPeutAgir(99, {
      agentContext: { isActionSystemRole: true },
      agentDirectionIds: [1, 2],
    })).toBe(true);
  });

  test('écran "Vue globale" (ignoreOwnDirection) sans accès action -> jamais autorisé', () => {
    expect(calculerPeutAgir(1, {
      agentContext: { isActionSystemRole: false, ignoreOwnDirection: true },
      agentDirectionIds: [1, 2],
    })).toBe(false);
  });

  test('agent normal sur une direction qui lui appartient -> autorisé', () => {
    expect(calculerPeutAgir(2, {
      agentContext: { isActionSystemRole: false, ignoreOwnDirection: false },
      agentDirectionIds: [1, 2],
    })).toBe(true);
  });

  test('agent normal sur une direction hors de la sienne -> refusé', () => {
    expect(calculerPeutAgir(7, {
      agentContext: { isActionSystemRole: false, ignoreOwnDirection: false },
      agentDirectionIds: [1, 2],
    })).toBe(false);
  });
});

describe('calculerDureeEtRepos', () => {
  test('chaîne terminée : durée en jours/mois + date de repos = fin + 1 mois + 1 jour', () => {
    const res = calculerDureeEtRepos('2026-01-01', '2026-03-31');
    expect(res.dureeTotaleJours).toBe(89);
    expect(res.dateDebutChaine).toBe('2026-01-01');
    expect(res.dateFinChaine).toBe('2026-03-31');
    expect(res.dateMinRepos).toBe('2026-05-02');
  });

  test('chaîne encore en cours (pas de date de fin) : calcule jusqu\'à "now" injecté, pas de repos', () => {
    const now = new Date('2026-05-15T00:00:00.000Z');
    const res = calculerDureeEtRepos('2026-01-01', null, now);
    expect(res.dureeTotaleJours).toBe(134);
    expect(res.dateFinChaine).toBeNull();
    expect(res.dateMinRepos).toBeNull();
  });

  test('chaîne de exactement 6 mois -> dureeTotaleMois proche de 6', () => {
    const res = calculerDureeEtRepos('2026-01-01', '2026-06-30');
    expect(res.dureeTotaleMois).toBeGreaterThanOrEqual(5.9);
    expect(res.dureeTotaleMois).toBeLessThanOrEqual(6.1);
  });

  test('fin de chaîne en fin de mois -> dateMinRepos déborde correctement sur le mois suivant', () => {
    // Fin le 31 décembre : +1 mois (31 janvier, valide) +1 jour = 1er février
    const res = calculerDureeEtRepos('2026-01-01', '2026-12-31');
    expect(res.dateMinRepos).toBe('2027-02-01');
  });
});