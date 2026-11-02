/**
 * TardiGrader – mündliche Noten Biologie
 * Hauptmodul: Zustand, Navigation und alle Bildschirme.
 */
import * as db from './db.js';
import {
  ROW_KEYS, DEFAULT_WEIGHTS, evaluate, describeGrade, adjustGrade, formatDecimal, normalizeWeights,
} from './grades.js';
import {
  CRITERIA, TEACHER_HEADERS, DEFINITIONS, GRADE_NAMES, TEACHER_DEFINITION_LABEL, FOOTNOTE_TEXT, FOOTNOTE_URL, plain,
} from './rubric.js';
import { analyzeNameText, extractNames, splitName, nameKey, buildCSV } from './csv.js';
import {
  buildSheet, buildGradeList, gradeListTable, studentName, compareStudents, todayISO, formatDate, klasseOf, weightsText,
} from './sheet-data.js';
import {
  h, rich, richParas, icon, toast, openDialog, confirmDialog, promptDialog, offerFile, safeFileName, debounce, uid,
} from './ui.js';
import { openPrintView, buildSheetPages, buildListPages } from './print.js';
import { sheetsToDocxBlob } from './docx-export.js';

export const APP_VERSION = '1.1.0';

/**
 * Weiche Trennstellen für lange Wörter – nur für die Anzeige im Raster, damit
 * schmale Spalten (Hochformat) sauber umbrechen. Der Wortlaut bleibt unverändert.
 */
const DISPLAY_HYPHENS = [
  'Zusammen|hänge', 'fächer|über|greifend', 'Sach|verhalte', 'Unterrichts|einheiten', 'Jahrgangs|stufen',
  'nach|vollzieh|bar', 'Basis|wissen', 'Selbst|ständiges', 'selbst|ständiger', 'experi|menteller',
  'weiter|führender', 'Über|prüfung', 'reprodu|zierbar', 'repro|duktiv', 'Hilfe|stellung', 'Formu|lierung',
  'Fach|sprache', 'Fach|wissen', 'Ver|ständnis', 'Experi|mente', 'Hypo|thesen', 'Ver|netzung', 'behan|delten',
  'Eigen|ständige', 'Grund|zügen', 'anwend|bar', 'abruf|bar', 'Einord|nung', 'erkenn|bar', 'ersicht|lich',
  'Anwen|dung', 'Gedan|ken', 'Verwen|dung', 'aktuel|len', 'aktu|ell', 'weitge|hend', 'verständ|lich',
];

function displayHyphenate(text) {
  let t = text;
  for (const w of DISPLAY_HYPHENS) t = t.split(w.replace(/\|/g, '')).join(w.replace(/\|/g, '\u00AD'));
  return t;
}

const DEFAULT_SETTINGS = {
  weights: { ...DEFAULT_WEIGHTS },
  scale: 'quarter', // Standard für neue Lerngruppen: 'quarter' | 'points' | 'both'
  stepBoth: 'quarter', // Standard-Schrittweite beim Nachschärfen, wenn beide Skalen angezeigt werden
  nameOrder: 'last-first', // Anzeige in Listen
  theme: 'auto',
  lastBackupAt: null,
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  groups: [],
  rounds: [],
  assessments: new Map(),
  exportSelection: new Map(), // roundId → Set(studentId)
  navDirection: 0,
};

const app = document.getElementById('app');

// ===========================================================================
// Daten laden & speichern
// ===========================================================================

async function loadAll() {
  const [meta, groups, rounds, assessments] = await Promise.all([
    db.getAll('meta'), db.getAll('groups'), db.getAll('rounds'), db.getAll('assessments'),
  ]);
  const s = meta.find((m) => m.key === 'settings');
  state.settings = { ...DEFAULT_SETTINGS, ...(s ? s.value : {}) };
  state.settings.weights = { ...DEFAULT_WEIGHTS, ...(state.settings.weights || {}) };
  state.groups = groups.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { numeric: true }));
  state.rounds = rounds;
  state.assessments = new Map(assessments.map((a) => [a.id, a]));
  // Ab Version 1.1 hat jede Lerngruppe ihre eigene Notenskala. Ältere Gruppen
  // übernehmen einmalig die bisher zentral eingestellte Skala.
  const migrate = state.groups.filter((g) => !SCALES.includes(g.scale));
  for (const g of migrate) {
    g.scale = state.settings.scale;
    g.stepBoth = state.settings.stepBoth;
  }
  if (migrate.length) await db.batch(migrate.map((g) => ({ store: 'groups', put: g })));
  applyTheme();
}

function saveSettings() {
  return db.put('meta', { key: 'settings', value: state.settings });
}

function saveGroup(g) {
  g.updatedAt = new Date().toISOString();
  if (!state.groups.includes(g)) state.groups.push(g);
  return db.put('groups', g);
}

function saveRound(r) {
  if (!state.rounds.includes(r)) state.rounds.push(r);
  return db.put('rounds', r);
}

function saveAssessment(a) {
  a.updatedAt = new Date().toISOString();
  a.proposal = evaluate(a).proposal; // Vorschlag zusätzlich speichern (getrennt von der Endnote)
  state.assessments.set(a.id, a);
  return db.put('assessments', a);
}

const getGroup = (id) => state.groups.find((g) => g.id === id);
const roundsOf = (gid) => state.rounds.filter((r) => r.groupId === gid).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
const sortedStudents = (g) => [...(g.students || [])].sort(compareStudents);
const countLabel = (n) => `${n} ${n === 1 ? 'Schüler:in' : 'Schüler:innen'}`;
const assessmentId = (roundId, studentId) => `${roundId}:${studentId}`;
const getAssessment = (roundId, studentId) => state.assessments.get(assessmentId(roundId, studentId)) || null;

function currentRound(g) {
  let r = state.rounds.find((x) => x.id === g.currentRoundId && x.groupId === g.id);
  if (!r) r = roundsOf(g.id)[0] || null;
  return r;
}

function defaultRoundTitle(gid) {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  let t = m >= 8 ? `1. Halbjahr ${y}/${String(y + 1).slice(2)}` : m === 1 ? `1. Halbjahr ${y - 1}/${String(y).slice(2)}` : `2. Halbjahr ${y - 1}/${String(y).slice(2)}`;
  const existing = new Set(roundsOf(gid).map((r) => r.title));
  if (existing.has(t)) {
    let n = 2;
    while (existing.has(`${t} (${n})`)) n++;
    t = `${t} (${n})`;
  }
  return t;
}

async function createRound(g, title) {
  const r = { id: uid('r'), groupId: g.id, title: title || defaultRoundTitle(g.id), createdAt: new Date().toISOString() };
  await saveRound(r);
  g.currentRoundId = r.id;
  await saveGroup(g);
  return r;
}

async function ensureRound(g) {
  return currentRound(g) || createRound(g);
}

function statusOf(a) {
  if (!a) return 'open';
  const ev = evaluate(a);
  if (ev.complete) return 'done';
  return ROW_KEYS.some((k) => ev.rows[k] !== null) ? 'partial' : 'open';
}

const SCALES = ['quarter', 'points', 'both'];
const SCALE_LABELS = { quarter: 'Viertelnoten', points: 'Notenpunkte', both: 'Viertelnoten und Notenpunkte' };

/** Notenskala einer Lerngruppe (Anzeige und Export). */
function displayScale(g) {
  return g && SCALES.includes(g.scale) ? g.scale : state.settings.scale;
}

/** Schrittweite beim Nachschärfen in dieser Lerngruppe. */
function stepScale(g) {
  const s = displayScale(g);
  if (s !== 'both') return s;
  return g && (g.stepBoth === 'quarter' || g.stepBoth === 'points') ? g.stepBoth : state.settings.stepBoth;
}

/**
 * Auswahl „Notenskala“ (+ Schrittweite bei „Beides“) für ein Objekt mit
 * den Feldern scale und stepBoth – Lerngruppe oder Einstellungen.
 */
