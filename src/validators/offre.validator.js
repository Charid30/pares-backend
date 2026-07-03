// src/validators/offre.validator.js
const Joi = require('joi');

/**
 * Schéma de validation pour créer une offre (par candidat)
 */
const createOffreCandidatSchema = Joi.object({
  typeOffre: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le type d\'offre est requis',
    }),
  
  titre: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le titre est requis',
    }),
  
  description: Joi.string().allow('', null),
});

/**
 * Schéma de validation pour créer une offre (par admin)
 */
const createOffreAdminSchema = Joi.object({
  typeOffre: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le type d\'offre est requis',
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
  
  nombreCandidaturesMax: Joi.number()
    .integer()
    .min(1)
    .default(100)
    .messages({
      'number.min': 'Le nombre maximum de candidatures doit être au moins 1',
    }),
  
  statusOffre: Joi.string()
    .valid('BROUILLON', 'ACTIVE', 'CLOTUREE')
    .default('BROUILLON'),
});

/**
 * Schéma de validation pour mettre à jour une offre
 */
const updateOffreSchema = Joi.object({
  titre: Joi.string(),
  description: Joi.string().allow('', null),
  conditionsRequises: Joi.string().allow('', null),
  documentsRequis: Joi.array().items(Joi.string()),
  dateDebut: Joi.date(),
  dateFin: Joi.date().min(Joi.ref('dateDebut')),
  nombreCandidaturesMax: Joi.number().integer().min(1),
  statusOffre: Joi.string().valid('BROUILLON', 'EN_ATTENTE', 'EN_TRAITEMENT', 'VALIDEE', 'REJETEE', 'ACTIVE', 'CLOTUREE'),
}).min(1);

/**
 * Schéma de validation pour évaluer une offre créée par un candidat
 */
const evaluateOffreSchema = Joi.object({
  statusOffre: Joi.string()
    .valid('EN_ATTENTE', 'EN_TRAITEMENT', 'VALIDEE', 'REJETEE')
    .required()
    .messages({
      'any.required': 'Le statut est requis',
      'any.only': 'Statut invalide',
    }),
  
  motifRefus: Joi.when('statusOffre', {
    is: 'REJETEE',
    then: Joi.string().required().messages({
      'string.empty': 'Le motif de refus est requis pour un rejet',
    }),
    otherwise: Joi.string().allow('', null),
  }),
});

/**
 * Schéma de validation pour créer une candidature à une offre
 */
const createCandidatureOffreSchema = Joi.object({
  offres_idoffres: Joi.number()
    .integer()
    .required()
    .messages({
      'number.base': 'L\'ID de l\'offre doit être un nombre',
      'any.required': 'L\'ID de l\'offre est requis',
    }),
});

/**
 * Schéma de validation pour évaluer une candidature
 */
const evaluateCandidatureOffreSchema = Joi.object({
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
  createOffreCandidatSchema,
  createOffreAdminSchema,
  updateOffreSchema,
  evaluateOffreSchema,
  createCandidatureOffreSchema,
  evaluateCandidatureOffreSchema,
};