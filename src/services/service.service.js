// src/services/service.service.js - Service de gestion des services de l'entreprise
const { Service, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Récupérer tous les services avec pagination et filtres
 */
const getAllServices = async (filters = {}) => {
  const { search, page = 1, limit = 10 } = filters;

  const where = { del: 0 };

  if (search) {
    where[Op.or] = [
      { accronyme: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ];
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await Service.findAndCountAll({
    where,
    order: [['createdDate', 'DESC']],
    limit: parseInt(limit),
    offset,
  });

  return {
    items: rows,
    total: count,
    page: parseInt(page),
    totalPages: Math.ceil(count / limit) || 1,
    limit: parseInt(limit),
  };
};

/**
 * Récupérer un service par ID
 */
const getServiceById = async (id) => {
  const service = await Service.findOne({
    where: { idservice: id, del: 0 },
  });

  if (!service) {
    throw new Error('Service non trouvé');
  }

  return service;
};

/**
 * Créer un nouveau service
 */
const createService = async (data, createdBy) => {
  const { accronyme, description } = data;

  if (!accronyme || !accronyme.trim()) {
    throw new Error('L\'acronyme est requis');
  }
  if (!description || !description.trim()) {
    throw new Error('La description est requise');
  }

  // Vérifier unicité de l'acronyme
  const existing = await Service.findOne({
    where: { accronyme: accronyme.trim().toUpperCase(), del: 0 },
  });
  if (existing) {
    throw new Error('Un service avec cet acronyme existe déjà');
  }

  const service = await Service.create({
    accronyme: accronyme.trim().toUpperCase(),
    description: description.trim(),
    createdBy,
    createdDate: new Date(),
  });

  return service;
};

/**
 * Mettre à jour un service
 */
const updateService = async (id, data, modifiedBy) => {
  const { accronyme, description } = data;

  const service = await Service.findOne({ where: { idservice: id, del: 0 } });
  if (!service) {
    throw new Error('Service non trouvé');
  }

  // Vérifier unicité si acronyme modifié
  if (accronyme && accronyme.trim().toUpperCase() !== service.accronyme) {
    const existing = await Service.findOne({
      where: {
        accronyme: accronyme.trim().toUpperCase(),
        del: 0,
        idservice: { [Op.ne]: id },
      },
    });
    if (existing) {
      throw new Error('Un service avec cet acronyme existe déjà');
    }
  }

  await service.update({
    accronyme: accronyme ? accronyme.trim().toUpperCase() : service.accronyme,
    description: description ? description.trim() : service.description,
    lastmodifiedBy: modifiedBy,
    lastmodifiedDate: new Date(),
  });

  return service;
};

/**
 * Supprimer un service (soft delete)
 */
const deleteService = async (id, deletedBy) => {
  const service = await Service.findOne({ where: { idservice: id, del: 0 } });
  if (!service) {
    throw new Error('Service non trouvé');
  }

  await service.update({
    del: 1,
    deletedBy,
    deletedDate: new Date(),
  });

  return { message: 'Service supprimé avec succès' };
};

/**
 * Statistiques des services
 */
const getServiceStats = async () => {
  const total = await Service.count({ where: { del: 0 } });
  return { total };
};

module.exports = {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getServiceStats,
};