function scaleControls(target, onChange) {
  const box = h('div');
  function seg(key, options) {
    const el = h('div', { class: 'seg', role: 'group' });
    for (const [v, label] of options) {
      el.append(h('button', { type: 'button', 'aria-pressed': String(target[key] === v), onclick: async () => {
        target[key] = v;
        build();
        if (onChange) await onChange(key, v);
      } }, label));
    }
    return el;
  }
  function build() {
    const parts = [seg('scale', [['quarter', 'Viertelnoten'], ['points', 'Notenpunkte'], ['both', 'Beides']])];
    if (target.scale === 'both') {
      parts.push(h('div', { class: 'field', style: { marginTop: '12px', marginBottom: 0 } },
        h('span', null, 'Nachschärfen in Schritten von'),
        seg('stepBoth', [['quarter', 'einer Viertelnote'], ['points', 'einem Punkt']])));
    }
    box.replaceChildren(...parts);
  }
  if (!SCALES.includes(target.scale)) target.scale = state.settings.scale;
  if (target.stepBoth !== 'quarter' && target.stepBoth !== 'points') target.stepBoth = state.settings.stepBoth;
  build();
  return box;
}

function nameFor(s) {
  return studentName(s, state.settings.nameOrder);
}

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ===========================================================================
// Navigation
// ===========================================================================

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return parts;
}

function go(path, { replace = false } = {}) {
  const url = `#/${path}`;
  if (replace) location.replace(url);
  else location.hash = url;
}

let cleanupView = null;

async function render() {
  if (cleanupView) {
    try { cleanupView(); } catch { /* ignorieren */ }
    cleanupView = null;
  }
  const [a, b, c, d] = route();
  try {
    if (!a) return renderHome();
    if (a === 'einstellungen') return renderSettings();
    if (a === 'gruppe' && b) {
      const g = getGroup(b);
      if (!g) return go('', { replace: true });
      if (!c) return await renderGroup(g);
      if (c === 'namen') return renderGroupEdit(g);
      if (c === 'export') return await renderExport(g);
      if (c === 'bewerten' && d) return await renderRate(g, d);
    }
    go('', { replace: true });
  } catch (err) {
    console.error(err);
    app.replaceChildren(h('main', { class: 'main' }, h('div', { class: 'empty' }, h('h2', null, 'Diese Ansicht ließ sich nicht öffnen'), h('p', null, String(err && err.message ? err.message : err)), h('a', { class: 'btn', href: '#/' }, 'Zur Startseite'))));
  }
}

function topbar({ back, title, subtitle, actions = [], brand = false }) {
  return h('header', { class: 'topbar' },
    back ? h('a', { class: 'btn btn--icon btn--ghost', href: back, 'aria-label': 'Zurück' }, icon('back')) : null,
    brand
      ? h('div', { class: 'brand topbar__title' }, h('div', { class: 'brand' }, h('img', { src: 'icons/icon.svg', alt: '' }), h('b', null, 'Tardi', h('span', null, 'Grader'))))
      : h('div', { class: 'topbar__title' }, h('h1', null, title), subtitle ? h('small', null, subtitle) : null),
    ...actions,
  );
}

function view(...children) {
  app.replaceChildren(...children);
}

// ===========================================================================
// Startseite: Lerngruppen
// ===========================================================================

function renderHome() {
  document.title = 'TardiGrader';
  const groups = state.groups;
  const main = h('main', { class: 'main' });

  const lastBackup = state.settings.lastBackupAt ? new Date(state.settings.lastBackupAt) : null;
  const hasData = state.assessments.size > 0;
  if (hasData && (!lastBackup || Date.now() - lastBackup.getTime() > 14 * 864e5)) {
    main.append(h('div', { class: 'notice' },
      h('p', null, lastBackup ? `Letztes Backup am ${formatDate(todayISO(lastBackup))}. Sichere deine Noten regelmäßig als Datei.` : 'Noch kein Backup. Sichere deine Noten als Datei, damit sie bei Geräteverlust nicht verloren gehen.'),
      h('button', { class: 'btn', type: 'button', onclick: exportBackup }, icon('download'), 'Backup sichern')));
  }

  if (!groups.length) {
    main.append(h('div', { class: 'empty' },
      h('img', { src: 'icons/icon.svg', alt: '' }),
      h('h2', null, 'Lege deine erste Lerngruppe an'),
      h('p', null, 'Namen per CSV-Datei, eingefügter Liste oder einzeln eintragen. Danach tippst du im Raster an, was zutrifft – die Note rechnet TardiGrader aus.'),
      h('div', { class: 'btn-group', style: { justifyContent: 'center' } },
        h('button', { class: 'btn btn--primary btn--big', type: 'button', onclick: newGroupDialog }, icon('plus'), 'Neue Lerngruppe'),
        h('button', { class: 'btn btn--big', type: 'button', onclick: createDemoGroup }, 'Beispielgruppe ausprobieren'))));
  } else {
    const list = h('div', { class: 'group-list' });
    for (const g of groups) {
      const r = currentRound(g);
      const students = g.students || [];
      const done = r ? students.filter((s) => statusOf(getAssessment(r.id, s.id)) === 'done').length : 0;
      const pct = students.length ? Math.round((done / students.length) * 100) : 0;
      list.append(h('a', { class: 'group-item', href: `#/gruppe/${g.id}` },
        h('span', { class: 'group-item__name' }, g.name || 'Ohne Namen'),
        g.klasse ? h('span', { class: 'group-item__klasse' }, g.klasse) : h('span'),
        h('span', { class: 'group-item__meta' }, `${countLabel(students.length)}${r ? ` · ${r.title} · ${done} von ${students.length} bewertet` : ''}`),
        h('span', { class: 'progress', 'aria-hidden': 'true' }, h('i', { style: { width: `${pct}%` } }))));
    }
    main.append(h('section', { class: 'section' },
      h('div', { class: 'row', style: { marginBottom: '12px' } }, h('h2', { class: 'h2', style: { margin: 0 } }, 'Lerngruppen'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--primary', type: 'button', onclick: newGroupDialog }, icon('plus'), 'Neue Lerngruppe')),
      list));
  }
  main.append(h('p', { class: 'muted small', style: { textAlign: 'center', marginTop: '36px' } }, `Alle Daten bleiben auf diesem Gerät. TardiGrader ${APP_VERSION}`));

  view(topbar({
    brand: true,
    actions: [h('a', { class: 'btn btn--icon btn--ghost', href: '#/einstellungen', 'aria-label': 'Einstellungen' }, icon('gear'))],
  }), main);
}

function newGroupDialog() {
  const name = h('input', { class: 'input', type: 'text', placeholder: 'z. B. Bio 8b', autocomplete: 'off' });
  const klasse = h('input', { class: 'input', type: 'text', placeholder: 'z. B. 8b', autocomplete: 'off' });
  const choice = { scale: state.settings.scale, stepBoth: state.settings.stepBoth };
  openDialog({
    title: 'Neue Lerngruppe',
    body: [
      h('label', { class: 'field' }, h('span', null, 'Name der Lerngruppe'), name),
      h('label', { class: 'field' }, h('span', null, 'Klasse (erscheint auf dem Schülerbogen)'), klasse),
      h('div', { class: 'field' }, h('span', null, 'Notenskala'), scaleControls(choice)),
    ],
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Anlegen',
        kind: 'primary',
        onClick: async () => {
          const n = name.value.trim() || klasse.value.trim();
          if (!n) {
            name.focus();
            toast('Bitte einen Namen eintragen.');
            return false;
          }
          const g = { id: uid('g'), name: n, klasse: klasse.value.trim(), scale: choice.scale, stepBoth: choice.stepBoth, students: [], createdAt: new Date().toISOString() };
          await saveGroup(g);
          await createRound(g);
          go(`gruppe/${g.id}/namen`);
          return true;
        },
      },
    ],
  });
  setTimeout(() => name.focus(), 50);
}

async function createDemoGroup() {
  const names = ['Anna Müller', 'Ben Özdemir', 'Clara von Berg', 'David Nguyen', 'Emma Schulz', 'Finn Weber', 'Greta Hoffmann', 'Hamza Yılmaz', 'Ida Koch', 'Jonas Wagner', 'Lea Fischer', 'Mia Becker'];
  const g = {
    id: uid('g'),
    name: 'Beispiel Bio 8b',
    klasse: '8b',
    scale: state.settings.scale,
    stepBoth: state.settings.stepBoth,
    students: names.map((n) => ({ id: uid('s'), ...splitName(n, 'first-last') })),
    createdAt: new Date().toISOString(),
  };
  await saveGroup(g);
  const r = await createRound(g);
  // drei Beispielbewertungen
  const st = sortedStudents(g);
  const demo = [[[2], [2, 3], [1]], [[4], [4], [3, 4]], [[1], [1], [2]]];
  for (let i = 0; i < demo.length; i++) {
    const a = newAssessment(r, st[i]);
    ROW_KEYS.forEach((k, j) => { a.rows[k].cols = demo[i][j]; });
    await saveAssessment(a);
  }
  go(`gruppe/${g.id}`);
}

