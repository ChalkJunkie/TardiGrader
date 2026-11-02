/**
 * TardiGrader – Druckansichten
 * =============================
 * Erzeugt druckfertige Seiten (A4) für
 *   • Schülerbögen: 1 pro Seite (A4 quer), 2 pro Seite (A4 hoch), 4 pro Seite (A4 quer, kompakt)
 *   • Notenliste (A4 hoch)
 * Gedruckt bzw. als PDF gesichert wird über den Druckdialog des Systems
 * (iPad: Teilen → Drucken → Teilen-Symbol → „In Dateien sichern“).
 */
import {
  CRITERIA,
  STUDENT_TITLE,
  STUDENT_MARKS,
  STUDENT_COMMENT_HEADER,
  STUDENT_NOTE_LABEL,
  STUDENT_DEFINITION_LABEL,
  GRADE_NAMES,
  DEFINITIONS,
  FOOTNOTE_TEXT,
  FOOTNOTE_URL,
} from './rubric.js';
import { esc, richHTML, h, icon } from './ui.js';

const MM = 96 / 25.4; // CSS-Pixel pro Millimeter

function parasHTML(list) {
  return (Array.isArray(list) ? list : [list]).map((t) => `<p>${richHTML(t)}</p>`).join('');
}

/**
 * HTML eines ausgefüllten Schülerbogens.
 * @param {object} s Ergebnis von buildSheet()
 * @param {{compact?:boolean, definitions?:boolean}} opt
 */
/** Spaltenbreiten (%) je Variante: wie die Vorlage (full) bzw. für verkleinerte Bögen umverteilt. */
const WIDTHS = {
  full: { label: 10.83, best: 22.38, mark: 3.247, worst: 16.25, comment: 31.06 },
  half: { label: 10.5, best: 25.5, mark: 3.25, worst: 18.5, comment: 26 },
  compact: { label: 13, best: 28.5, mark: 3.4, worst: 19.5, comment: 18.6 },
};

