// src/services/excel.service.js
// Service partagé de génération de rapports Excel (.xlsx) — pendant du
// pdf.service.js pour les exports qui ont besoin de mise en forme (police,
// couleurs) et de graphiques, ce qu'un simple CSV ne permet pas.
const ExcelJS = require('exceljs');
const { genBarChart, genDonutChart, STATUT_COULEURS } = require('./pdf.service');

const ROUGE  = 'FFDC2626';
const NOIR   = 'FF0F172A';
const GRIS_C = 'FFF1F5F9';
const BLANC  = 'FFFFFFFF';

const FONT_NOM = 'Times New Roman';

const STATUT_COULEURS_HEX = {
  EN_ATTENTE: '#f59e0b', EN_TRAITEMENT: '#3b82f6', ACCEPTE: '#16a34a',
  VALIDEE: '#16a34a', ACTIVE: '#16a34a', REJETE: '#dc2626', REJETEE: '#dc2626',
  ANNULE: '#6b7280', CLOTUREE: '#6b7280', TERMINEE: '#6b7280',
  BROUILLON: '#94a3b8', SOUMISE: '#3b82f6', EN_COURS: '#8b5cf6',
};

/**
 * Génère un classeur Excel avec une feuille "Résumé" (cartes de stats +
 * graphiques image) et une feuille "Détails" (tableau complet), en Times New
 * Roman. Miroir du rapport PDF (genererRapportPDF) pour la cohérence visuelle.
 */
async function genererRapportExcel({
  titre,
  module,
  statsCards,
  parStatut,
  parDirection,
  colonnes,
  lignes,
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PORTAIL SONABHY';
  workbook.created = new Date();

  // ═══════════════════════════════════════════════════════════
  // Feuille "Résumé"
  // ═══════════════════════════════════════════════════════════
  const resume = workbook.addWorksheet('Résumé', {
    properties: { defaultColWidth: 14 },
  });

  resume.mergeCells('A1:H1');
  const titreCell = resume.getCell('A1');
  titreCell.value = titre;
  titreCell.font = { name: FONT_NOM, size: 20, bold: true, color: { argb: BLANC } };
  titreCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROUGE } };
  resume.getRow(1).height = 40;

  resume.mergeCells('A2:H2');
  const sousTitre = resume.getCell('A2');
  sousTitre.value = `${module} — Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — PORTAIL SONABHY`;
  sousTitre.font = { name: FONT_NOM, size: 10, italic: true, color: { argb: 'FF64748B' } };
  resume.getRow(2).height = 20;

  // Cartes de statistiques
  let col = 1;
  const rowStats = 4;
  statsCards.forEach((s) => {
    const cell = resume.getCell(rowStats, col);
    const labelCell = resume.getCell(rowStats + 1, col);
    cell.value = s.val;
    cell.font = { name: FONT_NOM, size: 18, bold: true, color: { argb: hexToArgb(s.color || '#dc2626') } };
    cell.alignment = { horizontal: 'center' };
    labelCell.value = s.label;
    labelCell.font = { name: FONT_NOM, size: 9, color: { argb: 'FF64748B' } };
    labelCell.alignment = { horizontal: 'center' };
    [cell, labelCell].forEach((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_C } };
    });
    col += 2;
  });
  resume.getRow(rowStats).height = 26;

  let rowCursor = rowStats + 4;

  // Graphique répartition par statut (donut)
  if (parStatut.length > 0) {
    const header = resume.getCell(rowCursor, 1);
    header.value = 'Répartition par statut';
    header.font = { name: FONT_NOM, size: 12, bold: true, color: { argb: BLANC } };
    resume.mergeCells(rowCursor, 1, rowCursor, 8);
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROUGE } };
    resume.getRow(rowCursor).height = 22;
    rowCursor += 1;

    const donutBuf = await genDonutChart(
      parStatut.map((s) => s.label),
      parStatut.map((s) => s.count),
      parStatut.map((s) => STATUT_COULEURS[s.key] || '#2563eb')
    );
    const imgId = workbook.addImage({ buffer: donutBuf, extension: 'png' });
    resume.addImage(imgId, {
      tl: { col: 0, row: rowCursor - 1 },
      ext: { width: 400, height: 210 },
    });
    rowCursor += 12;
  }

  // Graphique répartition par direction (barres)
  if (parDirection.length > 0) {
    const header = resume.getCell(rowCursor, 1);
    header.value = 'Répartition par direction';
    header.font = { name: FONT_NOM, size: 12, bold: true, color: { argb: BLANC } };
    resume.mergeCells(rowCursor, 1, rowCursor, 8);
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROUGE } };
    resume.getRow(rowCursor).height = 22;
    rowCursor += 1;

    const barBuf = await genBarChart(
      parDirection.map((d) => d.label),
      parDirection.map((d) => d.count),
      parDirection.map(() => '#dc2626')
    );
    const imgId = workbook.addImage({ buffer: barBuf, extension: 'png' });
    resume.addImage(imgId, {
      tl: { col: 0, row: rowCursor - 1 },
      ext: { width: 400, height: 210 },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Feuille "Détails"
  // ═══════════════════════════════════════════════════════════
  const details = workbook.addWorksheet('Détails', {
    views: [{ state: 'frozen', ySplit: 1 }], // fige la ligne d'en-tête
  });

  details.columns = colonnes.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(10, Math.round((c.width || 60) / 5.5)),
  }));

  details.getRow(1).eachCell((cell) => {
    cell.font = { name: FONT_NOM, size: 10, bold: true, color: { argb: BLANC } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NOIR } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  details.getRow(1).height = 20;

  lignes.forEach((row, i) => {
    const excelRow = details.addRow(row);
    const isStatutCol = colonnes.findIndex((c) => ['statut', 'status', 'statusOffre', 'statusAide', 'statusStage'].includes(c.key));
    excelRow.eachCell((cell, colNumber) => {
      cell.font = { name: FONT_NOM, size: 10 };
      cell.alignment = { vertical: 'top', wrapText: true };
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      if (colNumber - 1 === isStatutCol) {
        const val = String(cell.value ?? '');
        const hex = STATUT_COULEURS_HEX[val];
        if (hex) cell.font = { name: FONT_NOM, size: 10, bold: true, color: { argb: hexToArgb(hex) } };
      }
    });
  });

  details.autoFilter = { from: 'A1', to: { row: 1, column: colonnes.length } };

  return workbook.xlsx.writeBuffer();
}

function hexToArgb(hex) {
  return 'FF' + hex.replace('#', '').toUpperCase();
}

module.exports = { genererRapportExcel };