// ===========================================================================
// Lerngruppe: Übersicht
// ===========================================================================

async function renderGroup(g) {
  const r = await ensureRound(g);
  document.title = `${g.name} – TardiGrader`;
  const students = sortedStudents(g);
  const rounds = roundsOf(g.id);

  const roundSelect = h('select', { class: 'input', 'aria-label': 'Bewertungsrunde' },
    rounds.map((x) => h('option', { value: x.id, selected: x.id === r.id }, x.title)));
  roundSelect.addEventListener('change', async () => {
    g.currentRoundId = roundSelect.value;
    await saveGroup(g);
    render();
  });

  const counts = { done: 0, partial: 0, open: 0 };
  const grades = [];
  for (const s of students) {
    const a = getAssessment(r.id, s.id);
    const st = statusOf(a);
    counts[st]++;
    if (st === 'done') grades.push(evaluate(a).effective);
  }
  const avg = grades.length ? grades.reduce((x, y) => x + y, 0) / grades.length : null;
  const firstOpen = students.find((s) => statusOf(getAssessment(r.id, s.id)) !== 'done') || students[0];

  const main = h('main', { class: 'main' },
    h('div', { class: 'round-bar' },
      h('span', { class: 'label' }, 'Bewertungsrunde'),
      roundSelect,
      h('button', { class: 'btn', type: 'button', onclick: async () => { await createRound(g); toast('Neue Runde angelegt.'); render(); } }, icon('plus'), 'Neue Runde'),
      h('button', { class: 'btn btn--icon', type: 'button', 'aria-label': 'Runde umbenennen', onclick: async () => {
        const t = await promptDialog({ title: 'Runde umbenennen', label: 'Bezeichnung', value: r.title });
        if (t) { r.title = t; await saveRound(r); render(); }
      } }, icon('edit')),
      rounds.length > 1 ? h('button', { class: 'btn btn--icon btn--danger', type: 'button', 'aria-label': 'Runde löschen', onclick: () => deleteRound(g, r) }, icon('trash')) : null),
  );

  if (!students.length) {
    main.append(h('div', { class: 'empty' },
      h('h2', null, 'Noch keine Namen in dieser Lerngruppe'),
      h('p', null, 'Füge Namen per CSV-Datei, eingefügter Liste oder einzeln hinzu.'),
      h('a', { class: 'btn btn--primary btn--big', href: `#/gruppe/${g.id}/namen` }, icon('users'), 'Namen hinzufügen')));
  } else {
    main.append(
      h('div', { class: 'row', style: { marginBottom: '14px' } },
        h('p', { class: 'stats', style: { margin: 0 } },
          h('span', null, h('b', null, counts.done), ' bewertet'),
          h('span', null, h('b', null, counts.partial), ' angefangen'),
          h('span', null, h('b', null, counts.open), ' offen'),
          avg !== null ? h('span', null, 'Durchschnitt ', h('b', null, formatDecimal(avg, 2))) : null),
        h('span', { class: 'spacer' }),
        h('a', { class: 'btn btn--primary btn--big', href: `#/gruppe/${g.id}/bewerten/${firstOpen.id}` }, counts.done === students.length ? 'Bewertungen ansehen' : counts.done || counts.partial ? 'Weiter bewerten' : 'Bewertung starten')),
      studentGrid(g, r, students),
    );
  }

  view(topbar({
    back: '#/',
    title: g.name,
    subtitle: `${g.klasse ? `Klasse ${g.klasse} · ` : ''}${countLabel(students.length)} · ${SCALE_LABELS[displayScale(g)]}`,
    actions: [
      h('a', { class: 'btn', href: `#/gruppe/${g.id}/namen` }, icon('users'), h('span', null, 'Namen')),
      h('a', { class: 'btn btn--primary', href: `#/gruppe/${g.id}/export` }, icon('share'), h('span', null, 'Export')),
    ],
  }), main);
}

function studentGrid(g, r, students, currentId = null, onPick = null) {
  const list = h('div', { class: currentId !== null ? 'quick-list' : 'student-list' });
  for (const s of students) {
    const a = getAssessment(r.id, s.id);
    const st = statusOf(a);
    const ev = evaluate(a || {});
    const grade = ev.effective !== null ? describeGrade(ev.effective, displayScale(g)).short : '–';
    const rowsTxt = a && st !== 'open' ? CRITERIA.map((c) => (ev.rows[c.key] === null ? '–' : formatDecimal(ev.rows[c.key], 2, true))).join(' · ') : 'noch nicht bewertet';
    const label = { done: 'bewertet', partial: 'angefangen', open: 'offen' }[st];
    const item = h(onPick ? 'button' : 'a', {
      class: `student-item${s.id === currentId ? ' is-current' : ''}`,
      href: onPick ? undefined : `#/gruppe/${g.id}/bewerten/${s.id}`,
      type: onPick ? 'button' : undefined,
      'aria-label': `${nameFor(s)}, ${label}${ev.effective !== null ? `, Note ${grade}` : ''}`,
    },
    h('span', { class: `dot dot--${st}`, 'aria-hidden': 'true' }),
    h('span', { class: 'student-item__name' }, nameFor(s), currentId === null ? h('span', { class: 'student-item__rows' }, rowsTxt) : null),
    h('span', { class: 'student-item__grade' }, grade, ev.adjusted ? h('small', null, 'nachgeschärft') : null));
    if (onPick) item.addEventListener('click', () => onPick(s));
    list.append(item);
  }
  return list;
}

async function deleteRound(g, r) {
  const n = [...state.assessments.values()].filter((a) => a.roundId === r.id).length;
  const ok = await confirmDialog(`„${r.title}“ mit ${n} Bewertungen löschen? Das lässt sich nicht rückgängig machen.`, { title: 'Runde löschen', ok: 'Runde löschen', danger: true });
  if (!ok) return;
  const ops = [{ store: 'rounds', del: r.id }];
  for (const a of state.assessments.values()) {
    if (a.roundId === r.id) {
      ops.push({ store: 'assessments', del: a.id });
      state.assessments.delete(a.id);
    }
  }
  await db.batch(ops);
  state.rounds = state.rounds.filter((x) => x.id !== r.id);
  g.currentRoundId = (roundsOf(g.id)[0] || {}).id || null;
  await saveGroup(g);
  toast('Runde gelöscht.');
  render();
}

// ===========================================================================
// Lerngruppe bearbeiten: Namen
// ===========================================================================

