// src/validators/stage.validator.js
const Joi = require('joi');

// Clés des documents pouvant être joints à une demande de stage
const DOCUMENT_KEYS = ['cv', 'cnib', 'casierJudiciaire', 'lettreMotivation', 'lettreRecommandation', 'dernierDiplome'];

/**
 * Schéma de validation pour créer une demande de stage
 */
const createStageSchema = Joi.object({
  typeStage: Joi.string()
    .valid('SOUTENANCE', 'PERFECTIONNEMENT')
    .required()
    .messages({
      'any.required': 'Le type de stage est requis',
      'any.only': 'Type de stage invalide',
    }),

  niveau: Joi.string()
    .valid('CAP', 'BEPC', 'BEP', 'BAC', 'LICENCE', 'MASTER', 'DOCTORAT')
    .when('typeStage', {
      is: Joi.valid('SOUTENANCE', 'PERFECTIONNEMENT'),
      then: Joi.required().messages({
        'any.required': 'Le niveau est requis pour ce type de stage',
        'any.only': 'Niveau invalide',
      }),
      otherwise: Joi.optional(),
    }),

  // Note: fichiers (lettreRecommandation, dernierDiplome...) validés dans le service via multer

  domaineStage: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le domaine de stage est requis',
    }),

  direction_iddirection: Joi.number()
    .integer()
    .required()
    .messages({
      'number.base': 'L\'identifiant de la direction doit être un nombre',
      'any.required': 'La direction est requise',
    }),

  service_idservice: Joi.number()
    .integer()
    .required()
    .messages({
      'number.base': 'L\'identifiant du service doit être un nombre',
      'any.required': 'Le service est requis',
    }),

  dureeStage: Joi.number()
    .integer()
    .min(1)
    .max(6)
    .required()
    .messages({
      'number.base': 'La durée doit être un nombre',
      'number.min': 'La durée doit être au moins 1 mois',
      'number.max': 'La durée ne peut pas dépasser 6 mois',
      'any.required': 'La durée de stage est requise',
    }),
  
  dateDebutSouhaitee: Joi.date()
    .min('now')
    .required()
    .custom((value, helpers) => {
      const jour = new Date(value).getUTCDate();
      if (jour !== 1 && jour !== 15) {
        return helpers.error('date.jourInvalide');
      }
      return value;
    })
    .messages({
      'date.base':        'La date de début doit être une date valide',
      'date.min':         'La date de début doit être dans le futur',
      'any.required':     'La date de début souhaitée est requise',
      'date.jourInvalide':'La date de début doit être le 1er ou le 15 du mois',
    }),
});

/**
 * Schéma de validation pour mettre à jour le statut d'un stage
 */
