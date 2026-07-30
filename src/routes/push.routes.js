// src/routes/push.routes.js
const express = require('express');
const router = express.Router();
const pushController = require('../controllers/push.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Clé publique VAPID — accessible sans authentification (nécessaire avant connexion
// pour certains flux, et de toute façon publique par nature)
router.get('/vapid-public-key', pushController.getVapidPublicKey);

router.post('/subscribe', authenticate, pushController.subscribe);
router.post('/unsubscribe', authenticate, pushController.unsubscribe);

module.exports = router;
