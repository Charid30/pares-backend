// src/controllers/auth.controller.js
const authService = require('../services/auth.service');
const { success, error } = require('../utils/response.util');
const env = require('../config/env');

// Options de base du cookie JWT (HttpOnly — inaccessible depuis JS côté client)
const baseCookieOptions = {
  httpOnly: true,                        // Protège contre le vol XSS
  secure: env.NODE_ENV === 'production', // HTTPS uniquement en prod
  sameSite: 'strict',                    // Bloque les requêtes cross-site (CSRF)
  path: '/',
};

const COOKIE_DEFAULT_MS  =  8 * 60 * 60 * 1000; //  8h  — session normale
const COOKIE_REMEMBER_MS = 24 * 60 * 60 * 1000; // 24h  — "se souvenir de moi"

/**
 * Inscription d'un nouveau candidat
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const result = await authService.register(req.body);
    // Inscription → session normale (8h)
    res.cookie('token', result.token, { ...baseCookieOptions, maxAge: COOKIE_DEFAULT_MS });
    return success(res, result, 'Inscription réussie', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Connexion d'un utilisateur
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { username, password, rememberMe = false } = req.body;
    const result = await authService.login(username, password, !!rememberMe);
    // Durée du cookie selon "se souvenir de moi"
    res.cookie('token', result.token, {
      ...baseCookieOptions,
      maxAge: rememberMe ? COOKIE_REMEMBER_MS : COOKIE_DEFAULT_MS,
    });
    return success(res, result, 'Connexion réussie');
  } catch (err) {
    return error(res, err.message, 401);
  }
};

/**
 * Obtenir le profil de l'utilisateur connecté
 * GET /api/auth/profile
 */
const getProfile = async (req, res) => {
  try {
    const profile = await authService.getProfile(req.user.id);
    return success(res, profile, 'Profil récupéré avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Demande de réinitialisation de mot de passe
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);

    // Email introuvable en base
    if (result.notFound) {
      return error(res, 'Aucun compte n\'est associé à cette adresse email.', 404);
    }

    // Cooldown actif : trop tôt pour renvoyer
    if (result.cooldown) {
      return error(res, `Veuillez attendre ${result.waitSeconds} secondes avant de renvoyer un email.`, 429);
    }

    return success(res, { sent: true }, 'Un lien de réinitialisation a été envoyé à votre adresse email.');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Réinitialiser le mot de passe via token (lien email)
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return error(res, 'Token et nouveau mot de passe requis', 400);
    const result = await authService.resetPassword(token, newPassword);
    return success(res, result, 'Mot de passe réinitialisé avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Déconnexion — invalide le token JWT côté serveur + supprime le cookie
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    const { addToBlacklist } = require('../utils/tokenBlacklist');
    // req.token est attaché par le middleware authenticate (cookie ou header)
    if (req.token) {
      await addToBlacklist(req.token);
    }
  } catch (err) {
    // Erreur silencieuse — la déconnexion doit toujours réussir côté client
  }
  // Effacer le cookie HttpOnly
  res.clearCookie('token', { path: '/' });
  return success(res, null, 'Déconnexion réussie');
};

module.exports = {
  register,
  login,
  getProfile,
  forgotPassword,
  resetPassword,
  logout,
};
