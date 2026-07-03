// src/routes/index.js
const express = require('express');
const router = express.Router();

// Importer les routes
const authRoutes = require('./auth.routes');
const stageRoutes = require('./stage.routes');
const offreRoutes = require('./offre.routes');
const aideRoutes = require('./aide.routes');
const demandeAudienceRoutes = require('./demandeAudience.routes');
const candidatRoutes = require('./candidat.routes');
const userRoutes = require('./user.routes');
const dashboardRoutes = require('./dashboard.routes');
const adminCandidatRoutes = require('./admin-candidat.routes');
const adminDashboardRoutes = require('./admin-dashboard.routes');
const serviceRoutes = require('./service.routes');
const directionRoutes = require('./direction.routes');
const permissionRoutes = require('./permission.routes');
const settingsRoutes = require('./settings.routes');
const auditRoutes = require('./audit.routes');
const notificationRoutes = require('./notification.routes');
const securityRoutes = require('./security.routes');
const agentDashboardRoutes = require('./agentDashboard.routes');

// Utiliser les routes
router.use('/auth', authRoutes);
router.use('/stages', stageRoutes);
router.use('/offres', offreRoutes);
router.use('/aides', aideRoutes);
router.use('/demandes-audience', demandeAudienceRoutes);
router.use('/candidat', candidatRoutes);
router.use('/users', userRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin/candidats', adminCandidatRoutes);
router.use('/admin/dashboard', adminDashboardRoutes);
router.use('/admin/services', serviceRoutes);
router.use('/admin/directions', directionRoutes);
router.use('/permissions', permissionRoutes);
router.use('/admin/settings', settingsRoutes);
router.use('/admin/audit', auditRoutes);
router.use('/admin/security', securityRoutes);
router.use('/notifications', notificationRoutes);
router.use('/agent-dashboard', agentDashboardRoutes);

// Route de test
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API PARES fonctionne correctement',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;