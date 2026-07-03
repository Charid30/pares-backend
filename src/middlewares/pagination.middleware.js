// src/middlewares/pagination.middleware.js
// Middleware de validation et sécurisation des paramètres de pagination

const ALLOWED_SORT_ORDERS = ['ASC', 'DESC'];

/**
 * Valide et assainit les paramètres de pagination
 * - page : min 1
 * - limit : min 1, max 100
 * - sortOrder : ASC ou DESC uniquement
 * - sortBy : doit être dans la liste des champs autorisés (si fournie)
 */
const paginationMiddleware = (allowedSortFields = []) => {
  return (req, res, next) => {
    let { page, limit, sortOrder, sortBy } = req.query;

    // Valider et limiter page
    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;
    req.query.page = page;

    // Valider et limiter limit (max 100)
    limit = parseInt(limit, 10);
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 100) limit = 100;
    req.query.limit = limit;

    // Valider sortOrder
    if (sortOrder && !ALLOWED_SORT_ORDERS.includes(sortOrder.toUpperCase())) {
      sortOrder = 'DESC';
    }
    req.query.sortOrder = sortOrder ? sortOrder.toUpperCase() : 'DESC';

    // Valider sortBy (si une liste est fournie)
    if (allowedSortFields.length > 0 && sortBy && !allowedSortFields.includes(sortBy)) {
      req.query.sortBy = allowedSortFields[0];
    }

    next();
  };
};

module.exports = paginationMiddleware;
