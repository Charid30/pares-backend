// src/controllers/service.controller.js - Contrôleur de gestion des services
const serviceService = require('../services/service.service');
const { success } = require('../utils/response.util');

const getServices = async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const data = await serviceService.getAllServices({
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
    });
    return success(res, data, 'Services récupérés avec succès');
  } catch (err) {
    next(err);
  }
};

const getServiceById = async (req, res, next) => {
  try {
    const service = await serviceService.getServiceById(parseInt(req.params.id));
    return success(res, service, 'Service récupéré avec succès');
  } catch (err) {
    next(err);
  }
};

const createService = async (req, res, next) => {
  try {
    const createdBy = req.user?.username || 'admin';
    const service = await serviceService.createService(req.body, createdBy);
    return success(res, service, 'Service créé avec succès', 201);
  } catch (err) {
    next(err);
  }
};

const updateService = async (req, res, next) => {
  try {
    const modifiedBy = req.user?.username || 'admin';
    const service = await serviceService.updateService(parseInt(req.params.id), req.body, modifiedBy);
    return success(res, service, 'Service mis à jour avec succès');
  } catch (err) {
    next(err);
  }
};

const deleteService = async (req, res, next) => {
  try {
    const deletedBy = req.user?.username || 'admin';
    const result = await serviceService.deleteService(parseInt(req.params.id), deletedBy);
    return success(res, null, result.message);
  } catch (err) {
    next(err);
  }
};

const getStats = async (req, res, next) => {
  try {
    const stats = await serviceService.getServiceStats();
    return success(res, stats, 'Statistiques récupérées avec succès');
  } catch (err) {
    next(err);
  }
};

module.exports = { getServices, getServiceById, createService, updateService, deleteService, getStats };
