// src/validators/aide.validator.js
const Joi = require('joi');

/**
 * Schéma de validation pour créer une aide (par candidat)
 */
const createAideCandidatSchema = Joi.object({
  typeAide: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le type d\'aide est requis',
    }),
  
  titre: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le titre est requis',
    }),
  
  description: Joi.string().allow('', null),
});

/**
 * Schéma de validation pour créer une aide (par admin)
 */
const createAideAdminSchema = Joi.object({
  typeAide: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le type d\'aide est requis',
    }),
  
  titre: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le titre est requis',
    }),
  
  description: Joi.string().allow('', null),
  
  conditionsRequises: Joi.string().allow('', null),
  
  documentsRequis: Joi.array()
    .items(Joi.string())
    .default([]),
  
  dateDebut: Joi.date()
    .required()
    .messages({
      'date.base': 'La date de début doit être une date valide',
      'any.required': 'La date de début est requise',
    }),
  
  dateFin: Joi.date()
    .min(Joi.ref('dateDebut'))
    .required()
    .messages({
      'date.base': 'La date de fin doit être une date valide',
      'date.min': 'La date de fin doit être après la date de début',
      'any.required': 'La date de fin est requise',
    }),
  
  nombreBeneficiairesMax: Joi.number()
    .integer()
    .min(1)
    .default(100)
    .messages({
      'number.min': 'Le nombre maximum de bénéficiaires doit être au moins 1',
    }),
  
  statusAide: Joi.string()
    .valid('BROUILLON', 'ACTIVE', 'CLOTUREE')
    .default('BROUILLON'),
});

/**
 * Schéma de validation pour mettre à jour une aide
 */
const updateAideSchema = Joi.object({
  titre: Joi.string(),
  description: Joi.string().allow('', null),
  conditionsRequises: Joi.string().allow('', null),
  documentsRequis: Joi.array().items(Joi.string()),
  dateDebut: Joi.date(),
  dateFin: Joi.date().min(Joi.ref('dateDebut')),
  nombreBeneficiairesMax: Joi.number().integer().min(1),
  statusAide: Joi.string().valid('BROUILLON', 'EN_ATTENTE', 'EN_TRAITEMENT', 'VALIDEE', 'REJETEE', 'ACTIVE', 'CLOTUREE'),
}).min(1);

/**
 * Schéma de validation pour évaluer une aide créée par un candidat
 */
const evaluateAideSchema = Joi.object({
  statusAide: Joi.string()
    .valid('EN_ATTENTE', 'EN_TRAITEMENT', 'VALIDEE', 'REJETEE')
    .required()
    .messages({
      'any.required': 'Le statut est requis',
      'any.only': 'Statut invalide',
    }),
  
  motifRefus: Joi.when('statusAide', {
    is: 'REJETEE',
    then: Joi.string().required().messages({
      'string.empty': 'Le motif de refus est requis pour un rejet',
    }),
    otherwise: Joi.string().allow('', null),
  }),
});

/**
 * Schéma de validation pour créer une candidature à une aide
 */
const createCandidatureAideSchema = Joi.object({
  aides_idaide: Joi.number()
    .integer()
    .required()
    .messages({
      'number.base': 'L\'ID de l\'aide doit être un nombre',
      'any.required': 'L\'ID de l\'aide est requis',
    }),
});

/**
 * Schéma de validation pour évaluer une candidature
 */
const evaluateCandidatureAideSchema = Joi.object({
  statusCandidature: Joi.string()
    .valid('SOUMISE', 'EN_EXAMEN', 'VALIDEE', 'REJETEE')
    .required()
    .messages({
      'any.required': 'Le statut est requis',
      'any.only': 'Statut invalide',
    }),
  
  motifRefus: Joi.when('statusCandidature', {
    is: 'REJETEE',
    then: Joi.string().required().messages({
      'string.empty': 'Le motif de refus est requis pour un rejet',
    }),
    otherwise: Joi.string().allow('', null),
  }),
  
  commentaireAgent: Joi.string().allow('', null),
});

module.exports = {
  createAideCandidatSchema,
  createAideAdminSchema,
  updateAideSchema,
  evaluateAideSchema,
  createCandidatureAideSchema,
  evaluateCandidatureAideSchema,
};