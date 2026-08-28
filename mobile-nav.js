(function () {
  'use strict';

  /* ============================================================
     APP-SHELL LAYOUT
     Verschiebt den gesamten Seiteninhalt in einen Scroll-Container.
     Die Tab Bar wird NICHT mehr mit position:fixed gerendert,
     sondern als normaler letzter flex-Child des body.
     → Kein Springen mehr, weil kein fixed-Element existiert.
     ============================================================ */
  function applyAppShell() {
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    var wrap = document.createElement('div');
    wrap.className = 'mobileScrollWrap';
    wrap.id = 'mobileScrollWrap';

    /* Alle aktuellen body-Kinder in den Scroll-Wrapper verschieben */
    /* (Snapshot nötig, da childNodes live ist) */
    Array.from(document.body.childNodes).forEach(function (n) {
      wrap.appendChild(n);
    });

    document.body.appendChild(wrap);
    document.body.classList.add('mobileShell');
  }

  /* ============================================================
     TABS
     ============================================================ */
  /* Strichsymbole statt Emoji — gleiche Sprache wie der Rest der App */
  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  var ICONS = {
    home:  svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5.5h5V20"/>'),
    users: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8"/>' +
               '<path d="M16.5 6.4a3 3 0 0 1 0 5.8"/><path d="M17.5 14.9c2 .5 3.3 1.9 3.3 4.6"/>'),
    userPlus: svg('<circle cx="10" cy="8" r="3.2"/><path d="M4 19.5c0-3 2.7-4.8 6-4.8 1.2 0 2.3.2 3.2.7"/>' +
                  '<path d="M17.5 14v6"/><path d="M14.5 17h6"/>'),
    file:  svg('<path d="M14 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V7.6Z"/>' +
               '<path d="M14 3v4.6h4.6"/><path d="M8.8 12.5h6.4"/><path d="M8.8 16h4.4"/>'),
    more:  svg('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>'),
  };

  var TABS = [
    { href: 'index.html',       icon: ICONS.home,     label: 'Dashboard'   },
    { href: 'members.html',     icon: ICONS.users,    label: 'Mitglieder'  },
    { href: 'anwaerter.html',   icon: ICONS.userPlus, label: 'Anwärter'    },
    { href: 'bewerbungen.html', icon: ICONS.file,     label: 'Bewerbungen' },
    { href: '#mehr',            icon: ICONS.more,     label: 'Mehr', isMehr: true },
  ];

  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function buildTabBar(openFn) {
    var page = currentPage();
    var bar  = document.createElement('nav');
    bar.className = 'bottomTabBar';
    bar.setAttribute('aria-label', 'Hauptnavigation');

    /* ── Liquid Glass sliding pill (sits behind all tab items) ── */
    var pill = document.createElement('div');
    pill.className = 'liquidPill';
    pill.id = 'liquidPill';
    bar.appendChild(pill);

    TABS.forEach(function (tab) {
      var isActive = !tab.isMehr &&
        (page === tab.href || (page === '' && tab.href === 'index.html'));

      if (tab.isMehr) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tabItem';
        btn.setAttribute('aria-label', 'Weiteres Menü öffnen');
        btn.setAttribute('data-mehr', 'true');
        btn.innerHTML =
          '<span class="tabIcon">' + tab.icon + '</span>' +
          '<span class="tabLabel">' + tab.label + '</span>';
        btn.addEventListener('click', function () {
          if (typeof openFn === 'function') openFn();
        });
        bar.appendChild(btn);
      } else {
        var a = document.createElement('a');
        a.className = 'tabItem' + (isActive ? ' active' : '');
        a.href = '/' + tab.href;
        if (isActive) a.setAttribute('aria-current', 'page');
        a.setAttribute('aria-label', tab.label);
        a.innerHTML =
          '<span class="tabIcon">' + tab.icon + '</span>' +
          '<span class="tabLabel">' + tab.label + '</span>';
        bar.appendChild(a);
      }
    });

    /* Tab Bar wird an body gehängt — nach mobileScrollWrap,
       damit sie letzter flex-Child ist (= immer unten) */
    document.body.appendChild(bar);

    /* ── Pill: sauberer Slide, kein Stretch ── */
    var pillReady = false;
    var INSET = 3; /* px Abstand innen pro Seite */

    function pillTarget(item) {
      var barRect = bar.getBoundingClientRect();
      var iRect   = item.getBoundingClientRect();
      return {
        left:  iRect.left - barRect.left + INSET,
        width: iRect.width - INSET * 2
      };
    }

    function movePill(target, instant) {
      if (!target) { pill.style.opacity = '0'; return; }
      var t = pillTarget(target);

      if (instant || !pillReady) {
        /* Erste Platzierung: sofort, ohne Animation */
        pill.style.transition = 'none';
        pill.style.left       = t.left  + 'px';
        pill.style.width      = t.width + 'px';
        pill.style.opacity    = '1';
        pillReady = true;
      } else {
        /* Tab-Wechsel: einfacher, sauberer Slide */
        pill.style.transition =
          'left   .26s cubic-bezier(.4,0,.2,1),' +
          'width  .26s cubic-bezier(.4,0,.2,1),' +
          'opacity .18s ease';
        pill.style.left    = t.left  + 'px';
        pill.style.width   = t.width + 'px';
        pill.style.opacity = '1';
      }
    }

    /* Pill beim Seitenload platzieren (nach Layout-Commit) */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        movePill(bar.querySelector('.tabItem.active'), true);
      });
    });

    /* Nach Orientierungswechsel neu ausrichten */
    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        movePill(bar.querySelector('.tabItem.active'), true);
      }, 350);
    }, { passive: true });
    window.addEventListener('resize', function () {
      movePill(bar.querySelector('.tabItem.active'), true);
    }, { passive: true });

    /* Pill beim Tap sofort Richtung Ziel bewegen */
    bar.querySelectorAll('a.tabItem').forEach(function (a) {
      a.addEventListener('click', function () { movePill(a, false); });
    });

    /* Keyboard-Handling: Tab Bar verstecken wenn Tastatur offen */
    var hidden = false;
    document.addEventListener('focusin', function (e) {
      if (e.target.matches('input, textarea, select') && !hidden) {
        hidden = true;
        bar.style.setProperty('display', 'none', 'important');
      }
    });
    document.addEventListener('focusout', function () {
      if (hidden) {
        hidden = false;
        setTimeout(function () { bar.style.removeProperty('display'); }, 150);
      }
    });

    return bar;
  }

  /* ============================================================
     DRAWER
     ============================================================ */
  function initMobileNav() {

    /* 1. App-Shell zuerst aufbauen */
    applyAppShell();

    var scrollWrap = document.getElementById('mobileScrollWrap');
    var hamburger  = document.getElementById('hamburger');
    var navLeft    = document.querySelector('.navLeft');
    var navRight   = document.querySelector('.navRight');

    var openDrawer, closeDrawer;

    if (hamburger && navLeft) {
      var logoutBtn  = navRight ? navRight.querySelector('button') : null;
      var logoutAttr = logoutBtn ? (logoutBtn.getAttribute('onclick') || '') : '';

      var navLinks  = Array.from(navLeft.querySelectorAll('.navLink'));
      var linksHtml = navLinks.map(function (link) {
        var href     = link.getAttribute('href') || '#';
        var text     = link.textContent.trim();
        var isActive = link.classList.contains('active');
        var hidden   = link.style.display === 'none';
        return (
          '<a class="drawerLink' + (isActive ? ' active' : '') + '"' +
          ' href="' + href + '"' +
          (hidden ? ' style="display:none"' : '') +
          ' data-navid="' + (link.id || '') + '">' +
          text + '</a>'
        );
      }).join('');

      /* Overlay + Drawer an body hängen (außerhalb des scrollWrap → fixed funktioniert) */
      var overlay = document.createElement('div');
      overlay.className = 'mobileOverlay';

      var drawer = document.createElement('div');
      drawer.className = 'mobileDrawer';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-label', 'Navigation');
      drawer.innerHTML =
        '<div class="drawerHeader">' +
          '<div class="drawerLogo">' +
            '<img class="drawerLogoImg drawerLogoImg--light" src="/logo-mark-light.png" alt="FSBS"' +
            ' onerror="this.style.display=\'none\'">' +
            '<img class="drawerLogoImg drawerLogoImg--dark" src="/logo-mark-dark.png" alt="" aria-hidden="true"' +
            ' onerror="this.style.display=\'none\'">' +
            '<span class="drawerAppName">Intern</span>' +
          '</div>' +
          '<button class="drawerClose" id="drawerClose" type="button" aria-label="Schließen">✕</button>' +
        '</div>' +
        '<div class="drawerUser" id="drawerUser" style="display:none">' +
          '<div class="drawerUserInner">' +
            '<div class="drawerAvatar" id="drawerAvatarEl">U</div>' +
            '<div class="drawerUserInfo">' +
              '<div class="drawerUserName" id="drawerNameEl">–</div>' +
              '<div class="drawerUserRole" id="drawerRoleEl"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="drawerLinks" id="drawerLinks">' + linksHtml + '</div>' +
        '<div class="drawerFooter">' +
          '<button class="drawerThemeBtn" id="drawerThemeBtn" type="button">' +
            '<span id="drawerThemeLabel">Dunkles Design</span></button>' +
          '<button class="drawerLogout" type="button"' +
          (logoutAttr ? ' onclick="' + logoutAttr + '"' : '') + '>' +
          'Abmelden</button>' +
        '</div>';

      document.body.appendChild(overlay);
      document.body.appendChild(drawer);

      /* Theme-Umschalter im Drawer */
      var themeBtn = document.getElementById('drawerThemeBtn');
      if (themeBtn) {
        var themeLabel = document.getElementById('drawerThemeLabel');
        var syncTheme = function () {
          var dark = document.documentElement.classList.contains('dark');
          if (themeLabel) themeLabel.textContent = dark ? 'Helles Design' : 'Dunkles Design';
        };
        syncTheme();
        document.addEventListener('fsbs:themechange', syncTheme);
        themeBtn.addEventListener('click', function () {
          if (window.FSBSTheme) window.FSBSTheme.toggle();
          syncTheme();
        });
      }

      /* Links/User synchron halten */
      function syncLinks() {
        var dLinks = drawer.querySelectorAll('.drawerLink');
        navLinks.forEach(function (nl, i) {
          if (dLinks[i]) dLinks[i].style.display = nl.style.display || '';
        });
      }
      function syncUser() {
        var nameEl = document.getElementById('authNameInline');
        var roleEl = document.getElementById('authRolePill');
        var avatEl = document.getElementById('authAvatar');
        var name   = nameEl ? nameEl.textContent.trim() : '';
        if (!name || name === 'User') return;
        var du = document.getElementById('drawerUser');
        var dn = document.getElementById('drawerNameEl');
        var dr = document.getElementById('drawerRoleEl');
        var da = document.getElementById('drawerAvatarEl');
        if (du) du.style.display = '';
        if (dn) dn.textContent = name;
        if (dr) dr.textContent = roleEl ? roleEl.textContent.trim() : '';
        if (da) {
          da.textContent = (avatEl ? avatEl.textContent.trim() : '') || name.charAt(0).toUpperCase();
          if (avatEl && avatEl.style.background) da.style.background = avatEl.style.background;
        }
      }
      var mo = new MutationObserver(function () { syncLinks(); syncUser(); });
      mo.observe(navLeft, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
      ['authNameInline', 'authRolePill', 'authAvatar'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
      });
      setTimeout(syncUser, 300);
      setTimeout(syncUser, 1500);

      /* Öffnen / Schließen */
      openDrawer = function () {
        syncLinks(); syncUser();
        drawer.classList.add('open');
        overlay.classList.add('open');
        /* Scroll im Content-Bereich sperren */
        if (scrollWrap) scrollWrap.style.overflow = 'hidden';
        else document.body.style.overflow = 'hidden';
        var first = drawer.querySelector('.drawerLink:not([style*="none"])');
        if (first) setTimeout(function () { first.focus(); }, 50);
      };
      closeDrawer = function () {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
        /* Scroll wieder freigeben */
        if (scrollWrap) scrollWrap.style.overflow = '';
        else document.body.style.overflow = '';
      };

      hamburger.addEventListener('click', function (e) {
        e.stopPropagation();
        drawer.classList.contains('open') ? closeDrawer() : openDrawer();
      });
      overlay.addEventListener('click', closeDrawer);
      var closeBtn = document.getElementById('drawerClose');
      if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
      drawer.querySelectorAll('.drawerLink').forEach(function (l) {
        l.addEventListener('click', closeDrawer);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
      });

      /* Swipe links → schließen */
      var tx = 0;
      drawer.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
      drawer.addEventListener('touchend', function (e) {
        if (tx - e.changedTouches[0].clientX > 55) closeDrawer();
      }, { passive: true });
    }

    /* 2. Tab Bar bauen (wird nach scrollWrap an body gehängt) */
    buildTabBar(openDrawer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }

})();