function renderGroupEdit(g) {
  document.title = `Namen – ${g.name}`;
  let mode = 'single';

  const nameIn = h('input', { class: 'input', type: 'text', value: g.name || '', autocomplete: 'off' });
  const klasseIn = h('input', { class: 'input', type: 'text', value: g.klasse || '', autocomplete: 'off' });
  const saveMeta = debounce(async () => {
    g.name = nameIn.value.trim() || g.name;
    g.klasse = klasseIn.value.trim();
    await saveGroup(g);
  }, 400);
  nameIn.addEventListener('input', saveMeta);
  klasseIn.addEventListener('input', saveMeta);
  cleanupView = () => saveMeta.flush();

  // --- Namen hinzufügen ---
  const single = h('input', { class: 'input', type: 'text', placeholder: 'z. B. Anna Müller oder Müller, Anna', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'enter' });
  const addSingle = async () => {
    const raw = single.value.trim();
    if (!raw) return;
    single.value = ''; // sofort leeren, damit der nächste Name direkt eingegeben werden kann
    single.focus();
    const n = splitName(raw, 'first-last');
    const added = await addStudents(g, [n]);
    if (added) {
      toast(`${studentName(n)} hinzugefügt.`, { duration: 1500 });
      refreshList();
    } else {
      toast('Dieser Name steht schon in der Liste.');
    }
  };
  single.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSingle();
    }
  });

  const paste = h('textarea', { class: 'input', rows: 8, placeholder: 'Ein Name pro Zeile, z. B.\nAnna Müller\nMüller, Anna\n(auch direkt aus Excel kopiert)' });
  const file = h('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain', class: 'visually-hidden', id: 'csv-file' });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const text = await readTextFile(f);
    file.value = '';
    importDialog(g, text, f.name, refreshList);
  });

  const panes = {
    single: h('div', { class: 'add-name' }, single, h('button', { class: 'btn btn--primary', type: 'button', onclick: addSingle }, icon('plus'), 'Hinzufügen')),
    paste: h('div', null, paste, h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => {
        if (!paste.value.trim()) { toast('Bitte zuerst Namen einfügen.'); return; }
        importDialog(g, paste.value, 'Eingefügte Liste', () => { paste.value = ''; refreshList(); });
      } }, 'Vorschau & übernehmen'))),
    csv: h('div', null,
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'CSV-Datei z. B. aus der Schulverwaltung oder Excel. Komma oder Semikolon, Nachname/Vorname getrennt oder in einer Spalte – die Spalten kannst du in der Vorschau anpassen.'),
      h('label', { class: 'btn btn--primary', for: 'csv-file' }, icon('file'), 'CSV-Datei wählen'), file),
  };
  const paneBox = h('div', { style: { marginTop: '12px' } }, panes.single);
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Eingabeart' });
  for (const [key, label] of [['single', 'Einzeln'], ['paste', 'Liste einfügen'], ['csv', 'CSV-Datei']]) {
    seg.append(h('button', { type: 'button', 'aria-pressed': String(key === mode), onclick: (e) => {
      mode = key;
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      e.currentTarget.setAttribute('aria-pressed', 'true');
      paneBox.replaceChildren(panes[key]);
    } }, label));
  }

  // --- Liste der Namen ---
  const listBox = h('div', { class: 'name-rows' });
  const countEl = h('span', { class: 'muted' });
  function refreshList() {
    const st = sortedStudents(g);
    countEl.textContent = ` (${st.length})`;
    listBox.replaceChildren(...(st.length
      ? [h('div', { class: 'name-row name-row--head', 'aria-hidden': 'true' }, h('span', null, 'Nachname'), h('span', null, 'Vorname'), h('span')), ...st.map((s) => nameRow(g, s, refreshList))]
      : [h('p', { class: 'muted' }, 'Noch keine Namen.')]));
  }
  refreshList();

  const main = h('main', { class: 'main' },
    h('section', { class: 'section panel' },
      h('div', { class: 'map-grid map-grid--wide' },
        h('label', { class: 'field' }, h('span', null, 'Name der Lerngruppe'), nameIn),
        h('label', { class: 'field' }, h('span', null, 'Klasse (für Schülerbogen und Notenliste)'), klasseIn)),
      h('div', { class: 'field', style: { marginBottom: 0 } },
        h('span', null, 'Notenskala dieser Lerngruppe (Anzeige, Nachschärfen und Export)'),
        scaleControls(g, async (key) => {
          await saveGroup(g);
          if (key === 'scale') toast(`Notenskala: ${SCALE_LABELS[displayScale(g)]}`, { duration: 1500 });
        }),
        h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, 'Ein Wechsel wirkt sofort auf alle Runden dieser Lerngruppe. Nachgeschärfte Endnoten bleiben erhalten und werden in die neue Skala umgerechnet.'))),
    h('section', { class: 'section' }, h('h2', null, 'Namen hinzufügen'), seg, paneBox),
    h('section', { class: 'section' }, h('h2', null, 'Schüler:innen', countEl), listBox),
    h('section', { class: 'section' },
      h('button', { class: 'btn btn--danger', type: 'button', onclick: () => deleteGroup(g) }, icon('trash'), 'Lerngruppe löschen')),
  );

  view(topbar({
    back: `#/gruppe/${g.id}`,
    title: 'Namen & Lerngruppe',
    subtitle: g.name,
    actions: [h('a', { class: 'btn btn--primary', href: `#/gruppe/${g.id}` }, 'Fertig')],
  }), main);
}

function nameRow(g, s, refresh) {
  const first = h('input', { class: 'input', type: 'text', value: s.firstName || '', 'aria-label': `Vorname von ${studentName(s)}`, placeholder: 'Vorname', autocomplete: 'off' });
  const last = h('input', { class: 'input', type: 'text', value: s.lastName || '', 'aria-label': `Nachname von ${studentName(s)}`, placeholder: 'Nachname', autocomplete: 'off' });
  const save = debounce(async () => {
    s.firstName = first.value.trim();
    s.lastName = last.value.trim();
    await saveGroup(g);
  }, 400);
  first.addEventListener('input', save);
  last.addEventListener('input', save);
  first.addEventListener('blur', () => save.flush());
  last.addEventListener('blur', () => save.flush());
  const del = h('button', { class: 'btn btn--icon btn--danger', type: 'button', 'aria-label': `${studentName(s)} entfernen`, onclick: async () => {
    const has = [...state.assessments.values()].some((a) => a.groupId === g.id && a.studentId === s.id);
    const ok = await confirmDialog(`${studentName(s)} aus der Lerngruppe entfernen?${has ? ' Vorhandene Bewertungen werden ebenfalls gelöscht.' : ''}`, { title: 'Namen entfernen', ok: 'Entfernen', danger: true });
    if (!ok) return;
    g.students = g.students.filter((x) => x.id !== s.id);
    const ops = [];
    for (const a of state.assessments.values()) {
      if (a.groupId === g.id && a.studentId === s.id) {
        ops.push({ store: 'assessments', del: a.id });
        state.assessments.delete(a.id);
      }
    }
    if (ops.length) await db.batch(ops);
    await saveGroup(g);
    refresh();
  } }, icon('trash'));
  return h('div', { class: 'name-row' }, last, first, del);
}

async function addStudents(g, names) {
  const keys = new Set((g.students || []).map(nameKey));
  let n = 0;
  for (const x of names) {
    const s = { id: uid('s'), firstName: (x.firstName || '').trim(), lastName: (x.lastName || '').trim() };
    if (!s.firstName && !s.lastName) continue;
    const k = nameKey(s);
    if (keys.has(k)) continue;
    keys.add(k);
    g.students = [...(g.students || []), s];
    n++;
  }
  if (n) await saveGroup(g);
  return n;
}

async function readTextFile(f) {
  const buf = await f.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('\uFFFD')) {
    // Ältere Excel-Exporte sind oft Windows-1252 kodiert
    try { text = new TextDecoder('windows-1252').decode(buf); } catch { /* bleibt UTF-8 */ }
  }
  return text;
}