const updateStatusStageSchema = Joi.object({
  statusStage: Joi.string()
    .valid('EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'PROGRAMMATION_EN_COURS', 'ACCEPTE', 'REJETE', 'EN_COURS', 'EXPIRE', 'SUSPENDU', 'ANNULE')
    .required()
    .messages({
      'any.required': 'Le statut est requis',
      'any.only': 'Statut invalide',
    }),
  
  motifRefus: Joi.when('statusStage', {
    is: 'REJETE',
    then: Joi.string().required().messages({
      'string.empty': 'Le motif de refus est requis pour un rejet',
    }),
    otherwise: Joi.string().allow('', null),
  }),

  // Liste (CSV) des clés de documents non conformes — requis en cas de rejet
  documentsRejetes: Joi.when('statusStage', {
    is: 'REJETE',
    then: Joi.string().required().custom((value, helpers) => {
      const keys = value.split(',').map((k) => k.trim()).filter(Boolean);
      if (keys.length === 0) {
        return helpers.error('string.empty');
      }
      const invalid = keys.filter((k) => !DOCUMENT_KEYS.includes(k));
      if (invalid.length > 0) {
        return helpers.error('any.invalid');
      }
      return value;
    }),
    otherwise: Joi.string().allow('', null),
  }).messages({
    'string.empty': 'Veuillez sélectionner au moins un document non conforme',
    'any.required': 'Veuillez sélectionner au moins un document non conforme',
    'any.invalid': 'Un ou plusieurs documents sélectionnés sont invalides',
  }),

  dateDebutEffective: Joi.when('statusStage', {
    is: 'ACCEPTE',
    then: Joi.date().required().messages({
      'date.base': 'La date de début effective doit être une date valide',
      'any.required': 'La date de début effective est requise pour un stage accepté',
    }),
    otherwise: Joi.date().allow(null),
  }),

  // Durée (en mois) réellement accordée par l'entreprise — peut différer de la durée demandée
  dureeAccordee: Joi.when('statusStage', {
    is: 'ACCEPTE',
    then: Joi.number().integer().min(1).max(12).required().messages({
      'number.base': 'La durée accordée doit être un nombre',
      'number.min': 'La durée accordée doit être au moins 1 mois',
      'number.max': 'La durée accordée ne peut pas dépasser 12 mois',
      'any.required': 'La durée accordée est requise pour un stage accepté',
    }),
    otherwise: Joi.number().integer().min(1).max(12).optional().allow(null),
  }),
  
  dateFinEffective: Joi.when('statusStage', {
    is: Joi.valid('EN_COURS', 'EXPIRE'),
    then: Joi.date().min(Joi.ref('dateDebutEffective')).allow(null),
    otherwise: Joi.date().allow(null),
  }),
});

/**
 * Schéma de validation pour créer un renouvellement
 */
const createRenouvellementSchema = Joi.object({
  stage_actuel_idstage: Joi.number()
    .integer()
    .required()
    .messages({
      'number.base': 'L\'ID du stage actuel doit être un nombre',
      'any.required': 'L\'ID du stage actuel est requis',
    }),
  
  dureeDemandee: Joi.number()
    .integer()
    .min(1)
    .max(12)
    .required()
    .messages({
      'number.base': 'La durée demandée doit être un nombre',
      'number.min': 'La durée demandée doit être au moins 1 mois',
      'number.max': 'La durée demandée ne peut pas dépasser 12 mois',
      'any.required': 'La durée demandée est requise',
    }),
});

/**
 * Schéma de validation pour évaluer un renouvellement
 */
const evaluateRenouvellementSchema = Joi.object({
  statusRenouvellement: Joi.string()
    .valid('EN_ATTENTE', 'ACCEPTE', 'REJETE')
    .required()
    .messages({
      'any.required': 'Le statut est requis',
      'any.only': 'Statut invalide',
    }),
  
  motifRefus: Joi.when('statusRenouvellement', {
    is: 'REJETE',
    then: Joi.string().required().messages({
      'string.empty': 'Le motif de refus est requis pour un rejet',
    }),
    otherwise: Joi.string().allow('', null),
  }),
});

/**
 * Schéma de validation pour soumettre un rapport de stage
 */
const createRapportSchema = Joi.object({
  stage_idstage: Joi.number()
    .integer()
    .required()
    .messages({
      'number.base': 'L\'ID du stage doit être un nombre',
      'any.required': 'L\'ID du stage est requis',
    }),
  
  titreRapport: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le titre du rapport est requis',
    }),
  
  natureRapport: Joi.string()
    .required()
    .messages({
      'string.empty': 'La nature du rapport est requise',
    }),
});

/**
 * Schéma de validation pour évaluer un rapport
 */
const evaluateRapportSchema = Joi.object({
  statusRapport: Joi.string()
    .valid('SOUMIS', 'EN_EVALUATION', 'VALIDE', 'REFUSE')
    .required()
    .messages({
      'any.required': 'Le statut est requis',
      'any.only': 'Statut invalide',
    }),
  
  noteRapport: Joi.number()
    .min(0)
    .max(20)
    .allow(null)
    .messages({
      'number.min': 'La note doit être au moins 0',
      'number.max': 'La note ne peut pas dépasser 20',
    }),
  
  commentaireEvaluateur: Joi.string().allow('', null),
  
  motifRefus: Joi.when('statusRapport', {
    is: 'REFUSE',
    then: Joi.string().required().messages({
      'string.empty': 'Le motif de refus est requis pour un refus',
    }),
    otherwise: Joi.string().allow('', null),
  }),
});

/**
 * Schéma de validation pour créer un document de stage (convention/attestation)
 */
