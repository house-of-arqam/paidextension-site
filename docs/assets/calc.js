// Live rows of the comparison table: what you keep per month on each stack,
// from three sliders and a handful of editable assumptions. The defaults are
// the published figures at the time of writing (see the footnote in the HTML).
(function () {
  var root = document.getElementById('compare');
  if (!root) return;

  var inputs = {};
  var fields = root.querySelectorAll('[data-input]');
  for (var i = 0; i < fields.length; i++) inputs[fields[i].getAttribute('data-input')] = fields[i];

  var out = {};
  var outs = root.querySelectorAll('[data-out]');
  for (var j = 0; j < outs.length; j++) out[outs[j].getAttribute('data-out')] = outs[j];

  function num(name) {
    var v = parseFloat(inputs[name].value);
    return isFinite(v) ? v : 0;
  }
  function money(n) {
    var sign = n < 0 ? '−' : '';
    n = Math.abs(n);
    return sign + '$' + (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(n < 10 && n !== Math.round(n) ? 2 : 0));
  }
  function setText(name, text) {
    if (out[name]) out[name].textContent = text;
  }

  // The three "you keep" figures roll to their new value so a slider move
  // reads as a change, not a swap. Instant when reduced motion is preferred.
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shown = {};
  var frames = {};
  function setMoney(name, value) {
    if (!out[name]) return;
    var from = shown[name];
    if (reduce || from === undefined || !window.requestAnimationFrame) {
      shown[name] = value;
      out[name].textContent = money(value);
      return;
    }
    if (frames[name]) window.cancelAnimationFrame(frames[name]);
    var start = null;
    frames[name] = window.requestAnimationFrame(function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / 320);
      var eased = 1 - Math.pow(1 - t, 3);
      shown[name] = from + (value - from) * eased;
      out[name].textContent = money(t === 1 ? value : Math.round(shown[name]));
      if (t < 1) frames[name] = window.requestAnimationFrame(step);
    });
  }

  function compute() {
    var price = num('price');
    var sales = num('sales');
    var users = num('users');
    var gross = price * sales;

    // PaidExtension: Paddle 5% + 50¢ per sale, $0 infra inside the free tiers.
    // Measured per licensed install (Pro or trial; free users never call the
    // licence server): ~1 KV write a day and up to ~32 requests a day (a
    // renewal every 30 min while the browser is open). Free KV allows 1,000
    // writes a day, so ~1,000 active licensed installs; Workers Paid is
    // $5/month with 10M requests and 1M writes a month included, then
    // $0.30 per extra million requests and $5 per extra million writes.
    var paddle = sales * (price * 0.05 + 0.5);
    var requestsPerMonth = users * 32 * 30;
    var writesPerMonth = users * 30;
    var usInfra = users <= 1000 ? 0 : 5 +
      Math.max(0, requestsPerMonth - 10e6) / 1e6 * 0.30 +
      Math.max(0, writesPerMonth - 1e6) / 1e6 * 5;
    var usKeep = gross - paddle - usInfra;

    // Without a merchant of record, sales tax is yours: a calculation tool
    // (Stripe Tax 0.5% per transaction) plus registrations/filings.
    var tax = gross * (num('taxRate') / 100) + num('tax');

    // Hosted payments SDK: their cut + Stripe processing, tax still yours.
    var sdkCut = sales * (price * (num('sdkRate') / 100));
    var stripe = sales * (price * 0.029 + 0.3);
    var sdkKeep = gross - sdkCut - stripe - tax;

    // DIY: Stripe + a hosted backend/db bill (Supabase Pro / Firebase Blaze…).
    var hosting = num('hosting');
    var diyKeep = gross - stripe - hosting - tax;

    setText('gross', money(gross));
    setMoney('usKeep', usKeep);
    setMoney('sdkKeep', sdkKeep);
    setMoney('diyKeep', diyKeep);
    setText('usCost', money(paddle) + ' fees · ' + money(usInfra) + ' infra · tax included');
    setText('sdkCost', money(sdkCut + stripe) + ' fees · $0 infra · ' + money(tax) + ' tax');
    setText('diyCost', money(stripe) + ' fees · ' + money(hosting) + ' infra · ' + money(tax) + ' tax');

    var delta = usKeep - Math.max(sdkKeep, diyKeep);
    var abs = Math.abs(delta);
    setText('delta', delta >= 0
      ? 'PaidExtension keeps ' + money(abs) + '/month more than the next best stack — ' + money(abs * 36) + ' over three years, and Paddle files the sales tax.'
      : 'On paper the next best stack keeps ' + money(abs) + '/month more — before your own hours registering and filing sales tax in every jurisdiction.');

    setText('priceEcho', money(price));
    setText('salesEcho', String(sales));
    setText('usersEcho', users >= 1000 ? (users / 1000).toFixed(users % 1000 ? 1 : 0) + 'k' : String(users));
    setText('freeTier', users > 1000 ? 'Your installs are above the Workers free tier, so the $5/month plan is counted.' : 'Your installs fit inside the Cloudflare Workers + KV free tier.');
  }

  root.addEventListener('input', compute);
  compute();
})();
