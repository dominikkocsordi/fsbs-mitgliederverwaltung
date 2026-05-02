(function () {
  function initMobileNav() {
    var hamburger = document.getElementById('hamburger');
    var navLeft = document.querySelector('.navLeft');
    if (!hamburger || !navLeft) return;

    function close() {
      navLeft.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.textContent = '☰';
    }

    hamburger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = navLeft.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
      hamburger.textContent = isOpen ? '✕' : '☰';
    });

    document.addEventListener('click', function (e) {
      if (!navLeft.contains(e.target) && e.target !== hamburger) close();
    });

    navLeft.querySelectorAll('.navLink').forEach(function (link) {
      link.addEventListener('click', close);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