function importDialog(g, text, sourceName, onDone) {
  const analysis = analyzeNameText(text);
  const { rows, delim } = analysis;
  const mapping = { ...analysis.mapping };
  if (!rows.length) {
    toast('In der Datei wurden keine Namen gefunden.');
    return;
  }
  const width = Math.max(...rows.map((r) => r.length));
  const existing = new Set((g.students || []).map(nameKey));
  const delimName = { ';': 'Semikolon', ',': 'Komma', '\t': 'Tabulator' }[delim] || 'keines (ein Name pro Zeile)';

  const colLabel = (i) => {
    const head = mapping.hasHeader ? rows[0][i] : '';
    const sample = (mapping.hasHeader ? rows[1] : rows[0]) || [];
    return `Spalte ${i + 1}${head ? ` – ${head}` : sample[i] ? ` (z. B. ${sample[i]})` : ''}`;
  };
  const colSelect = (key) => {
    const sel = h('select', { class: 'input' }, Array.from({ length: width }, (_, i) => h('option', { value: i, selected: mapping[key] === i }, colLabel(i))));
    sel.addEventListener('change', () => { mapping[key] = Number(sel.value); update(); });
    return sel;
  };

  const headerCb = h('input', { type: 'checkbox', checked: mapping.hasHeader });
  headerCb.addEventListener('change', () => { mapping.hasHeader = headerCb.checked; rebuildControls(); update(); });

  const controls = h('div');
  const previewBox = h('div', { style: { maxHeight: '42vh', overflow: 'auto', marginTop: '6px' } });
  const summary = h('p', { class: 'muted small' });
  let klasseCb = null;
  let names = [];
  let okBtn = null;

  function segOf(options, value, onChange) {
    const seg = h('div', { class: 'seg' });
    for (const [v, label] of options) {
      seg.append(h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => { onChange(v); rebuildControls(); update(); } }, label));
    }
    return seg;
  }

  function rebuildControls() {
    const parts = [
      h('label', { class: 'check' }, headerCb, 'Erste Zeile ist eine Kopfzeile'),
    ];
    if (width > 1) {
      parts.push(h('div', { class: 'field' }, h('span', null, 'Namen stehen'),
        segOf([['split', 'in zwei Spalten (Nachname / Vorname)'], ['combined', 'in einer Spalte']], mapping.mode, (v) => {
          mapping.mode = v;
          if (v === 'split' && (mapping.last < 0 || mapping.first < 0)) { mapping.last = 0; mapping.first = Math.min(1, width - 1); }
          if (v === 'combined' && mapping.full < 0) mapping.full = 0;
        })));
    }
    if (mapping.mode === 'split') {
      parts.push(h('div', { class: 'map-grid' },
        h('label', { class: 'field' }, h('span', null, 'Nachname'), colSelect('last')),
        h('label', { class: 'field' }, h('span', null, 'Vorname'), colSelect('first'))));
    } else {
      if (width > 1) parts.push(h('label', { class: 'field' }, h('span', null, 'Spalte mit dem Namen'), colSelect('full')));
      parts.push(h('div', { class: 'field' }, h('span', null, 'Reihenfolge bei Namen ohne Komma'),
        segOf([['first-last', 'Vorname Nachname'], ['last-first', 'Nachname Vorname']], mapping.order, (v) => { mapping.order = v; })),
      h('p', { class: 'muted small', style: { marginTop: '-6px' } }, 'Namen mit Komma werden immer als „Nachname, Vorname“ gelesen.'));
    }
    controls.replaceChildren(...parts);
  }

  function update() {
    names = extractNames(rows, mapping);
    const seen = new Set(existing);
    const trs = names.map((n) => {
      const k = nameKey(n);
      const dup = seen.has(k);
      seen.add(k);
      n.dup = dup;
      return h('tr', { class: dup ? 'is-dup' : '' }, h('td', null, n.lastName), h('td', null, n.firstName), h('td', { class: 'muted small' }, dup ? 'schon vorhanden' : ''));
    });
    previewBox.replaceChildren(h('table', { class: 'preview-table' },
      h('thead', null, h('tr', null, h('th', null, 'Nachname'), h('th', null, 'Vorname'), h('th', null, ''))),
      h('tbody', null, trs)));
    const fresh = names.filter((n) => !n.dup).length;
    summary.textContent = `Erkannt: Trennzeichen ${delimName}${mapping.hasHeader ? ', mit Kopfzeile' : ''}. ${names.length} Namen, davon ${fresh} neu.`;
    if (okBtn) {
      okBtn.textContent = fresh ? `${fresh} ${fresh === 1 ? 'Namen' : 'Namen'} übernehmen` : 'Keine neuen Namen';
      okBtn.disabled = !fresh;
    }
    const klassen = [...new Set(names.map((n) => n.klasse).filter(Boolean))];
    if (klassen.length === 1 && !g.klasse && !klasseCb) {
      klasseCb = h('input', { type: 'checkbox', checked: true, dataset: { klasse: klassen[0] } });
      controls.after(h('label', { class: 'check' }, klasseCb, `Klasse „${klassen[0]}“ für die Lerngruppe übernehmen`));
    }
  }

  rebuildControls();
  const { dlg } = openDialog({
    title: `Namen übernehmen: ${sourceName}`,
    wide: true,
    body: [summary, controls, previewBox],
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Übernehmen',
        kind: 'primary',
        onClick: async () => {
          const n = await addStudents(g, names.filter((x) => !x.dup));
          if (klasseCb && klasseCb.checked) {
            g.klasse = klasseCb.dataset.klasse;
            await saveGroup(g);
          }
          toast(`${n} ${n === 1 ? 'Name' : 'Namen'} übernommen.`);
          if (onDone) onDone();
          if (klasseCb && klasseCb.checked) render();
        },
      },
    ],
  });
  okBtn = dlg.querySelector('.dlg__foot .btn--primary');
  update();
}

async function deleteGroup(g) {
  const ok = await confirmDialog(`„${g.name}“ mit allen Runden und Bewertungen löschen? Das lässt sich nicht rückgängig machen.`, { title: 'Lerngruppe löschen', ok: 'Endgültig löschen', danger: true });
  if (!ok) return;
  const ops = [{ store: 'groups', del: g.id }];
  for (const r of state.rounds.filter((x) => x.groupId === g.id)) ops.push({ store: 'rounds', del: r.id });
  for (const a of state.assessments.values()) {
    if (a.groupId === g.id) {
      ops.push({ store: 'assessments', del: a.id });
      state.assessments.delete(a.id);
    }
  }
  await db.batch(ops);
  state.groups = state.groups.filter((x) => x.id !== g.id);
  state.rounds = state.rounds.filter((x) => x.groupId !== g.id);
  toast('Lerngruppe gelöscht.');
  go('', { replace: true });
}

// ===========================================================================
// Bewerten
// ===========================================================================

function newAssessment(r, s) {
  return {
    id: assessmentId(r.id, s.id),
    roundId: r.id,
    groupId: r.groupId,
    studentId: s.id,
    date: todayISO(),
    rows: Object.fromEntries(ROW_KEYS.map((k) => [k, { cols: [], comment: '' }])),
    weights: { ...state.settings.weights }, // Gewichtung wird mit der Bewertung gespeichert
    proposal: null,
    final: null,
    finalScale: null,
    createdAt: new Date().toISOString(),
  };
}

