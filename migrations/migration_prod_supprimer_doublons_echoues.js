// =============================================================================
// Migration : suppression des doublons d'envois échoués dans les dossiers de stage (2026-10-21)
//
// L'ancien code écrivait le fichier sur disque AVANT l'enregistrement en base : quand celui-ci
// échouait, le fichier restait sans référence, et l'envoi suivant (réussi) en recréait une copie.
// Constaté sur la copie de production : 1 convention (TAPSOBA, stage 128) et 3 rapports (SERE,
// stage 156), chacun strictement identique au fichier rattaché au dossier.
//
// Règle (décidée avec l'administration) : un fichier est supprimé SEULEMENT s'il n'est référencé
// par aucune ligne ET que son contenu est identique, octet pour octet (même taille, même SHA-256),
// à un fichier référencé. Un fichier non référencé unique est conservé et signalé.
// Dossiers examinés : conventions (+ stages, renouvellements), documents-stage, attestations,
// rapports, renouvellements. Exécutée après migration_prod_ranger_fichiers_stage.js (ordre alphabétique).
//
// ⚠️ Sauvegarder le dossier uploads/ avant `npm run migrate` (procédure production).
// Idempotent : une relance ne trouve plus de doublon.
// Retour arrière : restaurer les fichiers depuis la sauvegarde de uploads/.
// =============================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOSSIERS = [
  'conventions', 'conventions/stages', 'conventions/renouvellements',
  'documents-stage', 'attestations', 'rapports', 'renouvellements',
];

// Toutes les colonnes de chemin qui peuvent référencer un fichier de ces dossiers
const REFERENCES = [
  ['document_stage', 'document_path'],
  ['rapport_stage', 'rapportPdf_path'],
  ['renouvellement_stage', 'lettreMotivationRenouvellement_path'],
  ['stage', 'cv_path'], ['stage', 'cnib_path'], ['stage', 'casierJudiciaire_path'],
  ['stage', 'lettreMotivation_path'], ['stage', 'lettreRecommandation_path'], ['stage', 'dernierDiplome_path'],
];

const empreinte = (fichier) => crypto.createHash('sha256').update(fs.readFileSync(fichier)).digest('hex');

module.exports.up = async (connection, { uploadsRoot, log = console.log }) => {
  const absolu = (rel) => path.join(uploadsRoot, rel.replace(/^uploads\//, ''));

  // Chemins référencés en base
  const references = new Set();
  for (const [table, colonne] of REFERENCES) {
    const [lignes] = await connection.query(`SELECT \`${colonne}\` AS chemin FROM \`${table}\` WHERE \`${colonne}\` IS NOT NULL`);
    for (const { chemin } of lignes) references.add(chemin);
  }

  // Fichiers présents dans les dossiers examinés
  const fichiers = [];
  for (const dossier of DOSSIERS) {
    const repertoire = path.join(uploadsRoot, dossier);
    if (!fs.existsSync(repertoire)) continue;
    for (const nom of fs.readdirSync(repertoire)) {
      const complet = path.join(repertoire, nom);
      if (fs.statSync(complet).isFile()) fichiers.push({ rel: `uploads/${dossier}/${nom}`, complet, taille: fs.statSync(complet).size });
    }
  }

  const orphelins = fichiers.filter(f => !references.has(f.rel));
  if (orphelins.length === 0) {
    log('aucun fichier non référencé');
    return;
  }

  // Empreintes des fichiers référencés de même taille qu'un orphelin (évite de tout relire)
  const taillesOrphelins = new Set(orphelins.map(f => f.taille));
  const empreintesReferencees = new Map();
  for (const f of fichiers) {
    if (references.has(f.rel) && taillesOrphelins.has(f.taille)) empreintesReferencees.set(empreinte(f.complet), f.rel);
  }

  let supprimes = 0;
  for (const f of orphelins) {
    const original = empreintesReferencees.get(empreinte(f.complet));
    if (original) {
      fs.unlinkSync(f.complet);
      supprimes++;
      log(`doublon supprimé : ${f.rel} (identique à ${original})`);
    } else {
      log(`⚠ fichier non référencé et unique, conservé : ${f.rel}`);
    }
  }
  log(`${supprimes} doublon(s) supprimé(s)`);
};
