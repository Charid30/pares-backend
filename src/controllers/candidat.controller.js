// src/controllers/candidat.controller.js
const candidatService = require('../services/candidat.service');
const { success, error } = require('../utils/response.util');

// =====================================================
// PROFIL
// =====================================================

/**
 * Récupérer le profil du candidat
 * GET /api/candidat/profil
 */
const getProfil = async (req, res) => {
  try {
    const profil = await candidatService.getProfilCandidat(req.user.candidatId);

    // Aplatir la réponse pour inclure le username directement
    const data = {
      idcandidats: profil.idcandidats,
      nom: profil.nom,
      prenom: profil.prenom,
      genre: profil.genre || null,
      email: profil.email,
      telephone: profil.telephone,
      nip: profil.nip,
      ifu: profil.ifu || null,
      recipisse: profil.recipisse || null,
      createdDate: profil.createdDate,
      username: profil.user?.username || null,
      lastUsernameChange: profil.user?.lastUsernameChange || null,
    };

    return success(res, data, 'Profil récupéré avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Mettre à jour le profil du candidat
 * PUT /api/candidat/profil
 */
const updateProfil = async (req, res) => {
  try {
    const profil = await candidatService.updateProfilCandidat(
      req.user.candidatId,
      req.body
    );
    return success(res, profil, 'Profil mis à jour avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// =====================================================
// DOCUMENTS / STAGES-RAPPORTS
// =====================================================

/**
 * Récupérer les documents du candidat (ancienne route, garde pour compatibilité)
 * GET /api/candidat/documents
 */
const getDocuments = async (req, res) => {
  try {
    const documents = await candidatService.getDocumentsCandidat(req.user.candidatId);
    return success(res, documents, 'Documents récupérés avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Récupérer les stages avec rapports et attestations du candidat
 * GET /api/candidat/stages-rapports
 */
const getStagesRapports = async (req, res) => {
  try {
    const stagesRapports = await candidatService.getStagesRapportsCandidat(req.user.candidatId);
    return success(res, stagesRapports, 'Stages et rapports récupérés avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Télécharger une attestation de stage
 * GET /api/candidat/attestations/:id/download
 */
const downloadAttestation = async (req, res) => {
  try {
    const attestation = await candidatService.getAttestationStage(
      req.user.candidatId,
      req.params.id
    );

    // Définir les headers pour le téléchargement
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${attestation.filename}"`);
    res.setHeader('Content-Length', attestation.size);

    // Envoyer le fichier
    return res.send(attestation.data);
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Uploader un document
 * POST /api/candidat/documents
 */
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return error(res, 'Aucun fichier fourni', 400);
    }

    const fileData = {
      type: req.body.type,
      file: req.file.buffer,
      filename: req.file.originalname,
      size: req.file.size,
    };

    const result = await candidatService.uploadDocumentCandidat(
      req.user.candidatId,
      fileData
    );

    return success(res, result, 'Document uploadé avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Récupérer les demandes de stage du candidat
 * GET /api/candidat/mes-demandes-stage
 */
const getMesDemandesStage = async (req, res) => {
  try {
    const demandes = await candidatService.getMesDemandesStage(req.user.candidatId);
    return success(res, demandes, 'Demandes de stage récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Soumettre une demande de stage
 * POST /api/candidat/demande-stage
 */
const soumettreDemandeStage = async (req, res) => {
  try {
    // Préparer les fichiers
    const files = {};
    if (req.files) {
      if (req.files.cv && req.files.cv[0]) files.cv = req.files.cv[0];
      if (req.files.cnib && req.files.cnib[0]) files.cnib = req.files.cnib[0];
      if (req.files.casierJudiciaire && req.files.casierJudiciaire[0]) {
        files.casierJudiciaire = req.files.casierJudiciaire[0];
      }
      if (req.files.lettreMotivation && req.files.lettreMotivation[0]) {
        files.lettreMotivation = req.files.lettreMotivation[0];
      }
      if (req.files.lettreRecommandation && req.files.lettreRecommandation[0]) {
        files.lettreRecommandation = req.files.lettreRecommandation[0];
      }
      if (req.files.dernierDiplome && req.files.dernierDiplome[0]) {
        files.dernierDiplome = req.files.dernierDiplome[0];
      }
    }

    const result = await candidatService.soumettreDemandeStage(
      req.user.candidatId,
      req.body,
      files
    );

    return success(res, result, 'Demande de stage soumise avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Soumettre un rapport de stage
 * POST /api/candidat/stages/:id/rapport
 */
const soumettreRapportStage = async (req, res) => {
  try {
    const stageId = req.params.id;
    const file = req.file;
    const candidatId = req.user?.candidatId;

    console.log('=== Soumission rapport de stage ===');
    console.log('Stage ID:', stageId);
    console.log('Candidat ID:', candidatId);
    console.log('File présent:', !!file);
    console.log('Body:', req.body);

    if (!candidatId) {
      return error(res, 'Candidat non identifié', 401);
    }

    if (!file) {
      return error(res, 'Le fichier du rapport est obligatoire', 400);
    }

    if (!file.buffer || file.buffer.length === 0) {
      return error(res, 'Le contenu du fichier est vide', 400);
    }

    console.log('File details:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      bufferLength: file.buffer?.length
    });

    const result = await candidatService.soumettreRapportStage(
      candidatId,
      stageId,
      req.body,
      file
    );

    console.log('Rapport créé avec succès:', result);
    return success(res, result, 'Rapport soumis avec succès', 201);
  } catch (err) {
    console.error('Erreur soumission rapport:', err);
    return error(res, err.message, 400);
  }
};

/**
 * Récupérer le rapport d'un stage
 * GET /api/candidat/stages/:id/rapport
 */
const getRapportStage = async (req, res) => {
  try {
    const stageId = req.params.id;

    const rapport = await candidatService.getRapportByStageId(
      req.user.candidatId,
      stageId
    );

    if (!rapport) {
      return success(res, null, 'Aucun rapport trouvé pour ce stage');
    }

    return success(res, rapport, 'Rapport récupéré avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Récupérer les infos de convention pour le modal de renouvellement
 * GET /api/candidat/stages/:id/convention-renouvellement
 */
const getConventionPourRenouvellement = async (req, res) => {
  try {
    const stageId = req.params.id;
    const result = await candidatService.getConventionPourRenouvellement(
      req.user.candidatId,
      stageId
    );
    return success(res, result, 'Informations de renouvellement récupérées');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Demander le renouvellement d'un stage
 * POST /api/candidat/stages/:id/renouvellement
 * Body: FormData avec dureeDemandee + fichier lettreRenouvellement (PDF)
 */
const demanderRenouvellement = async (req, res) => {
  try {
    const stageId = req.params.id;
    const file = req.file; // lettre de demande de renouvellement

    if (!file) {
      return error(res, 'La lettre de demande de renouvellement est obligatoire', 400);
    }

    const result = await candidatService.demanderRenouvellement(
      req.user.candidatId,
      stageId,
      req.body,
      file
    );

    return success(res, result, 'Demande de renouvellement soumise avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = {
  // Profil
  getProfil,
  updateProfil,

  // Documents / Stages-Rapports
  getDocuments,
  uploadDocument,
  getStagesRapports,
  downloadAttestation,
  getMesDemandesStage,
  soumettreDemandeStage,
  soumettreRapportStage,
  getRapportStage,
  getConventionPourRenouvellement,
  demanderRenouvellement,
};