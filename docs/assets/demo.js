// Live licensing demo. Plays both roles of the kit in one page: the "Worker"
// (signs ES256 license keys and entitlement tokens, keeps the seat registry,
// revokes on refund) and the "extension" (verifies keys offline with only the
// public key). The keypair is generated fresh in the browser on every load, so
// nothing here is a real credential. The verification code mirrors
// extension/src/licensing/verify.ts.
(function () {
  var root = document.getElementById('demo');
  if (!root || !window.crypto || !window.crypto.subtle || !window.TextEncoder) return;

  var ISSUER = 'acme-extension';
  var MAX_SEATS = 3;
  var TRIAL_DAYS = 7;
  var ENTITLEMENT_DAYS = 3;

  var $ = function (sel) { return root.querySelector(sel); };
  var el = {
    tier: $('[data-tier]'),
    plan: $('[data-plan]'),
    seats: $('[data-seats]'),
    key: $('[data-key]'),
    log: $('[data-log]'),
    features: root.querySelectorAll('[data-feature]'),
    buttons: root.querySelectorAll('[data-action]'),
    server: $('[data-server]'),
    edge: $('.popup-edge'),
    guideStep: $('[data-guide-step]'),
    guideText: $('[data-guide-text]')
  };

  // ---- "Worker" state -----------------------------------------------------
  var keyPair = null;
  var licenses = {}; // sub -> { plan, status, installs: [] }
  var serverUp = true;

  // ---- "Extension" state --------------------------------------------------
  var installId = 'install_' + randomId(6);
  var storedKey = null;
  var storedToken = null;
  var lastEvent = 'start'; // drives the walkthrough copy

  function randomId(n) {
    var bytes = new Uint8Array(n);
    window.crypto.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] % 36).toString(36);
    return out;
  }

  function b64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(seg) {
    var pad = seg.length % 4 === 0 ? '' : '='.repeat(4 - (seg.length % 4));
    var bin = atob(seg.replace(/-/g, '+').replace(/_/g, '/') + pad);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function encodeJson(obj) { return b64url(new TextEncoder().encode(JSON.stringify(obj))); }
  function decodeJson(seg) { return JSON.parse(new TextDecoder().decode(b64urlDecode(seg))); }
  function now() { return Math.floor(Date.now() / 1000); }

  // Worker side: sign { sub, plan, iss, iat, exp } with the private key.
  function sign(claims) {
    var header = encodeJson({ alg: 'ES256', typ: 'JWT' });
    var payload = encodeJson(claims);
    var data = new TextEncoder().encode(header + '.' + payload);
    return window.crypto.subtle
      .sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, data)
      .then(function (sig) { return header + '.' + payload + '.' + b64url(new Uint8Array(sig)); });
  }

  // Extension side: verify with the PUBLIC key only. Same failure taxonomy as
  // the kit: malformed | bad-signature | expired | wrong-issuer.
  function verify(jwt) {
    var parts = typeof jwt === 'string' ? jwt.split('.') : [];
    if (parts.length !== 3) return Promise.resolve({ ok: false, reason: 'malformed' });
    var claims;
    try { claims = decodeJson(parts[1]); } catch (_err) { return Promise.resolve({ ok: false, reason: 'malformed' }); }
    var data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    var sig;
    try { sig = b64urlDecode(parts[2]); } catch (_err) { return Promise.resolve({ ok: false, reason: 'malformed' }); }
    return window.crypto.subtle
      .verify({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.publicKey, sig, data)
      .then(function (valid) {
        if (!valid) return { ok: false, reason: 'bad-signature' };
        if (claims.iss !== ISSUER) return { ok: false, reason: 'wrong-issuer' };
        if (typeof claims.exp !== 'number' || claims.exp <= now()) return { ok: false, reason: 'expired' };
        return { ok: true, claims: claims };
      }, function () { return { ok: false, reason: 'verify-error' }; });
  }

  // ---- Worker routes --------------------------------------------------------
  function routeTrial() {
    if (!serverUp) return Promise.reject({ error: 'network' });
    var sub = 'trial_' + randomId(8);
    licenses[sub] = { plan: 'trial', status: 'active', installs: [] };
    return sign({ sub: sub, plan: 'trial', iss: ISSUER, iat: now(), exp: now() + TRIAL_DAYS * 86400 });
  }
  function routeWebhook(plan) {
    if (!serverUp) return Promise.reject({ error: 'network' });
    var sub = (plan === 'lifetime' ? 'txn_' : 'sub_') + randomId(10);
    licenses[sub] = { plan: plan, status: 'active', installs: [] };
    var days = plan === 'monthly' ? 31 : plan === 'yearly' ? 366 : 36500;
    return sign({ sub: sub, plan: plan, iss: ISSUER, iat: now(), exp: now() + days * 86400 }).then(function (key) {
      return { sub: sub, key: key };
    });
  }
  function routeActivate(key, install) {
    if (!serverUp) return Promise.reject({ error: 'network' });
    return verify(key).then(function (res) {
      if (!res.ok) return Promise.reject({ error: 'invalid_key', reason: res.reason });
      var lic = licenses[res.claims.sub];
      if (!lic || lic.status !== 'active') return Promise.reject({ error: 'subscription_inactive', status: lic ? lic.status : 'unknown' });
      if (res.claims.plan !== 'trial') {
        var known = lic.installs.indexOf(install) !== -1;
        if (!known && lic.installs.length >= MAX_SEATS) {
          return Promise.reject({ error: 'seat_limit', seats: { used: lic.installs.length, max: MAX_SEATS } });
        }
        if (!known) lic.installs.push(install);
      }
      var exp = Math.min(res.claims.exp, now() + ENTITLEMENT_DAYS * 86400);
      return sign({
        sub: res.claims.sub, plan: res.claims.plan, iss: ISSUER, iat: now(), exp: exp, typ: 'entitlement', install: install
      }).then(function (token) {
        return { token: token, seats: res.claims.plan === 'trial' ? null : { used: lic.installs.length, max: MAX_SEATS } };
      });
    });
  }
  function routeRefund(sub) {
    var lic = licenses[sub];
    if (!lic) return;
    lic.status = 'cancelled';
    lic.installs = [];
  }

  // ---- Extension UI -----------------------------------------------------------
  function log(kind, text, mono) {
    var line = document.createElement('div');
    line.className = 'demo-line ' + kind;
    var who = document.createElement('span');
    who.className = 'who';
    who.textContent = kind === 'worker' ? 'worker' : kind === 'paddle' ? 'paddle' : kind === 'error' ? 'error' : 'extension';
    var msg = document.createElement('span');
    if (mono) msg.className = 'mono';
    msg.textContent = text;
    line.appendChild(who);
    line.appendChild(msg);
    el.log.appendChild(line);
    while (el.log.childNodes.length > 9) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function shorten(jwt) {
    if (!jwt) return '—';
    var parts = jwt.split('.');
    return parts[0].slice(0, 8) + '…' + parts[1].slice(0, 10) + '…' + parts[2].slice(-8);
  }

  var popup = $('.popup');
  function flash(node, name) {
    if (!node) return;
    node.classList.remove(name);
    void node.offsetWidth; // restart the animation if it is mid-run
    node.classList.add(name);
  }
  root.addEventListener('animationend', function (event) {
    if (event.animationName === 'beam' || event.animationName === 'tier-flip') event.target.classList.remove('beam', 'flip');
  });

  var FREE = ['basicMode'];
  var PRO = ['basicMode', 'advancedMode', 'exportData', 'unlimitedItems'];

  function render(status, seats) {
    var tier = status.tier;
    el.tier.textContent = tier === 'pro' ? 'Pro' : tier === 'trial' ? 'Trial' : 'Free';
    el.tier.className = 'demo-tier ' + tier;
    el.plan.textContent = status.detail;
    el.seats.textContent = seats ? seats.used + ' of ' + seats.max + ' devices' : tier === 'trial' ? 'trial — no seat used' : '—';
    el.key.textContent = shorten(storedToken || storedKey);
    var allowed = tier === 'free' ? FREE : PRO;
    for (var i = 0; i < el.features.length; i++) {
      var f = el.features[i];
      var on = allowed.indexOf(f.getAttribute('data-feature')) !== -1;
      f.classList.toggle('on', on);
      f.setAttribute('aria-disabled', String(!on));
    }
    // A licence state change is the moment worth looking at: one sweep of
    // light round the popup and a pop on the badge (effects.css; no-ops when
    // the visitor prefers reduced motion).
    if (root.getAttribute('data-state') !== tier) {
      flash(popup, 'beam');
      flash(el.tier, 'flip');
    }
    root.setAttribute('data-state', tier);
    for (var j = 0; j < el.buttons.length; j++) {
      var b = el.buttons[j];
      var needs = b.getAttribute('data-needs');
      b.disabled = needs === 'key' ? !storedKey
        : needs === 'free' ? !!storedKey
          : needs === 'notpro' ? tier === 'pro'
            : needs === 'paid' ? tier !== 'pro'
              : false;
    }
    guide(tier, seats);
  }

  // Walkthrough: one sentence on what just happened and which button to press
  // next. Steps 1-5 are the happy path; edge cases get their own copy.
  function guide(tier, seats) {
    var step = '';
    var text = '';
    var next = null;
    var em = null;
    if (!serverUp) {
      step = 'Worker down';
      text = tier === 'free'
        ? 'No license is stored, so there is nothing to keep alive: a fresh install stays Free until the Worker is reachable again. Toggle the outage off to continue.'
        : 'Renewal failed, but the extension verifies the stored token with the embedded public key — no server call needed — so ' + (tier === 'pro' ? 'Pro' : 'the trial') + ' stays on until the token expires in ' + ENTITLEMENT_DAYS + ' days. Toggle the outage off to renew.';
      next = 'offline';
    } else if (lastEvent === 'tamper') {
      step = 'Tamper rejected';
      text = 'The payload said "lifetime", but one changed byte broke the ES256 signature, so the extension treated the token as invalid and cleared it. No cached flag to flip — the entitlement is the signed token or nothing.';
      next = 'reset'; em = 'Reset';
    } else if (lastEvent === 'refund') {
      step = 'Step 5 of 5 · Revoked';
      text = 'Paddle\u2019s refund webhook flipped the license to cancelled. At the next entitlement renewal /activate answered 403, the extension cleared the key and every Pro gate closed — no kill switch, no support ticket. Reset to replay, or open Edge cases.';
      next = 'reset'; em = 'Reset';
    } else if (tier === 'free') {
      step = 'Step 1 of 5 · Fresh install';
      text = 'This is the popup of an extension built with the kit. Start 7-day trial: the Worker signs a 7-day trial key and the extension verifies it with only the public key.';
      next = 'trial'; em = 'Start 7-day trial';
    } else if (tier === 'trial') {
      step = 'Step 2 of 5 · Trial';
      text = 'The signature checked out offline and the Worker issued an install-bound entitlement token, so Pro features are on without using a paid seat. Next, Buy lifetime (sandbox): a Paddle purchase becomes a signed lifetime key via webhook.';
      next = 'buy'; em = 'Buy lifetime (sandbox)';
    } else if (seats && seats.used >= seats.max) {
      step = 'Step 4 of 5 · Seat limit';
      text = 'The fourth browser got 409 seat_limit; the extension tells the user to release a device instead of failing silently. Next, Refund the purchase to see revocation.';
      next = 'refund'; em = 'Refund';
    } else {
      step = 'Step 3 of 5 · Pro';
      text = 'Paddle\u2019s webhook made the Worker sign a lifetime key (emailed to the buyer); this install took seat ' + (seats ? seats.used + ' of ' + seats.max : '1 of ' + MAX_SEATS) + '. Add 3 more devices to see the seat limit enforced.';
      next = 'seats'; em = 'Add 3 more devices';
    }
    el.guideStep.textContent = step;
    el.guideText.textContent = '';
    if (em) {
      var idx = text.indexOf(em);
      if (idx !== -1) {
        el.guideText.appendChild(document.createTextNode(text.slice(0, idx)));
        var strong = document.createElement('em');
        strong.textContent = em;
        el.guideText.appendChild(strong);
        el.guideText.appendChild(document.createTextNode(text.slice(idx + em.length)));
      } else {
        el.guideText.textContent = text;
      }
    } else {
      el.guideText.textContent = text;
    }
    for (var i = 0; i < el.buttons.length; i++) {
      var b = el.buttons[i];
      var hint = b.getAttribute('data-action') === next && !b.disabled;
      b.classList.toggle('suggested', hint);
      if (hint && el.edge && el.edge.contains(b)) el.edge.open = true;
    }
  }

  // getEntitlementStatus(): the token unlocks Pro; a bare purchase key only
  // does so inside the offline grace window (here: only if we hold a token).
  function refresh() {
    var source = storedToken || storedKey;
    if (!source) { render({ tier: 'free', detail: 'no license stored' }, null); return Promise.resolve(); }
    return verify(source).then(function (res) {
      if (!res.ok) {
        // Definitive failures clear the key; transient ones keep it.
        if (res.reason !== 'verify-error') { storedToken = null; storedKey = null; }
        log('error', 'verifyLicenseKey → ' + res.reason + (res.reason !== 'verify-error' ? ' — key cleared, back to Free' : ''));
        render({ tier: 'free', detail: 'verification failed: ' + res.reason }, null);
        return;
      }
      var c = res.claims;
      var days = Math.ceil((c.exp - now()) / 86400);
      var lic = licenses[c.sub];
      var seats = c.plan !== 'trial' && lic ? { used: lic.installs.length, max: MAX_SEATS } : null;
      render({
        tier: c.plan === 'trial' ? 'trial' : 'pro',
        detail: c.plan + (c.typ === 'entitlement' ? ' · entitlement renews in ' + days + 'd' : ' · key only, not activated')
      }, seats);
    });
  }

  var actions = {
    trial: function () {
      lastEvent = 'trial';
      log('ext', 'POST /trial {visitorId}');
      return routeTrial().then(function (key) {
        storedKey = key; storedToken = null;
        log('worker', '200 signed trial key, exp +' + TRIAL_DAYS + 'd', true);
        return actions.activate();
      }, function () {
        log('error', 'fetch failed: Worker unreachable — no trial without the Worker');
        return refresh();
      });
    },
    buy: function (btn) {
      lastEvent = 'buy';
      var plan = btn.getAttribute('data-plan-id') || 'lifetime';
      log('ext', 'POST /checkout {plan: "' + plan + '"} → Paddle overlay opens');
      return routeWebhook(plan).then(function (res) {
        log('paddle', 'transaction.completed → POST /webhook (signature verified)');
        storedKey = res.key; storedToken = null;
        log('worker', 'signed ' + plan + ' key for ' + res.sub + ', emailed via Resend', true);
        log('ext', 'GET /license?txn= → key received, stored');
        return actions.activate();
      }, function () {
        log('error', 'fetch failed: Worker unreachable — checkout cannot start');
        return refresh();
      });
    },
    activate: function () {
      log('ext', 'POST /activate {key, installId: "' + installId + '"}');
      return routeActivate(storedKey, installId).then(function (res) {
        storedToken = res.token;
        log('worker', '200 entitlement token' + (res.seats ? ' · seat ' + res.seats.used + '/' + res.seats.max : ''), true);
        return refresh();
      }, function (err) {
        if (err.error === 'network') {
          log('error', 'fetch failed: Worker unreachable — keeping stored key (offline grace)');
          return refresh();
        }
        if (err.error === 'seat_limit') {
          log('error', '409 seat_limit ' + err.seats.used + '/' + err.seats.max + ' — release a device on the devices page');
          return refresh();
        }
        if (err.error === 'subscription_inactive') {
          storedToken = null; storedKey = null;
          log('error', '403 subscription_inactive (' + err.status + ') — key cleared');
          return refresh();
        }
        log('error', '400 ' + err.error + ' (' + err.reason + ')');
        return refresh();
      });
    },
    seats: function () {
      // Simulate two more installs of the same key, then a fourth that is refused.
      var subs = storedKey ? decodeJson(storedKey.split('.')[1]) : null;
      if (!subs || subs.plan === 'trial') { log('error', 'buy a plan first — trials do not use seats'); return Promise.resolve(); }
      lastEvent = 'seats';
      var others = ['install_' + randomId(6), 'install_' + randomId(6), 'install_' + randomId(6)];
      var chain = Promise.resolve();
      others.forEach(function (id) {
        chain = chain.then(function () {
          log('ext', 'another browser: POST /activate {installId: "' + id + '"}');
          return routeActivate(storedKey, id).then(function (res) {
            log('worker', '200 seat ' + res.seats.used + '/' + res.seats.max);
          }, function (err) {
            log('error', '409 ' + err.error + ' ' + err.seats.used + '/' + err.seats.max + ' — extension shows "release a device"');
          });
        });
      });
      return chain.then(refresh);
    },
    tamper: function () {
      if (!storedToken) return Promise.resolve();
      lastEvent = 'tamper';
      var parts = storedToken.split('.');
      var payload = decodeJson(parts[1]);
      payload.plan = 'lifetime';
      payload.exp = now() + 36500 * 86400;
      storedToken = parts[0] + '.' + encodeJson(payload) + '.' + parts[2];
      log('ext', 'attacker edits token payload → plan: "lifetime", exp: +100y', true);
      return refresh();
    },
    offline: function () {
      serverUp = !serverUp;
      el.server.textContent = serverUp ? 'Worker: online' : 'Worker: down';
      el.server.classList.toggle('down', !serverUp);
      log(serverUp ? 'worker' : 'error', serverUp ? 'Worker back online' : 'Worker unreachable (simulated outage)');
      if (!serverUp && storedToken) log('ext', 'alarm: renew entitlement → fetch failed; verify() still passes offline → ' + (root.getAttribute('data-state') === 'pro' ? 'Pro' : 'trial') + ' stays on');
      if (!serverUp && !storedToken) log('ext', 'no license stored — nothing to renew, popup stays Free');
      if (serverUp && storedToken) { log('ext', 'alarm: renew entitlement'); return actions.activate(); }
      return refresh();
    },
    refund: function () {
      var source = storedToken || storedKey;
      if (!source) return Promise.resolve();
      var claims = decodeJson(source.split('.')[1]);
      lastEvent = 'refund';
      log('paddle', 'transaction.refunded / subscription.canceled → POST /webhook');
      routeRefund(claims.sub);
      log('worker', 'status → cancelled, seats cleared for ' + claims.sub);
      log('ext', 'alarm (≤' + ENTITLEMENT_DAYS + 'd later): POST /activate {renew: true}');
      storedToken = null; // renewal time: the old token is not reused
      return actions.activate();
    },
    reset: function () {
      storedKey = null; storedToken = null; licenses = {}; serverUp = true; lastEvent = 'start';
      if (el.edge) el.edge.open = false;
      el.server.textContent = 'Worker: online';
      el.server.classList.remove('down');
      el.log.textContent = '';
      log('ext', 'fresh install ' + installId + ' — no license stored');
      return refresh();
    }
  };

  var busy = false;
  function run(name, btn) {
    var fn = actions[name];
    if (!fn || busy) return Promise.resolve();
    busy = true;
    return Promise.resolve(fn(btn)).then(function () { busy = false; }, function (err) {
      busy = false;
      log('error', String(err && err.message ? err.message : err));
    });
  }
  root.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    run(btn.getAttribute('data-action'), btn);
  });

  // Most visitors never click a demo, so play the first steps once when it
  // scrolls into view: trial, then a purchase. Any interaction hands control
  // back for good. Skipped when the visitor prefers reduced motion.
  var autoplay = { done: false, timer: null };
  function stopAutoplay() {
    autoplay.done = true;
    if (autoplay.timer) window.clearTimeout(autoplay.timer);
    root.removeAttribute('data-autoplay');
  }
  function startAutoplay() {
    if (autoplay.done) return;
    autoplay.done = true;
    root.setAttribute('data-autoplay', '');
    var steps = ['trial', 'buy'];
    (function next() {
      var name = steps.shift();
      if (!name) { root.removeAttribute('data-autoplay'); return; }
      autoplay.timer = window.setTimeout(function () {
        if (!root.hasAttribute('data-autoplay')) return;
        var btn = root.querySelector('[data-action="' + name + '"]');
        if (!btn || btn.disabled) { root.removeAttribute('data-autoplay'); return; }
        run(name, btn).then(next);
      }, 2600);
    })();
  }
  ['pointerdown', 'keydown', 'focusin'].forEach(function (type) { root.addEventListener(type, stopAutoplay); });
  function armAutoplay() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return;
    var watcher = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      watcher.disconnect();
      startAutoplay();
    }, { threshold: 0.6 });
    watcher.observe(popup || root);
  }

  window.crypto.subtle
    .generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
    .then(function (kp) {
      keyPair = kp;
      root.classList.add('ready');
      log('worker', 'generated a fresh ES256 keypair for this page; public key embedded in the "extension"');
      return actions.reset();
    })
    .then(armAutoplay)
    .catch(function () {
      root.classList.add('unsupported');
    });
})();
