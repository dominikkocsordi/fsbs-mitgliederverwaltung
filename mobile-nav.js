(function () {
  'use strict';

  /* ============================================================
     BOTTOM TAB BAR – native App-Navigation am unteren Rand
     ============================================================ */

  /* Tabs die immer angezeigt werden (erste 4 = Haupt-Tabs) */
  var TABS = [
    { href: 'index.html',       icon: '🏠', label: 'Dashboard'   },
    { href: 'members.html',     icon: '👥', label: 'Mitglieder'  },
    { href: 'anwaerter.html',   icon: '👶', label: 'Anwärter'    },
    { href: 'bewerbungen.html', icon: '📝', label: 'Bewerbungen' },
    { href: '#mehr',            icon: '☰',  label: 'Mehr',  isMehr: true },
  ];

  /* Aktuelle Seite erkennen */
  function currentPage() {
    var path = window.location.pathname;
    var file = path.split('/').pop() || 'index.html';
    return file || 'index.html';
  }

  function buildTabBar(openDrawerFn) {
    var page = currentPage();
    var bar  = document.createElement('nav');
    bar.className = 'bottomTabBar';
    bar.setAttribute('aria-label', 'Hauptnavigation');

    TABS.forEach(function (tab) {
      var isActive = !tab.isMehr && (
        page === tab.href ||
        (page === '' && tab.href === 'index.html')
      );

      if (tab.isMehr) {
        /* "Mehr" öffnet den Drawer */
        var btn = document.createElement('button');
        btn.className = 'tabItem';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Mehr Navigation');
        btn.innerHTML =
          '<span class="tabIcon">' + tab.icon + '</span>' +
          '<span class="tabLabel">' + tab.label + '</span>';
        btn.addEventListener('click', function () {
          if (typeof openDrawerFn === 'function') openDrawerFn();
        });
        bar.appendChild(btn);
      } else {
        var a = document.createElement('a');
        a.className = 'tabItem' + (isActive ? ' active' : '');
        a.href = '/' + tab.href;
        a.setAttribute('aria-label', tab.label);
        if (isActive) a.setAttribute('aria-current', 'page');
        a.innerHTML =
          '<span class="tabIcon">' + tab.icon + '</span>' +
          '<span class="tabLabel">' + tab.label + '</span>';
        bar.appendChild(a);
      }
    });

    document.body.appendChild(bar);
    return bar;
  }

  /* ============================================================
     DRAWER – Slide-in Navigation
     ============================================================ */

  function initMobileNav() {
    var hamburger = document.getElementById('hamburger');
    var navLeft   = document.querySelector('.navLeft');
    var navRight  = document.querySelector('.navRight');

    /* ---- Drawer bauen (nur wenn Nav-Elemente existieren) ---- */
    var openDrawer, closeDrawer;

    if (hamburger && navLeft) {
      var logoutBtn  = navRight ? navRight.querySelector('button') : null;
      var logoutAttr = logoutBtn ? (logoutBtn.getAttribute('onclick') || '') : '';

      /* Nav-Links in Drawer-Links umwandeln */
      var navLinks  = Array.from(navLeft.querySelectorAll('.navLink'));
      var linksHtml = navLinks.map(function (link) {
        var href     = link.getAttribute('href') || '#';
        var text     = link.textContent.trim();
        var isActive = link.classList.contains('active');
        var hidden   = link.style.display === 'none';
        return '<a class="drawerLink' + (isActive ? ' active' : '') + '"'
          + ' href="' + href + '"'
          + (hidden ? ' style="display:none"' : '')
          + ' data-navid="' + (link.id || '') + '">'
          + text + '</a>';
      }).join('');

      /* DOM-Elemente erstellen */
      var overlay = document.createElement('div');
      overlay.className = 'mobileOverlay';

      var drawer = document.createElement('div');
      drawer.className = 'mobileDrawer';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-label', 'Navigation');
      drawer.innerHTML =
        '<div class="drawerHeader">'
          + '<div class="drawerLogo">'
            + '<img class="drawerLogoImg" src="/logo.png" alt="FSBS"'
            + ' onerror="this.style.display=\'none\'">'
            + '<span class="drawerAppName">FSBS Intern</span>'
          + '</div>'
          + '<button class="drawerClose" id="drawerClose" type="button" aria-label="Menü schließen">✕</button>'
        + '</div>'
        + '<div class="drawerUser" id="drawerUser" style="display:none">'
          + '<div class="drawerUserInner">'
            + '<div class="drawerAvatar" id="drawerAvatarEl">U</div>'
            + '<div class="drawerUserInfo">'
              + '<div class="drawerUserName" id="drawerNameEl">–</div>'
              + '<div class="drawerUserRole" id="drawerRoleEl"></div>'
            + '</div>'
          + '</div>'
        + '</div>'
        + '<div class="drawerLinks" id="drawerLinks">' + linksHtml + '</div>'
        + '<div class="drawerFooter">'
          + '<button class="drawerLogout" type="button"'
          + (logoutAttr ? ' onclick="' + logoutAttr + '"' : '') + '>'
          + '🚪 Logout</button>'
        + '</div>';

      document.body.appendChild(overlay);
      document.body.appendChild(drawer);

      /* ---- Drawer-Links-Sichtbarkeit synchronisieren ---- */
      function syncLinks() {
        var drawerLinks = drawer.querySelectorAll('.drawerLink');
        navLinks.forEach(function (navLink, i) {
          if (!drawerLinks[i]) return;
          drawerLinks[i].style.display = navLink.style.display || '';
        });
      }

      /* ---- User-Info aus Auth-Badge synchronisieren ---- */
      function syncUser() {
        var nameEl = document.getElementById('authNameInline');
        var roleEl = document.getElementById('authRolePill');
        var avatEl = document.getElementById('authAvatar');
        var name   = nameEl ? nameEl.textContent.trim() : '';
        var role   = roleEl ? roleEl.textContent.trim() : '';
        var avatar = avatEl ? avatEl.textContent.trim() : '';
        var avatBg = avatEl ? avatEl.style.background    : '';

        if (!name) return;

        var drawerUser = document.getElementById('drawerUser');
        var dName = document.getElementById('drawerNameEl');
        var dRole = document.getElementById('drawerRoleEl');
        var dAvat = document.getElementById('drawerAvatarEl');

        if (drawerUser) drawerUser.style.display = '';
        if (dName) dName.textContent = name;
        if (dRole) dRole.textContent = role;
        if (dAvat) {
          dAvat.textContent = avatar || name.charAt(0).toUpperCase();
          if (avatBg) dAvat.style.background = avatBg;
        }
      }

      /* ---- MutationObserver: Drawer in Sync halten ---- */
      var mo = new MutationObserver(function () {
        syncLinks();
        syncUser();
      });
      mo.observe(navLeft, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

      ['authNameInline', 'authRolePill', 'authAvatar'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
      });

      setTimeout(syncUser, 300);
      setTimeout(syncUser, 1200);

      /* ---- Öffnen / Schließen ---- */
      openDrawer = function () {
        syncLinks();
        syncUser();
        drawer.classList.add('open');
        overlay.classList.add('open');
        hamburger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
        var firstLink = drawer.querySelector('.drawerLink:not([style*="display:none"])');
        if (firstLink) firstLink.focus();
      };

      closeDrawer = function () {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
        hamburger.focus();
      };

      hamburger.addEventListener('click', function (e) {
        e.stopPropagation();
        drawer.classList.contains('open') ? closeDrawer() : openDrawer();
      });

      overlay.addEventListener('click', closeDrawer);

      var closeBtn = document.getElementById('drawerClose');
      if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

      drawer.querySelectorAll('.drawerLink').forEach(function (link) {
        link.addEventListener('click', closeDrawer);
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
      });

      /* Swipe nach links = Drawer schließen */
      var touchStartX = 0;
      drawer.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });
      drawer.addEventListener('touchend', function (e) {
        if (touchStartX - e.changedTouches[0].clientX > 60) closeDrawer();
      }, { passive: true });
    }

    /* ---- Bottom Tab Bar bauen ---- */
    buildTabBar(openDrawer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