async function renderRate(g, studentId) {
  const r = await ensureRound(g);
  const students = sortedStudents(g);
  const idx = students.findIndex((s) => s.id === studentId);
  if (idx < 0) return go(`gruppe/${g.id}`, { replace: true });
  const s = students[idx];
  document.title = `${nameFor(s)} – TardiGrader`;

  let a = getAssessment(r.id, s.id);
  const draft = a || newAssessment(r, s); // wird erst bei der ersten Eingabe gespeichert
  const persist = debounce(() => { saveAssessment(draft); }, 250);
  const ensure = () => {
    if (!a) {
      a = draft;
      state.assessments.set(a.id, a);
    }
    persist();
  };
  cleanupView = () => {
    persist.flush();
    document.removeEventListener('keydown', onKey);
  };

  const goTo = (i, dir) => {
    if (i < 0 || i >= students.length) return;
    persist.flush();
    state.navDirection = dir;
    go(`gruppe/${g.id}/bewerten/${students[i].id}`, { replace: true });
  };
  const prev = () => goTo(idx - 1, -1);
  const next = () => goTo(idx + 1, 1);

  // --- Kopf ---
  const dateIn = h('input', { class: 'input', type: 'date', value: draft.date || todayISO(), 'aria-label': 'Datum' });
  dateIn.addEventListener('change', () => { draft.date = dateIn.value || todayISO(); ensure(); });

  const weightsDiffer = a && JSON.stringify(normalizeWeights(a.weights)) !== JSON.stringify(normalizeWeights(state.settings.weights));
  const head = h('div', { class: 'rate-head' },
    h('div', { class: 'meta' },
      h('span', null, `Klasse ${klasseOf(g) || '–'}`),
      h('label', { class: 'row', style: { gap: '6px' } }, h('span', null, 'Datum'), dateIn),
      h('span', null, r.title)),
    h('span', { class: 'spacer' }),
    weightsDiffer ? h('span', { class: 'muted small' }, `Gewichtung dieser Bewertung: ${weightsText(a.weights)} `,
      h('button', { class: 'btn', type: 'button', style: { minHeight: '40px' }, onclick: () => {
        draft.weights = { ...state.settings.weights };
        ensure();
        persist.flush();
        render();
      } }, 'Aktuelle übernehmen')) : null);

  // --- Raster ---
  const gridHead = h('div', { class: 'grid-head', 'aria-hidden': 'true' },
    h('span', { class: 'grid-head__corner' }),
    TEACHER_HEADERS.map((t) => h('span', null, t)));

  const valueEls = {};
  const blocks = CRITERIA.map((c) => {
    const row = draft.rows[c.key];
    const valueEl = h('span', { class: 'crit__value' });
    valueEls[c.key] = valueEl;
    const cells = h('div', { class: 'crit__cells', role: 'group', 'aria-label': plain(c.teacherLabel) });
    c.cells.forEach((paras, i) => {
      const grade = i + 1;
      const btn = h('button', {
        class: 'cell',
        type: 'button',
        'aria-pressed': String(row.cols.includes(grade)),
        'aria-label': `${plain(c.teacherLabel)}, Note ${grade}: ${paras.map(plain).join(' ')}`,
      }, richParas(paras.map(displayHyphenate)));
      btn.addEventListener('click', () => {
        const set = new Set(row.cols);
        if (set.has(grade)) set.delete(grade);
        else set.add(grade);
        row.cols = [...set].sort((x, y) => x - y);
        btn.setAttribute('aria-pressed', String(set.has(grade)));
        ensure();
        updateNumbers();
      });
      cells.append(btn);
    });
    const comment = h('textarea', {
      class: 'input',
      rows: 2,
      placeholder: `Kommentar zu „${plain(c.studentLabel)}“ (optional)`,
      'aria-label': `Kommentar ${plain(c.studentLabel)}`,
    });
    comment.value = row.comment || '';
    const autoGrow = () => {
      comment.style.height = 'auto';
      comment.style.height = `${Math.max(52, comment.scrollHeight + 2)}px`;
    };
    comment.addEventListener('input', () => {
      row.comment = comment.value;
      autoGrow();
      ensure();
    });
    requestAnimationFrame(autoGrow);
    return h('section', { class: 'crit' },
      h('div', { class: 'crit__label' }, h('h2', null, rich(c.teacherLabel)), valueEl),
      cells,
      comment);
  });

  const defs = h('details', { class: 'definitions' },
    h('summary', null, 'Notendefinitionen nach §5 Notenbildungsverordnung'),
    h('div', { class: 'crit__cells' }, DEFINITIONS.map((d, i) => h('div', { class: 'def' }, h('p', { style: { margin: '0 0 4px' } }, rich(GRADE_NAMES[i])), h('p', { style: { margin: 0 } }, d)))),
    h('p', { class: 'footnote' }, `${plain(TEACHER_DEFINITION_LABEL)}: ${FOOTNOTE_TEXT.replace(/^\* /, '')}`, h('a', { href: FOOTNOTE_URL, target: '_blank', rel: 'noopener' }, FOOTNOTE_URL)));

  // --- Fußleiste ---
  const propBig = h('b');
  const propSmall = h('em');
  const finalBig = h('b');
  const finalSmall = h('small');
  const finalBox = h('div', { class: 'final__value', 'aria-live': 'polite' }, finalBig, finalSmall);
  const btnWorse = h('button', { class: 'btn', type: 'button', 'aria-label': 'Note verschlechtern' }, '−');
  const btnBetter = h('button', { class: 'btn', type: 'button', 'aria-label': 'Note verbessern' }, '+');
  const btnReset = h('button', { class: 'btn btn--icon', type: 'button', 'aria-label': 'Auf berechneten Wert zurücksetzen', title: 'Auf berechneten Wert zurücksetzen' }, icon('reset'));
  const step = stepScale(g);
  const adjust = (dir) => {
    const ev = evaluate(draft);
    if (ev.proposal === null) return;
    const nv = adjustGrade(ev.effective, step, dir);
    const same = describeGrade(nv, displayScale(g)).short === describeGrade(ev.proposal, displayScale(g)).short;
    draft.final = same ? null : nv;
    draft.finalScale = same ? null : step;
    ensure();
    updateNumbers();
  };
  btnBetter.addEventListener('click', () => adjust('better'));
  btnWorse.addEventListener('click', () => adjust('worse'));
  btnReset.addEventListener('click', () => {
    draft.final = null;
    draft.finalScale = null;
    ensure();
    updateNumbers();
  });

  function updateNumbers() {
    const ev = evaluate(draft);
    for (const c of CRITERIA) {
      const v = ev.rows[c.key];
      const w = normalizeWeights(draft.weights)[c.key];
      valueEls[c.key].replaceChildren(
        v === null ? 'nicht bewertet' : h('span', null, 'Zeilenwert ', h('b', null, formatDecimal(v, 2, true))),
        h('span', null, ` · ${formatDecimal(w * 100, 0)} %`));
    }
    const sc = displayScale(g);
    if (ev.proposal === null) {
      propBig.textContent = '–';
      propSmall.textContent = 'Zellen antippen';
      finalBig.textContent = '–';
      finalSmall.textContent = 'Endnote';
    } else {
      const p = describeGrade(ev.proposal, sc);
      propBig.textContent = sc === 'points' ? `${p.points} P` : p.quarter + (sc === 'both' ? ` / ${p.points} P` : '');
      propSmall.textContent = `${formatDecimal(ev.proposal, 2)}${ev.complete ? '' : ' · vorläufig'}`;
      const f = describeGrade(ev.effective, sc);
      finalBig.textContent = sc === 'points' ? String(f.points) : f.quarter;
      finalSmall.textContent = sc === 'points' ? `Punkte${ev.adjusted ? ' · nachgeschärft' : ''}` : sc === 'both' ? `${f.points} Punkte${ev.adjusted ? ' · nachgeschärft' : ''}` : ev.adjusted ? 'nachgeschärft' : 'Endnote';
    }
    finalBox.classList.toggle('is-adjusted', ev.adjusted);
    const none = ev.proposal === null;
    btnBetter.disabled = none;
    btnWorse.disabled = none;
    btnReset.disabled = !ev.adjusted;
  }

  const btnPrev = h('button', { class: 'btn btn--big', type: 'button', disabled: idx === 0, 'aria-label': 'Vorherige Person', onclick: prev }, icon('back'));
  const btnNext = h('button', { class: 'btn btn--primary btn--big', type: 'button', onclick: () => (idx === students.length - 1 ? go(`gruppe/${g.id}`) : next()) },
    idx === students.length - 1 ? 'Fertig' : 'Weiter', idx === students.length - 1 ? null : icon('next'));

  const gradebar = h('footer', { class: 'gradebar' },
    h('div', { class: 'gradebar__inner' },
      h('div', { class: 'proposal' }, h('span', null, 'Vorschlag'), propBig, propSmall),
      h('div', { class: 'final' },
        h('div', { class: 'stepper' }, btnWorse, h('span', null, 'schlechter')),
        finalBox,
        h('div', { class: 'stepper' }, btnBetter, h('span', null, 'besser')),
        btnReset),
      h('div', { class: 'nav-btns' }, btnPrev, btnNext)));

  const hint = h('p', { class: 'muted small', style: { margin: '0 0 4px' } },
    'Zutreffende Beschreibung antippen. Bei gemischter Leistung mehrere Zellen einer Zeile wählen – der Zeilenwert ist dann der Mittelwert. Wischen wechselt zur nächsten Person.');

  const main = h('main', { class: `main swipe-area${state.navDirection > 0 ? ' slide-in-left' : state.navDirection < 0 ? ' slide-in-right' : ''}` },
    head, hint, gridHead, ...blocks, defs);
  state.navDirection = 0;

  // --- Wischgeste ---
  let sx = 0;
  let sy = 0;
  let st = 0;
  let tracking = false;
  main.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('input, textarea, select, details')) { tracking = false; return; }
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    st = Date.now();
    tracking = true;
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 1.8 * Math.abs(dy) && Date.now() - st < 700) {
      if (dx < 0) next();
      else prev();
    }
  }, { passive: true });

  function onKey(e) {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  }
  document.addEventListener('keydown', onKey);

  view(topbar({
    back: `#/gruppe/${g.id}`,
    title: nameFor(s),
    subtitle: `${g.name} · ${idx + 1} von ${students.length}`,
    actions: [
      h('span', { class: 'pos' }, `${idx + 1} / ${students.length}`),
      h('button', { class: 'btn', type: 'button', onclick: () => quickList(g, r, s) }, icon('list'), h('span', null, 'Liste')),
    ],
  }), main, gradebar);
  updateNumbers();
  window.scrollTo(0, 0);
}

function quickList(g, r, current) {
  const students = sortedStudents(g);
  let close = null;
  const grid = studentGrid(g, r, students, current.id, (s) => {
    if (close) close();
    go(`gruppe/${g.id}/bewerten/${s.id}`, { replace: true });
  });
  const d = openDialog({ title: `${g.name} – ${r.title}`, wide: true, body: grid, actions: [{ label: 'Schließen' }] });
  close = d.close;
}

// ===========================================================================
// Export
// ===========================================================================

