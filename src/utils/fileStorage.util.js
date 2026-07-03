// src/utils/fileStorage.util.js
// Gestion du stockage des fichiers sur disque.
// Nouveau comportement : les fichiers uploadés sont sauvegardés dans uploads/
// et seul le chemin relatif est stocké en base (BLOB = null).
// Ancien comportement (BLOB) : conservé pour la lecture des fichiers existants.

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// Racine du dossier uploads (deux niveaux au-dessus de utils/)
const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');

// Whitelist des sous-dossiers autorisés — protège contre le path traversal
// si subfolder venait un jour d'une entrée utilisateur non contrôlée.
const ALLOWED_SUBFOLDERS = new Set([
  'stages',
  'stages/modifications',
  'aides',
  'aides/candidatures',
  'offres',
  'audiences',
  'recrutements',
  'candidats',
  'agents',
  'temp',
]);

/**
 * Sauvegarde un buffer sur disque et retourne le chemin relatif à stocker en base.
 * @param {Buffer} buffer        - Contenu du fichier
 * @param {string} originalname  - Nom original (pour conserver l'extension)
 * @param {string} subfolder     - Sous-dossier dans uploads/ (doit être dans ALLOWED_SUBFOLDERS)
 * @returns {string}             - Chemin relatif ex: "uploads/stages/1714000000-abc123.pdf"
 */
const saveFile = (buffer, originalname, subfolder) => {
  // Vérification whitelist
  if (!ALLOWED_SUBFOLDERS.has(subfolder)) {
    throw new Error(`Sous-dossier non autorisé : "${subfolder}"`);
  }

  const dir = path.join(UPLOADS_ROOT, subfolder);
  fs.mkdirSync(dir, { recursive: true });

  const ext      = path.extname(originalname) || '.pdf';
  const unique   = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const filePath = path.join(dir, unique);

  fs.writeFileSync(filePath, buffer);

  // Retourner un chemin relatif normalisé avec des slashes UNIX
  return `uploads/${subfolder}/${unique}`.replace(/\\/g, '/');
};

/**
 * Lit un fichier depuis le disque si file_path existe, sinon retourne le BLOB.
 * @param {string|null} relPath  - Chemin relatif stocké en base (peut être null)
 * @param {Buffer|null} blobData - Données BLOB de l'ancienne méthode (peut être null)
 * @returns {Buffer}
 */
const readFile = (relPath, blobData) => {
  if (relPath) {
    const absPath = path.join(__dirname, '..', '..', relPath);
    if (fs.existsSync(absPath)) {
      return fs.readFileSync(absPath);
    }
  }
  // Fallback : BLOB existant (anciens fichiers)
  if (blobData) {
    return Buffer.isBuffer(blobData) ? blobData : Buffer.from(blobData);
  }
  return Buffer.alloc(0);
};

/**
 * Supprime un fichier sur disque (si le chemin existe).
 * Ne lève pas d'erreur si le fichier est absent.
 * @param {string|null} relPath
 */
const deleteFile = (relPath) => {
  if (!relPath) return;
  const absPath = path.join(__dirname, '..', '..', relPath);
  try { fs.unlinkSync(absPath); } catch (_) {}
};

module.exports = { saveFile, readFile, deleteFile };
