// src/services/candidat.service.js
const fileStorage = require('../utils/fileStorage.util');
const {
  Candidat,
  User,
  Stage,
  RapportStage,
  DocumentStage,
  RenouvellementStage,
  DemandeModificationStage,
  AutorisationRenouvellementStage,
} = require('../models');
const { Op } = require('sequelize');
const emailService = require('./email.service');
const notifService = require('./notification.service');
const { calculerDateFin, getDureeContinueCandidat } = require('./stage.service');

const DUREE_MAX_CONTINUE_MOIS = 6;   // Maximum 6 mois de stage continu
const REPOS_OBLIGATOIRE_MOIS = 1;    // 1 mois de repos minimum après 6 mois

// =====================================================
// PROFIL CANDIDAT
// =====================================================

/**
 * Récupérer le profil complet du candidat
 */
const getProfilCandidat = async (candidatId) => {
  const candidat = await Candidat.findOne({
    where: {
      idcandidats: candidatId,
      del: 0,
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['idusers', 'username', 'lastUsernameChange'],
      },
    ],
  });

  if (!candidat) {
    throw new Error('Candidat non trouvé');
  }

  return candidat;
};

/**
 * Mettre à jour le profil du candidat
 */
const updateProfilCandidat = async (candidatId, data) => {
  const candidat = await Candidat.findOne({
    where: { idcandidats: candidatId, del: 0 },
    include: [{ model: User, as: 'user', attributes: ['idusers', 'username', 'lastUsernameChange'] }],
  });

  if (!candidat) {
    throw new Error('Candidat non trouvé');
  }

  // ── Champs candidat autorisés ──────────────────────────────────────────
  const allowedFields = ['nom', 'prenom', 'genre', 'telephone', 'email'];
  const updateData = {};
  allowedFields.forEach(field => {
    if (data[field] !== undefined) updateData[field] = data[field];
  });

  // Validation genre
  if (updateData.genre && !['HOMME', 'FEMME'].includes(updateData.genre)) {
    throw new Error('Genre invalide. Valeurs acceptées : HOMME, FEMME');
  }

  // ── IFU / Récépissé — exclusif : on ne peut avoir les deux ──────────────
  // Si les deux champs sont fournis dans le même appel (ex: bascule de type de
  // document fiscal côté formulaire), on compare à l'état FINAL voulu plutôt
  // qu'à l'ancienne valeur en mémoire — sinon basculer de l'un à l'autre en un
  // seul appel échoue toujours, même quand l'autre champ est explicitement
  // mis à null dans la même requête.
  if (data.ifu !== undefined) {
    const recipisseRestant = data.recipisse !== undefined ? data.recipisse : candidat.recipisse;
    if (data.ifu && recipisseRestant) {
      throw new Error('Vous ne pouvez pas avoir un IFU et un récépissé simultanément. Supprimez d\'abord le récépissé.');
    }
    // Vérifier unicité si valeur non vide
    if (data.ifu) {
      const existing = await Candidat.findOne({ where: { ifu: data.ifu } });
      if (existing && existing.idcandidats !== candidatId) {
        throw new Error('Ce numéro IFU est déjà associé à un autre compte.');
      }
    }
    updateData.ifu = data.ifu || null;
    if (data.ifu) updateData.recipisse = null; // effacer l'autre
  }

  if (data.recipisse !== undefined) {
    const ifuRestant = data.ifu !== undefined ? data.ifu : candidat.ifu;
    if (data.recipisse && ifuRestant) {
      throw new Error('Vous ne pouvez pas avoir un récépissé et un IFU simultanément. Supprimez d\'abord l\'IFU.');
    }
    if (data.recipisse) {
      const existing = await Candidat.findOne({ where: { recipisse: data.recipisse } });
      if (existing && existing.idcandidats !== candidatId) {
        throw new Error('Ce numéro de récépissé est déjà associé à un autre compte.');
      }
    }
    updateData.recipisse = data.recipisse || null;
    if (data.recipisse) updateData.ifu = null; // effacer l'autre
  }

  await candidat.update(updateData);

  // ── Nom d'utilisateur — cooldown 25 jours ──────────────────────────────
  if (data.username !== undefined && data.username !== candidat.user?.username) {
    const user = candidat.user;
    if (!user) throw new Error('Utilisateur non trouvé');

    if (user.lastUsernameChange) {
      const COOLDOWN_DAYS = 25;
      const lastChange = new Date(user.lastUsernameChange);
      const nextAllowed = new Date(lastChange.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
      if (new Date() < nextAllowed) {
        const daysLeft = Math.ceil((nextAllowed - new Date()) / (24 * 60 * 60 * 1000));
        throw new Error(`Vous ne pouvez changer votre nom d'utilisateur que tous les 25 jours. Prochain changement possible dans ${daysLeft} jour(s).`);
      }
    }

    // Vérifier unicité
    const existingUser = await User.findOne({ where: { username: data.username } });
    if (existingUser && existingUser.idusers !== user.idusers) {
      throw new Error('Ce nom d\'utilisateur est déjà pris.');
    }

    await user.update({ username: data.username, lastUsernameChange: new Date() });
  }

  // Recharger pour retourner les données à jour
  await candidat.reload({
    include: [{ model: User, as: 'user', attributes: ['idusers', 'username', 'lastUsernameChange'] }],
  });

  return candidat;
};

// =====================================================
// DOCUMENTS / STAGES-RAPPORTS
// =====================================================

/**
 * Récupérer les stages du candidat avec leurs rapports et attestations
 */
const getStagesRapportsCandidat = async (candidatId) => {
  const stages = await Stage.findAll({
    where: {
      candidats_idcandidats: candidatId,
      del: 0,
    },
    include: [
      {
        model: RapportStage,
        as: 'rapport',
        required: false, // LEFT JOIN pour inclure les stages sans rapport
        include: [
          {
            model: DocumentStage,
            as: 'attestations',
            required: false,
          },
        ],
      },
    ],
    order: [['createdDate', 'DESC']],
  });

  // Formater les données pour le frontend
  return stages.map(stage => {
    // Filtrer le rapport (del = 0)
    const rapport = stage.rapport && stage.rapport.del === 0 ? stage.rapport : null;

    // Filtrer l'attestation (typeDocument = ATTESTATION, del = 0)
    const attestation = rapport?.attestations?.find(
      doc => doc.typeDocument === 'ATTESTATION' && doc.del === 0
    ) || null;

    return {
      idstage: stage.idstage,
      intitule: stage.domaineStage,
      typeStage: stage.typeStage,
      dateDebutEffective: stage.dateDebutEffective,
      dateFinEffective: stage.dateFinEffective,
      statusStage: stage.statusStage,
      // Infos rapport
      rapportSoumis: !!rapport,
      idrapport: rapport?.idrapport || null,
      titreRapport: rapport?.titreRapport || null,
      dateSoumissionRapport: rapport?.createdDate || null,
      statusRapport: rapport?.statusRapport || null,
      noteRapport: rapport?.noteRapport || null,
      // Infos attestation
      attestationDisponible: !!attestation,
      idattestation: attestation?.iddocument || null,
      numeroAttestation: attestation?.numeroAttestation || null,
    };
  });
};

/**
 * Télécharger l'attestation d'un stage
 */
const getAttestationStage = async (candidatId, documentId) => {
  // Vérifier que le document appartient bien au candidat
  const document = await DocumentStage.findOne({
    where: {
      iddocument: documentId,
      typeDocument: 'ATTESTATION',
      del: 0,
    },
    include: [
      {
        model: RapportStage,
        as: 'rapport',
        include: [
          {
            model: Stage,
            as: 'stage',
            where: {
              candidats_idcandidats: candidatId,
              del: 0,
            },
          },
        ],
      },
    ],
  });

  if (!document) {
    throw new Error('Attestation non trouvée ou accès non autorisé');
  }

  return {
    filename: document.document_filename,
    data: document.document,
    size: document.document_size,
  };
};

/**
 * Récupérer les documents du candidat (ancienne fonction, garde pour compatibilité)
 */
const getDocumentsCandidat = async (candidatId) => {
  // Rediriger vers la nouvelle fonction
  return getStagesRapportsCandidat(candidatId);
};

/**
 * Uploader un document
 */
const uploadDocumentCandidat = async (candidatId, fileData) => {
  // À implémenter selon votre système de gestion de fichiers
  return { message: 'Document uploadé avec succès' };
};

/**
 * Récupérer les demandes de stage du candidat
 * Met à jour automatiquement les statuts basés sur les dates effectives
 */
const getMesDemandesStage = async (candidatId) => {
  const now = new Date();

  const stages = await Stage.findAll({
    where: {
      candidats_idcandidats: candidatId,
      del: 0,
    },
    // Exclure les colonnes BLOB pour des raisons de performance
    attributes: {
      exclude: [
        'cv', 'cnib', 'casierJudiciaire', 'lettreMotivation',
        'lettreRecommandation', 'dernierDiplome'
      ]
    },
    include: [
      {
        model: DocumentStage,
        as: 'documents',
        where: { typeDocument: 'CONVENTION', del: 0 },
        required: false,
        attributes: ['iddocument', 'document_filename'],
      },
      {
        model: DemandeModificationStage,
        as: 'demandesModification',
        where: { status: 'EN_ATTENTE', del: 0 },
        required: false,
        attributes: ['id', 'type', 'dateDebut', 'createdDate'],
      },
      {
        model: AutorisationRenouvellementStage,
        as: 'autorisationsRenouvellement',
        where: {
          del: 0,
          usedAt: null,
          expiresAt: { [Op.gt]: now },
        },
        required: false,
        attributes: ['id', 'expiresAt', 'autorisePar'],
      },
    ],
    order: [['createdDate', 'DESC']],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normaliser à minuit

  // Mettre à jour les statuts automatiquement
  for (const stage of stages) {
    let needsUpdate = false;
    let newStatus = stage.statusStage;

    // Si le stage a une date de début effective et qu'on est passé cette date
    if (stage.dateDebutEffective && stage.statusStage === 'ACCEPTE') {
      const dateDebut = new Date(stage.dateDebutEffective);
      dateDebut.setHours(0, 0, 0, 0);
      if (today >= dateDebut) {
        newStatus = 'EN_COURS';
        needsUpdate = true;
      }
    }

    // Si le stage est EN_COURS et qu'on a dépassé la date de fin effective
    if (stage.dateFinEffective && (stage.statusStage === 'EN_COURS' || newStatus === 'EN_COURS')) {
      const dateFin = new Date(stage.dateFinEffective);
      dateFin.setHours(0, 0, 0, 0);
      if (today > dateFin) {
        newStatus = 'EXPIRE';
        needsUpdate = true;
      }
    }

    // Mettre à jour en base si nécessaire
    if (needsUpdate) {
      await stage.update({ statusStage: newStatus });
      stage.statusStage = newStatus; // Mettre à jour l'objet local aussi
    }
  }

  return stages.map(stage => {
    // Verifier si une convention existe
    const convention = stage.documents && stage.documents.length > 0 ? stage.documents[0] : null;

    // Demande de modification (suspension/annulation) en attente, le cas échéant
    const demandeModif = stage.demandesModification && stage.demandesModification.length > 0
      ? stage.demandesModification[0]
      : null;

    return {
      idstage: stage.idstage,
      typeStage: stage.typeStage,
      niveau: stage.niveau,
      domaineStage: stage.domaineStage,
      dureeStage: stage.dureeStage,
      dateDebutSouhaitee: stage.dateDebutSouhaitee,
      dateDebutEffective: stage.dateDebutEffective,
      dateFinEffective: stage.dateFinEffective,
      statusStage: stage.statusStage,
      motifRefus: stage.motifRefus,
      documentsRejetes: stage.documentsRejetes,
      createdDate: stage.createdDate,
      hasConvention: !!convention,
      conventionFilename: convention ? convention.document_filename : null,
      // Documents soumis par le candidat (métadonnées uniquement, pas les BLOBs)
      cv_filename: stage.cv_filename,
      cnib_filename: stage.cnib_filename,
      casierJudiciaire_filename: stage.casierJudiciaire_filename,
      lettreMotivation_filename: stage.lettreMotivation_filename,
      lettreRecommandation_filename: stage.lettreRecommandation_filename,
      dernierDiplome_filename: stage.dernierDiplome_filename,
      // Demande de modification en attente (null si aucune)
      demandeModifEnCours: demandeModif
        ? { id: demandeModif.id, type: demandeModif.type, dateDebut: demandeModif.dateDebut, createdDate: demandeModif.createdDate }
        : null,
      // Autorisation de renouvellement active (null si aucune valide)
      autorisationRenouvellement: (() => {
        const a = stage.autorisationsRenouvellement && stage.autorisationsRenouvellement[0];
        return a ? { id: a.id, expiresAt: a.expiresAt } : null;
      })(),
    };
  });
};

/**
 * Soumettre une demande de stage
 */
const soumettreDemandeStage = async (candidatId, data, files) => {
  // Vérifier que le candidat existe
  const candidat = await Candidat.findOne({
    where: { idcandidats: candidatId, del: 0 },
  });

  if (!candidat) {
    throw new Error('Candidat non trouvé');
  }

  // Vérifier qu'il n'a pas déjà un stage actif (en attente, en traitement, accepté, en cours ou rapport soumis)
  const stageActif = await Stage.findOne({
    where: {
      candidats_idcandidats: candidatId,
      statusStage: {
        [Op.in]: ['EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'ACCEPTE', 'EN_COURS', 'RAPPORT_SOUMIS'],
      },
      del: 0,
    },
  });

  if (stageActif) {
    const messages = {
      EN_ATTENTE: 'Vous avez déjà une demande de stage en attente de traitement',
      EN_COURS_DE_TRAITEMENT: 'Vous avez déjà une demande de stage en cours de traitement',
      ACCEPTE: 'Vous avez déjà un stage accepté. Veuillez attendre le début de votre stage',
      EN_COURS: 'Vous avez déjà un stage en cours',
      RAPPORT_SOUMIS: 'Vous avez un stage dont le rapport est en cours d\'évaluation',
    };
    throw new Error(messages[stageActif.statusStage] || 'Vous avez déjà un stage actif');
  }

  // Vérifier la règle des 6 mois continus
  // Si le candidat a terminé une chaîne récemment, vérifier s'il doit se reposer
  const dureeInfo = await getDureeContinueCandidat(candidatId, null);
  if (dureeInfo.dureeTotaleJours > 0 && dureeInfo.dureeTotaleMois >= DUREE_MAX_CONTINUE_MOIS) {
    const dateMin = dureeInfo.dateMinRepos;
    const aujourd = new Date().toISOString().split('T')[0];
    if (dateMin && aujourd < dateMin) {
      throw new Error(
        `Vous avez atteint la limite de ${DUREE_MAX_CONTINUE_MOIS} mois de stage continu. ` +
        `Une période de repos de ${REPOS_OBLIGATOIRE_MOIS} mois est obligatoire. ` +
        `Vous pourrez soumettre une nouvelle demande à partir du ${new Date(dateMin).toLocaleDateString('fr-FR')}.`,
        { dateMinRepos: dateMin }
      );
    }
  }

  // Vérifier que la date de début souhaitée respecte le repos obligatoire si applicable
  if (dureeInfo.dateMinRepos && data.dateDebutSouhaitee < dureeInfo.dateMinRepos) {
    throw new Error(
      `La date de début souhaitée doit être au minimum le ${new Date(dureeInfo.dateMinRepos).toLocaleDateString('fr-FR')} ` +
      `(après la période de repos obligatoire de ${REPOS_OBLIGATOIRE_MOIS} mois).`
    );
  }

  // Préparer les données du stage
  if (!data.direction_iddirection) {
    throw new Error('La direction est requise pour soumettre une demande de stage');
  }
  if (!data.service_idservice) {
    throw new Error('Le service est requis pour soumettre une demande de stage');
  }
  if (!data.domaineStage?.trim()) {
    throw new Error('Le domaine de stage est requis');
  }

  console.log('[soumettreDemandeStage] direction:', data.direction_iddirection, '| service:', data.service_idservice, '| domaine:', data.domaineStage);

  const stageData = {
    candidats_idcandidats: candidatId,
    typeStage: data.typeStage,
    domaineStage: data.domaineStage.trim(),
    direction_iddirection: parseInt(data.direction_iddirection),
    service_idservice: parseInt(data.service_idservice),
    dureeStage: parseInt(data.dureeStage),
    dateDebutSouhaitee: data.dateDebutSouhaitee,
    statusStage: 'EN_ATTENTE',
    estRenouvellement: 0,
  };

  // Ajouter le niveau si c'est un stage de soutenance ou perfectionnement
  if (data.typeStage === 'SOUTENANCE' || data.typeStage === 'PERFECTIONNEMENT') {
    if (!data.niveau) {
      throw new Error('Le niveau est obligatoire pour ce type de stage');
    }
    stageData.niveau = data.niveau;
  }

  // Valider les fichiers obligatoires
  if (!files.cv)                   throw new Error('Le CV est requis');
  if (!files.cnib)                 throw new Error('La CNIB est requise');
  if (!files.casierJudiciaire)     throw new Error('Le casier judiciaire est requis');
  if (!files.lettreMotivation)     throw new Error('La lettre de motivation est requise');

  // Lettre de recommandation : exigée pour la SOUTENANCE uniquement (pas pour le perfectionnement)
  if (data.typeStage !== 'PERFECTIONNEMENT' && !files.lettreRecommandation) {
    throw new Error('La lettre de recommandation est requise');
  }

  if (!files.dernierDiplome) {
    throw new Error('Le dernier diplôme (fichier PDF) est obligatoire');
  }

  // Ajouter les fichiers s'ils sont présents
  if (files.cv) {
    stageData.cv_path = fileStorage.saveFile(files.cv.buffer, files.cv.originalname, 'stages');
    stageData.cv = null;
    stageData.cv_filename = files.cv.originalname;
    stageData.cv_size = files.cv.size;
  }

  if (files.cnib) {
    stageData.cnib_path = fileStorage.saveFile(files.cnib.buffer, files.cnib.originalname, 'stages');
    stageData.cnib = null;
    stageData.cnib_filename = files.cnib.originalname;
    stageData.cnib_size = files.cnib.size;
  }

  if (files.casierJudiciaire) {
    stageData.casierJudiciaire_path = fileStorage.saveFile(files.casierJudiciaire.buffer, files.casierJudiciaire.originalname, 'stages');
    stageData.casierJudiciaire = null;
    stageData.casierJudiciaire_filename = files.casierJudiciaire.originalname;
    stageData.casierJudiciaire_size = files.casierJudiciaire.size;
  }

  if (files.lettreMotivation) {
    stageData.lettreMotivation_path = fileStorage.saveFile(files.lettreMotivation.buffer, files.lettreMotivation.originalname, 'stages');
    stageData.lettreMotivation = null;
    stageData.lettreMotivation_filename = files.lettreMotivation.originalname;
    stageData.lettreMotivation_size = files.lettreMotivation.size;
  }

  if (files.lettreRecommandation) {
    stageData.lettreRecommandation_path = fileStorage.saveFile(files.lettreRecommandation.buffer, files.lettreRecommandation.originalname, 'stages');
    stageData.lettreRecommandation = null;
    stageData.lettreRecommandation_filename = files.lettreRecommandation.originalname;
    stageData.lettreRecommandation_size = files.lettreRecommandation.size;
  }

  if (files.dernierDiplome) {
    stageData.dernierDiplome_path = fileStorage.saveFile(files.dernierDiplome.buffer, files.dernierDiplome.originalname, 'stages');
    stageData.dernierDiplome = null;
    stageData.dernierDiplome_filename = files.dernierDiplome.originalname;
    stageData.dernierDiplome_size = files.dernierDiplome.size;
  }

  // Créer la demande de stage
  const stage = await Stage.create(stageData);

  // Envoyer email de confirmation + notifier les agents en arrière-plan : la demande
  // est déjà créée en base, on ne doit pas faire attendre le candidat pendant que
  // l'API envoie un email à chaque agent abonné (cumul de plusieurs secondes par envoi SMTP).
  (async () => {
    try {
      const stageForEmail = {
        typeStage: stage.typeStage,
        domaineStage: stage.domaineStage,
        dureeStage: stage.dureeStage,
        dateDebutSouhaitee: stage.dateDebutSouhaitee,
      };
      await emailService.sendDemandeStageRecueEmail(candidat, stageForEmail);
      console.log(`📧 Email de confirmation de demande envoyé à ${candidat.email}`);
      // Notifier les agents ayant la permission STAGE
      await notifService.onNouvelleDemandeStage(candidat, stageForEmail);
    } catch (emailError) {
      console.error('❌ Erreur envoi email confirmation demande:', emailError);
    }
  })();

  return {
    idstage: stage.idstage,
    typeStage: stage.typeStage,
    domaineStage: stage.domaineStage,
    dureeStage: stage.dureeStage,
    dateDebutSouhaitee: stage.dateDebutSouhaitee,
    statusStage: stage.statusStage,
    createdDate: stage.createdDate,
  };
};

/**
 * Soumettre un rapport de stage
 */
const soumettreRapportStage = async (candidatId, stageId, data, file) => {
  // Vérifier que le stage existe et appartient au candidat
  const stage = await Stage.findOne({
    where: {
      idstage: stageId,
      candidats_idcandidats: candidatId,
      del: 0,
    },
  });

  if (!stage) {
    throw new Error('Stage non trouvé ou accès non autorisé');
  }

  // Vérifier que le stage est en cours, terminé ou expiré (pas en attente, pas rejeté, pas déjà rapport soumis)
  const statutsValides = ['EN_COURS', 'TERMINE', 'EXPIRE'];
  if (!statutsValides.includes(stage.statusStage)) {
    throw new Error(`Le rapport ne peut être soumis que pour un stage en cours, terminé ou expiré. Statut actuel: ${stage.statusStage}`);
  }

  // Vérifier qu'il n'y a pas déjà un rapport soumis
  const rapportExistant = await RapportStage.findOne({
    where: {
      stage_idstage: stageId,
      del: 0,
    },
  });

  if (rapportExistant) {
    throw new Error('Un rapport a déjà été soumis pour ce stage');
  }

  // Vérifier le fichier
  if (!file) {
    throw new Error('Le fichier du rapport est obligatoire');
  }

  // Vérifier que le fichier a un buffer
  if (!file.buffer) {
    throw new Error('Le contenu du fichier est vide ou invalide');
  }

  try {
    // Créer le rapport
    const rapport = await RapportStage.create({
      stage_idstage: stageId,
      titreRapport: data.titreRapport,
      natureRapport: data.natureRapport || 'RAPPORT_STAGE',
      rapportPdf: file.buffer,
      rapportPdf_filename: file.originalname,
      rapportPdf_size: file.size,
      statusRapport: 'SOUMIS',
      createdDate: new Date(),
    });

    // Mettre à jour le statut du stage
    await stage.update({ statusStage: 'RAPPORT_SOUMIS' });

    return {
      idrapport: rapport.idrapport,
      titreRapport: rapport.titreRapport,
      natureRapport: rapport.natureRapport,
      statusRapport: rapport.statusRapport,
      filename: rapport.rapportPdf_filename,
      createdDate: rapport.createdDate,
    };
  } catch (err) {
    console.error('Erreur lors de la création du rapport:', err);
    throw new Error(`Erreur lors de l'enregistrement du rapport: ${err.message}`);
  }
};

/**
 * Récupérer les infos de convention pour le modal de renouvellement
 * Retourne les infos de la convention (sans le blob) + confirmation qu'elle existe
 */
const getConventionPourRenouvellement = async (candidatId, stageId) => {
  // Vérifier que le stage existe et appartient au candidat
  const stage = await Stage.findOne({
    where: {
      idstage: stageId,
      candidats_idcandidats: candidatId,
      del: 0,
    },
    attributes: { exclude: ['cv', 'cnib', 'casierJudiciaire', 'lettreMotivation', 'lettreRecommandation', 'dernierDiplome'] },
  });

  if (!stage) {
    throw new Error('Stage non trouvé ou accès non autorisé');
  }

  const statusValides = ['EN_COURS', 'TERMINE', 'EXPIRE'];
  if (!statusValides.includes(stage.statusStage)) {
    throw new Error('Le renouvellement n\'est disponible que pour un stage en cours, terminé ou expiré');
  }

  // Pour TERMINE/EXPIRE : vérifier qu'une autorisation admin active existe
  const estFinished = ['TERMINE', 'EXPIRE'].includes(stage.statusStage);
  if (estFinished) {
    const autorisation = await AutorisationRenouvellementStage.findOne({
      where: {
        stage_idstage: stageId,
        del: 0,
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });
    if (!autorisation) {
      throw new Error('Aucune autorisation de renouvellement active pour ce stage. Veuillez contacter l\'administration.');
    }
  }

  // Vérifier la fenêtre de renouvellement (2 semaines avant la fin) — uniquement pour EN_COURS
  if (!estFinished) {
    if (!stage.dateFinEffective) {
      throw new Error('Date de fin du stage non définie');
    }

    const dateFin = new Date(stage.dateFinEffective);
    dateFin.setHours(0, 0, 0, 0);
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const deuxSemainesAvant = new Date(dateFin);
    deuxSemainesAvant.setDate(deuxSemainesAvant.getDate() - 14);

    if (aujourdhui < deuxSemainesAvant) {
      const joursRestants = Math.ceil((deuxSemainesAvant - aujourdhui) / (1000 * 60 * 60 * 24));
      throw new Error(`Le renouvellement sera disponible dans ${joursRestants} jours`);
    }

    // Le dernier jour (dateFinEffective) est encore actif — on bloque seulement à partir du lendemain
    if (aujourdhui > dateFin) {
      throw new Error('Le stage est déjà terminé, le renouvellement n\'est plus possible');
    }
  }

  // Vérifier qu'il n'y a pas déjà une demande de renouvellement
  const demandeExistante = await Stage.findOne({
    where: { stage_parent_idstage: stageId, del: 0 },
  });

  if (demandeExistante) {
    throw new Error('Une demande de renouvellement existe déjà pour ce stage');
  }

  // Récupérer la convention depuis document_stage (sans le blob)
  const convention = await DocumentStage.findOne({
    where: {
      stage_idstage: stageId,
      typeDocument: 'CONVENTION',
      del: 0,
    },
    attributes: ['iddocument', 'document_filename', 'document_size', 'dateEmission', 'dateExpiration', 'emetteurNom'],
  });

  return {
    stage: {
      idstage: stage.idstage,
      typeStage: stage.typeStage,
      domaineStage: stage.domaineStage,
      dureeStage: stage.dureeStage,
      dateDebutEffective: stage.dateDebutEffective,
      dateFinEffective: stage.dateFinEffective,
    },
    convention: convention ? {
      iddocument: convention.iddocument,
      filename: convention.document_filename,
      size: convention.document_size,
      dateEmission: convention.dateEmission,
      emetteurNom: convention.emetteurNom,
    } : null,
    conventionDisponible: !!convention,
  };
};

/**
 * Demander le renouvellement d'un stage
 * Disponible uniquement 2 semaines avant la fin du stage
 * @param {number} candidatId
 * @param {number} stageId
 * @param {object} data - { dureeDemandee }
 * @param {object} file - fichier lettre de demande (PDF)
 */
const demanderRenouvellement = async (candidatId, stageId, data, file) => {
  // Vérifier que le stage existe et appartient au candidat
  const stage = await Stage.findOne({
    where: {
      idstage: stageId,
      candidats_idcandidats: candidatId,
      del: 0,
    },
  });

  if (!stage) {
    throw new Error('Stage non trouvé ou accès non autorisé');
  }

  const statusValides = ['EN_COURS', 'TERMINE', 'EXPIRE'];
  if (!statusValides.includes(stage.statusStage)) {
    throw new Error('Le renouvellement n\'est possible que pour un stage en cours, terminé ou expiré');
  }

  // Pour TERMINE/EXPIRE : vérifier et récupérer l'autorisation admin active
  const estFinished = ['TERMINE', 'EXPIRE'].includes(stage.statusStage);
  let autorisationActive = null;

  if (estFinished) {
    autorisationActive = await AutorisationRenouvellementStage.findOne({
      where: {
        stage_idstage: stageId,
        del: 0,
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });
    if (!autorisationActive) {
      throw new Error('Aucune autorisation de renouvellement active pour ce stage. Veuillez contacter l\'administration.');
    }
  }

  // Vérifications de fenêtre temporelle — uniquement pour EN_COURS
  if (!estFinished) {
    if (!stage.dateFinEffective) {
      throw new Error('Date de fin du stage non définie');
    }

    const dateFin = new Date(stage.dateFinEffective);
    dateFin.setHours(0, 0, 0, 0);
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const deuxSemainesAvant = new Date(dateFin);
    deuxSemainesAvant.setDate(deuxSemainesAvant.getDate() - 14);

    if (aujourdhui < deuxSemainesAvant) {
      const joursRestants = Math.ceil((deuxSemainesAvant - aujourdhui) / (1000 * 60 * 60 * 24));
      throw new Error(`Le renouvellement sera disponible dans ${joursRestants} jours`);
    }

    // Le dernier jour (dateFinEffective) est encore actif — on bloque seulement à partir du lendemain
    if (aujourdhui > dateFin) {
      throw new Error('Le stage est déjà terminé, le renouvellement n\'est plus possible');
    }
  }

  // Vérifier qu'il n'y a pas déjà une demande de renouvellement en cours
  const demandeExistante = await Stage.findOne({
    where: {
      stage_parent_idstage: stageId,
      del: 0,
    },
  });

  if (demandeExistante) {
    throw new Error('Une demande de renouvellement existe déjà pour ce stage');
  }

  // Vérifier la lettre de demande
  if (!file || !file.buffer) {
    throw new Error('La lettre de demande de renouvellement est obligatoire');
  }

  // ─── Règle 6 mois : vérifier que durée chaîne + durée demandée ≤ 6 mois ───
  const dureeDemandeeN = parseInt(data.dureeDemandee) || stage.dureeStage;

  // Calculer la durée déjà consommée dans la chaîne actuelle
  const rootId = stage.stage_parent_idstage || stageId;
  const dureeChaine = await getDureeContinueCandidat(candidatId, rootId);

  // Total si ce renouvellement est accepté = durée chaîne actuelle (en mois) + durée demandée
  const dureeChaineMois = dureeChaine.dureeTotaleMois || 0;
  const totalApresRenouvellement = dureeChaineMois + dureeDemandeeN;

  if (totalApresRenouvellement > DUREE_MAX_CONTINUE_MOIS) {
    const moisDisponibles = Math.max(0, Math.floor((DUREE_MAX_CONTINUE_MOIS - dureeChaineMois) * 10) / 10);
    throw new Error(
      `Ce renouvellement dépasserait la limite de ${DUREE_MAX_CONTINUE_MOIS} mois de stage continu. ` +
      `Vous avez déjà ${dureeChaineMois} mois cumulés. ` +
      `Durée maximum disponible : ${moisDisponibles} mois.`
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Récupérer la convention existante depuis document_stage
  const conventionDoc = await DocumentStage.findOne({
    where: {
      stage_idstage: stageId,
      typeDocument: 'CONVENTION',
      del: 0,
    },
  });

  const dureeDemandee = parseInt(data.dureeDemandee) || stage.dureeStage;

  // Le renouvellement commence le lendemain de la fin du stage actuel (dateFin est le dernier jour actif)
  const dateDebutRenouvellement = new Date(stage.dateFinEffective);
  dateDebutRenouvellement.setDate(dateDebutRenouvellement.getDate() + 1);

  // Créer une nouvelle demande de stage comme renouvellement
  const nouveauStage = await Stage.create({
    candidats_idcandidats: candidatId,
    typeStage: stage.typeStage,
    niveau: stage.niveau,
    domaineStage: stage.domaineStage,
    dureeStage: dureeDemandee,
    dateDebutSouhaitee: dateDebutRenouvellement.toISOString().split('T')[0],
    statusStage: 'EN_ATTENTE',
    estRenouvellement: 1,
    stage_parent_idstage: stageId,
    // Copier les documents du stage parent
    cv: stage.cv,
    cv_filename: stage.cv_filename,
    cv_size: stage.cv_size,
    cnib: stage.cnib,
    cnib_filename: stage.cnib_filename,
    cnib_size: stage.cnib_size,
    casierJudiciaire: stage.casierJudiciaire,
    casierJudiciaire_filename: stage.casierJudiciaire_filename,
    casierJudiciaire_size: stage.casierJudiciaire_size,
    lettreMotivation: stage.lettreMotivation,
    lettreMotivation_filename: stage.lettreMotivation_filename,
    lettreMotivation_size: stage.lettreMotivation_size,
    lettreRecommandation: stage.lettreRecommandation,
    lettreRecommandation_filename: stage.lettreRecommandation_filename,
    lettreRecommandation_size: stage.lettreRecommandation_size,
  });

  // Créer l'entrée dans renouvellement_stage avec la lettre et la convention récupérée
  await RenouvellementStage.create({
    stage_actuel_idstage: stageId,
    stage_nouveau_idstage: nouveauStage.idstage,
    lettreMotivationRenouvellement: file.buffer,
    lettreMotivationRenouvellement_filename: file.originalname,
    lettreMotivationRenouvellement_size: file.size,
    // Copier la convention depuis document_stage si elle existe
    conventionStageEnCours: conventionDoc ? conventionDoc.document : null,
    conventionStageEnCours_filename: conventionDoc ? conventionDoc.document_filename : null,
    conventionStageEnCours_size: conventionDoc ? conventionDoc.document_size : null,
    dureeDemandee: dureeDemandee,
    statusRenouvellement: 'EN_ATTENTE',
  });

  // Consommer l'autorisation si le stage était TERMINE/EXPIRE
  if (autorisationActive) {
    await autorisationActive.update({ usedAt: new Date() });
  }

  return {
    idstage: nouveauStage.idstage,
    typeStage: nouveauStage.typeStage,
    domaineStage: nouveauStage.domaineStage,
    dureeStage: nouveauStage.dureeStage,
    dateDebutSouhaitee: nouveauStage.dateDebutSouhaitee,
    statusStage: nouveauStage.statusStage,
    estRenouvellement: nouveauStage.estRenouvellement,
    stageParentId: stageId,
    conventionJointe: !!conventionDoc,
    createdDate: nouveauStage.createdDate,
  };
};

/**
 * Vérifier si un rapport existe pour un stage
 */
const getRapportByStageId = async (candidatId, stageId) => {
  const stage = await Stage.findOne({
    where: {
      idstage: stageId,
      candidats_idcandidats: candidatId,
      del: 0,
    },
  });

  if (!stage) {
    throw new Error('Stage non trouvé ou accès non autorisé');
  }

  const rapport = await RapportStage.findOne({
    where: {
      stage_idstage: stageId,
      del: 0,
    },
  });

  if (!rapport) {
    return null;
  }

  return {
    idrapport: rapport.idrapport,
    titreRapport: rapport.titreRapport,
    natureRapport: rapport.natureRapport,
    statusRapport: rapport.statusRapport,
    noteRapport: rapport.noteRapport,
    commentaireEvaluateur: rapport.commentaireEvaluateur,
    filename: rapport.rapportPdf_filename,
    createdDate: rapport.createdDate,
  };
};

module.exports = {
  // Profil
  getProfilCandidat,
  updateProfilCandidat,

  // Documents / Stages-Rapports
  getDocumentsCandidat,
  uploadDocumentCandidat,
  getStagesRapportsCandidat,
  getAttestationStage,
  getMesDemandesStage,
  soumettreDemandeStage,
  soumettreRapportStage,
  getRapportByStageId,
  getConventionPourRenouvellement,
  demanderRenouvellement,
};