/* ============================================================
   FSBS INTERN — Konto
   ------------------------------------------------------------
   Hängt den Punkt „Einstellungen“ in das Menü, das schon das
   Abmelden trägt. Der Dialog dahinter hat drei Bereiche:

     Darstellung        hell, dunkel oder automatisch; Akzentfarbe
     Konto              die eigene Adresse umziehen
     Sicherheit         Passkeys — Face ID, Fingerabdruck, Windows Hello

   Konto und Sicherheit betreffen ausschliesslich das eigene, bereits bestehende
   Konto. Wer hineindarf, entscheidet sich weiterhin allein auf
   /nutzer — hier entsteht kein Konto und keine Rolle.

   Die Seite muss dafür nichts mitbringen: Die Punkte entstehen im
   Aufklapper aus app-shell.js, im Schubfach aus mobile-nav.js, und
   der Dialog wird beim ersten Öffnen gebaut.
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://hdhueuihmxbskiusenpe.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_H6YjVStNvwY-VnZuZCYDxw_mOWEvAAW';

  /* Wohin der Bestätigungslink aus der Mail führt. Wie auf /login muss
     die Adresse in Supabase unter Authentication → URL Configuration
     stehen. */
  var MAIL_REDIRECT = 'https://portal.fsbs-hm.de/login';

  var mandant = null;

  /* Die Seite hat ihren eigenen Supabase-Client — den nehmen, wenn er
     dasteht. Sonst einen eigenen, der dieselbe Sitzung aus dem
     Speicher liest. */
  function client() {
    if (mandant) return mandant;
    if (window.sb && window.sb.auth) { mandant = window.sb; return mandant; }
    try {
      /* eslint-disable-next-line no-undef */
      if (typeof sb !== 'undefined' && sb && sb.auth) { mandant = sb; return mandant; }
    } catch (_) { /* die Seite hat keinen */ }
    if (window.supabase && window.supabase.createClient) {
      mandant = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { autoRefreshToken: false }
      });
      return mandant;
    }
    return null;
  }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function icon(paths) {
    return '<span class="userPanelIcon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths + '</svg></span>';
  }

  var ICON_MAIL = '<path d="M3.5 6.5h17v11h-17z"/><path d="m3.5 7.5 8.5 6 8.5-6"/>';
  var ICON_KEY  = '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21"/>' +
                  '<path d="M17.5 12v3"/><path d="M20 12v2"/>';

  var ICON_ZAHNRAD = '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>';

  var ICON_FARBE = '<circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10" r="1.2"/>' +
                   '<circle cx="12" cy="7.5" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/>' +
                   '<path d="M12 20.5a2.5 2.5 0 0 1 0-5h1.5"/>';

  /* Die sechs Akzentfarben: Schlüssel, Name, hell, dunkel. Die Werte
     gleichen denen in style.css unter [data-akzent]. */
  var AKZENTE = [
    ['blau', 'Blau', 'oklch(0.55 0.19 258)', 'oklch(0.75 0.15 255)'],
    ['violett', 'Violett', 'oklch(0.53 0.21 295)', 'oklch(0.75 0.15 295)'],
    ['gruen', 'Grün', 'oklch(0.52 0.14 155)', 'oklch(0.76 0.15 155)'],
    ['tuerkis', 'Türkis', 'oklch(0.53 0.10 205)', 'oklch(0.77 0.11 205)'],
    ['orange', 'Orange', 'oklch(0.57 0.17 45)', 'oklch(0.77 0.15 55)'],
    ['rosa', 'Rosa', 'oklch(0.56 0.20 355)', 'oklch(0.76 0.14 355)']
  ];

  function datum(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function setMsg(node, text, art) {
    if (!node) return;
    node.textContent = text || '';
    node.className = 'kontoMsg' + (art ? ' ' + art : '');
  }


  /* ============================================================
     Der Dialog
     ------------------------------------------------------------
     Links die Bereiche, rechts was dazugehört. Auf dem Telefon
     rücken die Bereiche als Reiter über den Inhalt.
     ============================================================ */
  var dlg = null;
  var felder = {};

  var BEREICHE = [
    ['darstellung', 'Darstellung', ICON_FARBE],
    ['konto',       'Konto',       ICON_MAIL],
    ['sicherheit',  'Sicherheit',  ICON_KEY]
  ];

  /* Ältere Sprungziele aus dem Menü landen im passenden Bereich. */
  var ZIEL = { mail: 'konto', passkey: 'sicherheit', akzent: 'darstellung' };

  var DESIGNS = [
    ['light',  'Hell',        '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'],
    ['dark',   'Dunkel',      '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'],
    ['system', 'Automatisch', '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>']
  ];

  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  function dialogBauen() {
    if (dlg) return dlg;

    var nav = BEREICHE.map(function (b) {
      return '<button class="setNavBtn" type="button" role="tab" id="setTab-' + b[0] + '"' +
        ' aria-controls="setPanel-' + b[0] + '" data-bereich="' + b[0] + '">' +
        svg(b[2]) + '<span>' + b[1] + '</span></button>';
    }).join('');

    var designs = DESIGNS.map(function (d) {
      return '<button class="designBtn" type="button" role="radio" data-design="' + d[0] + '">' +
        '<span class="designVorschau designVorschau--' + d[0] + '" aria-hidden="true">' +
          '<span></span><span></span><span></span></span>' +
        '<span class="designName">' + svg(d[2]) + d[1] + '</span></button>';
    }).join('');

    dlg = document.createElement('dialog');
    dlg.id = 'kontoDlg';
    dlg.className = 'kontoDlg';
    dlg.setAttribute('aria-labelledby', 'kontoTitel');
    dlg.innerHTML =
      '<div class="dlgShell">' +
        '<div class="modalDragHandle"></div>' +
        '<div class="modalHeader">' +
          '<div class="modalKopf">' +
            '<div style="min-width:0;">' +
              '<h2 class="modalTitle" id="kontoTitel">Einstellungen</h2>' +
              '<div class="modalSub" id="kontoSub">–</div>' +
            '</div>' +
          '</div>' +
          '<button class="btn-secondary closeX" type="button" id="kontoX" title="Schließen">✕</button>' +
        '</div>' +

        '<div class="setLayout">' +
          '<nav class="setNav" role="tablist" aria-label="Bereiche">' + nav + '</nav>' +

          '<div class="setInhalt">' +

            /* ---- Darstellung ---- */
            '<section class="setPanel" role="tabpanel" id="setPanel-darstellung"' +
            ' aria-labelledby="setTab-darstellung" data-bereich="darstellung">' +
              '<div class="setGruppe">' +
                '<div class="setGruppeKopf">' +
                  '<h3 class="setGruppeTitel">Design</h3>' +
                  '<p class="setGruppeText">„Automatisch“ folgt der Einstellung des Geräts.</p>' +
                '</div>' +
                '<div class="designWahl" id="kontoDesign" role="radiogroup" aria-label="Design">' +
                  designs + '</div>' +
              '</div>' +
              '<div class="setGruppe">' +
                '<div class="setGruppeKopf">' +
                  '<h3 class="setGruppeTitel">Akzentfarbe</h3>' +
                  '<p class="setGruppeText">Für Knöpfe, Links und Markierungen.</p>' +
                '</div>' +
                '<div class="akzentWahl" id="kontoAkzent" role="radiogroup" aria-label="Akzentfarbe"></div>' +
              '</div>' +
              '<p class="setHinweis">Design und Farbe gelten auf diesem Gerät für alle Seiten des Portals.</p>' +
            '</section>' +

            /* ---- Konto ---- */
            '<section class="setPanel" role="tabpanel" id="setPanel-konto"' +
            ' aria-labelledby="setTab-konto" data-bereich="konto" hidden>' +
              '<div class="setGruppe">' +
                '<div class="setGruppeKopf">' +
                  '<h3 class="setGruppeTitel">Angemeldet als</h3>' +
                '</div>' +
                '<div class="setWert" id="kontoMailJetzt">–</div>' +
              '</div>' +
              '<div class="setGruppe">' +
                '<div class="setGruppeKopf">' +
                  '<h3 class="setGruppeTitel">E-Mail-Adresse ändern</h3>' +
                  '<p class="setGruppeText">An die neue Adresse geht eine Bestätigung. Erst wenn der ' +
                  'Link darin geklickt ist, gilt sie — bis dahin meldest du dich mit der alten an.</p>' +
                '</div>' +
                '<label class="formLabel" for="kontoMail">Neue Adresse</label>' +
                '<div class="setZeile">' +
                  '<input id="kontoMail" type="email" inputmode="email" autocomplete="email"' +
                  ' placeholder="name@domain.de">' +
                  '<button class="btn-secondary" type="button" id="kontoMailBtn">Bestätigung senden</button>' +
                '</div>' +
                '<div class="kontoMsg" id="kontoMailMsg"></div>' +
              '</div>' +
            '</section>' +

            /* ---- Sicherheit ---- */
            '<section class="setPanel" role="tabpanel" id="setPanel-sicherheit"' +
            ' aria-labelledby="setTab-sicherheit" data-bereich="sicherheit" hidden>' +
              '<div class="setGruppe">' +
                '<div class="setGruppeKopf">' +
                  '<h3 class="setGruppeTitel">Passkeys</h3>' +
                  '<p class="setGruppeText">Mit einem Passkey meldest du dich mit Face ID, Fingerabdruck ' +
                  'oder Windows Hello an — ohne auf den Code aus der Mail zu warten. Der Schlüssel ' +
                  'bleibt auf dem Gerät. Der Weg über den Code bleibt daneben offen.</p>' +
                '</div>' +
                '<div class="pkListe" id="kontoPkListe"></div>' +
                '<div class="pkAktionen">' +
                  '<button class="btn-primary" type="button" id="kontoPkBtn">Passkey hinzufügen</button>' +
                '</div>' +
                '<div class="kontoMsg" id="kontoPkMsg"></div>' +
              '</div>' +
            '</section>' +

          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dlg);

    felder.sub      = dlg.querySelector('#kontoSub');
    felder.mailJetzt = dlg.querySelector('#kontoMailJetzt');
    felder.mail     = dlg.querySelector('#kontoMail');
    felder.mailBtn  = dlg.querySelector('#kontoMailBtn');
    felder.mailMsg  = dlg.querySelector('#kontoMailMsg');
    felder.pkListe  = dlg.querySelector('#kontoPkListe');
    felder.pkBtn    = dlg.querySelector('#kontoPkBtn');
    felder.pkMsg    = dlg.querySelector('#kontoPkMsg');
    felder.design   = dlg.querySelector('#kontoDesign');

    dlg.querySelector('#kontoX').addEventListener('click', schliessen);
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) schliessen();
    });

    /* Bereiche umschalten; Pfeiltasten wie in einer Reiterleiste */
    var navEl = dlg.querySelector('.setNav');
    navEl.addEventListener('click', function (e) {
      var b = e.target.closest('.setNavBtn');
      if (b) bereichZeigen(b.dataset.bereich);
    });
    navEl.addEventListener('keydown', function (e) {
      var schritt = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!schritt) return;
      e.preventDefault();
      var knoepfe = Array.prototype.slice.call(navEl.children);
      var i = knoepfe.indexOf(document.activeElement);
      var ziel = knoepfe[(i + schritt + knoepfe.length) % knoepfe.length];
      ziel.focus();
      bereichZeigen(ziel.dataset.bereich);
    });

    radioGruppe(felder.design, function (b) {
      if (window.FSBSTheme && window.FSBSTheme.setMode) window.FSBSTheme.setMode(b.dataset.design);
      designMarkieren();
    });
    document.addEventListener('fsbs:themechange', designMarkieren);

    akzentKnoepfe(dlg.querySelector('#kontoAkzent'));

    felder.mailBtn.addEventListener('click', mailAendern);
    felder.pkBtn.addEventListener('click', passkeyAnlegen);
    felder.mail.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') mailAendern();
    });

    return dlg;
  }

  function bereichZeigen(name) {
    dialogBauen();
    if (!BEREICHE.some(function (b) { return b[0] === name; })) name = 'darstellung';
    Array.prototype.forEach.call(dlg.querySelectorAll('.setNavBtn'), function (b) {
      var an = b.dataset.bereich === name;
      b.setAttribute('aria-selected', an ? 'true' : 'false');
      b.tabIndex = an ? 0 : -1;
    });
    Array.prototype.forEach.call(dlg.querySelectorAll('.setPanel'), function (p) {
      p.hidden = p.dataset.bereich !== name;
    });
  }

  /* Eine Reihe Knöpfe, von denen genau einer gilt — mit Pfeiltasten. */
  function radioGruppe(wahl, beiWahl) {
    wahl.addEventListener('click', function (e) {
      var b = e.target.closest('[role="radio"]');
      if (b && wahl.contains(b)) beiWahl(b);
    });
    wahl.addEventListener('keydown', function (e) {
      var schritt = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!schritt) return;
      e.preventDefault();
      var knoepfe = Array.prototype.slice.call(wahl.querySelectorAll('[role="radio"]'));
      var i = knoepfe.indexOf(document.activeElement);
      var ziel = knoepfe[(i + schritt + knoepfe.length) % knoepfe.length];
      ziel.focus();
      beiWahl(ziel);
    });
  }

  function markieren(wahl, attr, jetzt) {
    Array.prototype.forEach.call(wahl.querySelectorAll('[role="radio"]'), function (b) {
      var an = b.getAttribute(attr) === jetzt;
      b.setAttribute('aria-checked', an ? 'true' : 'false');
      b.tabIndex = an ? 0 : -1;
    });
  }


  /* ============================================================
     Darstellung
     ============================================================ */
  function designMarkieren() {
    if (!felder.design) return;
    var jetzt = window.FSBSTheme && window.FSBSTheme.mode ? window.FSBSTheme.mode() : 'system';
    markieren(felder.design, 'data-design', jetzt);
  }

  function akzentKnoepfe(wahl) {
    felder.akzent = wahl;
    AKZENTE.forEach(function (a) {
      var b = el('button', 'akzentBtn');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', a[1]);
      b.title = a[1];
      b.dataset.akzent = a[0];
      b.innerHTML = '<span class="akzentPunkt" aria-hidden="true">' +
        svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>') + '</span><span class="akzentName"></span>';
      b.firstChild.style.setProperty('--akzent-licht', a[2]);
      b.firstChild.style.setProperty('--akzent-dunkel', a[3]);
      b.lastChild.textContent = a[1];
      wahl.appendChild(b);
    });

    radioGruppe(wahl, function (b) {
      if (window.FSBSTheme && window.FSBSTheme.setAkzent) window.FSBSTheme.setAkzent(b.dataset.akzent);
      akzentMarkieren();
    });

    document.addEventListener('fsbs:akzentchange', akzentMarkieren);
    akzentMarkieren();
  }

  function akzentMarkieren() {
    if (!felder.akzent) return;
    var jetzt = window.FSBSTheme && window.FSBSTheme.akzent ? window.FSBSTheme.akzent() : 'blau';
    markieren(felder.akzent, 'data-akzent', jetzt);
  }

  function schliessen() {
    if (dlg && dlg.open) dlg.close();
  }

  async function oeffnen(bereich) {
    dialogBauen();

    setMsg(felder.mailMsg, '');
    setMsg(felder.pkMsg, '');
    felder.mail.value = '';

    var name = ZIEL[bereich] || bereich || 'darstellung';
    bereichZeigen(name);
    designMarkieren();
    akzentMarkieren();
    if (!dlg.open) dlg.showModal();

    /* Den Fokus auf etwas Sinnvolles, nicht auf das ✕ */
    if (bereich === 'mail') felder.mail.focus();
    else if (bereich === 'passkey') felder.pkBtn.focus();
    else {
      var tab = dlg.querySelector('.setNavBtn[aria-selected="true"]');
      if (tab) tab.focus();
    }

    var sb = client();
    if (!sb) {
      felder.sub.textContent = 'Nicht angemeldet.';
      return;
    }

    var res = await sb.auth.getUser();
    var user = res && res.data ? res.data.user : null;
    if (!user) {
      felder.sub.textContent = 'Nicht angemeldet.';
      felder.mailJetzt.textContent = '–';
      return;
    }
    felder.sub.textContent = user.email || '';
    felder.mailJetzt.textContent = user.email || '–';

    passkeysLaden();
  }


  /* ============================================================
     E-Mail ändern
     ------------------------------------------------------------
     Das ändert nur die eigene Adresse. Ein Konto entsteht dabei
     nicht, und die Rolle bleibt, wie sie ist.
     ============================================================ */
  async function mailAendern() {
    var sb = client();
    if (!sb) return;

    var neu = (felder.mail.value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(neu)) {
      return setMsg(felder.mailMsg, 'Diese Adresse sieht nicht richtig aus.', 'error');
    }

    felder.mailBtn.disabled = true;
    setMsg(felder.mailMsg, 'Bestätigung wird gesendet …');

    var res = await sb.auth.updateUser({ email: neu }, { emailRedirectTo: MAIL_REDIRECT });
    felder.mailBtn.disabled = false;

    if (res.error) {
      return setMsg(felder.mailMsg, 'Fehler: ' + res.error.message, 'error');
    }

    setMsg(felder.mailMsg,
      'Bestätigung an ' + neu + ' gesendet. Der Link darin schliesst den Umzug ab — ' +
      'bis dahin gilt die alte Adresse.', 'success');
    felder.mail.value = '';
  }


  /* ============================================================
     Passkeys
     ============================================================ */
  async function passkeysLaden() {
    var sb = client();
    if (!sb) return;

    felder.pkListe.innerHTML = '<div class="pkLeer">Passkeys werden geladen …</div>';

    var res = await sb.from('passkeys')
      .select('id, name, created_at, last_used_at')
      .order('created_at', { ascending: true });

    if (res.error) {
      felder.pkListe.innerHTML =
        '<div class="pkLeer">Die Passkeys lassen sich gerade nicht laden.</div>';
      return;
    }

    var liste = res.data || [];
    if (!liste.length) {
      felder.pkListe.innerHTML =
        '<div class="pkLeer">Noch kein Passkey hinterlegt.</div>';
      return;
    }

    felder.pkListe.innerHTML = '';
    liste.forEach(function (p) {
      var zeile = el('div', 'pkZeile');

      var text = el('div', 'pkText');
      var name = el('div', 'pkName');
      name.textContent = p.name || 'Passkey';
      var meta = el('div', 'pkMeta');
      meta.textContent = p.last_used_at
        ? 'Zuletzt benutzt am ' + datum(p.last_used_at)
        : 'Angelegt am ' + datum(p.created_at) + ' · noch nicht benutzt';
      text.appendChild(name);
      text.appendChild(meta);

      var weg = el('button', 'btn-secondary pkWeg');
      weg.type = 'button';
      weg.textContent = 'Entfernen';
      weg.addEventListener('click', function () { passkeyEntfernen(p); });

      zeile.appendChild(text);
      zeile.appendChild(weg);
      felder.pkListe.appendChild(zeile);
    });
  }

  async function passkeyAnlegen() {
    var sb = client();
    if (!sb || !window.FSBSPasskey) return;

    if (!window.FSBSPasskey.verfuegbar()) {
      return setMsg(felder.pkMsg,
        'Dieser Browser kennt keine Passkeys. Der Code aus der Mail geht weiterhin.', 'error');
    }

    var vorschlag = geraeteName();
    var name = window.prompt('Name für diesen Passkey — damit du ihn später wiedererkennst:', vorschlag);
    if (name === null) return;

    felder.pkBtn.disabled = true;
    setMsg(felder.pkMsg, 'Warte auf das Gerät …');

    try {
      var erg = await window.FSBSPasskey.anlegen(sb, (name || '').trim() || vorschlag);
      if (erg && erg.abgebrochen) {
        setMsg(felder.pkMsg, 'Abgebrochen — es wurde nichts hinterlegt.');
      } else {
        setMsg(felder.pkMsg, 'Passkey hinterlegt. Ab jetzt geht das Anmelden ohne Code.', 'success');
        await passkeysLaden();
      }
    } catch (err) {
      setMsg(felder.pkMsg, (err && err.message) || 'Das hat nicht geklappt.', 'error');
    }
    felder.pkBtn.disabled = false;
  }

  async function passkeyEntfernen(p) {
    var sb = client();
    if (!sb) return;

    if (!window.confirm('„' + (p.name || 'Passkey') + '“ entfernen?\n\n' +
        'Mit diesem Gerät geht das Anmelden danach nur noch über den Code aus der Mail.')) {
      return;
    }

    var res = await sb.from('passkeys').delete().eq('id', p.id);
    if (res.error) {
      return setMsg(felder.pkMsg, 'Entfernen: ' + res.error.message, 'error');
    }
    setMsg(felder.pkMsg, 'Passkey entfernt.', 'success');
    await passkeysLaden();
  }

  /* Ein brauchbarer Vorschlag, damit in der Liste nicht dreimal
     „Dieses Gerät“ steht. */
  function geraeteName() {
    var ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android-Gerät';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows-PC';
    if (/Linux/i.test(ua)) return 'Linux-Rechner';
    return 'Dieses Gerät';
  }


  /* ============================================================
     Die Punkte ins Menü hängen
     ============================================================ */
  function menuepunkt(text, ikon, bereich) {
    var b = el('button', '');
    b.type = 'button';
    b.innerHTML = icon(ikon) + '<span>' + text + '</span>';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var panel = document.querySelector('.userPanel');
      if (panel) panel.classList.add('hidden');
      oeffnen(bereich);
    });
    return b;
  }

  function inAufklapper() {
    var panel = document.querySelector('.userPanel');
    if (!panel || panel.querySelector('.kontoActions')) return;

    var box = el('div', 'userPanelActions kontoActions');
    box.appendChild(menuepunkt('Einstellungen', ICON_ZAHNRAD, 'darstellung'));

    var sep = panel.querySelector('.userPanelSep');
    if (sep) panel.insertBefore(box, sep);
    else panel.appendChild(box);
  }

  function imSchubfach() {
    var fuss = document.querySelector('.drawerFooter');
    if (!fuss || fuss.querySelector('.drawerKonto')) return;

    var logout = fuss.querySelector('.drawerLogout');

    [['Einstellungen', 'darstellung']].forEach(function (paar) {
      var b = el('button', 'drawerThemeBtn drawerKonto');
      b.type = 'button';
      b.textContent = paar[0];
      b.addEventListener('click', function () {
        var drawer = document.querySelector('.mobileDrawer');
        var overlay = document.querySelector('.mobileOverlay');
        if (drawer) drawer.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        var wrap = document.getElementById('mobileScrollWrap');
        if (wrap) wrap.style.overflow = '';
        else document.body.style.overflow = '';
        oeffnen(paar[1]);
      });
      if (logout) fuss.insertBefore(b, logout);
      else fuss.appendChild(b);
    });
  }

  function einhaengen() {
    inAufklapper();
    imSchubfach();
  }

  /* Aufklapper und Schubfach entstehen in anderen Dateien und zu
     unterschiedlichen Zeitpunkten. Statt die Reihenfolge zu erraten:
     zusehen, bis beides dasteht. */
  function beobachten() {
    einhaengen();

    var mo = new MutationObserver(function () {
      einhaengen();
      if (document.querySelector('.kontoActions') &&
          (document.querySelector('.drawerKonto') || !document.querySelector('.drawerFooter'))) {
        /* Der Aufklapper steht; das Schubfach gibt es nur auf schmalen
           Fenstern. Weiter zusehen lohnt nicht. */
        if (document.querySelector('.drawerKonto')) mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    /* Nach zehn Sekunden ist alles gebaut, was gebaut wird. */
    setTimeout(function () { mo.disconnect(); }, 10000);
  }

  window.FSBSKonto = { oeffnen: oeffnen };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', beobachten);
  } else {
    beobachten();
  }
})();
