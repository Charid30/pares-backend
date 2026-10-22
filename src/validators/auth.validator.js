// src/validators/auth.validator.js
const Joi = require('joi');
const { estEmailJetable } = require('../utils/emailsJetables');

// Nom / prénom : lettres, espaces, apostrophes, tirets, et UN chiffre au plus (ex. « Sirina 1re Jumelle »)
const NOM_PATTERN = /^(?!(?:[^0-9]*[0-9]){2})[A-Za-zÀ-ÿ0-9\s'\-]{2,80}$/;
const NOM_MESSAGE = (libelle) => `Le ${libelle} ne doit contenir que des lettres, espaces, apostrophes ou tirets, et un seul chiffre au plus (ex. « 1re Jumelle »)`;
// Nom d'utilisateur : un seul mot (pas d'espace) — lettres, chiffres, point, tiret, tiret bas
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const USERNAME_MESSAGE = 'Le nom d\'utilisateur doit être un seul mot de 3 à 30 caractères (lettres, chiffres, point, tiret ou tiret bas), sans espace — ex. jean.ouedraogo';
const TELEPHONE_PATTERN = /^[0-9]{8,20}$/;
const EMAIL_JETABLE_MESSAGE = 'Les adresses e-mail temporaires (jetables) ne sont pas acceptées : utilisez votre adresse habituelle';

const refuserEmailJetable = (valeur, helpers) => (estEmailJetable(valeur) ? helpers.message(EMAIL_JETABLE_MESSAGE) : valeur);

/**
 * Schéma de validation pour l'inscription (register)
 */
const registerSchema = Joi.object({
  // User
  username: Joi.string()
    .trim()
    .pattern(USERNAME_PATTERN)
    .required()
    .messages({
      'string.empty': 'Le nom d\'utilisateur est requis',
      'string.pattern.base': USERNAME_MESSAGE,
    }),
  
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.empty': 'Le mot de passe est requis',
      'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
      'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
    }),
  
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Les mots de passe ne correspondent pas',
      'string.empty': 'La confirmation du mot de passe est requise',
    }),
  
  role_idrole: Joi.number()
    .integer()
    .default(6) // Par défaut : rôle CANDIDAT (idrole = 6)
    .messages({
      'number.base': 'Le rôle doit être un nombre',
    }),
  
  // Candidat
  nom: Joi.string()
    .trim()
    .pattern(NOM_PATTERN)
    .required()
    .messages({
      'string.empty': 'Le nom est requis',
      'string.pattern.base': NOM_MESSAGE('nom'),
    }),

  prenom: Joi.string()
    .trim()
    .pattern(NOM_PATTERN)
    .required()
    .messages({
      'string.empty': 'Le prénom est requis',
      'string.pattern.base': NOM_MESSAGE('prénom'),
    }),

  email: Joi.string()
    .trim()
    .email()
    .custom(refuserEmailJetable)
    .required()
    .messages({
      'string.empty': 'L\'email est requis',
      'string.email': 'L\'email n\'est pas valide',
    }),
  
  telephone: Joi.string()
    .pattern(TELEPHONE_PATTERN)
    .required()
    .messages({
      'string.empty': 'Le téléphone est requis',
      'string.pattern.base': 'Le téléphone doit contenir entre 8 et 20 chiffres',
    }),

  nip: Joi.string()
    .pattern(/^[0-9]{17}$/)
    .messages({
      'string.pattern.base': 'Le numéro NIP doit contenir exactement 17 chiffres',
    }),

  passeport: Joi.string()
    .pattern(/^[A-Za-z0-9]{6,12}$/)
    .messages({
      'string.pattern.base': 'Le numéro de passeport doit contenir entre 6 et 12 caractères alphanumériques',
    }),

  ifu: Joi.string()
    .pattern(/^\d{8}[A-Za-z]$/)
    .allow('', null)
    .optional()
    .messages({
      'string.pattern.base': 'Le numéro IFU doit contenir 8 chiffres suivis d\'une lettre (ex: 12345678A)',
    }),

  formToken: Joi.string().optional().allow('', null),
  website: Joi.string().optional().allow('', null),
})
  .xor('nip', 'passeport')
  .messages({
    'object.missing': 'Vous devez renseigner soit votre numéro NIP (CNIB), soit votre numéro de passeport',
    'object.xor': 'Vous ne pouvez renseigner que le NIP ou le passeport, pas les deux',
  });

/**
 * Schéma de validation pour la connexion (login)
 */
const loginSchema = Joi.object({
  username: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le nom d\'utilisateur est requis',
    }),

  password: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le mot de passe est requis',
    }),

  rememberMe: Joi.boolean()
    .default(false),
});

/**
 * Schéma de validation pour la demande de réinitialisation (forgot-password)
 */
const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.empty': 'L\'adresse email est requise',
      'string.email': 'L\'adresse email n\'est pas valide',
    }),
});

/**
 * Schéma de validation pour la réinitialisation du mot de passe (reset-password)
 */
const resetPasswordSchema = Joi.object({
  token: Joi.string().required().messages({
    'string.empty': 'Le token de réinitialisation est requis',
  }),
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.empty':        'Le nouveau mot de passe est requis',
      'string.min':          'Le mot de passe doit contenir au moins 8 caractères',
      'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
    }),
});

module.exports = {
  NOM_PATTERN,
  NOM_MESSAGE,
  USERNAME_PATTERN,
  USERNAME_MESSAGE,
  TELEPHONE_PATTERN,
  EMAIL_JETABLE_MESSAGE,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};