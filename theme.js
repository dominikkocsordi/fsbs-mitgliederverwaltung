/* ============================================================
   FSBS INTERN — Theme Handling (Light / Dark)
   ------------------------------------------------------------
   Wird synchron im <head> geladen: setzt die Theme-Klasse noch
   vor dem ersten Paint (kein Flackern) und hängt nach dem Laden
   einen Umschalter in die Kopfzeile.
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'fsbs-theme';
  var root = document.documentElement;

  /* `?theme=` schlägt alles andere: Eingebettet auf einer fremden Seite
     kann der Speicher gesperrt sein, und welches Design dort passt, weiß
     ohnehin nur die Seite ringsum.

       theme=light / theme=dark   festgelegt, nichts wird gespeichert
       theme=auto                 dem System folgen, Gewähltes ignorieren  */
  function ausDerAdresse() {
    try {
      var v = new URLSearchParams(window.location.search).get('theme');
      if (v === 'light' || v === 'dark' || v === 'auto') return v;
    } catch (e) { /* ältere Browser */ }
    return null;
  }

  var wunsch = ausDerAdresse();
  var festgelegt = wunsch === 'light' || wunsch === 'dark';
  var eingebettet = root.classList.contains('embed');

  function stored() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }

  function current() {
    return root.classList.contains('dark') ? 'dark' : 'light';
  }

  function apply(theme) {
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme !== 'dark');
    root.style.colorScheme = theme;
    updateMeta(theme);
  }

  function updateMeta(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      if (document.head) document.head.appendChild(meta);
    }
    meta.setAttribute('content', theme === 'dark' ? '#12141a' : '#f4f4f6');
  }

  function setTheme(theme) {
    apply(theme);
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore */ }
    document.dispatchEvent(new CustomEvent('fsbs:themechange', { detail: { theme: theme } }));
  }

  function toggle() {
    setTheme(current() === 'dark' ? 'light' : 'dark');
  }

  /* --- Sofort anwenden (vor dem ersten Paint) --- */
  apply(festgelegt ? wunsch : (wunsch === 'auto' ? systemTheme() : (stored() || systemTheme())));

  /* Systemwechsel folgen, solange nichts festgelegt und nichts gewählt wurde */
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) {
      if (festgelegt) return;
      if (wunsch === 'auto' || !stored()) apply(e.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* --- Umschalter aufbauen --- */
  var ICONS =
    '<svg class="moonIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>' +
    '<svg class="sunIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"' +
    ' stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  function build(floating) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'themeToggle';
    btn.className = 'themeToggle' + (floating ? ' themeToggle--floating' : '');
    btn.setAttribute('aria-label', 'Design umschalten');
    btn.title = 'Helles / dunkles Design';
    btn.innerHTML = ICONS;
    btn.addEventListener('click', toggle);
    return btn;
  }

  function mount() {
    if (document.getElementById('themeToggle')) return;

    /* Eingebettet oder festgelegt: Dann entscheidet nicht diese Seite,
       und ein Umschalter wäre ein Knopf, der das Falsche verspricht. */
    if (eingebettet || festgelegt) return;

    /* Bevorzugt: Aktionsbereich der App-Shell */
    var host = document.querySelector('.siteActions') || document.querySelector('.brandRight');
    if (host) { host.appendChild(build(false)); return; }

    /* Sonst: letzte Spalte der .top-Leiste */
    var top = document.querySelector('.top');
    if (top) {
      var slot = document.createElement('div');
      slot.style.display = 'flex';
      slot.style.alignItems = 'center';
      slot.style.gap = '10px';
      slot.style.marginLeft = 'auto';
      slot.appendChild(build(false));
      top.appendChild(slot);
      return;
    }

    /* Fallback: frei schwebend oben rechts */
    document.body.appendChild(build(true));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  /* `erzwinge` setzt das Design, ohne es zu speichern: So kann die
     umgebende Seite einer Einbettung sagen, wie sie es gerade hält. */
  function erzwinge(theme) {
    festgelegt = true;
    apply(theme === 'dark' ? 'dark' : 'light');
    document.dispatchEvent(new CustomEvent('fsbs:themechange', { detail: { theme: current() } }));
  }

  window.FSBSTheme = { get: current, set: setTheme, toggle: toggle, erzwinge: erzwinge };
})();
