/**
 * TardiGrader – Word-Export (.docx) der ausgefüllten Schülerbögen
 * ================================================================
 * Nachbau der Vorlage „NEU Schülerversion für mdl. Noten“:
 * A4 quer, ein Schüler pro Seite, Kopfzeile, Kriterientabelle mit Kreuzspalten
 * (++ / + / o / - / -- / leer = 6), Kommentarspalte, Notendefinitionen und Fußnote.
 *
 * Die docx-Bibliothek (https://docx.js.org, MIT) wird als Parameter übergeben,
 * damit dieselbe Funktion im Browser (vendor/docx.min.js) und in Node-Tests läuft.
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
  parseRich,
} from './rubric.js';

// A4 quer in DXA (1 cm ≈ 567 DXA)
const PAGE_W = 16838;
const PAGE_H = 11906;
const MARGIN_X = 720;
const MARGIN_Y = 624;
const CONTENT_W = PAGE_W - 2 * MARGIN_X; // 15398

// Spaltenbreiten der Kriterientabelle (Summe = CONTENT_W)
const COLS_CRIT = [1668, 3446, 500, 500, 500, 500, 500, 500, 2502, 4782];
// Spaltenbreiten der Definitionstabelle
const COLS_DEF = [1668, 2288, 2288, 2288, 2288, 2288, 2290];

const FONT = 'Calibri';
const SIZE_TABLE = 20; // 10 pt (Halbpunkte)
const SIZE_HEAD = 24; // 12 pt
const SIZE_TITLE = 30; // 15 pt

/**
 * @param {object} D docx-Bibliothek
 * @param {object[]} sheets Ergebnis von buildSheet() je Schüler
 * @returns {object} docx.Document
 */
