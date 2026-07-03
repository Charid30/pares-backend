// src/middlewares/validateFiles.middleware.js
// Validation des fichiers uploadés :
//   1. Vérification magic bytes (%PDF) — contre-mesure au spoofing Content-Type
//   2. Scan antivirus ClamAV — détection de malwares dans les PDFs
const { error } = require('../utils/response.util');
const antivirusService = require('../services/antivirus.service');

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

const validatePdfFiles = async (req, res, next) => {
  const files = [];

  if (req.file) {
    files.push(req.file);
  }
  if (req.files) {
    if (Array.isArray(req.files)) {
      files.push(...req.files);
    } else {
      Object.values(req.files).forEach(fieldFiles => files.push(...fieldFiles));
    }
  }

  // Aucun fichier → on passe
  if (files.length === 0) return next();

  for (const file of files) {
    // ── 1. Vérification magic bytes ───────────────────────────────────────
    if (!file.buffer || file.buffer.length < 4) {
      return error(res, `Fichier invalide ou vide : ${file.fieldname}`, 400);
    }
    if (!file.buffer.slice(0, 4).equals(PDF_MAGIC)) {
      return error(res, `Le fichier "${file.originalname}" n'est pas un PDF valide`, 400);
    }

    // ── 2. Scan antivirus ─────────────────────────────────────────────────
    try {
      const result = await antivirusService.scanBuffer(file.buffer, file.originalname);

      if (!result.clean) {
        console.warn(`[Upload] Fichier infecté rejeté — champ: ${file.fieldname}, virus: ${result.virus}`);
        return error(
          res,
          `Le fichier "${file.originalname}" a été rejeté : contenu malveillant détecté.`,
          422
        );
      }

      if (result.skipped) {
        // Log seulement — le fichier passe quand même (AV_STRICT=false)
        console.warn(`[Upload] Scan AV ignoré pour "${file.originalname}" (ClamAV non disponible)`);
      }
    } catch (avErr) {
      // Ne jamais faire crasher l'upload à cause d'une erreur imprévue du scanner
      console.error('[Upload] Erreur inattendue antivirus:', avErr.message);
    }
  }

  next();
};

module.exports = { validatePdfFiles };
