/**
 * NUR diese Funktion im Apps Script ersetzen (nicht doGet anfassen).
 * Sucht die Zeile nur anhand der E-Mail (Zeitstempel-Vergleich entfällt,
 * da Google Sheets Datum als Date-Objekt speichert → Vergleich schlägt fehl).
 */
function updatePrios(p) {
  if (p.key !== "hfishfisfhsdfhudsfijiew-fsfhdsjkfhsdkjfhjsfh1324") {
    return ContentService.createTextOutput('{"error":"Unauthorized"}').setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data  = sheet.getDataRange().getValues();
  var h     = data[0];

  var mC  = h.indexOf("E-Mail Adresse");
  var r1C = h.indexOf("Ressort Prio 1");
  var r2C = h.indexOf("Ressort Prio 2");

  if (mC < 0 || r1C < 0 || r2C < 0) {
    return ContentService.createTextOutput('{"error":"Spalten nicht gefunden: ' + h.join("|") + '"}').setMimeType(ContentService.MimeType.JSON);
  }

  var email = String(p.email || "").trim().toLowerCase();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][mC]).trim().toLowerCase() === email) {
      sheet.getRange(i + 1, r1C + 1).setValue(p.prio1 || "");
      sheet.getRange(i + 1, r2C + 1).setValue(p.prio2 || "");
      return ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput('{"error":"Nicht gefunden: ' + email + '"}').setMimeType(ContentService.MimeType.JSON);
}
