// src/controllers/admin-candidat.controller.js - Controller Admin pour gestion des candidats
const adminCandidatService = require('../services/admin-candidat.service');
const { success, error } = require('../utils/response.util');

/**
 * POST /api/admin/candidats
 * Créer un nouveau candidat (compte utilisateur + profil)
 */
const createCandidat = async (req, res) => {
  try {
    const { nom, prenom, email, telephone, username } = req.body;

    if (!nom || !prenom || !email || !telephone) {
      return error(res, 'Les champs nom, prénom, email et téléphone sont obligatoires', 400);
    }

    const result = await adminCandidatService.createCandidat({ nom, prenom, email, telephone, username });
    return success(res, result, 'Candidat créé avec succès');
  } catch (err) {
    console.error('Erreur createCandidat:', err);
    const statusCode = err.message.includes('déjà utilisé') || err.message.includes('déjà pris') ? 409 : 500;
    return error(res, err.message || 'Erreur lors de la création du candidat', statusCode);
  }
};

/**
 * GET /api/admin/candidats
 * Récupérer la liste des candidats avec filtres et pagination
 */
const getCandidats = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', sortBy = 'createdDate', sortOrder = 'DESC' } = req.query;

    const result = await adminCandidatService.getCandidats({
      page,
      limit,
      search,
      sortBy,
      sortOrder
    });

    return success(res, result, 'Liste des candidats récupérée');
  } catch (err) {
    console.error('Erreur getCandidats:', err);
    return error(res, err.message || 'Erreur lors de la récupération des candidats', 500);
  }
};

/**
 * GET /api/admin/candidats/stats
 * Récupérer les statistiques des candidats
 */
const getCandidatsStats = async (req, res) => {
  try {
    const stats = await adminCandidatService.getCandidatsStats();
    return success(res, stats, 'Statistiques récupérées');
  } catch (err) {
    console.error('Erreur getCandidatsStats:', err);
    return error(res, err.message || 'Erreur lors de la récupération des statistiques', 500);
  }
};

/**
 * GET /api/admin/candidats/:id
 * Récupérer un candidat par ID avec ses détails
 */
const getCandidatById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('========================================');
    console.log('getCandidatById appelé');
    console.log('ID reçu:', id, '| Type:', typeof id);
    console.log('========================================');

    const candidat = await adminCandidatService.getCandidatById(parseInt(id, 10));

    console.log('Candidat récupéré avec succès:', candidat.idcandidats);
    return success(res, candidat, 'Candidat récupéré');
  } catch (err) {
    console.error('========================================');
    console.error('ERREUR getCandidatById');
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    console.error('========================================');
    const statusCode = err.message === 'Candidat non trouvé' ? 404 : 500;
    return error(res, err.message || 'Erreur lors de la récupération du candidat', statusCode);
  }
};

/**
 * PUT /api/admin/candidats/:id
 * Mettre à jour un candidat
 */
const updateCandidat = async (req, res) => {
  try {
    const { id } = req.params;
    const candidat = await adminCandidatService.updateCandidat(id, req.body);
    return success(res, candidat, 'Candidat mis à jour avec succès');
  } catch (err) {
    console.error('Erreur updateCandidat:', err);
    const statusCode = err.message === 'Candidat non trouvé' ? 404 :
                       err.message.includes('email') ? 400 : 500;
    return error(res, err.message || 'Erreur lors de la mise à jour du candidat', statusCode);
  }
};

/**
 * DELETE /api/admin/candidats/:id
 * Supprimer un candidat (soft delete)
 */
const deleteCandidat = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminCandidatService.deleteCandidat(id);
    return success(res, result, 'Candidat supprimé avec succès');
  } catch (err) {
    console.error('Erreur deleteCandidat:', err);
    const statusCode = err.message === 'Candidat non trouvé' ? 404 : 500;
    return error(res, err.message || 'Erreur lors de la suppression du candidat', statusCode);
  }
};

/**
 * GET /api/admin/candidats/export
 * Exporter les candidats en CSV
 */
const exportCandidats = async (req, res) => {
  try {
    const { Candidat, User } = require('../models');

    const candidats = await Candidat.findAll({
      where: { del: 0 },
      include: [{
        model: User,
        as: 'user',
        attributes: ['username'],
        where: { del: 0 },
        required: false,
      }],
      attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone', 'nip', 'ifu', 'createdDate'],
      order: [['createdDate', 'DESC']],
    });

    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';

    const headers = ['N°', 'Nom', 'Prénom', 'Email', 'Téléphone', 'NIP', 'IFU', 'Date inscription'];

    const rows = candidats.map((c, i) => [
      i + 1,
      c.nom         || '',
      c.prenom      || '',
      c.email       || '',
      c.telephone   || '',
      c.nip         || '',
      c.ifu         || '',
      fmt(c.createdDate),
    ]);

    const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const sep = ';';
    const lines = [
      headers.map(csvEscape).join(sep),
      ...rows.map(r => r.map(csvEscape).join(sep)),
    ];
    const csv = '\uFEFF' + lines.join('\r\n');

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="candidats_${today}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('Erreur exportCandidats:', err);
    return require('../utils/response.util').error(res, err.message || 'Erreur export CSV', 500);
  }
};

/**
 * PUT /api/admin/candidats/:id/reset-password
 * Réinitialiser le mot de passe d'un candidat
 */
const resetCandidatPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim().length < 8) {
      return error(res, 'Le mot de passe doit contenir au moins 8 caractères', 400);
    }

    const result = await adminCandidatService.resetCandidatPassword(id, newPassword.trim());
    return success(res, result, 'Mot de passe réinitialisé avec succès');
  } catch (err) {
    console.error('Erreur resetCandidatPassword:', err);
    const statusCode = err.message === 'Candidat non trouvé' ? 404 : 500;
    return error(res, err.message || 'Erreur lors de la réinitialisation du mot de passe', statusCode);
  }
};

module.exports = {
  createCandidat,
  getCandidats,
  getCandidatsStats,
  getCandidatById,
  updateCandidat,
  deleteCandidat,
  exportCandidats,
  resetCandidatPassword,
};
