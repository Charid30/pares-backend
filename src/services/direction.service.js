// src/services/direction.service.js
const { Direction, Service, DirectionService } = require('../models');
const { Op } = require('sequelize');

const SERVICES_INCLUDE = {
  model: Service,
  as: 'services',
  attributes: ['idservice', 'accronyme', 'description'],
  where: { del: 0 },
  required: false,
  through: { attributes: [] },
};

const getAllDirections = async (filters = {}) => {
  const { search, page = 1, limit = 10 } = filters;

  const where = { del: 0 };
  if (search) {
    where[Op.or] = [
      { accronyme: { [Op.like]: `%${search}%` } },
      { nom:       { [Op.like]: `%${search}%` } },
    ];
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await Direction.findAndCountAll({
    where,
    include: [SERVICES_INCLUDE],
    order:   [['nom', 'ASC']],
    limit:   parseInt(limit),
    offset,
    distinct: true,
  });

  return {
    items:      rows,
    total:      count,
    page:       parseInt(page),
    totalPages: Math.ceil(count / limit) || 1,
    limit:      parseInt(limit),
  };
};

const getDirectionById = async (id) => {
  const direction = await Direction.findOne({
    where:   { iddirection: id, del: 0 },
    include: [SERVICES_INCLUDE],
  });
  if (!direction) throw new Error('Direction non trouvée');
  return direction;
};

const createDirection = async (data, createdBy) => {
  const { nom, accronyme, serviceIds = [] } = data;

  if (!nom?.trim())       throw new Error('Le nom est requis');
  if (!accronyme?.trim()) throw new Error('L\'acronyme est requis');

  const existing = await Direction.findOne({
    where: { accronyme: accronyme.trim().toUpperCase(), del: 0 },
  });
  if (existing) throw new Error('Une direction avec cet acronyme existe déjà');

  const direction = await Direction.create({
    nom:         nom.trim(),
    accronyme:   accronyme.trim().toUpperCase(),
    createdBy,
    createdDate: new Date(),
  });

  if (serviceIds.length > 0) {
    await DirectionService.bulkCreate(
      serviceIds.map(sid => ({
        direction_iddirection: direction.iddirection,
        service_idservice:     parseInt(sid),
      })),
      { ignoreDuplicates: true },
    );
  }

  return getDirectionById(direction.iddirection);
};

const updateDirection = async (id, data, modifiedBy) => {
  const { nom, accronyme, serviceIds } = data;

  const direction = await Direction.findOne({ where: { iddirection: id, del: 0 } });
  if (!direction) throw new Error('Direction non trouvée');

  if (accronyme && accronyme.trim().toUpperCase() !== direction.accronyme) {
    const existing = await Direction.findOne({
      where: {
        accronyme:    accronyme.trim().toUpperCase(),
        del:          0,
        iddirection:  { [Op.ne]: id },
      },
    });
    if (existing) throw new Error('Une direction avec cet acronyme existe déjà');
  }

  await direction.update({
    nom:              nom?.trim()                          ?? direction.nom,
    accronyme:        accronyme ? accronyme.trim().toUpperCase() : direction.accronyme,
    lastModifiedBy:   modifiedBy,
    lastModifiedDate: new Date(),
  });

  // Re-synchroniser les services si le tableau est fourni
  if (Array.isArray(serviceIds)) {
    await DirectionService.destroy({ where: { direction_iddirection: id } });
    if (serviceIds.length > 0) {
      await DirectionService.bulkCreate(
        serviceIds.map(sid => ({
          direction_iddirection: id,
          service_idservice:     parseInt(sid),
        })),
        { ignoreDuplicates: true },
      );
    }
  }

  return getDirectionById(id);
};

const deleteDirection = async (id, deletedBy) => {
  const direction = await Direction.findOne({ where: { iddirection: id, del: 0 } });
  if (!direction) throw new Error('Direction non trouvée');

  await direction.update({ del: 1, deletedBy, deletedDate: new Date() });
  return { message: 'Direction supprimée avec succès' };
};

const getDirectionStats = async () => {
  const total = await Direction.count({ where: { del: 0 } });
  return { total };
};

module.exports = {
  getAllDirections,
  getDirectionById,
  createDirection,
  updateDirection,
  deleteDirection,
  getDirectionStats,
};
