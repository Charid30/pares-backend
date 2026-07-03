// src/routes/security.routes.js
const express = require('express');
const router = express.Router();
const { getBannedIps, getStats, unbanIp, deleteIp } = require('../controllers/security.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/banned',        getBannedIps);
router.get('/stats',         getStats);
router.put('/banned/:id/unban', unbanIp);
router.delete('/banned/:id', deleteIp);

module.exports = router;
