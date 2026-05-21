/**
 * MV Anwesenheit – Web App
 *
 * Deployment:
 *  1. Extensions → Apps Script → diesen Code einfügen
 *  2. Deployen → Neue Deployment → Typ: Web App
 *     Ausführen als: Ich (mein Google-Konto)
 *     Zugriff:       Jeder
 *  3. Deployment-URL kopieren → in mv.html als APPS_SCRIPT_URL eintragen
 *
 * Das Script liest immer das erste Tabellenblatt der aktiven Tabelle.
 */

var COLUMNS = {
  zeitstempel:  ["Zeitstempel"],
  vorname:      ["Vorname"],
  nachname:     ["Nachname"],
  email:        ["E-Mail Adresse", "E-Mail", "Email", "Mail"],
  status:       ["Nimmst du an der MV teil?", "Status", "Teilnahme", "Anwesenheit"],
  grund:        ["Grund für Abwesenheit", "Grund", "Abwesenheitsgrund"],
  delegation:   ["Bestätigung zur Stimmübertragung", "Stimmübertragung"]
};

function findCol(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  // fuzzy fallback
  var c = candidates[0].toLowerCase().slice(0, 6);
  for (var j = 0; j < headers.length; j++) {
    if (headers[j].toLowerCase().indexOf(c) >= 0) return j;
  }
  return -1;
}

function doGet(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var data  = sheet.getDataRange().getValues();

    if (data.length < 2) {
      output.setContent(JSON.stringify({ ok: true, rows: [] }));
      return output;
    }

    var headers = data[0].map(function(h) { return String(h).trim(); });

    var cols = {
      zeitstempel: findCol(headers, COLUMNS.zeitstempel),
      vorname:     findCol(headers, COLUMNS.vorname),
      nachname:    findCol(headers, COLUMNS.nachname),
      email:       findCol(headers, COLUMNS.email),
      status:      findCol(headers, COLUMNS.status),
      grund:       findCol(headers, COLUMNS.grund),
      delegation:  findCol(headers, COLUMNS.delegation)
    };

    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      var vorname  = cols.vorname  >= 0 ? String(r[cols.vorname]  || "").trim() : "";
      var nachname = cols.nachname >= 0 ? String(r[cols.nachname] || "").trim() : "";
      rows.push({
        zeitstempel: cols.zeitstempel >= 0 ? String(r[cols.zeitstempel] || "").trim() : "",
        name:        [vorname, nachname].filter(Boolean).join(" ") || "Unbekannt",
        email:       cols.email      >= 0 ? String(r[cols.email]      || "").trim() : "",
        status:      cols.status     >= 0 ? String(r[cols.status]     || "").trim() : "",
        grund:       cols.grund      >= 0 ? String(r[cols.grund]      || "").trim() : "",
        delegation:  cols.delegation >= 0 ? String(r[cols.delegation] || "").trim() : ""
      });
    }

    output.setContent(JSON.stringify({ ok: true, rows: rows }));
  } catch (err) {
    output.setContent(JSON.stringify({ ok: false, error: String(err) }));
  }

  return output;
}
