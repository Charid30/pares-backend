// src/routes/direction.routes.js
const express = require('express');
const router = express.Router();
const directionController = require('../controllers/direction.controller');
const {
  authenticate,
  authorizeModule,
  authorizeAction,
} = require('../middlewares/auth.middleware');

/**
 * @route   GET /api/admin/directions
 * @desc    Lister toutes les directions (paginé + recherche)
 * @access  Agents ayant accès au module DIRECTIONS
 */
router.get(
  '/',
  authenticate,
  authorizeModule('DIRECTIONS'),
  directionController.getAllDirections,
);

/**
 * @route   GET /api/admin/directions/:id
 * @desc    Obtenir une direction par ID (avec ses services)
 * @access  Agents ayant accès au module DIRECTIONS
 */
router.get(
  '/:id',
  authenticate,
  authorizeModule('DIRECTIONS'),
  directionController.getDirectionById,
);

/**
 * @route   POST /api/admin/directions
 * @desc    Créer une direction
 * @access  Permission CREER sur DIRECTIONS
 */
router.post(
  '/',
  authenticate,
  authorizeAction('DIRECTIONS', 'CREER'),
  directionController.createDirection,
);

/**
 * @route   PUT /api/admin/directions/:id
 * @desc    Modifier une direction (nom, acronyme, services associés)
 * @access  Permission MODIFIER sur DIRECTIONS
 */
router.put(
  '/:id',
  authenticate,
  authorizeAction('DIRECTIONS', 'MODIFIER'),
  directionController.updateDirection,
);

/**
 * @route   DELETE /api/admin/directions/:id
 * @desc    Supprimer (soft-delete) une direction
 * @access  Permission SUPPRIMER sur DIRECTIONS
 */
router.delete(
  '/:id',
  authenticate,
  authorizeAction('DIRECTIONS', 'SUPPRIMER'),
  directionController.deleteDirection,
);

module.exports = router;
