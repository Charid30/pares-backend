// src/services/pdf.service.js
// Service partagé de génération de rapports PDF avec graphiques
const PDFDocument = require('pdfkit');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

// ── Couleurs SONABHY ────────────────────────────────────────
const ROUGE   = '#dc2626';
const GRIS    = '#64748b';
const GRIS_C  = '#f1f5f9';
const BLANC   = '#ffffff';
const NOIR    = '#0f172a';
const VERT    = '#16a34a';
const ORANGE  = '#d97706';
const BLEU    = '#2563eb';

// ── Couleurs statuts ────────────────────────────────────────
const STATUT_COULEURS = {
  EN_ATTENTE:    '#f59e0b',
  EN_TRAITEMENT: '#3b82f6',
  ACCEPTE:       '#16a34a',
  VALIDEE:       '#16a34a',
  ACTIVE:        '#16a34a',
  REJETE:        '#dc2626',
  REJETEE:       '#dc2626',
  ANNULE:        '#6b7280',
  CLOTUREE:      '#6b7280',
  TERMINEE:      '#6b7280',
  BROUILLON:     '#94a3b8',
  SOUMISE:       '#3b82f6',
  EN_COURS:      '#8b5cf6',
};

const chartCanvas = new ChartJSNodeCanvas({ width: 500, height: 260, backgroundColour: 'white' });

// ── Génère un graphique en barres horizontal ───────────────
async function genBarChart(labels, data, colors) {
  return chartCanvas.renderToBuffer({
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } }, grid: { color: '#e2e8f0' } },
        y: { ticks: { font: { size: 11 } } },
      },
    },
  });
}

// ── Génère un graphique en donut ───────────────────────────
async function genDonutChart(labels, data, colors) {
  return chartCanvas.renderToBuffer({
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff',
      }],
    },
    options: {
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: { font: { size: 10 }, boxWidth: 14, padding: 10 },
        },
      },
      cutout: '60%',
    },
  });
}

// ── Génère un graphique en courbe (évolution mensuelle) ────
async function genLineChart(labels, data) {
  return chartCanvas.renderToBuffer({
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: ROUGE,
        backgroundColor: 'rgba(220,38,38,0.08)',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: ROUGE,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: '#e2e8f0' } },
      },
    },
  });
}

// ── Utilitaires PDF ─────────────────────────────────────────
function drawPageNumber(doc, pageNum) {
  // Le texte est dessiné dans la marge basse (sous la zone de contenu), ce qui
  // fait croire à PDFKit qu'il déborde de la page et déclenche l'ajout
  // automatique d'une page fantôme. On désactive temporairement la marge basse
  // le temps de dessiner le numéro, à l'endroit exact prévu pour lui.
  const bottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.save()
    .fontSize(8).fillColor(GRIS)
    .text(`Page ${pageNum}`, 0, doc.page.height - 30, { align: 'center', width: doc.page.width, lineBreak: false })
    .restore();
  doc.page.margins.bottom = bottomMargin;
}

function footerLine(doc) {
  doc.save()
    .moveTo(50, doc.page.height - 40)
    .lineTo(doc.page.width - 50, doc.page.height - 40)
    .strokeColor('#e2e8f0').lineWidth(0.5).stroke()
    .restore();
}

// ── Page de garde ────────────────────────────────────────────
function pageCouverture(doc, { titre, module, total, periode }) {
  // Fond rouge en-tête
  doc.rect(0, 0, doc.page.width, 200).fill(ROUGE);

  // Logo / Nom institution
  doc.fontSize(11).fillColor(BLANC).font('Times-Roman')
    .text('SONABHY', 50, 40, { align: 'left' });
  doc.fontSize(9).fillColor('rgba(255,255,255,0.7)')
    .text('Société Nationale Burkinabè d\'Hydrocarbures', 50, 56);

  // Titre rapport
  doc.fontSize(24).fillColor(BLANC).font('Times-Bold')
    .text(titre, 50, 100, { width: doc.page.width - 100 });

  // Module badge — PDFKit ne comprend pas la notation CSS rgba(), d'où le
  // rectangle blanc opaque (texte blanc invisible) si on la passe à .fill().
  // On simule la translucidité avec fillOpacity() à la place.
  doc.save();
  doc.fillOpacity(0.2).roundedRect(50, 155, 120, 24, 4).fill(BLANC);
  doc.restore();
  doc.fontSize(9).fillColor(BLANC).font('Times-Roman')
    .text(module, 50, 162, { width: 120, align: 'center' });

  // Corps
  const y = 240;
  doc.fontSize(11).fillColor(NOIR).font('Times-Bold')
    .text('Résumé du rapport', 50, y);
  doc.moveTo(50, y + 18).lineTo(200, y + 18).strokeColor(ROUGE).lineWidth(2).stroke();

  // Stats rapides
  const stats = [
    { label: 'Total des enregistrements', val: total },
    { label: 'Période couverte', val: periode },
    { label: 'Date de génération', val: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) },
    { label: 'Heure de génération', val: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) },
  ];
  stats.forEach((s, i) => {
    const sy = y + 36 + i * 28;
    doc.fontSize(9).fillColor(GRIS).font('Times-Roman').text(s.label, 50, sy);
    doc.fontSize(11).fillColor(NOIR).font('Times-Bold').text(String(s.val), 280, sy);
  });

  // Ligne séparatrice bas
  doc.moveTo(50, y + 160).lineTo(doc.page.width - 50, y + 160).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  doc.fontSize(8).fillColor(GRIS).font('Times-Roman')
    .text('Document généré automatiquement par la plateforme PORTAIL SONABHY', 50, y + 172, { align: 'center', width: doc.page.width - 100 });
}