async function renderExport(g) {
  const r = await ensureRound(g);
  document.title = `Export – ${g.name}`;
  const students = sortedStudents(g);
  const byStudent = new Map(students.map((s) => [s.id, getAssessment(r.id, s.id)]));
  const doneIds = students.filter((s) => statusOf(byStudent.get(s.id)) === 'done').map((s) => s.id);

  let sel = state.exportSelection.get(r.id);
  if (!sel) {
    sel = new Set(doneIds.length ? doneIds : students.map((s) => s.id));
    state.exportSelection.set(r.id, sel);
  }

  const countEl = h('b');
  const boxes = [];
  const pick = h('div', { class: 'pick-list' }, students.map((s) => {
    const cb = h('input', { type: 'checkbox', checked: sel.has(s.id) });
    cb.addEventListener('change', () => {
      if (cb.checked) sel.add(s.id);
      else sel.delete(s.id);
      updateCount();
    });
    boxes.push([s.id, cb]);
    const st = statusOf(byStudent.get(s.id));
    return h('label', { class: 'check' }, cb, h('span', null, nameFor(s), st !== 'done' ? h('span', { class: 'muted small' }, st === 'partial' ? ' (angefangen)' : ' (offen)') : null));
  }));
  function setAll(ids) {
    sel.clear();
    ids.forEach((id) => sel.add(id));
    boxes.forEach(([id, cb]) => { cb.checked = sel.has(id); });
    updateCount();
  }
  function updateCount() {
    countEl.textContent = `${sel.size} von ${students.length}`;
  }
  updateCount();

  const chosen = () => students.filter((s) => sel.has(s.id));
  const need = () => {
    if (!sel.size) {
      toast('Bitte mindestens eine Person auswählen.');
      return false;
    }
    return true;
  };
  const sheetsFor = () => chosen().map((s) => buildSheet({ student: s, group: g, assessment: byStudent.get(s.id), scale: displayScale(g) }));
  const baseName = safeFileName(`${klasseOf(g) || g.name}_${r.title}`);
  const scaleName = { quarter: 'Viertelnoten', points: 'Notenpunkten', both: 'Viertelnoten und Notenpunkten' }[displayScale(g)];

  const exportCSV = () => {
    if (!need()) return;
    const list = buildGradeList({ students: chosen(), group: g, assessmentsByStudent: byStudent, nameOrder: 'last-first' });
    const { header, rows } = gradeListTable(list, displayScale(g));
    const blob = new Blob([buildCSV(header, rows)], { type: 'text/csv;charset=utf-8' });
    offerFile(blob, `Notenliste_${baseName}.csv`, { title: 'Notenliste (CSV) ist fertig' });
  };
  const exportListPDF = () => {
    if (!need()) return;
    const list = buildGradeList({ students: chosen(), group: g, assessmentsByStudent: byStudent, nameOrder: 'last-first' });
    const ws = [...new Set(list.filter((x) => x.weights).map((x) => weightsText(x.weights)))];
    const { orientation, pages } = buildListPages(list, {
      title: 'Notenliste – mündliche Noten Biologie',
      group: g.name,
      klasse: klasseOf(g),
      round: r.title,
      printed: formatDate(todayISO()),
      scale: displayScale(g),
      weightsNote: ws.length ? `Gewichtung: ${ws.join(' bzw. ')}` : `Gewichtung: ${weightsText(state.settings.weights)}`,
    });
    openPrintView({ title: `Notenliste ${g.name}`, orientation, pages, onClose: render });
  };
  const exportSheetsPrint = (perPage) => {
    if (!need()) return;
    const { orientation, pages } = buildSheetPages(sheetsFor(), perPage);
    openPrintView({
      title: perPage === 1 ? 'Schülerbögen' : `Schülerbögen, ${perPage} pro Seite`,
      orientation,
      pages,
      onClose: render,
      hint: perPage === 4 ? 'Kompaktfassung ohne Notendefinitionen, damit die Schrift lesbar bleibt. Entlang der gestrichelten Linien schneiden.' : perPage === 2 ? 'Zwei Bögen auf A4 hoch – entlang der gestrichelten Linie schneiden (A5).' : undefined,
    });
  };
  const exportDocx = async (btn) => {
    if (!need()) return;
    if (!window.docx) {
      toast('Die Word-Bibliothek ist noch nicht geladen. Bitte kurz warten und erneut tippen.');
      return;
    }
    btn.disabled = true;
    try {
      const blob = await sheetsToDocxBlob(window.docx, sheetsFor());
      offerFile(blob, `Schuelerboegen_${baseName}.docx`, { title: 'Word-Datei ist fertig' });
    } catch (err) {
      console.error(err);
      toast(`Word-Export fehlgeschlagen: ${err.message || err}`);
    } finally {
      btn.disabled = false;
    }
  };

  let perPage = 2;
  const multiSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Bögen pro Seite' });
  for (const n of [2, 4]) {
    multiSeg.append(h('button', { type: 'button', 'aria-pressed': String(n === perPage), onclick: (e) => {
      perPage = n;
      multiSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      e.currentTarget.setAttribute('aria-pressed', 'true');
    } }, `${n} pro Seite`));
  }

  const main = h('main', { class: 'main' },
    h('section', { class: 'section panel' },
      h('div', { class: 'row' },
        h('h2', { class: 'h2', style: { margin: 0 } }, 'Auswahl: ', countEl),
        h('span', { class: 'spacer' }),
        h('div', { class: 'btn-group' },
          h('button', { class: 'btn', type: 'button', onclick: () => setAll(students.map((s) => s.id)) }, 'Alle'),
          h('button', { class: 'btn', type: 'button', onclick: () => setAll(doneIds) }, 'Nur bewertete'),
          h('button', { class: 'btn', type: 'button', onclick: () => setAll([]) }, 'Keine'))),
      pick),
    h('p', { class: 'muted small' }, `Noten erscheinen in ${scaleName} – einstellbar für diese Lerngruppe unter `,
      h('a', { href: `#/gruppe/${g.id}/namen` }, 'Namen & Lerngruppe'), `. Runde: ${r.title}.`),
    h('div', { class: 'export-grid' },
      h('section', { class: 'panel export-card' },
        h('h3', null, 'Notenliste'),
        h('p', null, 'Name, Zeilenwerte, berechnete Note, Endnote, Klasse und Datum.'),
        h('div', { class: 'btn-group' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: exportCSV }, icon('file'), 'CSV für Excel'),
          h('button', { class: 'btn', type: 'button', onclick: exportListPDF }, icon('print'), 'PDF / Drucken'))),
      h('section', { class: 'panel export-card' },
        h('h3', null, 'Schülerbögen'),
        h('p', null, 'Ausgefüllte Schülerversion, eine Person pro Seite (A4 quer).'),
        h('div', { class: 'btn-group' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => exportSheetsPrint(1) }, icon('print'), 'PDF / Drucken'),
          h('button', { class: 'btn', type: 'button', onclick: (e) => exportDocx(e.currentTarget) }, icon('file'), 'Word (.docx)'))),
      h('section', { class: 'panel export-card' },
        h('h3', null, 'Mehrfachdruck'),
        h('p', null, 'Verkleinerte Bögen mit Schnittlinien, z. B. zum Anheften an eine Klassenarbeit.'),
        multiSeg,
        h('div', { class: 'btn-group' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => exportSheetsPrint(perPage) }, icon('print'), 'Druckansicht öffnen')))),
  );

  view(topbar({ back: `#/gruppe/${g.id}`, title: 'Exportieren', subtitle: `${g.name} · ${r.title}` }), main);
}

// ===========================================================================
// Einstellungen
// ===========================================================================

