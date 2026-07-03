// src/controllers/direction.controller.js
const directionService = require('../services/direction.service');

const getAllDirections = async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const result = await directionService.getAllDirections({ search, page, limit });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('getAllDirections error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getDirectionById = async (req, res) => {
  try {
    const direction = await directionService.getDirectionById(req.params.id);
    return res.json({ success: true, data: direction });
  } catch (err) {
    const status = err.message === 'Direction non trouvée' ? 404 : 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

const createDirection = async (req, res) => {
  try {
    const direction = await directionService.createDirection(req.body, req.user?.idutilisateur);
    return res.status(201).json({ success: true, data: direction, message: 'Direction créée avec succès' });
  } catch (err) {
    const status = err.message.includes('existe déjà') ? 409 : 400;
    return res.status(status).json({ success: false, message: err.message });
  }
};

const updateDirection = async (req, res) => {
  try {
    const direction = await directionService.updateDirection(
      req.params.id,
      req.body,
      req.user?.idutilisateur,
    );
    return res.json({ success: true, data: direction, message: 'Direction mise à jour avec succès' });
  } catch (err) {
    const status = err.message === 'Direction non trouvée' ? 404
      : err.message.includes('existe déjà') ? 409 : 400;
    return res.status(status).json({ success: false, message: err.message });
  }
};

const deleteDirection = async (req, res) => {
  try {
    const result = await directionService.deleteDirection(req.params.id, req.user?.idutilisateur);
    return res.json({ success: true, ...result });
  } catch (err) {
    const status = err.message === 'Direction non trouvée' ? 404 : 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllDirections,
  getDirectionById,
  createDirection,
  updateDirection,
  deleteDirection,
};