export function buildSheetsDocument(D, sheets) {
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
    VerticalAlign, BorderStyle, PageOrientation, TabStopType, ExternalHyperlink,
    TableLayoutType, SoftHyphen, UnderlineType,
  } = D;

  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const cellMargins = { top: 45, bottom: 45, left: 80, right: 80 };

  /** Text mit **fett** → TextRuns (weiche Trennzeichen als SoftHyphen). */
  function runs(text, opts = {}) {
    const out = [];
    for (const part of parseRich(text)) {
      const pieces = part.text.split('\u00AD');
      const children = [];
      pieces.forEach((p, i) => {
        if (i > 0) children.push(new SoftHyphen());
        if (p) children.push(p);
      });
      out.push(new TextRun({ children, bold: part.bold || !!opts.bold, size: opts.size || SIZE_TABLE, font: FONT }));
    }
    return out;
  }

  function paras(list, opts = {}) {
    const arr = Array.isArray(list) ? list : [list];
    return arr.map((t, i) => new Paragraph({
      children: runs(t, opts),
      alignment: opts.alignment,
      spacing: { before: 0, after: i < arr.length - 1 ? 50 : 0, line: 252 },
    }));
  }

  function plainParas(text) {
    const lines = String(text || '').split(/\r?\n/);
    return lines.map((l) => new Paragraph({
      children: l ? [new TextRun({ text: l, size: SIZE_TABLE, font: FONT })] : [],
      spacing: { before: 0, after: 0, line: 252 },
    }));
  }

  function cell(children, width, opts = {}) {
    return new TableCell({
      children,
      width: { size: width, type: WidthType.DXA },
      verticalAlign: opts.vAlign || VerticalAlign.TOP,
      margins: cellMargins,
    });
  }

  function markCell(on, width) {
    return cell([
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: on ? [new TextRun({ text: 'X', bold: true, size: 28, font: FONT })] : [],
      }),
    ], width, { vAlign: VerticalAlign.CENTER });
  }

  function headerLine(s) {
    const lab = (t) => new TextRun({ text: t, bold: true, size: SIZE_HEAD, font: FONT });
    const val = (t, minLen) => {
      const txt = t ? ` ${t} ` : '';
      const pad = Math.max(0, minLen - txt.length);
      return new TextRun({
        text: txt + '\u00A0'.repeat(pad),
        size: SIZE_HEAD,
        font: FONT,
        underline: { type: UnderlineType.SINGLE },
      });
    };
    const tab = () => new TextRun({ text: '\t', size: SIZE_HEAD, font: FONT });
    return new Paragraph({
      tabStops: [
        { type: TabStopType.LEFT, position: 6400 },
        { type: TabStopType.LEFT, position: 9000 },
        { type: TabStopType.LEFT, position: 12000 },
      ],
      spacing: { before: 120, after: 160 },
      children: [
        lab('Name: '), val(s.name, 34), tab(),
        lab('Klasse: '), val(s.klasse, 10), tab(),
        lab('Datum: '), val(s.datum, 14), tab(),
        lab('Note: '), val(s.note, 16),
      ],
    });
  }

  function critTable(s) {
    const headRow = new TableRow({
      tableHeader: true,
      children: [
        cell([new Paragraph({ children: [] })], COLS_CRIT[0]),
        cell([new Paragraph({ children: [] })], COLS_CRIT[1]),
        ...STUDENT_MARKS.map((m, i) => cell([
          new Paragraph({ alignment: AlignmentType.CENTER, children: m ? runs(m) : [] }),
        ], COLS_CRIT[2 + i], { vAlign: VerticalAlign.CENTER })),
        cell([new Paragraph({ children: [] })], COLS_CRIT[8]),
        cell(paras(`**${STUDENT_COMMENT_HEADER}**`), COLS_CRIT[9]),
      ],
    });
    const rows = CRITERIA.map((c) => {
      const r = s.rows[c.key] || { cols: [], comment: '' };
      return new TableRow({
        cantSplit: true,
        children: [
          cell(paras(c.studentLabel), COLS_CRIT[0]),
          cell(paras(c.studentBest), COLS_CRIT[1]),
          ...[1, 2, 3, 4, 5, 6].map((g, i) => markCell(r.cols.includes(g), COLS_CRIT[2 + i])),
          cell(paras(c.studentWorst), COLS_CRIT[8]),
          cell(plainParas(r.comment), COLS_CRIT[9]),
        ],
      });
    });
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: COLS_CRIT,
      layout: TableLayoutType.FIXED,
      borders,
      rows: [headRow, ...rows],
    });
  }

  function defTable() {
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: COLS_DEF,
      layout: TableLayoutType.FIXED,
      borders,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell(paras(STUDENT_NOTE_LABEL), COLS_DEF[0]),
            ...GRADE_NAMES.map((g, i) => cell(paras(g), COLS_DEF[i + 1])),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell(paras(STUDENT_DEFINITION_LABEL), COLS_DEF[0]),
            ...DEFINITIONS.map((d, i) => cell(paras(d), COLS_DEF[i + 1])),
          ],
        }),
      ],
    });
  }

  function footnote() {
    return new Paragraph({
      spacing: { before: 100, after: 0 },
      children: [
        new TextRun({ text: FOOTNOTE_TEXT, size: 16, font: FONT }),
        new ExternalHyperlink({
          link: FOOTNOTE_URL,
          children: [new TextRun({ text: FOOTNOTE_URL, size: 16, font: FONT, color: '0563C1', underline: { type: UnderlineType.SINGLE } })],
        }),
      ],
    });
  }

  const children = [];
  sheets.forEach((s, idx) => {
    children.push(new Paragraph({
      pageBreakBefore: idx > 0,
      spacing: { before: 0, after: 60 },
      children: runs(`**${STUDENT_TITLE}**`, { size: SIZE_TITLE }),
    }));
    children.push(headerLine(s));
    children.push(critTable(s));
    children.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }));
    children.push(defTable());
    children.push(footnote());
  });

  return new Document({
    creator: 'TardiGrader',
    title: STUDENT_TITLE,
    description: 'Mündliche Noten Biologie – ausgefüllte Schülerbögen',
    styles: { default: { document: { run: { font: FONT, size: SIZE_TABLE } } } },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_H, height: PAGE_W, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN_Y, bottom: MARGIN_Y, left: MARGIN_X, right: MARGIN_X },
        },
      },
      children,
    }],
  });
}

/** Erzeugt die .docx-Datei als Blob (Browser). */
export async function sheetsToDocxBlob(D, sheets) {
  return D.Packer.toBlob(buildSheetsDocument(D, sheets));
}
