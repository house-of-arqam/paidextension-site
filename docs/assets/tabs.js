// Accessible tabs (every [role="tablist"] on the page) and a small syntax
// highlighter for <pre data-lang> blocks. Highlighting rebuilds the block from
// its own text with textContent-only spans, so no markup is ever injected.
(function () {
  var lists = document.querySelectorAll('[role="tablist"]');
  for (var l = 0; l < lists.length; l++) wire(lists[l]);

  function wire(list) {
    var tabs = list.querySelectorAll('[role="tab"]');
    var panels = [];
    for (var i = 0; i < tabs.length; i++) {
      var panel = document.getElementById(tabs[i].getAttribute('aria-controls'));
      if (panel) panels.push(panel);
      tabs[i].addEventListener('click', function (e) { select(e.currentTarget); });
      tabs[i].addEventListener('keydown', onKey);
    }
    function select(tab) {
      for (var i = 0; i < tabs.length; i++) {
        var on = tabs[i] === tab;
        tabs[i].setAttribute('aria-selected', String(on));
        tabs[i].tabIndex = on ? 0 : -1;
      }
      for (var j = 0; j < panels.length; j++) panels[j].hidden = panels[j].id !== tab.getAttribute('aria-controls');
      slide(tab);
    }
    // One indicator slides to the selected tab; effects.css draws it.
    function slide(tab) {
      if (!tab.offsetWidth) return;
      list.classList.add('sliding');
      list.style.setProperty('--ind-x', tab.offsetLeft + 'px');
      list.style.setProperty('--ind-w', tab.offsetWidth + 'px');
    }
    function reslide() {
      var current = list.querySelector('[role="tab"][aria-selected="true"]');
      if (current) slide(current);
    }
    window.addEventListener('resize', reslide);
    // Tabs inside a closed <details> have no width until it opens.
    document.addEventListener('toggle', reslide, true);
    function onKey(e) {
      var idx = Array.prototype.indexOf.call(tabs, e.currentTarget);
      var next = e.key === 'ArrowRight' ? idx + 1 : e.key === 'ArrowLeft' ? idx - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (next < 0 || next >= tabs.length) return;
      e.preventDefault();
      tabs[next].focus();
      select(tabs[next]);
    }
    var initial = list.querySelector('[role="tab"][aria-selected="true"]') || tabs[0];
    if (initial) select(initial);
  }

  // --- highlighter -----------------------------------------------------------
  var RULES = {
    js: [
      [/\/\/[^\n]*|\/\*[\s\S]*?\*\//, 'c'],
      [/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/, 's'],
      [/\b(?:const|let|var|function|return|if|else|for|of|in|new|await|async|export|import|from|throw|try|catch|finally|switch|case|break|default|typeof|interface|type|extends|implements|readonly|true|false|null|undefined|this)\b/, 'k'],
      [/\b\d+(?:\.\d+)?\b/, 'n'],
      [/\b[A-Za-z_$][\w$]*(?=\s*\()/, 'f']
    ],
    json: [
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'p'],
      [/"(?:[^"\\]|\\.)*"/, 's'],
      [/\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?\b/, 'n']
    ],
    yaml: [
      [/#[^\n]*/, 'c'],
      [/^\s*-?\s*[\w.-]+(?=:)/m, 'p'],
      [/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/, 's'],
      [/\$\{\{[^}]*\}\}|\$[A-Z_]+|\$\{[^}]*\}/, 'k']
    ],
    md: [
      [/^#{1,6}[^\n]*/m, 'k'],
      [/`[^`\n]+`/, 's'],
      [/^\s*(?:[-*]|\d+\.)\s(?=\S)/m, 'p'],
      [/\*\*[^*\n]+\*\*/, 'n']
    ],
    sh: [
      [/#[^\n]*/, 'c'],
      [/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/, 's'],
      [/^\s*(?:\$\s*)?(?:npm|npx|git|cd|node|wrangler|cat|rg|export)\b/m, 'k'],
      [/\s--?[\w-]+/, 'p']
    ]
  };
  RULES.ts = RULES.js;

  function highlight(pre) {
    var rules = RULES[pre.getAttribute('data-lang')];
    var code = pre.querySelector('code') || pre;
    if (!rules || code.children.length) return;
    var text = code.textContent;
    var frag = document.createDocumentFragment();
    var pos = 0;
    while (pos < text.length) {
      var best = null;
      for (var r = 0; r < rules.length; r++) {
        var re = new RegExp(rules[r][0].source, 'g' + (rules[r][0].multiline ? 'm' : ''));
        re.lastIndex = pos;
        var m = re.exec(text);
        if (m && (!best || m.index < best.index)) best = { index: m.index, len: m[0].length, cls: rules[r][1] };
        if (m && m.index === pos) break;
      }
      if (!best) { frag.appendChild(document.createTextNode(text.slice(pos))); break; }
      if (best.index > pos) frag.appendChild(document.createTextNode(text.slice(pos, best.index)));
      var span = document.createElement('span');
      span.className = 'tk-' + best.cls;
      span.textContent = text.slice(best.index, best.index + best.len);
      frag.appendChild(span);
      pos = best.index + Math.max(best.len, 1);
    }
    code.textContent = '';
    code.appendChild(frag);
  }
  var blocks = document.querySelectorAll('pre[data-lang]');
  for (var b = 0; b < blocks.length; b++) highlight(blocks[b]);
})();
