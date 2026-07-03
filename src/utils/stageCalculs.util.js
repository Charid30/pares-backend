// src/utils/stageCalculs.util.js
// Fonctions de calcul pures liées aux stages — aucune dépendance DB, pour rester
// facilement testables (voir __tests__/stageCalculs.test.js).

/**
 * Calcule la date de fin d'un stage.
 * Règle : dateDebut + N mois - 1 jour = dernier jour inclus.
 * Exemple : 01/03/2026 + 1 mois = 31/03/2026 (et non 01/04/2026)
 * @param {string|Date} dateDebut
 * @param {number} dureeEnMois
 * @returns {string} Date au format YYYY-MM-DD
 */
const calculerDateFin = (dateDebut, dureeEnMois) => {
  const debut = new Date(dateDebut);
  const dateFin = new Date(debut);
  dateFin.setMonth(dateFin.getMonth() + dureeEnMois);
  dateFin.setDate(dateFin.getDate() - 1); // Dernier jour inclus
  return dateFin.toISOString().split('T')[0];
};

/**
 * Détermine si l'agent connecté peut agir (approuver/rejeter/...) sur un stage
 * d'une direction donnée, pour l'écran de liste "Vue globale" / "Stage [DIRECTION]".
 * @param {number|null} directionId - direction_iddirection du stage
 * @param {{ agentContext: object|null, agentDirectionIds: number[] }} params
 * @returns {boolean}
 */
const calculerPeutAgir = (directionId, { agentContext, agentDirectionIds = [] }) => {
  if (!agentContext) return true;
  if (agentContext.isActionSystemRole) return true;
  if (agentContext.ignoreOwnDirection) return false;
  return agentDirectionIds.includes(directionId);
};

/**
 * Calcule la durée totale d'une chaîne de stages (jours/mois) et la date minimale
 * à partir de laquelle le candidat peut soumettre une nouvelle demande (règle des
 * 6 mois continus + 1 mois de repos obligatoire).
 * @param {string|Date} dateDebutChaine - date de début effective du stage racine
 * @param {string|Date|null} dateFinEffectiveDernierStage - date de fin du dernier stage de la chaîne (null si en cours)
 * @param {Date} [now] - date de référence pour un stage en cours (injectable pour les tests)
 */
const calculerDureeEtRepos = (dateDebutChaine, dateFinEffectiveDernierStage, now = new Date()) => {
  const dateFinChaine = dateFinEffectiveDernierStage ? new Date(dateFinEffectiveDernierStage) : null;
  const debut = new Date(dateDebutChaine);
  const fin = dateFinChaine || now; // Si pas encore terminé, jusqu'à aujourd'hui

  const dureeTotaleJours = Math.ceil((fin - debut) / (1000 * 60 * 60 * 24));
  const dureeTotaleMois = dureeTotaleJours / 30.44; // Approximation

  // Date min pour une nouvelle demande après 6 mois = fin de la chaîne + 1 mois
  let dateMinRepos = null;
  if (dateFinChaine) {
    const minDate = new Date(dateFinChaine);
    minDate.setMonth(minDate.getMonth() + 1);
    minDate.setDate(minDate.getDate() + 1); // Lendemain du mois de repos
    dateMinRepos = minDate.toISOString().split('T')[0];
  }

  return {
    dureeTotaleJours,
    dureeTotaleMois: Math.round(dureeTotaleMois * 10) / 10,
    dateDebutChaine: debut.toISOString().split('T')[0],
    dateFinChaine: dateFinChaine ? dateFinChaine.toISOString().split('T')[0] : null,
    dateMinRepos,
  };
};

module.exports = { calculerDateFin, calculerPeutAgir, calculerDureeEtRepos };
