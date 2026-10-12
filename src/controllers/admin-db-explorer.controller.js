// src/controllers/admin-db-explorer.controller.js
const { sequelize } = require('../models');
const auditService = require('../services/audit.service');

const MAX_ROWS = 300;
const IS_SELECT = /^\s*SELECT\b/i;

const executeQuery = async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ success: false, message: 'Requête SQL requise' });
  }

  const clean = query.trim();

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

    const rows = Array.isArray(results) ? results : [];
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

module.exports = { executeQuery, getTables };