// ── En-tête de section ────────────────────────────────────────
function sectionHeader(doc, titre, y) {
  doc.rect(50, y, doc.page.width - 100, 26).fill(ROUGE);
  doc.fontSize(11).fillColor(BLANC).font('Times-Bold')
    .text(titre, 58, y + 7);
  return y + 40;
}

// ── Cartes de statistiques (ligne de 4) ───────────────────────
function drawStatCards(doc, stats, y) {
  const cardW = (doc.page.width - 100 - 30) / 4;
  stats.forEach((s, i) => {
    const x = 50 + i * (cardW + 10);
    doc.rect(x, y, cardW, 60).fill(GRIS_C);
    doc.rect(x, y, 3, 60).fill(s.color || ROUGE);
    doc.fontSize(18).fillColor(s.color || ROUGE).font('Times-Bold')
      .text(String(s.val), x + 10, y + 10, { width: cardW - 15 });
    doc.fontSize(8).fillColor(GRIS).font('Times-Roman')
      .text(s.label, x + 10, y + 36, { width: cardW - 15 });
  });
  return y + 76;
}

// ── Tableau de données ────────────────────────────────────────
function drawTable(doc, colonnes, lignes, startY) {
  const pageH = doc.page.height - 80;
  const tableW = doc.page.width - 100;
  const colW = colonnes.map(c => c.width || tableW / colonnes.length);
  let y = startY;

  // En-tête
  doc.rect(50, y, tableW, 20).fill('#1e293b');
  let x = 50;
  colonnes.forEach((col, i) => {
    doc.fontSize(8).fillColor(BLANC).font('Times-Bold')
      .text(col.label, x + 4, y + 6, { width: colW[i] - 8, height: 10, ellipsis: true });
    x += colW[i];
  });
  y += 20;

  // Lignes
  lignes.forEach((row, ri) => {
    if (y > pageH) {
      // Le pied de page (ligne + numéro) est ajouté a posteriori sur toutes les
      // pages en une seule passe finale — voir genererRapportPDF.
      doc.addPage();
      y = 50;
      // Répéter l'en-tête
      doc.rect(50, y, tableW, 20).fill('#1e293b');
      let xh = 50;
      colonnes.forEach((col, i) => {
        doc.fontSize(8).fillColor(BLANC).font('Times-Bold')
          .text(col.label, xh + 4, y + 6, { width: colW[i] - 8, ellipsis: true });
        xh += colW[i];
      });
      y += 20;
    }

    const rowH = 18;
    doc.rect(50, y, tableW, rowH).fill(ri % 2 === 0 ? BLANC : '#f8fafc');
    // Bordure basse subtile
    doc.moveTo(50, y + rowH).lineTo(50 + tableW, y + rowH).strokeColor('#e2e8f0').lineWidth(0.3).stroke();

    let cx = 50;
    colonnes.forEach((col, i) => {
      const val = String(row[col.key] ?? '');
      // Colorier les statuts
      const isStatut = col.key === 'statut' || col.key === 'status' || col.key === 'statusOffre' || col.key === 'statusAide';
      const color = isStatut ? (STATUT_COULEURS[val] || NOIR) : NOIR;
      doc.fontSize(7.5).fillColor(color).font(isStatut ? 'Times-Bold' : 'Times-Roman')
        .text(val, cx + 4, y + 5, { width: colW[i] - 8, height: 9, ellipsis: true });
      cx += colW[i];
    });
    y += rowH;
  });

  return y + 10;
}

