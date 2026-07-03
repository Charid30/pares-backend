// src/routes/notification.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth.middleware');
const notifCtrl = require('../controllers/notification.controller');

// Toutes les routes requièrent d'être authentifié
// Elles fonctionnent pour AGENTS et CANDIDATS (le contrôleur détecte le type)
router.get('/unread-count', authenticate, notifCtrl.getUnreadCount);
router.get('/',             authenticate, notifCtrl.getNotifications);
router.put('/read-all',     authenticate, notifCtrl.markAllRead);
router.put('/:id/read',     authenticate, notifCtrl.markRead);

module.exports = router;
