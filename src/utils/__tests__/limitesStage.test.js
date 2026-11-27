// Limites de durée des stages (2026-11-27) : 6 mois par service à vie, 6 mois par année civile,
// pause de 3 mois après 6 mois dans un service, sinon 2 mois.
const { verifierLimitesStage, calculerPause, moisDansService, versMois, joursEntre } = require('../limitesStage.util');

const SEBD = 1;
const RESEAU = 2;
const le = (iso) => new Date(`${iso}T10:00:00Z`);

describe('calcul des mois', () => {
  test('un stage du 01/01 au 30/06 compte 6 mois, février 2 mois pour deux mois', () => {
    expect(versMois(joursEntre('2026-01-01', '2026-06-30'))).toBe(6);
    expect(versMois(joursEntre('2026-02-01', '2026-03-31'))).toBe(2);
  });
  test('les mois se cumulent par service', () => {
    const stages = [
      { serviceId: SEBD, debut: '2025-01-01', fin: '2025-03-31' },
      { serviceId: SEBD, debut: '2025-04-01', fin: '2025-05-31' },
      { serviceId: RESEAU, debut: '2025-09-01', fin: '2025-09-30' },
    ];
    expect(moisDansService(stages, SEBD)).toBe(5);
    expect(moisDansService(stages, RESEAU)).toBe(1);
  });
});

describe('6 mois par service, à vie', () => {
  const sixMoisSEBD = [{ serviceId: SEBD, debut: '2024-01-01', fin: '2024-06-30' }];

  test('service fermé définitivement après 6 mois, même des années plus tard', () => {
    expect(() => verifierLimitesStage({
      stages: sixMoisSEBD, serviceId: SEBD, debut: '2027-03-01', dureeMois: 1, maintenant: le('2027-01-10'),
    })).toThrow('il ne vous est plus ouvert');
  });

  test('un autre service reste possible', () => {
    expect(() => verifierLimitesStage({
      stages: sixMoisSEBD, serviceId: RESEAU, debut: '2027-03-01', dureeMois: 3, maintenant: le('2027-01-10'),
    })).not.toThrow();
  });

  test('4 mois faits, 3 demandés : refus avec le reste (2 mois)', () => {
    const stages = [{ serviceId: SEBD, debut: '2025-01-01', fin: '2025-04-30' }];
    expect(() => verifierLimitesStage({
      stages, serviceId: SEBD, debut: '2026-03-01', dureeMois: 3, maintenant: le('2026-01-10'),
    })).toThrow('il vous reste 2 mois au plus');
    expect(() => verifierLimitesStage({
      stages, serviceId: SEBD, debut: '2026-03-01', dureeMois: 2, maintenant: le('2026-01-10'),
    })).not.toThrow();
  });
});

describe('6 mois par année civile, tous services', () => {
  test('4 mois en 2027 dans un service, 3 mois de plus en 2027 ailleurs : refus', () => {
    const stages = [{ serviceId: SEBD, debut: '2027-01-01', fin: '2027-04-30' }];
    expect(() => verifierLimitesStage({
      stages, serviceId: RESEAU, debut: '2027-08-01', dureeMois: 3, maintenant: le('2027-07-15'),
    })).toThrow('En 2027, vous avez déjà 4 mois de stage');
  });

  test('un stage à cheval ne compte que ses jours dans chaque année', () => {
    // 4 mois en 2027 ; nouveau stage nov. 2027 → fév. 2028 : 2 mois en 2027, 2 mois en 2028 → accepté
    const stages = [{ serviceId: SEBD, debut: '2027-01-01', fin: '2027-04-30' }];
    expect(() => verifierLimitesStage({
      stages, serviceId: RESEAU, debut: '2027-11-01', dureeMois: 4, maintenant: le('2027-08-15'),
    })).not.toThrow();
  });
});

describe('pause entre deux stages', () => {
  test('après 6 mois dans un service : 3 mois de pause', () => {
    const stages = [{ serviceId: SEBD, debut: '2026-01-01', fin: '2026-06-30' }];
    expect(calculerPause(stages)).toEqual({ dateMin: '2026-10-01', pauseMois: 3, finDernierStage: '2026-06-30' });
    expect(() => verifierLimitesStage({
      stages, serviceId: RESEAU, debut: '2026-12-01', dureeMois: 1, maintenant: le('2026-09-20'),
    })).toThrow('une pause de 3 mois est obligatoire');
    expect(() => verifierLimitesStage({
      stages, serviceId: RESEAU, debut: '2027-01-01', dureeMois: 1, maintenant: le('2026-10-01'),
    })).not.toThrow();
  });

  test('stage plus court, non renouvelé : 2 mois de pause, même dans le même service', () => {
    const stages = [{ serviceId: SEBD, debut: '2026-01-01', fin: '2026-01-31' }];
    expect(calculerPause(stages).pauseMois).toBe(2);
    expect(() => verifierLimitesStage({
      stages, serviceId: SEBD, debut: '2026-05-01', dureeMois: 1, maintenant: le('2026-03-15'),
    })).toThrow('à partir du 01/04/2026');
  });

  test('un renouvellement ne vérifie pas la pause', () => {
    const stages = [{ serviceId: SEBD, debut: '2026-01-01', fin: '2026-02-28' }];
    expect(() => verifierLimitesStage({
      stages, serviceId: SEBD, debut: '2026-03-01', dureeMois: 2, verifierPause: false, maintenant: le('2026-02-20'),
    })).not.toThrow();
  });

  test('premier stage : aucune pause', () => {
    expect(calculerPause([]).dateMin).toBeNull();
    expect(() => verifierLimitesStage({ stages: [], serviceId: SEBD, debut: '2026-03-01', dureeMois: 6 })).not.toThrow();
  });
});
