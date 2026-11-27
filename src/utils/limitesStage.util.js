// src/utils/limitesStage.util.js
// Limites de durée des stages d'un candidat (règle validée le 2026-11-27, remplace « 6 mois continus + 1 mois de repos ») :
//   1. 6 mois au plus PAR SERVICE, à vie : après 6 mois dans un service, ce service est fermé définitivement au candidat ;
//   2. 6 mois au plus PAR ANNÉE CIVILE, tous services confondus (un stage à cheval compte dans chaque année pour ses jours) ;
//   3. pause après la fin du dernier stage (aucun renouvellement) avant toute nouvelle demande :
//      3 mois si le candidat a atteint 6 mois dans le service de ce stage, sinon 2 mois.
// Seuls comptent les stages ACCEPTÉS (convention jointe) : accepté, en cours, suspendu, expiré, rapport soumis, terminé —
// renouvellements compris, selon leurs dates réelles. Fonctions pures (aucun accès à la base), testées dans
// __tests__/limitesStage.test.js ; le chargement des stages se fait dans candidat.service.js.

const { calculerDateFin } = require('./stageCalculs.util');

const MAX_MOIS_PAR_SERVICE = 6;
const MAX_MOIS_PAR_ANNEE = 6;
const PAUSE_APRES_6_MOIS = 3;
const PAUSE_SINON = 2;
const STATUTS_STAGE_ACCEPTE = ['ACCEPTE', 'EN_COURS', 'SUSPENDU', 'EXPIRE', 'RAPPORT_SOUMIS', 'TERMINE'];

const JOUR_MS = 24 * 60 * 60 * 1000;
const JOURS_PAR_MOIS = 30.44;

const versDate = (d) => { const x = new Date(d); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())); };
const iso = (d) => d.toISOString().split('T')[0];
/** Jours d'une période, bornes incluses. */
const joursEntre = (debut, fin) => Math.max(0, Math.round((versDate(fin) - versDate(debut)) / JOUR_MS) + 1);
/** Jours → mois, arrondis au demi-mois (un stage du 01/01 au 30/06 compte 6 mois, pas 5,95). */
const versMois = (jours) => Math.round((jours / JOURS_PAR_MOIS) * 2) / 2;
const formatMois = (m) => `${String(m).replace('.', ',')} mois`;
const dateFr = (d) => versDate(d).toLocaleDateString('fr-FR', { timeZone: 'UTC' });

/** Jours d'une période répartis par année civile : { 2026: 45, 2027: 136 } */
const joursParAnnee = (debut, fin) => {
  const res = {};
  const d = versDate(debut);
  const f = versDate(fin);
  for (let annee = d.getUTCFullYear(); annee <= f.getUTCFullYear(); annee++) {
    const debutAnnee = new Date(Date.UTC(annee, 0, 1));
    const finAnnee = new Date(Date.UTC(annee, 11, 31));
    res[annee] = joursEntre(d > debutAnnee ? d : debutAnnee, f < finAnnee ? f : finAnnee);
  }
  return res;
};

/** Mois de stage accepté du candidat dans un service. stages : [{ serviceId, debut, fin }] */
const moisDansService = (stages, serviceId) => versMois(
  stages.filter(s => s.serviceId === serviceId).reduce((t, s) => t + joursEntre(s.debut, s.fin), 0)
);

/** Jours de stage accepté par année civile, tous services. */
const joursAcceptesParAnnee = (stages) => {
  const total = {};
  for (const s of stages) {
    for (const [annee, jours] of Object.entries(joursParAnnee(s.debut, s.fin))) total[annee] = (total[annee] || 0) + jours;
  }
  return total;
};

/**
 * Date à partir de laquelle le candidat peut déposer une nouvelle demande (pause après son dernier stage).
 * @returns {{ dateMin: string|null, pauseMois: number|null, finDernierStage: string|null }}
 */
