/* ============================================================
   FSBS — Einbettung für WordPress
   ------------------------------------------------------------
   Dieses Skript läuft nicht auf dem Portal, sondern auf der
   WordPress-Seite. Es sucht dort Platzhalter, setzt in jeden
   einen iframe auf portal.fsbs-hm.de/bewerbung und hält seine
   Höhe nach: Das Formular ist je nach Frage und Fehlermeldung
   verschieden lang, und eine feste Höhe wäre entweder zu kurz
   (abgeschnitten) oder zu lang (ein Loch unter dem Knopf).

   In WordPress genügt ein Block "Benutzerdefiniertes HTML":

     <div data-fsbs-bewerbung></div>
     <script src="https://portal.fsbs-hm.de/embed.js" defer></script>

   Das Skript darf mehrmals auf einer Seite stehen; geladen wird
   es trotzdem nur einmal.

   Einstellungen am Platzhalter, alle freiwillig:

     data-ansicht="formular"   nur das Formular
     data-ansicht="stand"      nur die Abfrage "Wie weit ist meine Bewerbung?"
                               (ohne Angabe: beides, mit Umschalter)
     data-theme="auto"         hell oder dunkel nach dem System des Besuchers
     data-theme="light"        immer hell (Voreinstellung)
     data-theme="dark"         immer dunkel
     data-karte="1"            den Kasten des Portals behalten
     data-kopf="0"             Titel und Einleitung weglassen
     data-hoehe="700"          Höhe, bis die erste Meldung eintrifft
     data-basis="https://…"    anderes Portal (zum Ausprobieren)

   Warum ein iframe und kein eingebautes Formular: Der Schlüssel
   des Captchas gilt für portal.fsbs-hm.de, und das Formular
   spricht von dort mit der Datenbank. Im iframe bleibt beides
   richtig, ganz gleich, unter welcher Adresse die WordPress-Seite
   erreichbar ist.
   ============================================================ */
