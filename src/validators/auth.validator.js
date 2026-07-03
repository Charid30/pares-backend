// src/validators/auth.validator.js
const Joi = require('joi');

/**
 * Schéma de validation pour l'inscription (register)
 */
const registerSchema = Joi.object({
  // User
  username: Joi.string()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.empty': 'Le nom d\'utilisateur est requis',
      'string.min': 'Le nom d\'utilisateur doit contenir au moins 3 caractères',
      'string.max': 'Le nom d\'utilisateur ne peut pas dépasser 50 caractères',
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
    .required()
    .messages({
      'string.empty': 'Le nom est requis',
    }),
  
  prenom: Joi.string()
    .required()
    .messages({
      'string.empty': 'Le prénom est requis',
    }),
  
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.empty': 'L\'email est requis',
      'string.email': 'L\'email n\'est pas valide',
    }),
  
  telephone: Joi.string()
    .pattern(/^[0-9]{8,20}$/)
    .required()
    .messages({
      'string.empty': 'Le téléphone est requis',
      'string.pattern.base': 'Le téléphone doit contenir entre 8 et 20 chiffres',
    }),

  nip: Joi.string()
    .pattern(/^[0-9]{17}$/)
    .required()
    .messages({
      'string.empty': 'Le numéro NIP est requis',
      'string.pattern.base': 'Le numéro NIP doit contenir exactement 17 chiffres',
    }),

  ifu: Joi.string()
    .pattern(/^\d{8}[A-Za-z]$/)
    .allow('', null)
    .optional()
    .messages({
      'string.pattern.base': 'Le numéro IFU doit contenir 8 chiffres suivis d\'une lettre (ex: 12345678A)',
    }),
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
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};