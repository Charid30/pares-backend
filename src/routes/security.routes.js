// src/routes/security.routes.js
const express = require('express');
const router = express.Router();
const { getBannedIps, getStats, unbanIp, banPermanently, deleteIp, getLogsForIp, findUserByIp, banManually } = require('../controllers/security.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/banned',        getBannedIps);
router.get('/stats',         getStats);
router.put('/banned/:id/unban', unbanIp);
router.put('/banned/:id/ban-permanent', banPermanently);
router.delete('/banned/:id', deleteIp);
router.post('/ban-manual',   banManually);
router.get('/logs/:ip',      getLogsForIp);
router.get('/user-by-ip/:ip', findUserByIp);

module.exports = router;
