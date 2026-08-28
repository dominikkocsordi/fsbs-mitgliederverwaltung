/* ============================================================
   FSBS INTERN — App-Shell
   ------------------------------------------------------------
   Baut die vorhandene Kopf-/Navigationsstruktur jeder Seite in
   das Layout des Fachschaft-Checkin-Projekts um:

     <header class="siteHeader">   Logo · Nav-Pills · Aktionen
     <main class="app">
       <div class="pageHead">      Titel links · Kontext rechts
       … Seiteninhalt …

   Es werden ausschliesslich vorhandene Elemente verschoben —
   IDs, Event-Handler und Seiten-JS bleiben damit gültig.
   Läuft vor theme.js und mobile-nav.js.
   ============================================================ */
(function () {
  'use strict';

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function hasContent(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.querySelector('a, button, img, input, select')) return true;
    return node.textContent.trim().length > 0;
  }

  function build() {
    if (document.querySelector('.siteHeader')) return;

    var app = document.querySelector('.app');
    var top = document.querySelector('.top');
    var navWrap = document.querySelector('.navWrap');

    /* Nur Seiten mit Navigation bekommen die Shell —
       Login und die öffentliche Abstimmung behalten ihr eigenes Layout. */
    if (!app || !navWrap) return;

    var header = el('header', 'siteHeader');
    var inner = el('div', 'siteHeaderInner');
    header.appendChild(inner);

    /* ---------- 1. Wortmarke ---------- */
    var oldLogo = top && top.querySelector('.brandLogo');
    var logo = el('a', 'siteLogo');
    logo.href = (oldLogo && oldLogo.getAttribute('href')) || '/index.html';
    logo.title = 'FSBS Intern';
    logo.innerHTML =
      '<img class="siteLogoImg siteLogoImg--light" src="/logo-mark-light.png"' +
      ' alt="Fachschaft Business School e.V.">' +
      '<img class="siteLogoImg siteLogoImg--dark" src="/logo-mark-dark.png" alt="" aria-hidden="true">';
    inner.appendChild(logo);
    if (oldLogo && oldLogo.parentNode) oldLogo.parentNode.removeChild(oldLogo);

    /* ---------- 2. Navigation ---------- */
    var hamburger = document.getElementById('hamburger');
    if (hamburger) inner.appendChild(hamburger);

    var navLeft = navWrap && navWrap.querySelector('.navLeft');
    var nav = null;
    if (navLeft) {
      nav = el('nav', 'siteNav');
      nav.setAttribute('aria-label', 'Hauptnavigation');
      nav.appendChild(navLeft);
      inner.appendChild(nav);
    }

    /* ---------- 3. Aktionen rechts ---------- */
    var actions = el('div', 'siteActions');
    inner.appendChild(actions);

    var badge = document.getElementById('authBadge') || document.querySelector('.authFloating');
    var statusPill = document.getElementById('statusPill');
    if (statusPill) actions.appendChild(statusPill);

    var navRight = navWrap && navWrap.querySelector('.navRight');
    var userMenu = badge ? buildUserMenu(badge, navRight) : null;
    if (userMenu) actions.appendChild(userMenu);
    else if (navRight) actions.appendChild(navRight);

    /* ---------- 4. Seitenkopf ---------- */
    var pageHead = el('div', 'pageHead');
    var headMain = el('div', 'pageHeadMain');
    pageHead.appendChild(headMain);

    var h1 = top && top.querySelector('h1');
    var subtitle = top && top.querySelector('.subtitle');

    if (h1) headMain.appendChild(h1);

    var meta = el('p', 'pageHeadMeta');
    if (subtitle) {
      meta.appendChild(subtitle);
    } else {
      meta.textContent = 'Fachschaft Business School e.V.';
    }
    pageHead.appendChild(meta);

    /* Reste der alten Kopfzeile (z. B. Zurück-Links) nicht verlieren */
    if (top) {
      Array.prototype.slice.call(top.querySelectorAll('a, .pill')).forEach(function (node) {
        if (header.contains(node) || pageHead.contains(node)) return;
        if (!hasContent(node)) return;
        var extra = pageHead.querySelector('.pageHeadExtra');
        if (!extra) {
          extra = el('div', 'pageHeadExtra');
          headMain.insertBefore(extra, headMain.firstChild);
        }
        extra.appendChild(node);
      });
    }

    /* ---------- 5. Einsetzen & aufräumen ---------- */
    document.body.insertBefore(header, document.body.firstChild);
    app.classList.add('appMain');
    app.insertBefore(pageHead, app.firstChild);

    if (navWrap && navWrap.parentNode) navWrap.parentNode.removeChild(navWrap);
    if (top && top.parentNode) top.parentNode.removeChild(top);

    if (nav) setupOverflow(nav, navLeft);
  }


  /* ============================================================
     Konto-Menü
     ------------------------------------------------------------
     Baut aus dem vorhandenen Login-Chip einen Auslöser mit
     Aufklapper. Die IDs bleiben erhalten, damit das Seiten-JS
     (Anmeldestatus, Name, Rolle, Mail, Abmelden) weiter greift.
     ============================================================ */
  function buildUserMenu(badge, navRight) {
    var dot = badge.querySelector('.dot');
    var avatar = badge.querySelector('.authAvatar');
    var state = badge.querySelector('.authState');
    var compact = badge.querySelector('.authCompact');
    var name = badge.querySelector('.authNameInline');
    var role = badge.querySelector('.rolePill');
    var toggle = badge.querySelector('.authChevron');
    var details = badge.querySelector('.authDetails');
    var mail = badge.querySelector('.authMail');

    if (!toggle || !details) return badge;

    /* Der vorhandene Container wird selbst zum Menü — das Seiten-JS
       prüft für "Klick nach aussen" gegen #authBadge. */
    var wrap = badge;
    wrap.className = 'userMenu';
    wrap.removeAttribute('title');

    /* ---- Auslöser ----
       Frischer Button statt des alten Pfeils: Das Öffnen hängt damit
       nicht am Seiten-Skript, das je nach Ladezustand später kommt. */
    if (toggle.parentNode) toggle.parentNode.removeChild(toggle);
    toggle.removeAttribute('id');

    var trigger = el('button', 'userTrigger');
    trigger.type = 'button';
    trigger.id = 'authToggle';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Konto');
    wrap.appendChild(trigger);
    toggle = trigger;

    if (dot) toggle.appendChild(dot);
    if (avatar) toggle.appendChild(avatar);

    var label = el('span', 'userTriggerLabel');
    if (state) label.appendChild(state);
    if (compact) label.appendChild(compact);
    toggle.appendChild(label);

    var chev = el('span', 'userChevron');
    chev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    toggle.appendChild(chev);

    /* ---- Aufklapper ---- */
    details.className = 'userPanel' + (details.classList.contains('hidden') ? ' hidden' : '');
    details.setAttribute('role', 'menu');

    var head = el('div', 'userPanelHead');
    var pAvatar = el('div', 'userPanelAvatar');
    pAvatar.setAttribute('aria-hidden', 'true');
    var pText = el('div', 'userPanelText');
    var pName = el('div', 'userPanelName');
    pText.appendChild(pName);
    if (mail) pText.appendChild(mail);
    head.appendChild(pAvatar);
    head.appendChild(pText);
    details.insertBefore(head, details.firstChild);

    if (role) {
      var roleRow = el('div', 'userPanelRole');
      roleRow.appendChild(role);
      details.appendChild(roleRow);
    }

    if (navRight) {
      details.appendChild(el('div', 'userPanelSep'));
      navRight.classList.add('userPanelActions');
      Array.prototype.slice.call(navRight.querySelectorAll('button')).forEach(function (btn) {
        if (btn.querySelector('svg')) return;
        var icon = el('span', 'userPanelIcon');
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"' +
          ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M15 17l5-5-5-5"/><path d="M20 12H9"/>' +
          '<path d="M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/></svg>';
        btn.insertBefore(icon, btn.firstChild);
      });
      details.appendChild(navRight);
    }

    wrap.appendChild(details);

    /* Reste der alten Struktur entfernen */
    Array.prototype.slice.call(wrap.querySelectorAll('.authInfo, .authTopLine')).forEach(function (n) {
      if (!n.querySelector('.userTrigger, .userPanel') && n.parentNode) n.parentNode.removeChild(n);
    });

    /* ---- Name und Profilbild in den Aufklapper spiegeln ---- */
    var mirroring = false;

    function mirror() {
      if (mirroring) return;
      mirroring = true;
      if (name) pName.textContent = name.textContent.trim();
      if (avatar) {
        pAvatar.textContent = avatar.textContent.trim();
        pAvatar.style.background = avatar.style.background || '';
        pAvatar.style.display = avatar.classList.contains('hidden') ? 'none' : '';
      }
      var loggedIn = !(compact && compact.classList.contains('hidden'));
      wrap.classList.toggle('is-authed', loggedIn);
      toggle.setAttribute('aria-expanded', String(!details.classList.contains('hidden')));
      requestAnimationFrame(function () { mirroring = false; });
    }
    mirror();

    /* Quellen beobachten — nicht den Aufklapper selbst, sonst
       würde das Spiegeln sich gegenseitig auslösen. */
    var mo = new MutationObserver(mirror);
    [name, avatar, compact].forEach(function (n) {
      if (n) mo.observe(n, { attributes: true, childList: true, characterData: true, subtree: true });
    });
    mo.observe(details, { attributes: true, attributeFilter: ['class'] });

    /* ---- Öffnen und Schliessen ---- */
    function close() {
      details.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!wrap.classList.contains('is-authed')) return;
      var open = details.classList.contains('hidden');
      details.classList.toggle('hidden', !open);
      toggle.setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    /* Nach dem Abmelden schliessen */
    if (navRight) {
      navRight.addEventListener('click', function () { close(); });
    }

    return wrap;
  }

  /* ============================================================
     Overflow-Menü: was nicht in die Kopfzeile passt, wandert in
     ein Aufklapp-Menü — die Leiste bleibt damit immer aufgeräumt.
     ============================================================ */
  function setupOverflow(nav, navLeft) {
    var links = Array.prototype.slice.call(navLeft.querySelectorAll('.navLink'));
    if (links.length < 2) return;

    var wrap = el('div', 'navMore');
    var btn = el('button', 'navMoreBtn');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-haspopup', 'true');
    btn.innerHTML = 'Mehr <span class="navMoreChevron" aria-hidden="true">⌄</span>';

    var menu = el('div', 'navMoreMenu');
    menu.hidden = true;

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    nav.appendChild(wrap);

    function isHidden(link) {
      return link.style.display === 'none' || link.classList.contains('hidden');
    }

    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('open');
    }

    function toggle() {
      var open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      wrap.classList.toggle('open', open);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    var raf = null;
    var applying = false;

    function layout() {
      raf = null;
      applying = true;
      close();

      /* Alles zurück in die Leiste, in Originalreihenfolge */
      links.forEach(function (link) {
        link.classList.remove('navLink--menu');
        navLeft.appendChild(link);
      });
      wrap.style.display = 'none';

      var visible = links.filter(function (l) { return !isHidden(l); });
      if (!visible.length) return;

      /* Solange es zu breit ist: letzten sichtbaren Punkt ins Menü schieben */
      var guard = 0;
      while (navLeft.scrollWidth > navLeft.clientWidth + 1 && guard < links.length) {
        guard++;
        var pool = links.filter(function (l) {
          return !isHidden(l) && l.parentNode === navLeft;
        });
        if (pool.length <= 1) break;
        var moved = pool[pool.length - 1];
        moved.classList.add('navLink--menu');
        menu.insertBefore(moved, menu.firstChild);
        wrap.style.display = '';
        if (navLeft.scrollWidth <= navLeft.clientWidth + 1) break;
      }

      var inMenu = links.filter(function (l) { return l.parentNode === menu && !isHidden(l); });
      wrap.style.display = inMenu.length ? '' : 'none';
      btn.classList.toggle('active', inMenu.some(function (l) {
        return l.classList.contains('active');
      }));

      /* Die eigenen Umbauten dürfen keinen weiteren Lauf auslösen */
      requestAnimationFrame(function () { applying = false; });
    }

    function schedule() {
      if (applying || raf) return;
      raf = requestAnimationFrame(layout);
    }

    schedule();
    window.addEventListener('resize', schedule, { passive: true });

    /* Seiten-JS blendet Navigationspunkte je nach Rolle ein/aus */
    var mo = new MutationObserver(schedule);
    links.forEach(function (l) {
      mo.observe(l, { attributes: true, attributeFilter: ['style', 'class'] });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
