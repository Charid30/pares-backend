// src/controllers/admin-db-explorer.controller.js
const { sequelize } = require('../models');
const auditService = require('../services/audit.service');

const MAX_ROWS = 300;
const IS_SELECT = /^\s*SELECT\b/i;
// Lecture seule (audit 2026-11-04) : avant, UPDATE / DELETE / DROP passaient aussi. Les corrections de données
// passent par des migrations (CLAUDE.md), jamais par cet écran.
const LECTURE = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;
const INTERDIT = /\b(INTO\s+(OUT|DUMP)FILE|LOAD_FILE|SLEEP|BENCHMARK|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE|GET_LOCK)\b/i;
const SECRET = /\b(password|token|secret|key_hash|p256dh|auth_key)\b/i;

/** Message d'erreur si la requête n'est pas une lecture simple, sinon null. */
const refuserRequete = (requete) => {
  if (!LECTURE.test(requete)) return 'Seules les requêtes de lecture sont autorisées (SELECT, SHOW, DESCRIBE, EXPLAIN).';
  if (/\/\*|--|#/.test(requete)) return 'Les commentaires SQL ne sont pas autorisés.';
  if (requete.includes(';')) return 'Une seule requête à la fois, sans point-virgule.';
  if (INTERDIT.test(requete)) return 'Cette fonction SQL n\'est pas autorisée.';
  if (SECRET.test(requete)) return 'Les colonnes secrètes (mots de passe, jetons, clés) ne sont pas consultables.';
  return null;
};

/** Masque les colonnes secrètes d'un SELECT * (mots de passe, jetons…). */
const masquerSecrets = (rows) => rows.map((row) => {
  const copie = { ...row };
  for (const cle of Object.keys(copie)) if (/password|token|secret|key_hash|p256dh|auth_key/i.test(cle)) copie[cle] = '••••••';
  return copie;
});

const executeQuery = async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ success: false, message: 'Requête SQL requise' });
  }

  const clean = query.trim().replace(/;\s*$/, '');
  const refus = refuserRequete(clean);
  if (refus) return res.status(400).json({ success: false, message: refus });

  // Ajouter LIMIT si SELECT sans LIMIT
  let finalQuery = clean;
  if (IS_SELECT.test(clean) && !/\bLIMIT\s+\d+/i.test(clean)) {
    finalQuery = `${clean} LIMIT ${MAX_ROWS}`;
  }

  try {
    const [results, metadata] = await sequelize.query(finalQuery, { raw: true });

    await auditService.log({
      agentId: req.user?.agentId ?? null,
      agentNom: req.user?.username ?? 'admin',
      action: 'DB_EXPLORER_QUERY',
      module: 'ADMIN',
      entityId: null,
      details: { query: clean.substring(0, 500) },
      ip: req.ip,
    });

    const rows = masquerSecrets(Array.isArray(results) ? results : []);
    const affectedRows = metadata?.affectedRows ?? null;

    return res.json({
      success: true,
      data: {
        rows,
        rowCount: rows.length,
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        truncated: IS_SELECT.test(clean) && rows.length === MAX_ROWS,
        affectedRows,
        query: finalQuery,
      },
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

const getTables = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SHOW TABLES', { raw: true });
    const tables = rows.map((r) => Object.values(r)[0]);
    return res.json({ success: true, data: tables });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { executeQuery, getTables, refuserRequete, masquerSecrets };
