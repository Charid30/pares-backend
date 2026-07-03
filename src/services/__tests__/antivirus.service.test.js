// Test d'intégration : antivirus.service.js — le comportement de repli quand
// ClamAV est indisponible est LA décision de sécurité critique de ce module :
// AV_STRICT=true doit bloquer les uploads (fail-closed), AV_STRICT=false doit
// les laisser passer (fail-open, dev). Un inversement silencieux de cette logique
// laisserait passer des fichiers non scannés en production sans avertissement.
//
// AV_SCAN_ENABLED/AV_STRICT sont lus une seule fois au chargement du module : on
// utilise jest.resetModules() + re-require pour tester chaque combinaison.
// (L'auto-init eager du module au require() est désactivée en NODE_ENV=test —
// voir antivirus.service.js — donc seul l'appel explicite à initClamAV() ci-dessous
// déclenche réellement l'initialisation, sans risque de course asynchrone.)
describe('antivirus.service — repli quand ClamAV est indisponible', () => {
  const chargerAvecEnv = (env) => {
    jest.resetModules();
    jest.doMock('clamscan', () => {
      return jest.fn().mockImplementation(() => ({
        init: jest.fn().mockRejectedValue(new Error('ClamAV non installé')),
      }));
    });
    Object.assign(process.env, env);
    return require('../antivirus.service');
  };

  afterEach(() => {
    delete process.env.AV_SCAN_ENABLED;
    delete process.env.AV_STRICT;
  });

  test('AV_SCAN_ENABLED=false : aucun scan, toujours clean', async () => {
    const antivirusService = chargerAvecEnv({ AV_SCAN_ENABLED: 'false' });
    await antivirusService.initClamAV();

    const result = await antivirusService.scanBuffer(Buffer.from('contenu'), 'test.pdf');

    expect(result).toEqual({ clean: true, virus: null, skipped: true });
  });

  test('ClamAV indisponible + AV_STRICT=false : laisse passer (fail-open)', async () => {
    const antivirusService = chargerAvecEnv({ AV_SCAN_ENABLED: 'true', AV_STRICT: 'false' });
    await antivirusService.initClamAV();

    const result = await antivirusService.scanBuffer(Buffer.from('contenu'), 'test.pdf');

    expect(result.clean).toBe(true);
    expect(result.skipped).toBe(true);
  });

  test('ClamAV indisponible + AV_STRICT=true : bloque l\'upload (fail-closed)', async () => {
    const antivirusService = chargerAvecEnv({ AV_SCAN_ENABLED: 'true', AV_STRICT: 'true' });
    await antivirusService.initClamAV();

    const result = await antivirusService.scanBuffer(Buffer.from('contenu'), 'test.pdf');

    expect(result.clean).toBe(false);
    expect(result.virus).toMatch(/ClamAV indisponible/);
  });

  test('getStatus reflète fidèlement la configuration active', async () => {
    const antivirusService = chargerAvecEnv({ AV_SCAN_ENABLED: 'true', AV_STRICT: 'true' });
    await antivirusService.initClamAV();

    const status = antivirusService.getStatus();

    expect(status).toEqual(expect.objectContaining({ enabled: true, available: false, strict: true }));
  });
});
