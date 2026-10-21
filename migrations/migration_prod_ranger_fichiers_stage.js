// =============================================================================
// Migration : rangement des fichiers de stage dans uploads/ (2026-10-21)
//
//   conventions des demandes de stage  → uploads/conventions/stages/
//   conventions des renouvellements    → uploads/conventions/renouvellements/
//   attestations de stage              → uploads/attestations/
//   lettres de renouvellement          → uploads/renouvellements/
//
// Les nouveaux envois y vont déjà (stage.service.js) ; cette migration range les fichiers existants.
// Déroulement, pour ne jamais casser un lien :
//   1. copie de chaque fichier dans son nouveau dossier (l'original n'est pas touché) ;
//   2. mise à jour des chemins en base dans UNE transaction (en cas d'échec : annulation et
//      suppression des copies, rien n'a changé) ;
//   3. suppression de l'ancien fichier, seulement s'il n'est plus référencé par aucune ligne.
// Idempotent : un document déjà rangé n'est pas touché ; une copie déjà présente (relance après
// interruption) est réutilisée ; un fichier introuvable sur disque est signalé et son chemin conservé.
//
// ⚠️ Sauvegarder la base ET le dossier uploads/ avant `npm run migrate` (procédure production).
// Vérification APRÈS (doit renvoyer 0) :
//   SELECT COUNT(*) FROM document_stage
//   WHERE document_path IS NOT NULL AND document_path NOT LIKE 'uploads/conventions/stages/%'
//     AND document_path NOT LIKE 'uploads/conventions/renouvellements/%' AND document_path NOT LIKE 'uploads/attestations/%';
// Retour arrière : restaurer la sauvegarde de la base et du dossier uploads/.
// =============================================================================
const fs = require('fs');
const path = require('path');

// Colonnes de chemin qui peuvent référencer un fichier (contrôle avant suppression d'un ancien fichier)
const REFERENCES = [
  ['document_stage', 'document_path'],
  ['renouvellement_stage', 'lettreMotivationRenouvellement_path'],
  ['stage', 'cv_path'], ['stage', 'cnib_path'], ['stage', 'casierJudiciaire_path'],
  ['stage', 'lettreMotivation_path'], ['stage', 'lettreRecommandation_path'], ['stage', 'dernierDiplome_path'],
];

module.exports.up = async (connection, { uploadsRoot, log = console.log }) => {
  const absolu = (rel) => path.join(uploadsRoot, rel.replace(/^uploads\//, ''));
  const cible = (rel, dossier) => `uploads/${dossier}/${path.posix.basename(rel)}`;

  const [documents] = await connection.query(`
    SELECT d.iddocument AS id, d.document_path AS chemin, d.typeDocument AS type, s.stage_parent_idstage AS parent
      FROM document_stage d
      JOIN stage s ON s.idstage = d.stage_idstage
     WHERE d.document_path IS NOT NULL`);
  const [lettres] = await connection.query(`
    SELECT idrenouvellement AS id, lettreMotivationRenouvellement_path AS chemin
      FROM renouvellement_stage
     WHERE lettreMotivationRenouvellement_path IS NOT NULL`);

  const aRanger = [
    ...documents.map(d => ({
      table: 'document_stage', cle: 'iddocument', colonne: 'document_path', id: d.id, chemin: d.chemin,
      dossier: d.type === 'ATTESTATION' ? 'attestations' : (d.parent ? 'conventions/renouvellements' : 'conventions/stages'),
    })),
    ...lettres.map(l => ({
      table: 'renouvellement_stage', cle: 'idrenouvellement', colonne: 'lettreMotivationRenouvellement_path',
      id: l.id, chemin: l.chemin, dossier: 'renouvellements',
    })),
  ]
    .map(m => ({ ...m, nouveau: cible(m.chemin, m.dossier) }))
    .filter(m => m.chemin !== m.nouveau);

  if (aRanger.length === 0) {
    log('rien à ranger');
    return;
  }

  // 1. Copies
  const copiesFaites = [];
  const prets = [];
  const introuvables = [];
  for (const m of aRanger) {
    const source = absolu(m.chemin);
    const destination = absolu(m.nouveau);
    if (fs.existsSync(destination)) { prets.push(m); continue; } // relance après interruption
    if (!fs.existsSync(source)) { introuvables.push(m); continue; }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    if (fs.statSync(destination).size !== fs.statSync(source).size) {
      throw new Error(`Copie incomplète de ${m.chemin}`);
    }
    copiesFaites.push(m);
    prets.push(m);
  }

  // 2. Chemins en base : tout ou rien
  await connection.beginTransaction();
  try {
    for (const m of prets) {
      await connection.query(
        `UPDATE \`${m.table}\` SET \`${m.colonne}\` = ? WHERE \`${m.cle}\` = ? AND \`${m.colonne}\` = ?`,
        [m.nouveau, m.id, m.chemin]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    for (const m of copiesFaites) fs.rmSync(absolu(m.nouveau), { force: true });
    throw err;
  }

  // 3. Anciens fichiers qui ne sont plus référencés nulle part
  let supprimes = 0;
  for (const m of prets) {
    let references = 0;
    for (const [table, colonne] of REFERENCES) {
      const [[{ n }]] = await connection.query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${colonne}\` = ?`, [m.chemin]);
      references += Number(n);
    }
    const source = absolu(m.chemin);
    if (references === 0 && fs.existsSync(source)) {
      fs.unlinkSync(source);
      supprimes++;
    }
  }

  log(`${prets.length} fichier(s) rangé(s), ${supprimes} ancien(s) fichier(s) supprimé(s)`);
  for (const m of introuvables) {
    log(`⚠ fichier introuvable, chemin conservé : ${m.table} #${m.id} → ${m.chemin}`);
  }
};
