// src/services/antivirus.service.js
// Scan antivirus des fichiers uploadés via ClamAV (clamscan npm)
// Fonctionne en deux modes :
//   - Si ClamAV est disponible  → scan réel
//   - Si ClamAV est indisponible → comportement selon AV_STRICT (env)
//       AV_STRICT=true  : rejette le fichier (prod recommandé)
//       AV_STRICT=false : laisse passer avec warning dans les logs (dev)
//
// Chemins ClamAV par défaut selon l'OS :
//   Windows : C:\Program Files\ClamAV\clamscan.exe  (installer : https://www.clamav.net/downloads)
//   Linux   : /usr/bin/clamscan
// Surcharger via .env : AV_CLAMSCAN_PATH et AV_CLAMDSCAN_PATH
const NodeClam = require('clamscan');
const os = require('os');

// Variables d'environnement
const AV_SCAN_ENABLED = process.env.AV_SCAN_ENABLED !== 'false'; // true par défaut
const AV_STRICT       = process.env.AV_STRICT === 'true';        // false par défaut
const AV_HOST         = process.env.AV_HOST || '127.0.0.1';
const AV_PORT         = parseInt(process.env.AV_PORT) || 3310;

// Chemins par défaut selon la plateforme
const IS_WINDOWS = os.platform() === 'win32';
const DEFAULT_CLAMSCAN_PATH  = IS_WINDOWS
  ? 'C:\\Program Files\\ClamAV\\clamscan.exe'
  : '/usr/bin/clamscan';
const DEFAULT_CLAMDSCAN_PATH = IS_WINDOWS
  ? 'C:\\Program Files\\ClamAV\\clamdscan.exe'
  : '/usr/bin/clamdscan';

let clamInstance = null;
let clamAvailable = false;
let initAttempted = false;

// ── Initialisation (lazy, une seule fois) ──────────────────────────────────
const initClamAV = async () => {
  if (initAttempted) return;
  initAttempted = true;

  if (!AV_SCAN_ENABLED) {
    console.log('[AV] Scan antivirus désactivé (AV_SCAN_ENABLED=false)');
    return;
  }

  try {
    const clam = new NodeClam();
    clamInstance = await clam.init({
      removeInfected: false,
      quarantineInfected: false,
      scanLog: null,
      debugMode: false,
      fileList: null,
      scanRecursively: false,
      clamscan: {
        path: process.env.AV_CLAMSCAN_PATH || DEFAULT_CLAMSCAN_PATH,
        db: null,
        scanArchives: true,
        active: true,
      },
      clamdscan: {
        socket: false,
        host: AV_HOST,
        port: AV_PORT,
        timeout: 10000, // 10s max par fichier
        localFallback: true,
        path: process.env.AV_CLAMDSCAN_PATH || DEFAULT_CLAMDSCAN_PATH,
        active: true,
      },
      preference: 'clamdscan', // Préfère le daemon (plus rapide), fallback sur CLI
    });

    clamAvailable = true;
    console.log('[AV] ✅ ClamAV initialisé avec succès');
  } catch (err) {
    clamAvailable = false;
    if (AV_STRICT) {
      console.error('[AV] ❌ ClamAV indisponible — mode strict activé, uploads bloqués');
    } else {
      console.warn('[AV] ⚠️  ClamAV indisponible — uploads autorisés sans scan (AV_STRICT=false)');
    }
  }
};

// Lancer l'init au démarrage (non bloquant) — sauf en test, où cet appel
// "fire and forget" peut encore résoudre après la fin d'un test (et même
// après la fin du fichier, via jest.mock() qui charge le module réel pour en
// déduire l'automock), déclenchant "Cannot log after tests are done" dans
// Jest. Les tests qui ont besoin d'un comportement précis appellent déjà
// initClamAV() explicitement.
if (process.env.NODE_ENV !== 'test') {
  initClamAV().catch(() => {});
}

// ── Scan d'un Buffer ───────────────────────────────────────────────────────
/**
 * Scanne un fichier en mémoire (Buffer) via ClamAV.
 *
 * @param {Buffer} buffer     - Contenu du fichier
 * @param {string} filename   - Nom du fichier (pour les logs)
 * @returns {Promise<{ clean: boolean, virus: string|null, skipped: boolean }>}
 *   clean   : true si le fichier est sain
 *   virus   : nom du virus détecté, ou null
 *   skipped : true si le scan a été ignoré (ClamAV indisponible)
 */
const scanBuffer = async (buffer, filename = 'fichier') => {
  // Scan désactivé explicitement
  if (!AV_SCAN_ENABLED) {
    return { clean: true, virus: null, skipped: true };
  }

  // ClamAV non disponible
  if (!clamAvailable || !clamInstance) {
    if (AV_STRICT) {
      // Refuser l'upload si ClamAV est obligatoire
      return { clean: false, virus: 'ClamAV indisponible (mode strict)', skipped: false };
    }
    // Laisser passer avec warning
    console.warn(`[AV] ⚠️  Scan ignoré pour "${filename}" — ClamAV non disponible`);
    return { clean: true, virus: null, skipped: true };
  }

  try {
    const { isInfected, viruses } = await clamInstance.scanBuffer(buffer);

    if (isInfected) {
      const virusName = viruses && viruses.length > 0 ? viruses[0] : 'Virus inconnu';
      console.error(`[AV] 🦠 Virus détecté dans "${filename}": ${virusName}`);
      return { clean: false, virus: virusName, skipped: false };
    }

    return { clean: true, virus: null, skipped: false };
  } catch (err) {
    console.error(`[AV] Erreur lors du scan de "${filename}":`, err.message);

    // En cas d'erreur de scan
    if (AV_STRICT) {
      return { clean: false, virus: `Erreur scan: ${err.message}`, skipped: false };
    }
    return { clean: true, virus: null, skipped: true };
  }
};

/**
 * Vérifie si ClamAV est actif et disponible.
 * Utilisable pour un endpoint /health.
 */
const getStatus = () => ({
  enabled:   AV_SCAN_ENABLED,
  available: clamAvailable,
  strict:    AV_STRICT,
  host:      AV_HOST,
  port:      AV_PORT,
});

module.exports = { scanBuffer, getStatus, initClamAV };
