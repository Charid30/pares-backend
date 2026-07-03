// src/validators/user.validator.js
const Joi = require('joi');

/**
 * Schéma de validation pour la création d'un agent
 * Tous les champs requis + email unique vérifié côté service
 */
const createAgentSchema = Joi.object({
  // Informations personnelles
  nom: Joi.string()
    .min(2)
    .max(255)
    .required()
    .messages({
      'string.empty': 'Le nom est requis',
      'string.min':   'Le nom doit contenir au moins 2 caractères',
      'any.required': 'Le nom est requis',
    }),

  prenom: Joi.string()
    .min(2)
    .max(255)
    .required()
    .messages({
      'string.empty': 'Le prénom est requis',
      'string.min':   'Le prénom doit contenir au moins 2 caractères',
      'any.required': 'Le prénom est requis',
    }),

  matricule: Joi.string()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.empty': 'Le matricule est requis',
      'string.min':   'Le matricule doit contenir au moins 3 caractères',
      'any.required': 'Le matricule est requis',
    }),

  email: Joi.string()
    .email({ tlds: { allow: false } })
    .max(255)
    .required()
    .messages({
      'string.empty': "L'adresse email est requise",
      'string.email': "L'adresse email n'est pas valide",
      'any.required': "L'adresse email est requise",
    }),

  // Rattachement : soit un service, soit une direction (jamais les deux, voir .xor ci-dessous)
  service_idservice: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base':  'Le service doit être un nombre valide',
      'number.min':   'Veuillez sélectionner un service valide',
    }),

  direction_iddirection: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base':  'La direction doit être un nombre valide',
      'number.min':   'Veuillez sélectionner une direction valide',
    }),

  // Compte utilisateur
  username: Joi.string()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.empty': "Le nom d'utilisateur est requis",
      'string.min':   "Le nom d'utilisateur doit contenir au moins 3 caractères",
      'string.max':   "Le nom d'utilisateur ne peut pas dépasser 50 caractères",
      'any.required': "Le nom d'utilisateur est requis",
    }),

  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.empty': 'Le mot de passe est requis',
      'string.min':   'Le mot de passe doit contenir au moins 8 caractères',
      'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
      'any.required': 'Le mot de passe est requis',
    }),

  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only':     'Les mots de passe ne correspondent pas',
      'string.empty': 'La confirmation du mot de passe est requise',
      'any.required': 'La confirmation du mot de passe est requise',
    }),

  // Rôles — nouveau contrat : tableau roleIds (1er = principal, suivants = additionnels)
  roleIds: Joi.array()
    .items(Joi.number().integer().min(1))
    .min(1)
    .messages({
      'array.min':   'Veuillez sélectionner au moins un rôle',
      'number.base': 'Identifiant de rôle invalide',
    }),

  // Rôle (legacy — rôle unique). Au moins l'un des deux doit être fourni.
  role_idrole: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base':  'Le rôle est requis',
      'number.min':   'Veuillez sélectionner un rôle valide',
    }),
})
  .or('roleIds', 'role_idrole')
  .xor('service_idservice', 'direction_iddirection')
  .messages({
    'object.missing': 'Veuillez sélectionner au moins un rôle',
    'object.xor': 'Choisissez soit un service, soit une direction',
  });

/**
 * Schéma de validation pour la mise à jour d'un agent
 * Tous les champs sont optionnels (PATCH-like), mais email/username
 * sont vérifiés en unicité côté service si fournis
 */
const updateAgentSchema = Joi.object({
  nom: Joi.string()
    .min(2)
    .max(255)
    .messages({
      'string.empty': 'Le nom ne peut pas être vide',
      'string.min':   'Le nom doit contenir au moins 2 caractères',
    }),

  prenom: Joi.string()
    .min(2)
    .max(255)
    .messages({
      'string.empty': 'Le prénom ne peut pas être vide',
      'string.min':   'Le prénom doit contenir au moins 2 caractères',
    }),

  matricule: Joi.string()
    .min(3)
    .max(50)
    .messages({
      'string.empty': 'Le matricule ne peut pas être vide',
      'string.min':   'Le matricule doit contenir au moins 3 caractères',
    }),

  email: Joi.string()
    .email({ tlds: { allow: false } })
    .max(255)
    .messages({
      'string.empty': "L'adresse email ne peut pas être vide",
      'string.email': "L'adresse email n'est pas valide",
    }),

  service_idservice: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base': 'Le service doit être un nombre valide',
      'number.min':  'Veuillez sélectionner un service valide',
    }),

  direction_iddirection: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base': 'La direction doit être un nombre valide',
      'number.min':  'Veuillez sélectionner une direction valide',
    }),

  // Rôles (optionnels en update). Si fournis, remplacent l'ensemble.
  roleIds: Joi.array()
    .items(Joi.number().integer().min(1))
    .min(1)
    .messages({
      'array.min':   'Veuillez sélectionner au moins un rôle',
      'number.base': 'Identifiant de rôle invalide',
    }),

  role_idrole: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base': 'Le rôle doit être un nombre valide',
      'number.min':  'Veuillez sélectionner un rôle valide',
    }),
})
  .nand('service_idservice', 'direction_iddirection')
  .messages({
    'object.nand': 'Choisissez soit un service, soit une direction, pas les deux',
  });

/**
 * Schéma de validation pour le changement de mot de passe
 */
const changePasswordSchema = Joi.object({
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.empty':        'Le nouveau mot de passe est requis',
      'string.min':          'Le mot de passe doit contenir au moins 8 caractères',
      'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
      'any.required':        'Le nouveau mot de passe est requis',
    }),

  confirmNewPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only':     'Les mots de passe ne correspondent pas',
      'string.empty': 'La confirmation est requise',
      'any.required': 'La confirmation du mot de passe est requise',
    }),
});

module.exports = {
  createAgentSchema,
  updateAgentSchema,
  changePasswordSchema,
};
