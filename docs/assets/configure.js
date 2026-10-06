// Config → output preview. Mirrors what `npm run init` derives from a few
// answers: paidextension.config.json, the manifest fields and the popup's
// upgrade copy. All output is written with textContent, never as HTML.
(function () {
  var root = document.getElementById('configure');
  if (!root) return;

  var form = root.querySelector('.configure-form');
  var outConfig = root.querySelector('[data-out="config"]');
  var outManifest = root.querySelector('[data-out="manifest"]');
  var popup = root.querySelector('[data-popup]');

  function val(name) {
    var field = form.querySelector('[name="' + name + '"]');
    return field ? String(field.value).trim() : '';
  }
  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-extension';
  }
  function hostOf(url) {
    var m = /^https?:\/\/([^/?#]+)/i.exec(url);
    return m ? m[1].toLowerCase() : 'example.com';
  }
  function money(v, fallback) {
    var n = parseFloat(v);
    if (!isFinite(n) || n <= 0) return fallback;
    return '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
  }

  function derive() {
    var name = val('name') || 'Acme Extension';
    var slug = slugify(name);
    var company = val('company') || 'Acme Inc.';
    var site = /^https?:\/\//i.test(val('site')) ? val('site').replace(/\/+$/, '') : 'https://' + slug + '.example';
    var host = hostOf(site);
    var seats = Math.max(1, Math.min(10, parseInt(val('seats'), 10) || 3));
    var trial = Math.max(0, Math.min(30, parseInt(val('trial'), 10) || 0));
    var pro = val('pro') || 'Pro';
    var monthly = money(val('monthly'), '');
    var yearly = money(val('yearly'), '');
    var lifetime = money(val('lifetime'), '');
    return {
      name: name, slug: slug, shortName: name.length <= 12 ? name : name.split(/\s+/)[0].slice(0, 12), company: company, site: site, host: host,
      seats: seats, trial: trial, pro: pro, monthly: monthly, yearly: yearly, lifetime: lifetime,
      description: val('description') || 'A paid browser extension built with PaidExtension.'
    };
  }

  function configJson(d) {
    var plans = {};
    if (d.monthly) plans.monthly = { enabled: true, label: 'Monthly', price: d.monthly, period: '/month' };
    if (d.yearly) plans.yearly = { enabled: true, label: 'Yearly', price: d.yearly, period: '/year', badge: 'Best value' };
    if (d.lifetime) plans.lifetime = { enabled: true, label: 'Lifetime', price: d.lifetime, period: 'one-time', badge: 'Pay once' };
    return JSON.stringify({
      product: { name: d.name, slug: d.slug, shortName: d.shortName, description: d.description, proLabel: d.pro, version: '0.1.0' },
      company: { name: d.company, supportEmail: 'support@' + d.host, licenseFromEmail: d.name + ' <license@' + d.host + '>' },
      urls: { site: d.site, licenseApi: 'https://license.' + d.host },
      licensing: { issuer: d.slug, maxSeats: d.seats, trialDays: d.trial, offlineGraceDays: 3, entitlementTtlDays: 3 },
      plans: plans,
      features: { free: ['basicMode'], pro: ['basicMode', 'advancedMode', 'exportData', 'unlimitedItems'] }
    }, null, 2);
  }

  function manifestJson(d) {
    return JSON.stringify({
      manifest_version: 3,
      name: d.name,
      short_name: d.shortName,
      version: '0.1.0',
      description: d.description,
      action: { default_popup: 'popup.html', default_title: d.name },
      background: { service_worker: 'background.js', type: 'module' },
      permissions: ['storage', 'alarms'],
      host_permissions: ['https://license.' + d.host + '/*'],
      icons: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' }
    }, null, 2);
  }

  function renderPopup(d) {
    popup.querySelector('[data-p="name"]').textContent = d.name;
    popup.querySelector('[data-p="pro"]').textContent = d.pro;
    popup.querySelector('[data-p="trial"]').textContent = d.trial > 0
      ? 'Start your free ' + d.trial + '-day ' + d.pro + ' trial — no card needed.'
      : 'Unlock ' + d.pro + ' — one license, up to ' + d.seats + ' device' + (d.seats === 1 ? '' : 's') + '.';
    popup.querySelector('[data-p="company"]').textContent = '© ' + d.company + ' · support@' + d.host;
    var list = popup.querySelector('[data-p="plans"]');
    list.textContent = '';
    var rows = [
      d.monthly && { label: 'Monthly', price: d.monthly, period: '/month' },
      d.yearly && { label: 'Yearly', price: d.yearly, period: '/year', badge: 'Best value' },
      d.lifetime && { label: 'Lifetime', price: d.lifetime, period: 'one-time', badge: 'Pay once' }
    ];
    var any = false;
    rows.forEach(function (row) {
      if (!row) return;
      any = true;
      var li = document.createElement('li');
      var b = document.createElement('b');
      b.textContent = row.label;
      li.appendChild(b);
      if (row.badge) {
        var badge = document.createElement('span');
        badge.className = 'p-badge';
        badge.textContent = row.badge;
        li.appendChild(badge);
      }
      var price = document.createElement('span');
      price.className = 'p-price';
      price.textContent = row.price + ' ' + row.period;
      li.appendChild(price);
      list.appendChild(li);
    });
    if (!any) {
      var li = document.createElement('li');
      li.className = 'p-empty';
      li.textContent = 'Enter at least one price to enable checkout.';
      list.appendChild(li);
    }
    var cta = popup.querySelector('[data-p="cta"]');
    cta.textContent = d.trial > 0 ? 'Start free trial' : 'Upgrade to ' + d.pro;
  }

  function update() {
    var d = derive();
    outConfig.textContent = configJson(d);
    outManifest.textContent = manifestJson(d);
    renderPopup(d);
  }

  form.addEventListener('input', update);
  update();
})();
