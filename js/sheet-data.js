/**
 * TardiGrader – Aufbereitung der Daten für Schülerbögen und Notenliste.
 * Wird von Druckansicht, Word-Export und CSV-Export gemeinsam genutzt.
 */
import { evaluate, describeGrade, formatDecimal, normalizeWeights, ROW_KEYS } from './grades.js';
import { CRITERIA, plain } from './rubric.js';

/** Name in der gewünschten Reihenfolge. */
export function studentName(s, order = 'first-last') {
  if (!s) return '';
  const f = (s.firstName || '').trim();
  const l = (s.lastName || '').trim();
  if (order === 'last-first') return f && l ? `${l}, ${f}` : l || f;
  return [f, l].filter(Boolean).join(' ');
}

const PARTICLE_RE = /^((von|van|de|der|den|zu|zur|vom|di|da|del|della|du|la|le|ten|ter)\s+)+/i;

/** Sortierschlüssel des Nachnamens: Namenszusätze wie „von“ bleiben unberücksichtigt (DIN 5007). */
export function sortKey(lastName) {
  return String(lastName || '').replace(PARTICLE_RE, '').trim();
}

/** Sortierung nach Nachname, dann Vorname (deutsche Kollation). */
export function compareStudents(a, b) {
  const c = sortKey(a.lastName).localeCompare(sortKey(b.lastName), 'de', { sensitivity: 'base' });
  if (c) return c;
  return (a.firstName || '').localeCompare(b.firstName || '', 'de', { sensitivity: 'base' });
}

/** Heutiges Datum als ISO-String (lokale Zeit). */
export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** „2026-11-02“ → „02.11.2026“ */
export function formatDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/** Klassenbezeichnung einer Gruppe. */
export function klasseOf(group) {
  return (group && (group.klasse || group.name)) || '';
}

/**
 * Daten für einen ausgefüllten Schülerbogen.
 * @returns {{name, klasse, datum, note, rows:{[key]:{cols:number[], comment:string}}}}
 */
export function buildSheet({ student, group, assessment, scale = 'quarter' }) {
  const ev = evaluate(assessment || {});
  const rows = {};
  for (const k of ROW_KEYS) {
    const r = assessment && assessment.rows && assessment.rows[k];
    rows[k] = { cols: r ? [...new Set(r.cols || [])].sort((a, b) => a - b) : [], comment: (r && r.comment) || '' };
  }
  return {
    name: studentName(student, 'first-last'),
    klasse: klasseOf(group),
    datum: assessment ? formatDate(assessment.date) : '',
    note: ev.effective !== null ? describeGrade(ev.effective, scale).text : '',
    rows,
  };
}

/**
 * Zeilen der Notenliste.
 * @returns {object[]} je Schüler: name, klasse, datum, rowValues, proposal…, final…
 */
export function buildGradeList({ students, group, assessmentsByStudent, nameOrder = 'last-first' }) {
  return students.map((s) => {
    const a = assessmentsByStudent.get(s.id) || null;
    const ev = evaluate(a || {});
    const rowText = {};
    for (const k of ROW_KEYS) rowText[k] = ev.rows[k] === null ? '' : formatDecimal(ev.rows[k], 2, true);
    const prop = describeGrade(ev.proposal, 'both');
    const fin = describeGrade(ev.effective, 'both');
    return {
      student: s,
      name: studentName(s, nameOrder),
      klasse: klasseOf(group),
      datum: a ? formatDate(a.date) : '',
      rowValues: ev.rows,
      rowText,
      complete: ev.complete,
      adjusted: ev.adjusted,
      proposalDecimal: ev.proposal === null ? '' : formatDecimal(ev.proposal, 2),
      proposalQuarter: prop.quarter,
      proposalPoints: prop.points === null ? '' : prop.points,
      finalQuarter: fin.quarter,
      finalPoints: fin.points === null ? '' : fin.points,
      weights: a && a.weights ? normalizeWeights(a.weights) : null,
      comments: a ? ROW_KEYS.map((k) => (a.rows && a.rows[k] && a.rows[k].comment) || '') : ['', '', ''],
    };
  });
}

/**
 * Kopf und Zeilen für den CSV-Export der Notenliste.
 * @param {object[]} list Ergebnis von buildGradeList
 * @param {'quarter'|'points'|'both'} scale
 */
export function gradeListTable(list, scale) {
  const q = scale !== 'points';
  const p = scale !== 'quarter';
  const header = ['Name', 'Klasse', 'Datum', ...CRITERIA.map((c) => plain(c.studentLabel)), 'Berechnete Note (dezimal)'];
  if (q) header.push('Berechnete Note (Viertelnote)');
  if (p) header.push('Berechnete Note (Punkte)');
  if (q) header.push('Endnote (Viertelnote)');
  if (p) header.push('Endnote (Punkte)');
  header.push('Nachgeschärft', 'Vollständig bewertet');
  const rows = list.map((r) => {
    const row = [r.name, r.klasse, r.datum, ...ROW_KEYS.map((k) => r.rowText[k]), r.proposalDecimal];
    if (q) row.push(r.proposalQuarter);
    if (p) row.push(r.proposalPoints);
    if (q) row.push(r.finalQuarter);
    if (p) row.push(r.finalPoints);
    row.push(r.adjusted ? 'ja' : 'nein', r.complete ? 'ja' : 'nein');
    return row;
  });
  return { header, rows };
}

/** Lesbare Darstellung einer Gewichtung, z. B. „Qualität 50 % · Fachwissen 25 % · Fachsprache 25 %“. */
export function weightsText(weights) {
  const w = normalizeWeights(weights);
  return CRITERIA.map((c) => `${c.short} ${formatDecimal(w[c.key] * 100, 1, true)} %`).join(', ');
}
