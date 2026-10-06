// Cosmetic state for effects.css: frosts the header once the page scrolls and
// feeds the pointer position to the card spotlight.
(function () {
  var root = document.documentElement;
  function onScroll() { root.classList.toggle('scrolled', window.scrollY > 8); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (!window.matchMedia || !window.matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', function (event) {
    var card = event.target.closest && event.target.closest('.card');
    if (!card) return;
    var rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', (event.clientX - rect.left) + 'px');
    card.style.setProperty('--my', (event.clientY - rect.top) + 'px');
  }, { passive: true });
})();
