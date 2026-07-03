// src/routes/permission.routes.js
const express = require('express');
const router = express.Router();
const c = require('../controllers/permission.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate, authorize(['ADMIN']));

// Rôles
router.get('/roles', c.getAllRoles);
router.post('/roles', c.createRole);
router.get('/roles/:roleId', c.getRoleById);
router.put('/roles/:roleId', c.updateRole);
router.delete('/roles/:roleId', c.deleteRole);

// Permissions d'un rôle
router.get('/roles/:roleId/permissions', c.getPermissionsByRole);
router.put('/roles/:roleId/permissions', c.updateRolePermissions);
router.post('/roles/:roleId/permissions', c.addPermission);

// Métadonnées (modules & actions dispo)
router.get('/meta', c.getModulesActions);

// Permission individuelle
router.delete('/:permissionId', c.removePermission);

module.exports = router;
