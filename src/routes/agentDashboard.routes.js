// src/routes/agentDashboard.routes.js
const express = require('express');
const router = express.Router();
const { getStats } = require('../controllers/agentDashboard.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Accessible à tout utilisateur authentifié (agents système + agents rôle personnalisé)
router.get('/stats', authenticate, getStats);

module.exports = router;
