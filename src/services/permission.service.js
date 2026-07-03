// src/services/permission.service.js - Service de gestion des permissions et rôles
const { Permission, Role, User } = require('../models');

// Rôles système non modifiables
const SYSTEM_ROLES = ['ADMIN', 'CANDIDAT'];

// Modules et actions — valeurs exactes telles qu'elles existent en base de données
const MODULES = [
  { key: 'CANDIDATURES',     label: 'Candidatures Reçues' },
  { key: 'CANDIDATS',        label: 'Candidats' },
  { key: 'STAGE',            label: 'Stages' },
  { key: 'SUIVI_STAGE',      label: 'Suivi des Stages' },
  { key: 'SUSPENSION_STAGE', label: 'Suspensions / Annulations' },
  { key: 'OFFRE',            label: 'Offres Commerciales' },
  { key: 'AIDE',             label: 'Aides Sociales' },
  { key: 'DEMANDE_AUDIENCE', label: 'Demandes d\'Audience' },
  { key: 'AGENTS',           label: 'Agents' },
  { key: 'SERVICES',         label: 'Services' },
];

const ACTIONS = [
  { key: 'CONSULTER',   label: 'Consulter' },
  { key: 'CREER',       label: 'Créer' },
  { key: 'MODIFIER',    label: 'Modifier' },
  { key: 'APPROUVER',   label: 'Approuver' },
  { key: 'VALIDER',     label: 'Valider' },
  { key: 'REJETER',     label: 'Rejeter' },
  { key: 'TRANSFERER',  label: 'Transférer' },
  { key: 'SUPPRIMER',   label: 'Supprimer' },
];

// =====================================================
// RÔLES
// =====================================================

/**
 * Récupérer tous les rôles (hors rôles système) avec leurs permissions
 */
const getAllRoles = async () => {
  return await Role.findAll({
    where: { del: 0 },
    attributes: ['idrole', 'accronyme', 'description', 'lectureGlobale'],
    include: [
      {
        model: Permission,
        as: 'permissions',
        where: { del: 0 },
        required: false,
        attributes: ['idpermission', 'module', 'action'],
      },
    ],
    order: [['idrole', 'ASC']],
  });
};

/**
 * Créer un nouveau rôle
 */
const createRole = async (accronyme, description, lectureGlobale = false) => {
  const acc = accronyme.trim().toUpperCase();

  if (SYSTEM_ROLES.includes(acc)) {
    throw new Error('Cet acronyme est réservé à un rôle système');
  }

  const existing = await Role.findOne({ where: { accronyme: acc, del: 0 } });
  if (existing) throw new Error('Un rôle avec cet acronyme existe déjà');

  const role = await Role.create({
    accronyme: acc,
    description: description.trim(),
    lectureGlobale: !!lectureGlobale,
    del: 0,
  });
  return await getRoleById(role.idrole);
};

/**
 * Récupérer un rôle par ID avec ses permissions
 */
const getRoleById = async (roleId) => {
  const role = await Role.findOne({
    where: { idrole: roleId, del: 0 },
    attributes: ['idrole', 'accronyme', 'description', 'lectureGlobale'],
    include: [
      {
        model: Permission,
        as: 'permissions',
        where: { del: 0 },
        required: false,
        attributes: ['idpermission', 'module', 'action'],
      },
    ],
  });
  if (!role) throw new Error('Rôle non trouvé');
  return role;
};

/**
 * Modifier un rôle existant
 */
const updateRole = async (roleId, accronyme, description, lectureGlobale) => {
  const role = await Role.findOne({ where: { idrole: roleId, del: 0 } });
  if (!role) throw new Error('Rôle non trouvé');

  if (SYSTEM_ROLES.includes(role.accronyme)) {
    throw new Error('Les rôles système ne peuvent pas être modifiés');
  }

  const acc = accronyme ? accronyme.trim().toUpperCase() : role.accronyme;

  if (SYSTEM_ROLES.includes(acc)) {
    throw new Error('Cet acronyme est réservé à un rôle système');
  }

  // Vérifier unicité si l'acronyme change
  if (acc !== role.accronyme) {
    const conflict = await Role.findOne({ where: { accronyme: acc, del: 0 } });
    if (conflict) throw new Error('Un rôle avec cet acronyme existe déjà');
  }

  const nextLectureGlobale = lectureGlobale === undefined ? role.lectureGlobale : !!lectureGlobale;

  await role.update({
    accronyme: acc,
    description: description ? description.trim() : role.description,
    lectureGlobale: nextLectureGlobale,
  });

  return await getRoleById(roleId);
};

