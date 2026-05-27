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
  var TABS = [
    { href: 'index.html',       icon: '🏠', label: 'Dashboard'   },
    { href: 'members.html',     icon: '👥', label: 'Mitglieder'  },
    { href: 'anwaerter.html',   icon: '👶', label: 'Anwärter'    },
    { href: 'bewerbungen.html', icon: '📝', label: 'Bewerbungen' },
    { href: '#mehr',            icon: '☰',  label: 'Mehr', isMehr: true },
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

    /* ─────────────────────────────────────────────────────────
       LIQUID MORPH PILL
       Stretch-then-snap: pill instantly spans old→new tab,
       then spring-snaps to the target shape.
       This produces the iOS 26 "liquid drop" morphing effect.
       ───────────────────────────────────────────────────────── */
    var pillLeft  = 0;
    var pillWidth = 0;
    var pillReady = false;
    var INSET     = 8; /* px of horizontal padding inside each tab */

    function pillTarget(item) {
      var barRect = bar.getBoundingClientRect();
      var iRect   = item.getBoundingClientRect();
      return {
        left:  iRect.left - barRect.left + INSET,
        width: iRect.width - INSET * 2
      };
    }

    function placePillSilent(left, width) {
      pill.style.transition   = 'none';
      pill.style.left         = left  + 'px';
      pill.style.width        = width + 'px';
      pill.style.borderRadius = '18px';
      pill.style.opacity      = '1';
      pillLeft  = left;
      pillWidth = width;
    }

    function movePill(target) {
      if (!target) { pill.style.opacity = '0'; return; }

      var t = pillTarget(target);

      /* First call — silent placement, bar entrance handles visual */
      if (!pillReady) {
        placePillSilent(t.left, t.width);
        pillReady = true;
        return;
      }

      /* Already placed — liquid stretch-morph to new position */
      var fromRight    = pillLeft + pillWidth;
      var toRight      = t.left   + t.width;
      var goingRight   = t.left   > pillLeft;

      /* Stretch bounds: span from leading edge of origin to trailing edge of target */
      var sLeft  = Math.min(pillLeft, t.left);
      var sRight = Math.max(fromRight, toRight);
      var sWidth = sRight - sLeft;

      /* While stretched, squish the trailing corners — gives the
         "liquid blob pulling itself forward" look                */
      var squish = Math.max(5, 18 - Math.round(sWidth / 18));
      var squishRadius = goingRight
        ? (squish + 'px 18px 18px ' + squish + 'px')   /* left corners squish */
        : ('18px ' + squish + 'px ' + squish + 'px 18px'); /* right corners squish */

      /* Phase 1: instant stretch */
      pill.style.transition    = 'none';
      pill.style.left          = sLeft  + 'px';
      pill.style.width         = sWidth + 'px';
      pill.style.borderRadius  = squishRadius;

      /* Phase 2: spring-snap to target (double-rAF ensures Phase 1 painted) */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          pill.style.transition =
            'left          .40s cubic-bezier(.34,1.56,.64,1),' +
            'width         .40s cubic-bezier(.34,1.56,.64,1),' +
            'border-radius .22s ease .04s';
          pill.style.left         = t.left  + 'px';
          pill.style.width        = t.width + 'px';
          pill.style.borderRadius = '18px';
          pillLeft  = t.left;
          pillWidth = t.width;
        });
      });
    }

    /* Place pill once layout is ready */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        movePill(bar.querySelector('.tabItem.active'));
      });
    });

    /* Re-sync after orientation flip / resize */
    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        var active = bar.querySelector('.tabItem.active');
        if (active) { placePillSilent(pillTarget(active).left, pillTarget(active).width); }
      }, 380);
    }, { passive: true });
    window.addEventListener('resize', function () {
      var active = bar.querySelector('.tabItem.active');
      if (active) { placePillSilent(pillTarget(active).left, pillTarget(active).width); }
    }, { passive: true });

    /* Trigger morph on tab tap (pill starts moving before page unloads) */
    bar.querySelectorAll('a.tabItem').forEach(function (a) {
      a.addEventListener('click', function () { movePill(a); });
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
            '<img class="drawerLogoImg" src="/logo.png" alt="FSBS"' +
            ' onerror="this.style.display=\'none\'">' +
            '<span class="drawerAppName">FSBS Intern</span>' +
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
          '<button class="drawerLogout" type="button"' +
          (logoutAttr ? ' onclick="' + logoutAttr + '"' : '') + '>' +
          '🚪 Logout</button>' +
        '</div>';

      document.body.appendChild(overlay);
      document.body.appendChild(drawer);

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
        if (!name) return;
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
