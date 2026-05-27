(function () {
  'use strict';

  /* ============================================================
     BOTTOM TAB BAR
     ============================================================ */

  var TABS = [
    { href: 'index.html',       icon: '🏠', label: 'Dashboard'   },
    { href: 'members.html',     icon: '👥', label: 'Mitglieder'  },
    { href: 'anwaerter.html',   icon: '👶', label: 'Anwärter'    },
    { href: 'bewerbungen.html', icon: '📝', label: 'Bewerbungen' },
    { href: '#mehr',            icon: '☰',  label: 'Mehr', isMehr: true },
  ];

  function currentPage() {
    var p = window.location.pathname;
    return p.split('/').pop() || 'index.html';
  }

  function buildTabBar(openFn) {
    var page = currentPage();
    var bar  = document.createElement('nav');
    bar.className = 'bottomTabBar';
    bar.setAttribute('aria-label', 'Hauptnavigation');

    TABS.forEach(function (tab) {
      var isActive = !tab.isMehr &&
        (page === tab.href || (page === '' && tab.href === 'index.html'));

      if (tab.isMehr) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tabItem';
        btn.setAttribute('aria-label', 'Weiteres Menü öffnen');
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

    document.body.appendChild(bar);

    /* Tastatur-Handling: Tab Bar verstecken wenn Tastatur offen
       (verhindert Layout-Chaos auf iOS wenn Inputs fokussiert sind) */
    function hideBar()  { bar.style.setProperty('display', 'none',  'important'); }
    function showBar()  { bar.style.removeProperty('display'); }

    document.addEventListener('focusin', function (e) {
      if (e.target.matches('input, textarea, select')) hideBar();
    });
    document.addEventListener('focusout', function () {
      // Kleines Delay damit Blur nicht mit nächstem Fokus konkurriert
      setTimeout(showBar, 120);
    });

    return bar;
  }

  /* ============================================================
     DRAWER
     ============================================================ */

  function initMobileNav() {
    var hamburger = document.getElementById('hamburger');
    var navLeft   = document.querySelector('.navLeft');
    var navRight  = document.querySelector('.navRight');

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

      /* Overlay */
      var overlay = document.createElement('div');
      overlay.className = 'mobileOverlay';

      /* Drawer */
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

      /* Link-Sichtbarkeit mit navLeft synchron halten */
      function syncLinks() {
        var dLinks = drawer.querySelectorAll('.drawerLink');
        navLinks.forEach(function (nl, i) {
          if (dLinks[i]) dLinks[i].style.display = nl.style.display || '';
        });
      }

      /* Nutzer-Info aus Auth-Badge übernehmen */
      function syncUser() {
        var nameEl  = document.getElementById('authNameInline');
        var roleEl  = document.getElementById('authRolePill');
        var avatEl  = document.getElementById('authAvatar');
        var name    = nameEl ? nameEl.textContent.trim() : '';
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
        document.body.style.overflow = 'hidden';
        var first = drawer.querySelector('.drawerLink:not([style*="none"])');
        if (first) setTimeout(function () { first.focus(); }, 50);
      };

      closeDrawer = function () {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
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
      var tx = 0;
      drawer.addEventListener('touchstart', function (e) {
        tx = e.touches[0].clientX;
      }, { passive: true });
      drawer.addEventListener('touchend', function (e) {
        if (tx - e.changedTouches[0].clientX > 55) closeDrawer();
      }, { passive: true });
    }

    /* Tab Bar bauen */
    buildTabBar(openDrawer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }

})();