export function sheetHTML(s, { compact = false, definitions = true, variant } = {}) {
  const w = WIDTHS[variant || (compact ? 'compact' : 'full')];
  const cols = [
    `<col style="width:${w.label}%">`,
    `<col style="width:${w.best}%">`,
    ...STUDENT_MARKS.map(() => `<col style="width:${w.mark}%">`),
    `<col style="width:${w.worst}%">`,
    `<col style="width:${w.comment}%">`,
  ].join('');
  const head = `<tr><th></th><th></th>${STUDENT_MARKS.map((m) => `<th class="mark">${esc(m)}</th>`).join('')}<th></th><th>${richHTML(`**${STUDENT_COMMENT_HEADER}**`)}</th></tr>`;
  const body = CRITERIA.map((c) => {
    const r = s.rows[c.key] || { cols: [], comment: '' };
    const marks = [1, 2, 3, 4, 5, 6].map((g) => `<td class="mark">${r.cols.includes(g) ? 'X' : ''}</td>`).join('');
    return `<tr><td>${parasHTML(c.studentLabel)}</td><td>${parasHTML(c.studentBest)}</td>${marks}<td>${parasHTML(c.studentWorst)}</td><td class="comment">${esc(r.comment)}</td></tr>`;
  }).join('');
  const defs = definitions
    ? `<table class="sheet__defs"><colgroup><col style="width:10.83%">${GRADE_NAMES.map(() => '<col style="width:14.86%">').join('')}</colgroup>
        <tr><td>${richHTML(STUDENT_NOTE_LABEL)}</td>${GRADE_NAMES.map((g) => `<td>${richHTML(g)}</td>`).join('')}</tr>
        <tr><td>${richHTML(STUDENT_DEFINITION_LABEL)}</td>${DEFINITIONS.map((d) => `<td>${richHTML(d)}</td>`).join('')}</tr>
      </table>
      <p class="sheet__foot">${esc(FOOTNOTE_TEXT)}<a href="${esc(FOOTNOTE_URL)}">${esc(FOOTNOTE_URL)}</a></p>`
    : '';
  return `<div class="sheet${compact ? ' sheet--compact' : ''}">
    <div class="sheet__title">${esc(STUDENT_TITLE)}</div>
    <div class="sheet__head">
      <span class="f f--name"><b>Name:</b><span class="v">${esc(s.name)}</span></span>
      <span class="f f--klasse"><b>Klasse:</b><span class="v">${esc(s.klasse)}</span></span>
      <span class="f f--datum"><b>Datum:</b><span class="v">${esc(s.datum)}</span></span>
      <span class="f f--note"><b>Note:</b><span class="v">${esc(s.note)}</span></span>
    </div>
    <table class="sheet__crit"><colgroup>${cols}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table>
    ${defs}
  </div>`;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Ausgangsschriftgrößen je Layout (pt); bei Platzmangel wird automatisch verkleinert. */
const BASE_FS = { 1: 10.5, 2: 7.8, 4: 7.2 };

/**
 * Seiten für Schülerbögen.
 * @param {object[]} sheets
 * @param {1|2|4} perPage
 */
export function buildSheetPages(sheets, perPage = 1) {
  const fs = BASE_FS[perPage] || BASE_FS[1];
  if (perPage === 2) {
    return {
      orientation: 'portrait',
      pages: chunk(sheets, 2).map((group) => `<div class="page page--portrait"><div class="slots slots--2">
        ${group.map((s) => `<div class="slot" data-fs="${fs}">${sheetHTML(s, { variant: 'half' })}</div>`).join('')}
        ${group.length < 2 ? '<div class="slot"></div>' : ''}
        <span class="cutmark" aria-hidden="true">✂</span></div></div>`),
    };
  }
  if (perPage === 4) {
    return {
      orientation: 'landscape',
      pages: chunk(sheets, 4).map((group) => {
        const slots = [...group.map((s) => `<div class="slot" data-fs="${fs}">${sheetHTML(s, { compact: true, definitions: false })}</div>`)];
        while (slots.length < 4) slots.push('<div class="slot"></div>');
        return `<div class="page page--landscape"><div class="slots slots--4">${slots.join('')}
          <span class="cutmark cutmark--h" aria-hidden="true">✂</span><span class="cutmark cutmark--v" aria-hidden="true">✂</span></div></div>`;
      }),
    };
  }
  return {
    orientation: 'landscape',
    pages: sheets.map((s) => `<div class="page page--landscape" data-fs="${fs}">${sheetHTML(s)}</div>`),
  };
}

/**
 * Seite(n) der Notenliste.
 * @param {object[]} list Ergebnis von buildGradeList()
 * @param {{title:string, group:string, klasse:string, round:string, scale:string, weightsNote:string}} meta
 */
export function buildListPages(list, meta) {
  const q = meta.scale !== 'points';
  const p = meta.scale !== 'quarter';
  const crit = CRITERIA.map((c) => `<th>${esc(c.studentLabel.replace(/\*\*/g, ''))}</th>`).join('');
  const head = `<tr><th>Nr.</th><th class="name" style="width:24%">Name</th><th>Datum</th>${crit}<th>berechnet</th>${q ? '<th>Endnote</th>' : ''}${p ? '<th>Punkte</th>' : ''}</tr>`;
  const rows = list.map((r, i) => {
    const calc = r.proposalDecimal
      ? `${r.proposalDecimal}${q ? ` (${esc(r.proposalQuarter)})` : ` (${r.proposalPoints} P)`}`
      : '';
    const adj = r.adjusted ? '<span class="adj"> *</span>' : '';
    return `<tr>
      <td>${i + 1}</td><td class="name">${esc(r.name)}</td><td>${esc(r.datum)}</td>
      ${['quality', 'knowledge', 'language'].map((k) => `<td>${esc(r.rowText[k])}</td>`).join('')}
      <td>${calc}${r.proposalDecimal && !r.complete ? '<span class="adj"> (unvollst.)</span>' : ''}</td>
      ${q ? `<td class="list-final">${esc(r.finalQuarter)}${adj}</td>` : ''}
      ${p ? `<td class="list-final">${r.finalPoints}${q ? '' : adj}</td>` : ''}
    </tr>`;
  }).join('');
  const html = `<div class="page page--portrait page--list"><div class="list-sheet">
    <h1>${esc(meta.title)}</h1>
    <div class="list-meta">
      <span><b>Lerngruppe:</b> ${esc(meta.group)}</span>
      <span><b>Klasse:</b> ${esc(meta.klasse)}</span>
      <span><b>Runde:</b> ${esc(meta.round)}</span>
      <span><b>Stand:</b> ${esc(meta.printed)}</span>
    </div>
    <table><thead>${head}</thead><tbody>${rows}</tbody></table>
    <div class="list-foot">
      <p>Zeilenwerte: Mittelwert der markierten Spalten (1–6). Berechnete Note: gewichteter Mittelwert der drei Zeilen (${esc(meta.weightsNote)}).
      ${p ? 'Punkte = 17 − 3 × Note, gerundet. ' : ''}* = von der Lehrkraft nachgeschärft.</p>
    </div>
  </div></div>`;
  return { orientation: 'portrait', pages: [html] };
}

/** Verkleinert die Schrift eines Bogens schrittweise, bis er in seinen Rahmen passt. */
export function fitSheets(root) {
  root.querySelectorAll('[data-fs]').forEach((box) => {
    const sheet = box.classList.contains('sheet') ? box : box.querySelector('.sheet');
    if (!sheet) return;
    const base = parseFloat(box.dataset.fs) || 10;
    let fs = base;
    sheet.style.setProperty('--fs', `${fs}pt`);
    let guard = 0;
    while (sheet.scrollHeight > sheet.clientHeight + 1 && fs > base * 0.62 && guard < 40) {
      fs -= base * 0.025;
      sheet.style.setProperty('--fs', `${fs.toFixed(2)}pt`);
      guard++;
    }
  });
}

/**
 * Öffnet die Druckvorschau.
 * @param {{title:string, orientation:'portrait'|'landscape', pages:string[], onClose:Function, autoPrint?:boolean}} o
 */
export function openPrintView({ title, orientation, pages, onClose, hint }) {
  const root = document.getElementById('print-root');
  const pageStyle = document.getElementById('page-style');
  pageStyle.textContent = `@page { size: A4 ${orientation}; margin: 10mm; }`;
  root.innerHTML = '';
  const close = () => {
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('is-printing');
    window.removeEventListener('resize', onResize);
    if (onClose) onClose();
  };
  const pagesBox = h('div', { class: 'print-pages', html: pages.join('') });
  const toolbar = h('div', { class: 'print-toolbar' },
    h('button', { class: 'btn', type: 'button', onclick: close }, icon('back'), 'Zurück'),
    h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 260px', minWidth: '0' } },
      h('b', null, title),
      h('p', null, hint || `${pages.length} ${pages.length === 1 ? 'Seite' : 'Seiten'} · A4 ${orientation === 'landscape' ? 'quer' : 'hoch'}. Im Druckdialog über das Teilen-Symbol „In Dateien sichern“ wählen, um ein PDF zu erhalten.`)),
    h('button', { class: 'btn btn--primary btn--big', type: 'button', onclick: () => window.print() }, icon('print'), 'Drucken / PDF'),
  );
  root.append(toolbar, pagesBox);
  root.hidden = false;
  document.body.classList.add('is-printing');
  window.scrollTo(0, 0);

  // Erst bei 100 % einpassen, dann für den Bildschirm verkleinern
  pagesBox.style.setProperty('--preview-zoom', '1');
  fitSheets(pagesBox);
  const pageWidthMM = orientation === 'landscape' ? 277 : 190;
  function onResize() {
    const avail = Math.max(320, window.innerWidth - 24);
    const zoom = Math.min(1, avail / (pageWidthMM * MM));
    pagesBox.style.setProperty('--preview-zoom', zoom.toFixed(3));
  }
  onResize();
  window.addEventListener('resize', onResize);
  return { close };
}
