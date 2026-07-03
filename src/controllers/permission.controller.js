// src/controllers/permission.controller.js - Contrôleur permissions et rôles
const permissionService = require('../services/permission.service');
const { success, error } = require('../utils/response.util');

// ────────────────────────────── Rôles ───────────────────────────────────────────────────

const getAllRoles = async (req, res, next) => {
  try {
    const data = await permissionService.getAllRoles();
    return success(res, data, 'Rôles récupérés avec succès');
  } catch (err) { next(err); }
};

const createRole = async (req, res, next) => {
  try {
    const { accronyme, description, lectureGlobale } = req.body;
    if (!accronyme || !description) return error(res, 'Acronyme et description sont requis', 400);
    const data = await permissionService.createRole(accronyme, description, lectureGlobale);
    return success(res, data, 'Rôle créé avec succès', 201);
  } catch (err) { next(err); }
};

const getRoleById = async (req, res, next) => {
  try {
    const data = await permissionService.getRoleById(parseInt(req.params.roleId));
    return success(res, data, 'Rôle récupéré avec succès');
  } catch (err) { next(err); }
};

const updateRole = async (req, res, next) => {
  try {
    const { accronyme, description, lectureGlobale } = req.body;
    const data = await permissionService.updateRole(parseInt(req.params.roleId), accronyme, description, lectureGlobale);
    return success(res, data, 'Rôle mis à jour avec succès');
  } catch (err) { next(err); }
};

const deleteRole = async (req, res, next) => {
  try {
    const result = await permissionService.deleteRole(parseInt(req.params.roleId));
    return success(res, null, result.message);
  } catch (err) { next(err); }
};

// ───────────── Permissions ────────────────────────────────────────────────────

const getModulesActions = async (req, res, next) => {
  try {
    const data = await permissionService.getModulesActions();
    return success(res, data, 'Modules et actions récupérés avec succès');
  } catch (err) { next(err); }
};

const getAllPermissions = async (req, res, next) => {
  try {
    const data = await permissionService.getAllPermissions();
    return success(res, data, 'Permissions récupérées avec succès');
  } catch (err) { next(err); }
};

const getPermissionsByRole = async (req, res, next) => {
  try {
    const data = await permissionService.getPermissionsByRole(parseInt(req.params.roleId));
    return success(res, data, 'Permissions du rôle récupérées avec succès');
  } catch (err) { next(err); }
};

const updateRolePermissions = async (req, res, next) => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) return error(res, 'permissions doit être un tableau', 400);
    const data = await permissionService.updateRolePermissions(parseInt(req.params.roleId), permissions);
    return success(res, data, 'Permissions mises à jour avec succès');
  } catch (err) { next(err); }
};

const addPermission = async (req, res, next) => {
  try {
    const { module, action } = req.body;
    if (!module || !action) return error(res, 'module et action sont requis', 400);
    const data = await permissionService.addPermission(parseInt(req.params.roleId), module, action);
    return success(res, data, 'Permission ajoutée avec succès', 201);
  } catch (err) { next(err); }
};

const removePermission = async (req, res, next) => {
  try {
    const result = await permissionService.removePermission(parseInt(req.params.permissionId));
    return success(res, null, result.message);
  } catch (err) { next(err); }
};

module.exports = {
  getAllRoles, createRole, getRoleById, updateRole, deleteRole,
  getModulesActions, getAllPermissions, getPermissionsByRole,
  updateRolePermissions, addPermission, removePermission,
};
