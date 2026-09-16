/**
 * Belege aus Google Drive nach Supabase holen
 * ============================================================================
 *
 * Die Zeilen des alten Google-Formulars stehen nach supabase/rechnungen-import.sql
 * in `public.rechnungen`. Die Belege selbst liegen aber weiter in Google Drive;
 * mitgekommen ist nur die Datei-Kennung (`drive_id`).
 *
 * Dieses Skript schließt die Lücke: Es holt zu jeder Zeile ohne Beleg die
 * Datei aus Drive, legt sie im Supabase-Ordner `belege` ab und trägt den Pfad
 * an der Zeile ein. Zugeordnet wird über `drive_id` — die Kennung, unter der
 * die Datei in der Antwort des Formulars stand. Eine Verwechslung ist damit
 * ausgeschlossen, und ein zweiter Durchlauf holt nur, was noch fehlt.
 *
 * ---------------------------------------------------------------------------
 * Einrichten (einmal, etwa zehn Minuten)
 * ---------------------------------------------------------------------------
 *
 *  1. script.google.com öffnen → "Neues Projekt" → diesen Code einfügen.
 *     Es muss dasselbe Google-Konto sein, das die Belege in Drive sehen darf
 *     (also das Konto, dem der Ordner des Formulars gehört).
 *
 *  2. In Supabase: Project Settings → API → "service_role"-Schlüssel kopieren.
 *
 *     Achtung: Dieser Schlüssel hebelt alle Zugriffsregeln aus. Er gehört
 *     nirgendwo anders hin als hierher, und wenn die Belege drüben sind,
 *     nimmt man ihn wieder heraus (Schritt 6).
 *
 *  3. Im Apps-Script-Projekt links auf "Projekteinstellungen" (Zahnrad) →
 *     ganz unten "Skripteigenschaften" → zwei Einträge anlegen:
 *
 *         SUPABASE_URL          https://hdhueuihmxbskiusenpe.supabase.co
 *         SUPABASE_SERVICE_KEY  eyJ… (der service_role-Schlüssel)
 *
 *  4. Oben die Funktion `probelauf` auswählen und "Ausführen". Beim ersten Mal
 *     fragt Google nach der Berechtigung, auf Drive zuzugreifen — das ist der
 *     Zugriff auf die Belege. Im Ausführungsprotokoll steht danach, was das
 *     Skript vorhat. Es hat dabei noch nichts geändert.
 *
 *  5. Stimmt die Liste: Funktion `belegeHolen` auswählen und ausführen.
 *
 *     Apps Script bricht nach sechs Minuten ab; deshalb hört das Skript von
 *     sich aus nach viereinhalb auf und sagt im Protokoll, wie viel noch
 *     aussteht. Dann einfach noch einmal ausführen — es macht dort weiter, wo
 *     es aufgehört hat. Bei den 34 übernommenen Zeilen dürfte ein Durchlauf
 *     genügen.
 *
 *  6. Wenn im Protokoll "nichts mehr zu tun" steht: den Schlüssel aus den
 *     Skripteigenschaften löschen. Auf der Finanzen-Seite steht ab jetzt der
 *     Beleg selbst statt des Drive-Links.
 *
 * ---------------------------------------------------------------------------
 * Was das Skript nicht anfasst
 * ---------------------------------------------------------------------------
 *
 *  * Zeilen, die schon einen Beleg haben (`beleg_pfad` gesetzt). Wer eine
 *    Datei noch einmal holen will, leert das Feld in Supabase.
 *  * Die Dateien in Drive. Sie bleiben, wo sie sind — dieses Skript kopiert
 *    nur. Aufgeräumt wird in Drive später von Hand, wenn alles drüben ist.
 *  * `drive_link`. Er bleibt an der Zeile stehen, damit sich das Original
 *    weiter aufrufen lässt.
 */

/* --------------------------------------------------------------- Einstellungen */

/** Der Ordner in Supabase Storage. */
var BUCKET = 'belege';

/** Womit der Ordner umgehen kann (siehe supabase/rechnungen.sql, Block 8). */
var ERLAUBT = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif':  'gif',
  'application/pdf': 'pdf'
};

/** Die Grenze des Ordners: 15 MB. */
var MAX_BYTES = 15 * 1024 * 1024;

/** Nach dieser Zeit hört das Skript von selbst auf (Apps Script: 6 Minuten). */
var ZEITGRENZE_MS = 4.5 * 60 * 1000;