const calculerPause = (stages) => {
  if (!stages.length) return { dateMin: null, pauseMois: null, finDernierStage: null };
  const dernier = stages.reduce((a, b) => (versDate(b.fin) > versDate(a.fin) ? b : a));
  const pauseMois = moisDansService(stages, dernier.serviceId) >= MAX_MOIS_PAR_SERVICE ? PAUSE_APRES_6_MOIS : PAUSE_SINON;
  const min = versDate(dernier.fin);
  min.setUTCMonth(min.getUTCMonth() + pauseMois);
  min.setUTCDate(min.getUTCDate() + 1); // lendemain de la pause
  return { dateMin: iso(min), pauseMois, finDernierStage: iso(versDate(dernier.fin)) };
};

/**
 * Vérifie qu'un nouveau stage (demande ou renouvellement) respecte les limites. Lève une erreur au message
 * lisible par le candidat sinon.
 * @param {object} p
 * @param {Array<{serviceId:number, debut:string, fin:string}>} p.stages - stages acceptés du candidat
 * @param {number} p.serviceId - service du nouveau stage
 * @param {string} p.debut - date de début (souhaitée) du nouveau stage
 * @param {number} p.dureeMois - durée demandée
 * @param {boolean} [p.verifierPause=true] - false pour un renouvellement (il prolonge le stage, pas de pause)
 * @param {Date} [p.maintenant]
 */
const verifierLimitesStage = ({ stages, serviceId, debut, dureeMois, verifierPause = true, maintenant = new Date() }) => {
  if (verifierPause) {
    const { dateMin, pauseMois, finDernierStage } = calculerPause(stages);
    if (dateMin && iso(versDate(maintenant)) < dateMin) {
      throw new Error(
        `Votre dernier stage s'est terminé le ${dateFr(finDernierStage)} : une pause de ${pauseMois} mois est obligatoire. ` +
        `Vous pourrez déposer une nouvelle demande à partir du ${dateFr(dateMin)}.`
      );
    }
  }

  const dejaService = moisDansService(stages, serviceId);
  if (dejaService >= MAX_MOIS_PAR_SERVICE) {
    throw new Error(
      `Vous avez déjà effectué ${MAX_MOIS_PAR_SERVICE} mois de stage dans ce service : il ne vous est plus ouvert. ` +
      'Vous pouvez choisir un autre service.'
    );
  }
  const resteService = MAX_MOIS_PAR_SERVICE - dejaService;
  if (dureeMois > resteService) {
    throw new Error(
      `Vous avez déjà effectué ${formatMois(dejaService)} de stage dans ce service : il vous reste ${formatMois(resteService)} au plus ` +
      `(${MAX_MOIS_PAR_SERVICE} mois maximum par service).`
    );
  }

  const fin = calculerDateFin(debut, dureeMois);
  const dejaParAnnee = joursAcceptesParAnnee(stages);
  for (const [annee, joursNouveaux] of Object.entries(joursParAnnee(debut, fin))) {
    const deja = versMois(dejaParAnnee[annee] || 0);
    if (versMois((dejaParAnnee[annee] || 0) + joursNouveaux) > MAX_MOIS_PAR_ANNEE) {
      const reste = Math.max(0, MAX_MOIS_PAR_ANNEE - deja);
      throw new Error(
        `En ${annee}, vous avez déjà ${formatMois(deja)} de stage : ce stage dépasserait la limite de ${MAX_MOIS_PAR_ANNEE} mois par année ` +
        `(il vous reste ${formatMois(reste)} en ${annee}).`
      );
    }
  }
};

module.exports = {
  MAX_MOIS_PAR_SERVICE, MAX_MOIS_PAR_ANNEE, PAUSE_APRES_6_MOIS, PAUSE_SINON, STATUTS_STAGE_ACCEPTE,
  joursEntre, versMois, joursParAnnee, moisDansService, calculerPause, verifierLimitesStage,
};
