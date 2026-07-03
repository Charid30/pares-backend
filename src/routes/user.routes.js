// src/routes/user.routes.js - Routes de gestion des utilisateurs et agents
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, authorize, authorizeModule, authorizeAction } = require('../middlewares/auth.middleware');

// Routes publiques (références)
router.get('/roles', authenticate, userController.getRoles);
router.get('/services', authenticate, userController.getServices);
router.get('/directions', authenticate, userController.getDirections);

// Routes agents
// IMPORTANT: les routes fixes (/stats, /me/notifications) DOIVENT être avant /:id
router.get('/agents/stats',            authenticate, authorizeModule('AGENTS'), userController.getStats);
router.get('/agents/me/notifications',   authenticate, userController.getMyNotifications);
router.put('/agents/me/notifications',   authenticate, userController.updateMyNotifications);
router.get('/agents/me/recent-events',   authenticate, userController.getRecentEvents);
router.get('/agents',                  authenticate, authorizeModule('AGENTS'), userController.getAgents);
router.get('/agents/:id',              authenticate, authorizeModule('AGENTS'), userController.getAgentById);
router.post('/agents',                 authenticate, authorizeAction('AGENTS', 'CREER'),     userController.createAgent);
router.put('/agents/:id',              authenticate, authorizeAction('AGENTS', 'MODIFIER'),  userController.updateAgent);
router.delete('/agents/:id',           authenticate, authorizeAction('AGENTS', 'SUPPRIMER'), userController.deleteAgent);
router.post('/agents/:id/change-password', authenticate, authorizeAction('AGENTS', 'MODIFIER'), userController.changePassword);

module.exports = router;