function renderSettings() {
  document.title = 'Einstellungen – TardiGrader';
  const S = state.settings;

  // Gewichtung
  const outs = {};
  const inputs = {};
  const updatePct = () => {
    const w = normalizeWeights(S.weights);
    for (const k of ROW_KEYS) outs[k].textContent = `${formatDecimal(w[k] * 100, 1, true)} %`;
  };
  const setWeight = (k, v) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(v) * 2) / 2));
    if (!Number.isFinite(n)) return;
    S.weights[k] = n;
    inputs[k].value = String(n).replace('.', ',');
    updatePct();
    saveSettings();
  };
  const weightRows = CRITERIA.map((c) => {
    const k = c.key;
    const input = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: String(S.weights[k]).replace('.', ','), 'aria-label': `Gewicht ${c.short}` });
    input.addEventListener('change', () => setWeight(k, input.value.replace(',', '.')));
    inputs[k] = input;
    outs[k] = h('output');
    return h('div', { class: 'weight-row' },
      h('span', null, plain(c.studentLabel)),
      h('button', { class: 'btn btn--icon', type: 'button', 'aria-label': `${c.short} weniger`, onclick: () => setWeight(k, S.weights[k] - 1) }, '−'),
      input,
      h('button', { class: 'btn btn--icon', type: 'button', 'aria-label': `${c.short} mehr`, onclick: () => setWeight(k, S.weights[k] + 1) }, '+'),
      outs[k]);
  });

  function segSetting(key, options, after) {
    const seg = h('div', { class: 'seg', role: 'group' });
    for (const [v, label] of options) {
      seg.append(h('button', { type: 'button', 'aria-pressed': String(S[key] === v), onclick: async (e) => {
        S[key] = v;
        seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        e.currentTarget.setAttribute('aria-pressed', 'true');
        await saveSettings();
        if (after) after(v);
      } }, label));
    }
    return seg;
  }



  const backupInfo = S.lastBackupAt ? `Letztes Backup: ${formatDate(todayISO(new Date(S.lastBackupAt)))}` : 'Noch kein Backup erstellt.';
  const backupFile = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'backup-file' });
  backupFile.addEventListener('change', async () => {
    const f = backupFile.files && backupFile.files[0];
    backupFile.value = '';
    if (f) importBackup(f);
  });

  const persistInfo = h('span', { class: 'muted small' });
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => {
      persistInfo.textContent = p ? 'Der Browser hat dauerhaften Speicher zugesagt.' : 'Speicher ist nicht als dauerhaft markiert – regelmäßige Backups sind wichtig.';
    });
  }

  const main = h('main', { class: 'main', style: { maxWidth: '860px' } },
    h('section', { class: 'section panel' },
      h('h2', null, 'Gewichtung der Zeilen'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Relative Gewichte (z. B. 2 : 1 : 1 = 50 % / 25 % / 25 %). Gilt für neue Bewertungen – bestehende behalten ihre gespeicherte Gewichtung.'),
      h('div', { class: 'weights' }, weightRows),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn', type: 'button', onclick: () => { ROW_KEYS.forEach((k) => setWeight(k, 1)); } }, 'Je ein Drittel'))),
    h('section', { class: 'section panel' },
      h('h2', null, 'Notenskala für neue Lerngruppen'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Jede Lerngruppe hat ihre eigene Skala – einstellbar beim Anlegen und unter „Namen & Lerngruppe“. Hier legst du fest, womit neue Lerngruppen starten.'),
      scaleControls(S, () => saveSettings()),
      h('p', { class: 'muted small' }, 'Viertelnoten: 1 / 1- / 1-2 / 2+ / 2 … Notenpunkte: 17 − 3 × Note, gerundet (15 P ≙ 1+, 14 P ≙ 1, 13 P ≙ 1- …). Exakte Mitten werden zugunsten der Schülerin bzw. des Schülers gerundet.')),
    h('section', { class: 'section panel' },
      h('h2', null, 'Namen in Listen'),
      segSetting('nameOrder', [['last-first', 'Nachname, Vorname'], ['first-last', 'Vorname Nachname']])),
    h('section', { class: 'section panel' },
      h('h2', null, 'Darstellung'),
      segSetting('theme', [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']], applyTheme)),
    h('section', { class: 'section panel' },
      h('h2', null, 'Datensicherung'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Alle Daten liegen nur auf diesem Gerät. Das Backup ist eine JSON-Datei mit allen Lerngruppen, Runden, Bewertungen und Einstellungen – für die Sicherung und den Gerätewechsel.'),
      h('div', { class: 'btn-group' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: exportBackup }, icon('download'), 'Backup exportieren'),
        h('label', { class: 'btn', for: 'backup-file' }, icon('file'), 'Backup importieren'), backupFile),
      h('p', { class: 'small' }, backupInfo, ' ', persistInfo)),
    h('section', { class: 'section panel' },
      h('h2', null, 'Alle Daten löschen'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Entfernt alle Lerngruppen, Bewertungen und Einstellungen von diesem Gerät.'),
      h('button', { class: 'btn btn--danger', type: 'button', onclick: wipeAll }, icon('trash'), 'Alle Daten löschen')),
    h('p', { class: 'muted small', style: { textAlign: 'center' } },
      `TardiGrader ${APP_VERSION} · funktioniert offline · kein Server, kein Tracking. Enthält docx (MIT) und Atkinson Hyperlegible (SIL OFL).`),
  );
  updatePct();
  view(topbar({ back: '#/', title: 'Einstellungen' }), main);
}

async function exportBackup() {
  // Zeitpunkt vorher speichern, damit er auch im Backup selbst steht
  state.settings.lastBackupAt = new Date().toISOString();
  await saveSettings();
  const data = await db.dumpAll();
  const payload = {
    app: 'TardiGrader',
    format: 1,
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    ...data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  offerFile(blob, `TardiGrader-Backup_${todayISO()}.json`, { title: 'Backup ist fertig' });
}

function validateBackup(data) {
  if (!data || data.app !== 'TardiGrader' || !Array.isArray(data.groups) || !Array.isArray(data.assessments)) {
    throw new Error('Das ist keine TardiGrader-Backup-Datei.');
  }
  for (const k of db.STORES) {
    if (data[k] !== undefined && !Array.isArray(data[k])) throw new Error(`Ungültiger Abschnitt „${k}“.`);
  }
  for (const gr of data.groups) {
    if (!gr || typeof gr.id !== 'string' || !Array.isArray(gr.students || [])) throw new Error('Ungültige Lerngruppe im Backup.');
  }
  for (const a of data.assessments) {
    if (!a || typeof a.id !== 'string' || typeof a.roundId !== 'string') throw new Error('Ungültige Bewertung im Backup.');
  }
  return {
    meta: data.meta || [],
    groups: data.groups,
    rounds: data.rounds || [],
    assessments: data.assessments,
  };
}

async function importBackup(f) {
  let data;
  try {
    data = validateBackup(JSON.parse(await f.text()));
  } catch (err) {
    toast(`Import nicht möglich: ${err.message}`, { duration: 6000 });
    return;
  }
  const when = data && f.lastModified ? formatDate(todayISO(new Date(f.lastModified))) : '';
  openDialog({
    title: 'Backup importieren',
    body: [
      h('p', null, `${f.name}${when ? ` (${when})` : ''}: ${data.groups.length} Lerngruppen, ${data.rounds.length} Runden, ${data.assessments.length} Bewertungen.`),
      h('p', { class: 'muted small' }, '„Zusammenführen“ ergänzt die Daten auf diesem Gerät (gleiche Einträge werden überschrieben). „Ersetzen“ löscht zuerst alles auf diesem Gerät.'),
    ],
    actions: [
      { label: 'Abbrechen' },
      { label: 'Zusammenführen', onClick: async () => { await db.mergeAll(data); await afterImport('Backup zusammengeführt.'); } },
      {
        label: 'Ersetzen',
        kind: 'danger',
        onClick: async () => {
          const ok = await confirmDialog('Alle Daten auf diesem Gerät werden durch das Backup ersetzt.', { title: 'Wirklich ersetzen?', ok: 'Ersetzen', danger: true });
          if (!ok) return;
          await db.replaceAll(data);
          await afterImport('Backup eingespielt.');
        },
      },
    ],
  });
}

async function afterImport(msg) {
  await loadAll();
  toast(msg);
  go('', { replace: true });
  render();
}

async function wipeAll() {
  const ok = await confirmDialog('Wirklich alle Lerngruppen, Bewertungen und Einstellungen löschen? Ohne Backup sind sie verloren.', { title: 'Alle Daten löschen', ok: 'Alles löschen', danger: true });
  if (!ok) return;
  await db.clearAll();
  await loadAll();
  toast('Alle Daten gelöscht.');
  go('', { replace: true });
  render();
}

// ===========================================================================
// Start
// ===========================================================================

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let updateRequested = false;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const ask = (w) => {
      toast('Eine neue Version ist bereit.', {
        action: 'Neu laden',
        duration: 0,
        onAction: () => {
          updateRequested = true;
          w.postMessage({ type: 'SKIP_WAITING' });
        },
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w);
      });
    });
  }).catch((e) => console.warn('Service Worker:', e));
  // Nur nach einem bestätigten Update neu laden – nicht beim ersten Einrichten.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

async function start() {
  try {
    await loadAll();
  } catch (err) {
    app.replaceChildren(h('main', { class: 'main' }, h('div', { class: 'empty' },
      h('h2', null, 'Der lokale Speicher ist nicht verfügbar'),
      h('p', null, `TardiGrader braucht IndexedDB. Im privaten Modus von Safari ist sie eingeschränkt. (${err.message || err})`))));
    return;
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  window.addEventListener('hashchange', render);
  render();
  registerServiceWorker();
}

start();

// Für Tests im Browser
window.__tardigrader = { state, APP_VERSION };
