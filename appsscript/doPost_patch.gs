/**
 * PATCH für bestehenden Apps Script Code.
 *
 * 1. In deiner bestehenden doGet-Funktion ganz am Anfang (vor dem normalen
 *    Sheet-Read) diese Zeilen einfügen:
 *
 *      if (e.parameter.action === "updatePrios") {
 *        return updatePrios(e.parameter);
 *      }
 *
 * 2. Die Funktion updatePrios() unten einfach ans Ende des Scripts hängen.
 *
 * 3. Web App neu deployen ("Neue Version erstellen")
 */

// Muss mit SHEET_API_KEY im Frontend übereinstimmen
const API_KEY = "hfishfisfhsdfhudsfijiew-fsfhdsjkfhsdkjfhjsfh1324";

// Leer lassen = aktives Sheet; sonst z.B. "Formularantworten 1"
const RESPONSES_SHEET_NAME = "";

function updatePrios(params) {
  if (params.key !== API_KEY) {
    return json({ error: "Unauthorized" });
  }

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = RESPONSES_SHEET_NAME
    ? ss.getSheetByName(RESPONSES_SHEET_NAME)
    : ss.getActiveSheet();

  var data    = sheet.getDataRange().getValues();
  var headers = data[0];

  var tsCol    = headers.indexOf("Zeitstempel");
  var emailCol = headers.indexOf("E-Mail Adresse");
  var r1Col    = headers.indexOf("Ressort Prio 1");
  var r2Col    = headers.indexOf("Ressort Prio 2");

  if (tsCol < 0 || emailCol < 0 || r1Col < 0 || r2Col < 0) {
    return json({ error: "Spalten nicht gefunden", headers: headers });
  }

  var ts    = String(params.ts    || "").trim();
  var email = String(params.email || "").trim().toLowerCase();

  for (var i = 1; i < data.length; i++) {
    var rowTs    = String(data[i][tsCol]).trim();
    var rowEmail = String(data[i][emailCol]).trim().toLowerCase();

    if (rowTs === ts && rowEmail === email) {
      if (params.prio1 !== undefined) sheet.getRange(i + 1, r1Col + 1).setValue(params.prio1);
      if (params.prio2 !== undefined) sheet.getRange(i + 1, r2Col + 1).setValue(params.prio2);
      return json({ ok: true });
    }
  }

  return json({ error: "Zeile nicht gefunden" });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