/* ------------------------------------------------------------------- Probelauf */

/**
 * Zeigt, was zu tun wäre — ohne etwas zu ändern. Hier fällt auch auf, wenn
 * der Schlüssel fehlt oder eine Datei nicht mehr erreichbar ist.
 */
function probelauf() {
  var zeilen = offeneZeilen();

  if (!zeilen.length) {
    Logger.log('Nichts zu tun: Zu jeder Zeile liegt schon ein Beleg vor.');
    return;
  }

  Logger.log('%s Zeilen ohne Beleg:', zeilen.length);

  var lesbar = 0;
  for (var i = 0; i < zeilen.length; i++) {
    var zeile = zeilen[i];
    var befund;

    try {
      var datei = DriveApp.getFileById(zeile.drive_id);
      var art   = datei.getMimeType();
      var gross = datei.getSize();

      if (!ERLAUBT[art]) {
        befund = 'Art "' + art + '" nimmt der Ordner nicht an';
      } else if (gross > MAX_BYTES) {
        befund = 'zu groß (' + Math.round(gross / 1024 / 1024) + ' MB)';
      } else {
        befund = 'in Ordnung — ' + datei.getName() + ' (' + Math.round(gross / 1024) + ' KB)';
        lesbar++;
      }
    } catch (fehler) {
      befund = 'NICHT ERREICHBAR — ' + fehler.message;
    }

    Logger.log('  %s  %s %s · %s',
               zeile.code, zeile.vorname, zeile.nachname, befund);
  }

  Logger.log('');
  Logger.log('%s von %s ließen sich holen. Jetzt "belegeHolen" ausführen.',
             lesbar, zeilen.length);
}


/* -------------------------------------------------------------------- Der Lauf */

/**
 * Holt die Belege. Mehrfach ausführbar: Jede Zeile, die schon einen Beleg
 * hat, wird übersprungen.
 */
function belegeHolen() {
  var start  = Date.now();
  var zeilen = offeneZeilen();

  if (!zeilen.length) {
    Logger.log('Nichts mehr zu tun — jede Zeile hat ihren Beleg.');
    return;
  }

  Logger.log('%s Zeilen ohne Beleg. Los.', zeilen.length);

  var fertig = 0, misslungen = 0, offen = 0;

  for (var i = 0; i < zeilen.length; i++) {
    if (Date.now() - start > ZEITGRENZE_MS) {
      offen = zeilen.length - i;
      break;
    }

    var zeile = zeilen[i];
    try {
      var pfad = einenHolen(zeile);
      Logger.log('  ✓ %s  %s %s → %s', zeile.code, zeile.vorname, zeile.nachname, pfad);
      fertig++;
    } catch (fehler) {
      Logger.log('  ✗ %s  %s %s — %s',
                 zeile.code, zeile.vorname, zeile.nachname, fehler.message);
      misslungen++;
    }
  }

  Logger.log('');
  Logger.log('Geholt: %s · Misslungen: %s', fertig, misslungen);

  if (offen > 0) {
    Logger.log('Die Zeit war um; %s Zeilen stehen noch aus. ' +
               'Bitte "belegeHolen" noch einmal ausführen.', offen);
  } else if (misslungen > 0) {
    Logger.log('Die misslungenen Zeilen behalten ihren Drive-Link und stehen ' +
               'auf der Finanzen-Seite weiter als "Beleg noch bei Drive".');
  } else {
    Logger.log('Fertig. Jetzt den service_role-Schlüssel aus den ' +
               'Skripteigenschaften löschen.');
  }
}


/**
 * Eine Zeile: Datei aus Drive holen, in den Ordner legen, Pfad eintragen.
 * Gibt den Pfad zurück oder wirft mit einer Begründung im Klartext.
 */
function einenHolen(zeile) {
  var datei = DriveApp.getFileById(zeile.drive_id);
  var art   = datei.getMimeType();

  if (!ERLAUBT[art]) {
    throw new Error('Dateiart "' + art + '" nimmt der Ordner nicht an');
  }
  if (datei.getSize() > MAX_BYTES) {
    throw new Error('größer als 15 MB (' + Math.round(datei.getSize() / 1024 / 1024) + ' MB)');
  }

  /* Der Name trägt die Vorgangsnummer: Wer im Supabase-Ordner steht, sieht
     ohne Umweg, zu welcher Zeile eine Datei gehört. Eindeutig ist er auch —
     die Nummer gibt es nur einmal. */
  var pfad = 'drive/' + zeile.code + '.' + ERLAUBT[art];

  hochladen(pfad, datei.getBlob(), art);

  eintragen(zeile.id, {
    beleg_pfad: pfad,
    beleg_name: datei.getName().slice(0, 200),
    beleg_typ:  art
  });

  return pfad;
}