/**
 * Supprimer un rôle (soft delete) — uniquement si aucun utilisateur actif ne l'utilise
 */
const deleteRole = async (roleId) => {
  const role = await Role.findOne({ where: { idrole: roleId, del: 0 } });
  if (!role) throw new Error('Rôle non trouvé');

  if (SYSTEM_ROLES.includes(role.accronyme)) {
    throw new Error('Les rôles système ne peuvent pas être supprimés');
  }

  const usersWithRole = await User.count({ where: { role_idrole: roleId, del: 0 } });
  if (usersWithRole > 0) {
    throw new Error(`Impossible de supprimer : ${usersWithRole} utilisateur(s) ont ce rôle`);
  }

  // Soft delete des permissions liées
  await Permission.update({ del: 1 }, { where: { role_idrole: roleId, del: 0 } });
  await role.update({ del: 1 });

  return { message: 'Rôle supprimé avec succès' };
};

// =====================================================
// PERMISSIONS
// =====================================================

/**
 * Récupérer la liste des modules et actions disponibles
 */
const getModulesActions = async () => {
  return { modules: MODULES, actions: ACTIONS };
};

/**
 * Récupérer toutes les permissions groupées par rôle
 */
const getAllPermissions = async () => {
  return await getAllRoles();
};

/**
 * Récupérer les permissions d'un rôle
 */
const getPermissionsByRole = async (roleId) => {
  return await getRoleById(roleId);
};

/**
 * Mettre à jour les permissions d'un rôle (remplacement complet)
 */
const updateRolePermissions = async (roleId, permissions) => {
  const role = await Role.findOne({ where: { idrole: roleId, del: 0 } });
  if (!role) throw new Error('Rôle non trouvé');

  const validModules = MODULES.map((m) => m.key);
  const validActions = ACTIONS.map((a) => a.key);

  for (const perm of permissions) {
    if (!validModules.includes(perm.module)) throw new Error(`Module invalide : ${perm.module}`);
    if (!validActions.includes(perm.action)) throw new Error(`Action invalide : ${perm.action}`);
  }

  await Permission.update({ del: 1 }, { where: { role_idrole: roleId, del: 0 } });

  const unique = [];
  const seen = new Set();
  for (const perm of permissions) {
    const key = `${perm.module}:${perm.action}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ role_idrole: roleId, module: perm.module, action: perm.action, del: 0 });
    }
  }

  if (unique.length > 0) {
    await Permission.bulkCreate(unique);
  }

  return await getRoleById(roleId);
};

/**
 * Ajouter une permission à un rôle
 */
const addPermission = async (roleId, module, action) => {
  const role = await Role.findOne({ where: { idrole: roleId, del: 0 } });
  if (!role) throw new Error('Rôle non trouvé');

  const validModules = MODULES.map((m) => m.key);
  const validActions = ACTIONS.map((a) => a.key);

  if (!validModules.includes(module)) throw new Error(`Module invalide : ${module}`);
  if (!validActions.includes(action)) throw new Error(`Action invalide : ${action}`);

  const existing = await Permission.findOne({ where: { role_idrole: roleId, module, action, del: 0 } });
  if (existing) throw new Error('Cette permission existe déjà');

  return await Permission.create({ role_idrole: roleId, module, action, del: 0 });
};

/**
 * Supprimer une permission (soft delete)
 */
const removePermission = async (permissionId) => {
  const permission = await Permission.findOne({ where: { idpermission: permissionId, del: 0 } });
  if (!permission) throw new Error('Permission non trouvée');
  await permission.update({ del: 1 });
  return { message: 'Permission supprimée avec succès' };
};

module.exports = {
  // Rôles
  getAllRoles,
  createRole,
  getRoleById,
  updateRole,
  deleteRole,
  // Permissions
  getModulesActions,
  getAllPermissions,
  getPermissionsByRole,
  updateRolePermissions,
  addPermission,
  removePermission,
};
