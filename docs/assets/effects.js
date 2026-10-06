// Cosmetic state for effects.css: frosts the header once the page scrolls,
// reveals headings and the sale-to-key flow once, and feeds the pointer
// position to the card spotlight and the Marker card tilt.
(function () {
  var root = document.documentElement;
  function onScroll() { root.classList.toggle('scrolled', window.scrollY > 8); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'IntersectionObserver' in window) {
    root.classList.add('fx');
    var once = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        once.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.2 });
    var targets = document.querySelectorAll('section > h2, .flow');
    for (var i = 0; i < targets.length; i++) once.observe(targets[i]);
  }

  if (!window.matchMedia || !window.matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', function (event) {
    var card = event.target.closest && event.target.closest('.card');
    if (!card) return;
    var rect = card.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    card.style.setProperty('--mx', x + 'px');
    card.style.setProperty('--my', y + 'px');
    if (!reduce && card.classList.contains('try-card')) {
      card.classList.add('tilt');
      card.style.setProperty('--ry', ((x / rect.width - 0.5) * 6).toFixed(2) + 'deg');
      card.style.setProperty('--rx', ((0.5 - y / rect.height) * 6).toFixed(2) + 'deg');
    }
  }, { passive: true });
})();