/* ------------------------------------------------------------------- Aufräumen */

/**
 * Nur für den Notfall: Nimmt allen übernommenen Zeilen den Beleg wieder ab,
 * damit `belegeHolen` von vorn anfängt. Die Dateien im Ordner bleiben liegen
 * und werden beim nächsten Lauf überschrieben.
 *
 * Diese Funktion ändert Daten — sie läuft nur, wenn unten `WIRKLICH` auf true
 * steht. So löst sie niemand aus, der im Menü danebengreift.
 */
function alleBelegeZuruecksetzen() {
  var WIRKLICH = false;

  if (!WIRKLICH) {
    Logger.log('Nichts geschehen. Wer das wirklich will, setzt im Quelltext ' +
               'WIRKLICH auf true.');
    return;
  }

  var antwort = anfrage('PATCH',
    '/rest/v1/rechnungen?quelle=eq.import&drive_id=not.is.null',
    { beleg_pfad: null, beleg_name: null, beleg_typ: null });

  Logger.log('Zurückgesetzt: %s Zeilen', antwort.length);
}


/* ------------------------------------------------------------ Supabase sprechen */

function einstellung(name) {
  var wert = PropertiesService.getScriptProperties().getProperty(name);
  if (!wert) {
    throw new Error('Die Skripteigenschaft "' + name + '" fehlt. ' +
                    'Projekteinstellungen → Skripteigenschaften.');
  }
  return wert.replace(/\/+$/, '');
}

/**
 * Die Zeilen, zu denen ein Beleg fehlt, die aber eine Drive-Kennung haben.
 */
function offeneZeilen() {
  return anfrage('GET',
    '/rest/v1/rechnungen' +
    '?select=id,code,vorname,nachname,drive_id' +
    '&beleg_pfad=is.null' +
    '&drive_id=not.is.null' +
    '&order=created_at.asc');
}

function eintragen(id, felder) {
  return anfrage('PATCH', '/rest/v1/rechnungen?id=eq.' + encodeURIComponent(id), felder);
}

/**
 * Eine Datei in den Ordner legen. `x-upsert` ist Absicht: Ein zweiter Lauf
 * über dieselbe Zeile soll nicht daran scheitern, dass die Datei schon da ist.
 */
function hochladen(pfad, blob, art) {
  var antwort = UrlFetchApp.fetch(
    einstellung('SUPABASE_URL') + '/storage/v1/object/' + BUCKET + '/' + pfad,
    {
      method: 'post',
      contentType: art,
      payload: blob.getBytes(),
      headers: {
        Authorization: 'Bearer ' + einstellung('SUPABASE_SERVICE_KEY'),
        'x-upsert': 'true'
      },
      muteHttpExceptions: true
    });

  var code = antwort.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Hochladen fehlgeschlagen (' + code + '): ' +
                    antwort.getContentText().slice(0, 200));
  }
}

/**
 * Eine Anfrage an PostgREST. Gibt die geparste Antwort zurück — bei PATCH
 * dank `Prefer: return=representation` die geänderten Zeilen.
 */
function anfrage(methode, pfad, koerper) {
  var optionen = {
    method: methode.toLowerCase(),
    headers: {
      apikey: einstellung('SUPABASE_SERVICE_KEY'),
      Authorization: 'Bearer ' + einstellung('SUPABASE_SERVICE_KEY'),
      Prefer: 'return=representation'
    },
    muteHttpExceptions: true
  };

  if (koerper) {
    optionen.contentType = 'application/json';
    optionen.payload = JSON.stringify(koerper);
  }

  var antwort = UrlFetchApp.fetch(einstellung('SUPABASE_URL') + pfad, optionen);
  var code = antwort.getResponseCode();
  var text = antwort.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Supabase antwortet ' + code + ': ' + text.slice(0, 300));
  }

  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch (fehler) {
    throw new Error('Antwort nicht lesbar: ' + text.slice(0, 200));
  }
}
