// Launch price. launch.json is refreshed by the launch-counter workflow from
// Polar's redemption count; Polar itself stops applying the discount after the
// cap, so this only flips the card to the full price then. The remaining count
// is deliberately not shown. Without the
// file (or with JS off) the page shows the launch price and static copy.
(function () {
  if (!window.fetch) return;
  fetch('launch.json', { cache: 'no-cache' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data || typeof data.max !== 'number' || typeof data.redeemed !== 'number') return;
      var left = Math.max(0, data.max - data.redeemed);
      if (left === 0) {
        document.documentElement.classList.add('launch-over');
        var prices = document.querySelectorAll('[data-price-full]');
        for (var j = 0; j < prices.length; j++) prices[j].textContent = prices[j].getAttribute('data-price-full');
      } else {
        document.documentElement.classList.add('launch-live');
      }
    })
    .catch(function () { /* static copy stays */ });
})();
