# TardiGrader – mündliche Noten im Fach Biologie

TardiGrader ist eine WebApp für das iPad, mit der du mündliche Noten nach dem Biologie-Kriterienraster schnell erfasst und als ausgefüllten Schülerbogen bekanntgibst. Sie läuft vollständig offline. Alle Daten bleiben auf deinem Gerät: kein Server, kein Konto, kein Tracking.

## Inhalt

1. [Über GitHub Pages veröffentlichen](#1-über-github-pages-veröffentlichen)
2. [Auf dem iPad installieren](#2-auf-dem-ipad-installieren)
3. [Backups und Gerätewechsel](#3-backups-und-gerätewechsel)
4. [Bedienung in Kürze](#4-bedienung-in-kürze)
5. [So wird gerechnet](#5-so-wird-gerechnet)
6. [Updates einspielen](#6-updates-einspielen)
7. [Technik, Datenschutz und Tests](#7-technik-datenschutz-und-tests)

---

## 1. Über GitHub Pages veröffentlichen

Du brauchst ein kostenloses Konto auf [github.com](https://github.com). Das geht auch komplett am iPad in Safari.

1. **Neues Repository anlegen:** oben rechts auf **+** → **New repository**. Name z. B. `tardigrader`, Sichtbarkeit **Public** (GitHub Pages ist im kostenlosen Tarif nur für öffentliche Repositories verfügbar). Auf **Create repository** tippen.
   Das Repository enthält nur den Programmcode, niemals Schülerdaten – die liegen ausschließlich auf dem iPad.
2. **Dateien hochladen:** Die ZIP-Datei entpacken (in der Dateien-App: ZIP antippen). Im neuen Repository **uploading an existing file** bzw. **Add file → Upload files** wählen und den **Inhalt** des Ordners `tardigrader` hochladen – also `index.html`, `manifest.json`, `sw.js`, `.nojekyll` und die Ordner `css`, `js`, `vendor`, `icons`, `tests`. Wichtig: `index.html` muss direkt auf oberster Ebene liegen, nicht in einem Unterordner. Unten auf **Commit changes** tippen.
   *Tipp:* Am Mac oder PC lässt sich der ganze Ordnerinhalt einfach per Drag & Drop in das Upload-Feld ziehen. Die Datei `.nojekyll` ist auf manchen Systemen versteckt; sie ist praktisch, aber nicht zwingend nötig.
3. **Pages einschalten:** Im Repository **Settings → Pages**. Unter *Build and deployment* bei **Source** „Deploy from a branch“ wählen, Branch **main** und Ordner **/ (root)**, dann **Save**.
4. Nach ein bis zwei Minuten erscheint oben auf der Pages-Seite die Adresse, z. B.
   `https://DEIN-NAME.github.io/tardigrader/`

## 2. Auf dem iPad installieren

1. Die Adresse in **Safari** öffnen und warten, bis die Startseite erscheint. Dabei legt die App alle Dateien für den Offline-Betrieb ab.
2. Auf das **Teilen-Symbol** tippen → **Zum Home-Bildschirm** → (falls angeboten „Als Web-App öffnen“ eingeschaltet lassen) → **Hinzufügen**.
3. Ab jetzt TardiGrader immer über das **Bärtierchen-Symbol** auf dem Home-Bildschirm starten. Die App funktioniert dann auch ohne Internet.

> **Wichtig:** Die Home-Bildschirm-App und ein normaler Safari-Tab haben **getrennte Speicher**. Was du in der App bewertest, siehst du nicht im Safari-Tab – und umgekehrt. Arbeite deshalb immer mit dem Home-Bildschirm-Symbol. Zum Übertragen zwischen beiden dient das Backup.

## 3. Backups und Gerätewechsel

Alle Daten liegen nur im Speicher dieser App auf dem iPad. Wird die App gelöscht oder das iPad zurückgesetzt, sind sie ohne Backup weg. TardiGrader erinnert dich auf der Startseite, wenn das letzte Backup länger als 14 Tage zurückliegt.

**Backup erstellen**

1. Startseite → **Zahnrad** (Einstellungen) → **Backup exportieren**.
2. **Teilen / Sichern** → **In Dateien sichern** und z. B. iCloud Drive oder den Schul-Cloud-Ordner wählen. (Alternativ AirDrop oder Mail.)
3. Die Datei heißt `TardiGrader-Backup_JJJJ-MM-TT.json` und enthält alle Lerngruppen, Runden, Bewertungen und Einstellungen.

**Backup einspielen (z. B. neues iPad)**

1. TardiGrader auf dem neuen Gerät wie oben installieren.
2. Einstellungen → **Backup importieren** → Datei auswählen.
3. **Zusammenführen** ergänzt die vorhandenen Daten (gleiche Einträge werden überschrieben). **Ersetzen** löscht zuerst alles auf dem Gerät und spielt dann das Backup ein.

> Bewahre Backups sicher auf: Sie enthalten Namen und Noten deiner Schülerinnen und Schüler. Beachte die Datenschutzvorgaben deiner Schule für den Speicherort.

## 4. Bedienung in Kürze

**Lerngruppe anlegen** – Name (z. B. „Bio 8b“), Klasse (erscheint auf Schülerbogen und Notenliste) und **Notenskala**. Mit **Beispielgruppe ausprobieren** kannst du alles gefahrlos testen und die Gruppe danach löschen.

**Notenskala pro Lerngruppe** – Jede Lerngruppe hat ihre eigene Skala: **Viertelnoten**, **Notenpunkte** oder **beides** (dann zusätzlich wählbar, ob in Viertelnoten- oder Punkteschritten nachgeschärft wird). So kann z. B. „Bio 8b“ mit Viertelnoten und „Bio J1“ mit Notenpunkten arbeiten. Die Skala legst du beim Anlegen fest und änderst sie jederzeit unter **Namen** (Seite „Namen & Lerngruppe“). Sie gilt für Anzeige, Nachschärfen, Notenliste und Schülerbögen dieser Gruppe. Nachgeschärfte Endnoten bleiben bei einem Wechsel erhalten und werden umgerechnet. In den **Einstellungen** bestimmst du nur, mit welcher Skala neue Lerngruppen starten.

**Namen eintragen** – drei Wege, beliebig kombinierbar; doppelte Namen werden erkannt:

- **Einzeln:** „Anna Müller“ oder „Müller, Anna“ eintippen oder mit dem Apple Pencil hineinschreiben (Scribble), Eingabetaste – fertig, das Feld bleibt für den nächsten Namen offen.
- **Liste einfügen:** ein Name pro Zeile, z. B. aus einer Mail oder direkt aus Excel kopiert (zwei Spalten Nachname/Vorname werden erkannt).
- **CSV-Datei:** Semikolon oder Komma, mit oder ohne Kopfzeile, Nachname/Vorname getrennt oder in einer Spalte. Nummern- und Zusatzspalten werden übersprungen. In der Vorschau kannst du die Spalten korrigieren.

**Bewertungsrunden** – Jede Lerngruppe kann mehrere Runden haben (Vorschlag: „1. Halbjahr 2026/27“). So bleiben frühere mündliche Noten erhalten. Runde wählen, umbenennen oder neu anlegen in der Übersicht.

**Bewerten**

- Zutreffende Beschreibung im Raster antippen. Bei gemischter Leistung **mehrere Zellen einer Zeile** wählen – der Zeilenwert ist dann der Mittelwert.
- Pro Zeile ein optionaler Kommentar (Scribble funktioniert).
- Das Datum ist mit dem heutigen Tag vorbelegt, die Klasse kommt aus der Lerngruppe.
- **Wischen** nach links/rechts oder **Weiter / Zurück** wechselt die Person. **Liste** zeigt, wer schon bewertet ist (grün = vollständig, halb gefüllt = angefangen).
- Unten steht der **Vorschlag**. Mit **+ (besser)** und **− (schlechter)** schärfst du die **Endnote** nach; der Pfeil setzt sie auf den berechneten Wert zurück. Vorschlag und Endnote werden getrennt gespeichert.
- Alles wird sofort gespeichert.

**Exportieren** (Übersicht → Export) – erst Personen auswählen (alle, nur bewertete oder einzeln), dann:

- **Notenliste:** CSV für Excel (UTF-8 mit BOM, Semikolon) oder PDF/Drucken.
- **Schülerbögen:** eine Person pro Seite, A4 quer – als PDF/Drucken oder als **Word-Datei (.docx)**.
- **Mehrfachdruck:** 2 Bögen pro A4-Seite (A5, vollständig) oder 4 pro Seite (Kompaktfassung ohne Notendefinitionen, damit die Schrift lesbar bleibt), jeweils mit Schnittlinien.

**PDF erzeugen:** In der Druckansicht **Drucken / PDF** antippen. Im Druckdialog oben auf das **Teilen-Symbol** tippen und **In Dateien sichern** wählen – das ergibt ein PDF. Oder direkt drucken.

## 5. So wird gerechnet

| Schritt | Regel |
|---|---|
| Zeilenwert | Mittelwert der markierten Spalten (Spalte 1 = Note 1 … Spalte 6 = Note 6) |
| Vorschlag | gewichteter Mittelwert der drei Zeilen (Standard je 1/3, in den Einstellungen änderbar) |
| Viertelnote | Rundung auf die nächste Viertelstufe: 1 / 1- / 1-2 / 2+ / 2 / 2- / 2-3 / 3+ … 6 |
| Notenpunkte | Punkte = 17 − 3 × Note, gerundet, begrenzt auf 0–15 (15 P ≙ 1+, 14 P ≙ 1, 13 P ≙ 1- …) |
| Exakte Mitte | wird zugunsten der Schülerin bzw. des Schülers gerundet (z. B. 2,125 → 2; 12,5 P → 13 P) |
| Nachschärfen | in Viertelschritten oder ganzen Punkten, je nach Skala der Lerngruppe |

**Beispiel:** Qualität 2 und 3 markiert (Zeilenwert 2,5), Fachwissen 2, Fachsprache 1 → Vorschlag (2,5 + 2 + 1) / 3 = 1,83 → Viertelnote **2+**, Punkte 17 − 5,5 = 11,5 → **12 P**.

Die **Gewichtung** wird mit jeder Bewertung gespeichert. Änderst du sie später in den Einstellungen, bleiben ältere Bewertungen unverändert. In der Bewertungsansicht erscheint dann ein Hinweis mit der Möglichkeit, die aktuelle Gewichtung zu übernehmen.

Die Umrechnung steht gut dokumentiert in `js/grades.js` und ist mit Beispielwerten getestet (`tests/grades.test.mjs`).

## 6. Updates einspielen

1. Geänderte Dateien im Repository ersetzen (Upload wie oben).
2. In `sw.js` die Zeile `const CACHE_VERSION = 'tardigrader-v1.1.0';` hochzählen, z. B. auf `v1.1.1`. Nur dann holt sich die installierte App die neuen Dateien. (Die mitgelieferten Dateien sind bereits richtig nummeriert.)
3. Beim nächsten Start mit Internet erscheint in der App „Eine neue Version ist bereit“ → **Neu laden**. Deine Daten bleiben dabei erhalten.

## 7. Technik, Datenschutz und Tests

**Aufbau** – statische Dateien ohne Build-Schritt, direkt lauffähig auf GitHub Pages:

```
index.html            App-Gerüst (Content-Security-Policy: nur eigene Dateien)
manifest.json         PWA-Manifest (Homescreen-Symbol, Vollbild)
sw.js                 Service Worker (Offline-Cache)
css/app.css           Gestaltung, Dark Mode, Druck-CSS
js/app.js             Bildschirme und Abläufe
js/grades.js          Notenberechnung und Umrechnung
js/rubric.js          Rastertexte (wortgetreu, **fett** markiert)
js/csv.js             CSV-/Listen-Import und CSV-Export
js/db.js              lokale Datenbank (IndexedDB)
js/sheet-data.js      Aufbereitung für Bögen und Notenliste
js/print.js           Druckansichten (1, 2, 4 Bögen pro Seite; Notenliste)
js/docx-export.js     Word-Export
js/ui.js              Hilfsfunktionen für Oberfläche und Dateien
vendor/               docx-Bibliothek (MIT) und Schrift Atkinson Hyperlegible (SIL OFL), lokal
icons/                App-Symbole (stilisiertes Bärtierchen)
tests/                automatische Tests
```

**Datenmodell (IndexedDB „tardigrader“)**

- `meta` – Einstellungen: Gewichtung, Standard-Skala für neue Gruppen, Namensreihenfolge, Darstellung, letztes Backup
- `groups` – Lerngruppe mit Name, Klasse, Notenskala, Schrittweite und Liste der Schüler:innen (Vorname, Nachname)
- `rounds` – Bewertungsrunden je Lerngruppe
- `assessments` – je Runde und Person: markierte Spalten und Kommentar pro Zeile, Datum, Gewichtung zum Zeitpunkt der Bewertung, Vorschlag, Endnote

**Datenschutz** – Die App lädt keine externen Inhalte und sendet nichts. Die Content-Security-Policy erlaubt nur Dateien vom eigenen Server. Schrift und Bibliotheken liegen im Repository.

**Tests** (am Computer mit Node.js 18 oder neuer, im Ordner `tardigrader`):

```
node --test tests/grades.test.mjs tests/csv.test.mjs
npm install docx && node tests/docx-export.test.mjs beispiel.docx
```

Der erste Befehl prüft Notenumrechnung und CSV-Import/-Export (19 Tests), der zweite erzeugt eine Beispiel-Word-Datei mit drei Schülerbögen.

**Hinweise zu den Vorlagen** – Die Texte des Rasters sind wortgetreu aus beiden Vorlagen übernommen, einschließlich der Fettungen. Trennstriche, die in der Lehrerversion nur dem Zeilenumbruch dienten („Argumentations-ketten“, „Alternativ-beispiele“, „Notenbildungs-verordnung“), sind als weiche Trennstellen gesetzt und erscheinen nur, wenn dort umbrochen wird.

**Bekannte Grenzen**

- Ob Safari beim Drucken das Querformat aus der Druckvorlage übernimmt, hängt von der iPadOS-Version ab. Falls ein PDF im Hochformat entsteht: im Druckdialog die Ausrichtung wählen, sofern angeboten, oder den Word-Export nutzen (immer A4 quer).
- Sollte der Druckdialog in der Home-Bildschirm-App nicht erscheinen, bleibt der Word-Export als Weg zum PDF (in Word oder Pages öffnen → als PDF exportieren).
- Sehr lange Kommentare werden im Mehrfachdruck automatisch etwas kleiner gesetzt, damit der Bogen in sein Feld passt.

**Lizenzen** – docx © Dolan, MIT-Lizenz (`vendor/LICENSE-docx.txt`); Atkinson Hyperlegible © Braille Institute of America, SIL Open Font License 1.1 (`vendor/fonts/OFL-Atkinson-Hyperlegible.txt`).

## Versionen

- **1.1.0** – Notenskala pro Lerngruppe statt zentral. Bestehende Lerngruppen und ältere Backups übernehmen beim ersten Start automatisch die bisher eingestellte Skala.
- **1.0.0** – erste Version.