(function () {
  'use strict';

  if (window.__fsbsEinbettung) return;
  window.__fsbsEinbettung = true;

  var BASIS_STANDARD = 'https://portal.fsbs-hm.de';
  var PFAD = '/bewerbung';
  var HOEHE_ANFANG = 620;

  /* Die Rahmen, die dieses Skript gesetzt hat. Über sie findet die
     Nachricht von drinnen zurück zu ihrem eigenen Rahmen — `event.source`
     sagt, aus welchem Fenster sie kam. */
  var rahmen = [];

  /* Nur Schema und Host aus einer Adresse — das ist der Zielort, den
     postMessage verlangt. */
  function herkunft(url) {
    try { return new URL(url, window.location.href).origin; } catch (e) { return '*'; }
  }

  function attribut(el, name, ersatz) {
    var v = el.getAttribute('data-' + name);
    return v === null || v === '' ? ersatz : v;
  }

  /* Wonach der Besucher sucht, steht manchmal schon in der Adresse der
     WordPress-Seite: ein Link aus der Bestätigungsmail mit ?code=ABC12.
     Der wird durchgereicht, damit der Stand gleich dasteht. */
  function codeAusAdresse() {
    try {
      var v = new URLSearchParams(window.location.search).get('code');
      if (v && /^[0-9A-Za-z-]{1,12}$/.test(v)) return v;
    } catch (e) { /* ältere Browser */ }
    return null;
  }

  function adresse(el) {
    var basis = attribut(el, 'basis', BASIS_STANDARD).replace(/\/+$/, '');
    var p = new URLSearchParams();
    p.set('embed', '1');

    var ansicht = attribut(el, 'ansicht', '');
    if (ansicht === 'formular' || ansicht === 'stand') p.set('view', ansicht);

    var theme = attribut(el, 'theme', 'light');
    if (theme === 'auto' || theme === 'light' || theme === 'dark') p.set('theme', theme);

    if (attribut(el, 'karte', '') === '1') p.set('karte', '1');
    if (attribut(el, 'kopf', '') === '0') p.set('kopf', '0');

    /* Damit die Höhe nicht an jedes Fenster gemeldet wird, das zuhört. */
    if (window.location.protocol === 'https:' || window.location.protocol === 'http:') {
      p.set('origin', window.location.origin);
    }

    var code = codeAusAdresse();
    if (code && ansicht !== 'formular') p.set('code', code);

    return basis + PFAD + '?' + p.toString();
  }

  function bauen(el) {
    if (el.getAttribute('data-fsbs-fertig') === '1') return;
    el.setAttribute('data-fsbs-fertig', '1');

    var hoehe = parseInt(attribut(el, 'hoehe', HOEHE_ANFANG), 10);
    if (!(hoehe > 0)) hoehe = HOEHE_ANFANG;

    var frame = document.createElement('iframe');
    frame.src = adresse(el);
    frame.title = attribut(el, 'ansicht', '') === 'stand'
      ? 'Stand der Bewerbung bei der Fachschaft Business School'
      : 'Bewerbung bei der Fachschaft Business School';
    frame.loading = 'lazy';
    /* Die Zwischenablage: Der Bewerbungscode lässt sich mit einem Knopf
       kopieren. Alles Übrige braucht das Formular nicht. */
    frame.setAttribute('allow', 'clipboard-write');

    /* Die Begrüßung ist mehr als Höflichkeit: Erst wenn drinnen bekannt
       ist, dass hier jemand zuhört, gibt die Seite ihre eigene
       Bildlaufleiste auf. Ohne dieses Skript — ein iframe von Hand —
       behält sie sie, und der Inhalt bleibt erreichbar. */
    frame.addEventListener('load', function () {
      try {
        frame.contentWindow.postMessage({ fsbs: 'hallo' }, herkunft(frame.src));
      } catch (e) { /* nicht zu ändern */ }
    });

    frame.style.display = 'block';
    frame.style.width = '100%';
    frame.style.border = '0';
    frame.style.margin = '0';
    frame.style.overflow = 'hidden';
    frame.style.colorScheme = 'normal';
    frame.style.height = hoehe + 'px';

    el.appendChild(frame);
    rahmen.push(frame);
  }

  /* ---------- Nachrichten von drinnen ---------- */

  function zuRahmen(quelle) {
    for (var i = 0; i < rahmen.length; i++) {
      if (rahmen[i].contentWindow === quelle) return rahmen[i];
    }
    return null;
  }

  function scrollen(frame, versatz) {
    var oben = frame.getBoundingClientRect().top + window.pageYOffset;
    var ziel = Math.max(0, oben + (versatz || 0) - 24);
    try {
      window.scrollTo({ top: ziel, behavior: 'smooth' });
    } catch (e) {
      window.scrollTo(0, ziel);
    }
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d !== 'object' || typeof d.fsbs !== 'string') return;

    var frame = zuRahmen(e.source);
    if (!frame) return;           // nicht unser Rahmen

    /* Die Absenderadresse muss zu dem passen, was wir geladen haben.
       Sonst könnte ein anderer Rahmen in dieselbe Kerbe schlagen. */
    if (frame.src.indexOf(e.origin) !== 0) return;

    if (d.fsbs === 'hoehe') {
      var hoehe = parseInt(d.hoehe, 10);
      /* Die Obergrenze ist kein Geschmack, sondern eine Bremse: Ein Fehler
         drinnen soll nicht eine Seite von hunderttausend Pixeln ergeben. */
      if (hoehe > 0 && hoehe < 20000) frame.style.height = hoehe + 'px';
      return;
    }

    if (d.fsbs === 'scroll') {
      scrollen(frame, parseInt(d.versatz, 10) || 0);
      return;
    }
  });

  /* ---------- Platzhalter suchen ---------- */

  function suchen() {
    var alle = document.querySelectorAll('[data-fsbs-bewerbung]');
    for (var i = 0; i < alle.length; i++) bauen(alle[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', suchen);
  } else {
    suchen();
  }

  /* Seitenbaukästen setzen ihre Blöcke gern erst nach dem Laden ein —
     etwa wenn das Formular in einem Reiter oder Popup steckt. Gesucht wird
     deshalb weiter, aber gebündelt: Auf einer lebhaften Seite kämen sonst
     hunderte Durchläufe je Sekunde zusammen. */
  if (window.MutationObserver) {
    var geplant = false;
    new MutationObserver(function () {
      if (geplant) return;
      geplant = true;
      setTimeout(function () { geplant = false; suchen(); }, 200);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.FSBSEinbettung = { suchen: suchen };
})();
