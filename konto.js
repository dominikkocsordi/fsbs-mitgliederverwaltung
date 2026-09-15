/* ============================================================
   FSBS INTERN — Konto
   ------------------------------------------------------------
   Hängt zwei Punkte in das Menü, das schon das Abmelden trägt:

     E-Mail ändern      die eigene Adresse umziehen
     Passkeys           Face ID, Fingerabdruck, Windows Hello

   Beides betrifft ausschliesslich das eigene, bereits bestehende
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
     ============================================================ */
  var dlg = null;
  var felder = {};

  function dialogBauen() {
    if (dlg) return dlg;

    dlg = document.createElement('dialog');
    dlg.id = 'kontoDlg';
    dlg.className = 'kontoDlg';
    dlg.innerHTML =
      '<div class="dlgShell">' +
        '<div class="modalDragHandle"></div>' +
        '<div class="modalHeader">' +
          '<div class="modalKopf">' +
            '<div style="min-width:0;">' +
              '<h2 class="modalTitle">Mein Konto</h2>' +
              '<div class="modalSub" id="kontoSub">–</div>' +
            '</div>' +
          '</div>' +
          '<button class="btn-secondary closeX" type="button" id="kontoX" title="Schließen">✕</button>' +
        '</div>' +

        '<div class="modalBody">' +

          '<div class="formSection">' +
            '<div class="formSectionTitle">E-Mail-Adresse</div>' +
            '<div class="formGrid">' +
              '<div class="formField full">' +
                '<label class="formLabel" for="kontoMail">Neue Adresse</label>' +
                '<input id="kontoMail" type="email" inputmode="email" autocomplete="email"' +
                ' placeholder="name@domain.de">' +
                '<div class="small muted" style="margin-top:6px;">' +
                  'An die neue Adresse geht eine Bestätigung. Erst wenn der Link darin ' +
                  'geklickt ist, gilt sie — bis dahin meldest du dich mit der alten an.' +
                '</div>' +
              '</div>' +
              '<div class="formField full">' +
                '<button class="btn-secondary" type="button" id="kontoMailBtn">Bestätigung senden</button>' +
                '<div class="kontoMsg" id="kontoMailMsg"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="formSection">' +
            '<div class="formSectionTitle">Passkeys</div>' +
            '<div class="small muted">' +
              'Mit einem Passkey meldest du dich mit Face ID, Fingerabdruck oder ' +
              'Windows Hello an — ohne auf den Code aus der Mail zu warten. Der ' +
              'Schlüssel bleibt auf dem Gerät. Der Weg über den Code bleibt daneben offen.' +
            '</div>' +
            '<div class="pkListe" id="kontoPkListe"></div>' +
            '<div class="pkAktionen">' +
              '<button class="btn-primary" type="button" id="kontoPkBtn">Passkey hinzufügen</button>' +
            '</div>' +
            '<div class="kontoMsg" id="kontoPkMsg"></div>' +
          '</div>' +

        '</div>' +

        '<div class="modalActions">' +
          '<button class="btn-secondary" type="button" id="kontoFertig">Schließen</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dlg);

    felder.sub     = dlg.querySelector('#kontoSub');
    felder.mail    = dlg.querySelector('#kontoMail');
    felder.mailBtn = dlg.querySelector('#kontoMailBtn');
    felder.mailMsg = dlg.querySelector('#kontoMailMsg');
    felder.pkListe = dlg.querySelector('#kontoPkListe');
    felder.pkBtn   = dlg.querySelector('#kontoPkBtn');
    felder.pkMsg   = dlg.querySelector('#kontoPkMsg');

    dlg.querySelector('#kontoX').addEventListener('click', schliessen);
    dlg.querySelector('#kontoFertig').addEventListener('click', schliessen);
    felder.mailBtn.addEventListener('click', mailAendern);
    felder.pkBtn.addEventListener('click', passkeyAnlegen);
    felder.mail.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') mailAendern();
    });

    return dlg;
  }

  function schliessen() {
    if (dlg && dlg.open) dlg.close();
  }

  async function oeffnen(bereich) {
    dialogBauen();

    var sb = client();
    if (!sb) return;

    setMsg(felder.mailMsg, '');
    setMsg(felder.pkMsg, '');
    felder.mail.value = '';

    dlg.showModal();

    var res = await sb.auth.getUser();
    var user = res && res.data ? res.data.user : null;
    if (!user) {
      felder.sub.textContent = 'Nicht angemeldet.';
      return;
    }
    felder.sub.textContent = user.email || '';

    passkeysLaden();

    if (bereich === 'mail') felder.mail.focus();
    else if (bereich === 'passkey') felder.pkBtn.focus();
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
    box.appendChild(menuepunkt('E-Mail ändern', ICON_MAIL, 'mail'));
    box.appendChild(menuepunkt('Passkeys', ICON_KEY, 'passkey'));

    var sep = panel.querySelector('.userPanelSep');
    if (sep) panel.insertBefore(box, sep);
    else panel.appendChild(box);
  }

  function imSchubfach() {
    var fuss = document.querySelector('.drawerFooter');
    if (!fuss || fuss.querySelector('.drawerKonto')) return;

    var logout = fuss.querySelector('.drawerLogout');

    [['E-Mail ändern', 'mail'], ['Passkeys', 'passkey']].forEach(function (paar) {
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