// ── Export principal ──────────────────────────────────────────
async function genererRapportPDF({
  titre,
  module,
  statsCards,
  parStatut,
  parDirection,
  parMois,
  colonnes,
  lignes,
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  doc.font('Times-Roman'); // police par défaut pour tout texte sans .font() explicite (ex. numéros de page)
  const chunks = [];
  doc.on('data', c => chunks.push(c));

  // ─ Page de garde ─
  pageCouverture(doc, {
    titre,
    module,
    total: lignes.length,
    periode: parMois.length ? `${parMois[0].mois} – ${parMois[parMois.length - 1].mois}` : 'Toutes périodes',
  });

  // ─ Page 2 : Statistiques & graphiques ─
  doc.addPage({ margin: 50 });
  let y = 50;

  // Cartes stats
  y = sectionHeader(doc, 'Vue d\'ensemble', y);
  y = drawStatCards(doc, statsCards, y);
  y += 20;

  // Graphiques côte à côte
  if (parStatut.length > 0) {
    y = sectionHeader(doc, 'Répartition par statut', y);

    const donutBuf = await genDonutChart(
      parStatut.map(s => s.label),
      parStatut.map(s => s.count),
      parStatut.map(s => STATUT_COULEURS[s.key] || BLEU)
    );
    doc.image(donutBuf, 50, y, { width: 240, height: 140 });

    // Légende textuelle à droite
    let ly = y + 10;
    parStatut.forEach(s => {
      const c = STATUT_COULEURS[s.key] || BLEU;
      doc.rect(310, ly, 10, 10).fill(c);
      doc.fontSize(9).fillColor(NOIR).font('Times-Roman')
        .text(`${s.label} : `, 326, ly + 1, { continued: true })
        .font('Times-Bold').text(String(s.count));
      ly += 18;
    });
    y += 158;
  }

  if (parDirection.length > 0) {
    if (y + 160 >= doc.page.height - 80) {
      doc.addPage({ margin: 50 });
      y = 50;
    }
    y = sectionHeader(doc, 'Répartition par direction', y);
    const barBuf = await genBarChart(
      parDirection.map(d => d.label),
      parDirection.map(d => d.count),
      parDirection.map(() => ROUGE)
    );
    doc.image(barBuf, 50, y, { width: doc.page.width - 100, height: 150 });
    y += 168;
  }

  if (parMois.length > 0) {
    if (y + 170 > doc.page.height - 80) {
      doc.addPage({ margin: 50 });
      y = 50;
    }
    y = sectionHeader(doc, 'Évolution mensuelle', y);
    const lineBuf = await genLineChart(
      parMois.map(m => m.mois),
      parMois.map(m => m.count)
    );
    doc.image(lineBuf, 50, y, { width: doc.page.width - 100, height: 150 });
    y += 168;
  }

  // ─ Pages suivantes : tableau détaillé ─
  doc.addPage({ margin: 50 });
  y = 50;
  y = sectionHeader(doc, 'Liste détaillée', y);
  drawTable(doc, colonnes, lignes, y);

  // ─ Pied de page (ligne + numéro) sur toutes les pages, en une seule passe
  // finale — avec bufferPages:true, ajouter le pied de page AVANT chaque
  // doc.addPage() provoquait des pages fantômes quasi vides (le texte du
  // numéro se retrouvait décalé sur la page suivante). En le faisant après
  // coup via switchToPage(), chaque page reçoit son pied de page une seule
  // fois, au bon endroit.
  // La page de garde (index 0) a son propre pied de page dédié — elle n'est
  // jamais numérotée, comme avant.
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    footerLine(doc);
    drawPageNumber(doc, i + 1);
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ── Calculs statistiques communs ──────────────────────────────
function calcParMois(items, champDate) {
  const map = {};
  items.forEach(item => {
    const d = item[champDate] || item.createdAt || item.createdDate;
    if (!d) return;
    const key = new Date(d).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map)
    .sort(([a], [b]) => new Date('01 ' + a) - new Date('01 ' + b))
    .map(([mois, count]) => ({ mois, count }));
}

function calcParStatut(items, champStatut) {
  const LABELS = {
    EN_ATTENTE: 'En attente', EN_TRAITEMENT: 'En traitement',
    ACCEPTE: 'Accepté', VALIDEE: 'Validée', ACTIVE: 'Active',
    REJETE: 'Rejeté', REJETEE: 'Rejetée', ANNULE: 'Annulé',
    CLOTUREE: 'Clôturée', TERMINEE: 'Terminée', BROUILLON: 'Brouillon',
    SOUMISE: 'Soumise', EN_COURS: 'En cours',
  };
  const map = {};
  items.forEach(item => {
    const s = item[champStatut];
    if (s) map[s] = (map[s] || 0) + 1;
  });
  return Object.entries(map).map(([key, count]) => ({
    key, count, label: LABELS[key] || key,
  }));
}

function calcParDirection(items) {
  const map = {};
  items.forEach(item => {
    const nom = item.direction?.accronyme || item.direction?.nom || 'Non affecté';
    map[nom] = (map[nom] || 0) + 1;
  });
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .map(([label, count]) => ({ label, count }));
}

module.exports = {
  genererRapportPDF, calcParMois, calcParStatut, calcParDirection,
  // Réutilisés par excel.service.js pour insérer les mêmes graphiques dans les
  // exports Excel (images PNG — cohérent visuellement avec le rapport PDF).
  genBarChart, genDonutChart, STATUT_COULEURS,
};