const createDocumentStageSchema = Joi.object({
  stage_idstage: Joi.number()
    .integer()
    .required()
    .messages({
      'number.base': 'L\'ID du stage doit être un nombre',
      'any.required': 'L\'ID du stage est requis',
    }),
  
  typeDocument: Joi.string()
    .valid('CONVENTION', 'ATTESTATION')
    .required()
    .messages({
      'any.required': 'Le type de document est requis',
      'any.only': 'Type de document invalide',
    }),
  
  rapport_idrapport: Joi.when('typeDocument', {
    is: 'ATTESTATION',
    then: Joi.number().integer().required().messages({
      'number.base': 'L\'ID du rapport doit être un nombre',
      'any.required': 'L\'ID du rapport est requis pour une attestation',
    }),
    otherwise: Joi.number().allow(null),
  }),
  
  numeroAttestation: Joi.when('typeDocument', {
    is: 'ATTESTATION',
    then: Joi.string().required().messages({
      'string.empty': 'Le numéro d\'attestation est requis',
    }),
    otherwise: Joi.string().allow('', null),
  }),
  
  emetteurNom: Joi.string().allow('', null),
  
  emetteurFonction: Joi.string().allow('', null),
  
  dateEmission: Joi.date()
    .required()
    .messages({
      'date.base': 'La date d\'émission doit être une date valide',
      'any.required': 'La date d\'émission est requise',
    }),
  
  dateExpiration: Joi.date()
    .min(Joi.ref('dateEmission'))
    .allow(null)
    .messages({
      'date.min': 'La date d\'expiration doit être après la date d\'émission',
    }),
});

const updateStageSchema = Joi.object({
  commentaireAdmin: Joi.string().max(1000).optional().allow('', null),
  dateDebutEffective: Joi.date().optional().allow(null),
  dateFinEffective: Joi.date().optional().allow(null),
  dureeStage: Joi.number().integer().min(1).max(24).optional(),
  // Affectation direction/service — réservée aux rôles système (ADMIN...), voir stage.service.js
  direction_iddirection: Joi.number().integer().min(1).optional().allow(null),
  service_idservice: Joi.number().integer().min(1).optional().allow(null),
}).min(1);

/**
 * Schéma de validation pour transférer un stage vers une autre direction
 * (action distincte de MODIFIER — voir authorizeAction('STAGE', 'TRANSFERER'))
 */
const transfererStageSchema = Joi.object({
  direction_iddirection: Joi.number().integer().min(1).required().messages({
    'any.required': 'La direction de destination est requise',
    'number.base': 'Direction invalide',
  }),
});

/**
 * Schéma de validation pour approuver un stage. La date de début proposée est
 * optionnelle mais, si fournie, doit obligatoirement être le 1er ou le 15 du mois
 * (jours officiels de démarrage des stages).
 */
const approuverStageSchema = Joi.object({
  dateDebutProposee: Joi.date().optional().allow(null, '').custom((value, helpers) => {
    const jour = new Date(value).getUTCDate();
    if (jour !== 1 && jour !== 15) {
      return helpers.error('date.jourInvalide');
    }
    return value;
  }).messages({
    'date.jourInvalide': 'La date proposée doit être le 1er ou le 15 du mois',
  }),
});

/**
 * Schéma de validation pour créer une demande de modification de stage
 */
const createDemandeModificationSchema = Joi.object({
  type: Joi.string()
    .valid('SUSPENSION', 'ANNULATION')
    .required()
    .messages({
      'any.required': 'Le type de demande est requis',
      'any.only': 'Type invalide (SUSPENSION ou ANNULATION)',
    }),

  motif: Joi.string()
    .min(10)
    .required()
    .messages({
      'string.empty': 'Le motif est requis',
      'string.min': 'Le motif doit comporter au moins 10 caractères',
      'any.required': 'Le motif est requis',
    }),

  dateDebut: Joi.date()
    .required()
    .messages({
      'date.base': 'La date de début doit être une date valide',
      'any.required': 'La date de début est requise',
    }),
});

/**
 * Schéma de validation pour évaluer une demande de modification
 */
const evaluerDemandeModificationSchema = Joi.object({
  status: Joi.string()
    .valid('APPROUVEE', 'REJETEE')
    .required()
    .messages({
      'any.required': 'Le statut est requis',
      'any.only': 'Statut invalide (APPROUVEE ou REJETEE)',
    }),

  reponse_drh: Joi.string().allow('', null),
});

module.exports = {
  DOCUMENT_KEYS,
  createStageSchema,
  updateStatusStageSchema,
  updateStageSchema,
  transfererStageSchema,
  createRenouvellementSchema,
  evaluateRenouvellementSchema,
  createRapportSchema,
  evaluateRapportSchema,
  createDocumentStageSchema,
  approuverStageSchema,
  createDemandeModificationSchema,
  evaluerDemandeModificationSchema,
};