(function () {
  'use strict';

  function initMobileNav() {
    var hamburger = document.getElementById('hamburger');
    var navLeft   = document.querySelector('.navLeft');
    var navRight  = document.querySelector('.navRight');
    if (!hamburger || !navLeft) return;

    /* ---- Build drawer HTML ---- */
    var logoutBtn   = navRight ? navRight.querySelector('button') : null;
    var logoutAttr  = logoutBtn ? (logoutBtn.getAttribute('onclick') || '') : '';

    // Clone nav links into drawer links
    var navLinks = Array.from(navLeft.querySelectorAll('.navLink'));
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

    /* ---- Create DOM elements ---- */
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

    /* ---- Sync drawer link visibility from navLeft ---- */
    function syncLinks() {
      var drawerLinks = drawer.querySelectorAll('.drawerLink');
      navLinks.forEach(function (navLink, i) {
        if (!drawerLinks[i]) return;
        drawerLinks[i].style.display = navLink.style.display || '';
      });
    }

    /* ---- Sync user info from auth badge ---- */
    function syncUser() {
      var nameEl  = document.getElementById('authNameInline');
      var roleEl  = document.getElementById('authRolePill');
      var avatEl  = document.getElementById('authAvatar');
      var name    = nameEl  ? nameEl.textContent.trim()  : '';
      var role    = roleEl  ? roleEl.textContent.trim()  : '';
      var avatar  = avatEl  ? avatEl.textContent.trim()  : '';
      var avatBg  = avatEl  ? avatEl.style.background    : '';

      if (!name) return; // auth not loaded yet

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

    /* ---- MutationObserver: keep drawer in sync ---- */
    var mo = new MutationObserver(function () {
      syncLinks();
      syncUser();
    });
    mo.observe(navLeft, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    // also watch auth elements
    ['authNameInline', 'authRolePill', 'authAvatar'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
    });

    // Delayed initial sync (auth loads async)
    setTimeout(syncUser, 300);
    setTimeout(syncUser, 1200);

    /* ---- Open / Close ---- */
    function open() {
      syncLinks();
      syncUser();
      drawer.classList.add('open');
      overlay.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      var firstLink = drawer.querySelector('.drawerLink:not([style*="display:none"])');
      if (firstLink) firstLink.focus();
    }

    function close() {
      drawer.classList.remove('open');
      overlay.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      hamburger.focus();
    }

    hamburger.addEventListener('click', function (e) {
      e.stopPropagation();
      drawer.classList.contains('open') ? close() : open();
    });

    overlay.addEventListener('click', close);

    var closeBtn = document.getElementById('drawerClose');
    if (closeBtn) closeBtn.addEventListener('click', close);

    drawer.querySelectorAll('.drawerLink').forEach(function (link) {
      link.addEventListener('click', close);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });

    // Swipe left to close
    var touchStartX = 0;
    drawer.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    drawer.addEventListener('touchend', function (e) {
      if (touchStartX - e.changedTouches[0].clientX > 60) close();
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
