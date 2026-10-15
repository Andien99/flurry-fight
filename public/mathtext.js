// Friendly maths editing for the question builder.
// A plain <input>/<textarea> is hidden and replaced by an editable box where words are typed as
// normal and maths shows as a real fraction, power or root (a "chip"). Maths is written in a small
// pop-up editor (MathLive) with boxes to type into. The hidden field keeps the stored format
// ("Simplify $\frac{3}{4}$"), so saving, loading and the student view are unchanged.
(() => {
  const ZW = '​'; // invisible caret stop beside a maths chip

  function texHTML(tex) {
    try { return window.katex.renderToString('\\displaystyle ' + tex, { throwOnError: false }); } catch (_) { return tex.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  }

  // "Area is $\frac{1}{2}bh$ cm" -> [{text:'Area is '}, {tex:'\frac{1}{2}bh'}, {text:' cm'}]
  function parse(src) {
    src = String(src || '');
    const out = []; let buf = '', i = 0;
    const flush = () => { if (buf) { out.push({ text: buf }); buf = ''; } };
    while (i < src.length) {
      const c = src[i];
      if (c === '\\' && src[i + 1] === '$') { buf += '$'; i += 2; continue; }
      if (c === '$') {
        const open = src[i + 1] === '$' ? 2 : 1;
        let j = i + open, end = -1;
        while (j < src.length) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '$' && (open === 1 || src[j + 1] === '$')) { end = j; break; }
          j++;
        }
        if (end > i) {
          const tex = src.slice(i + open, end).trim();
          flush();
          if (tex === '\\$') out.push({ text: '$' }); // money sign
          else if (tex) out.push({ tex });
          i = end + open; continue;
        }
      }
      buf += c; i++;
    }
    flush();
    return out;
  }

  function serialize(root) {
    let s = '';
    const add = (piece, isMath) => { if (isMath && s.endsWith('$')) s += ' '; s += piece; };
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          for (const ch of n.data.replace(/​/g, '').replace(/ /g, ' ')) {
            if (ch === '$') add('$\\$$', true); else add(ch, false);
          }
        } else if (n.nodeType === 1) {
          if (n.classList.contains('mt-chip')) add('$' + n.dataset.tex + '$', true);
          else if (n.tagName === 'BR') add(' ', false);
          else { if (/^(DIV|P)$/.test(n.tagName) && s) add(' ', false); walk(n); }
        }
      }
    };
    walk(root);
    return s.replace(/ {2,}/g, ' ');
  }

  // MathLive writes short forms like \frac34 and x^2; expand to \frac{3}{4} and x^{2} so the rest of the
  // app (and anyone reading an export) sees the usual braced form.
  function braceTex(src) {
    let i = 0, out = '';
    const ws = () => { while (src[i] === ' ') i++; };
    const arg = () => {
      ws();
      if (src[i] === '{') {
        let depth = 0, j = i;
        for (; j < src.length; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
        const inner = src.slice(i + 1, j); i = j + 1;
        return '{' + braceTex(inner) + '}';
      }
      if (src[i] === '\\') { const m = src.slice(i).match(/^\\([a-zA-Z]+|.)/); i += m[0].length; return '{' + m[0] + '}'; }
      if (i >= src.length) return '{}';
      return '{' + src[i++] + '}';
    };
    while (i < src.length) {
      const m = src.slice(i).match(/^\\(d|t)?frac(?![a-zA-Z])/);
      if (m) { i += m[0].length; out += m[0] + arg() + arg(); continue; }
      const r = src.slice(i).match(/^\\sqrt(?![a-zA-Z])/);
      if (r) {
        i += r[0].length; out += r[0]; ws();
        if (src[i] === '[') { const k = src.indexOf(']', i); out += src.slice(i, k + 1); i = k + 1; }
        out += arg(); continue;
      }
      const c = src[i];
      if (c === '^' || c === '_') { i++; out += c + arg(); continue; }
      if (c === '\\') { const t = src.slice(i).match(/^\\([a-zA-Z]+|.)/); out += t[0]; i += t[0].length; continue; }
      out += c; i++;
    }
    return out;
  }

  function makeChip(tex) {
    const c = document.createElement('span');
    c.className = 'mt-chip'; c.contentEditable = 'false';
    c.dataset.tex = tex; c.title = 'Click to change';
    c.innerHTML = texHTML(tex);
    return c;
  }
  // Give the caret somewhere to sit before/after/between chips.
  function caretStops(ed) {
    for (const chip of ed.querySelectorAll('.mt-chip')) {
      if (!chip.nextSibling || chip.nextSibling.nodeType !== 3) chip.after(document.createTextNode(ZW));
      if (!chip.previousSibling || chip.previousSibling.nodeType !== 3) chip.before(document.createTextNode(ZW));
    }
  }
  function render(ed, value) {
    ed.textContent = '';
    for (const p of parse(value)) ed.appendChild(p.tex ? makeChip(p.tex) : document.createTextNode(p.text));
    caretStops(ed);
  }
  function caretToEnd(ed) {
    const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }

  // ---------- the pop-up maths editor ----------
  const TOOLS = [
    { label: '<span class="mb-frac"><i>a</i><i>b</i></span>', title: 'Fraction', tex: (mf) => '\\frac{#?}{#?}' },
    { label: 'x²', title: 'Power', tex: (mf) => (mf.value ? '#@^{#?}' : '#?^{#?}') },
    { label: '√x', title: 'Square root', tex: () => '\\sqrt{#?}' },
    { label: '×', tex: () => '\\times' }, { label: '÷', tex: () => '\\div' }, { label: '−', tex: () => '-' },
    { label: 'π', tex: () => '\\pi' }, { label: '°', tex: () => '^{\\circ}' },
    { label: '≤', tex: () => '\\le' }, { label: '≥', tex: () => '\\ge' }, { label: '( )', title: 'Brackets', tex: () => '\\left(#?\\right)' },
  ];
  const HINTS = {
    frac: 'Type the top number, press <kbd>Tab</kbd> or <kbd>→</kbd>, then type the bottom. <kbd>Enter</kbd> to insert.',
    pow: 'Type the base, press <kbd>Tab</kbd>, then type the power. <kbd>Enter</kbd> to insert.',
    sqrt: 'Type what goes under the root. <kbd>Enter</kbd> to insert.',
    edit: 'Change the maths, then press <kbd>Enter</kbd>.',
    any: 'Type maths here. Typing <kbd>/</kbd> makes a fraction and <kbd>^</kbd> a power. <kbd>Enter</kbd> to insert.',
  };
  let pop = null, active = null; // active = { inst, chip }

  function mathReady() {
    if (customElements.get('math-field')) return Promise.resolve(true);
    return Promise.race([customElements.whenDefined('math-field').then(() => true), new Promise((r) => setTimeout(() => r(false), 4000))]);
  }
  function buildPop() {
    pop = document.createElement('div');
    pop.className = 'mt-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Maths editor'); pop.hidden = true;
    pop.innerHTML = `<div class="mt-tools" role="toolbar" aria-label="Maths"></div>
      <math-field class="mt-mf" math-virtual-keyboard-policy="auto"></math-field>
      <p class="mt-hint"></p>
      <div class="mt-actions"><button type="button" class="btn-sun btn-small mt-ok">Insert</button><button type="button" class="btn-small mt-del">Remove</button><button type="button" class="btn-ghost btn-small mt-cancel">Cancel</button></div>`;
    document.body.appendChild(pop);
    const mf = pop.querySelector('math-field');
    const tools = pop.querySelector('.mt-tools');
    for (const t of TOOLS) {
      const b = document.createElement('button'); b.type = 'button'; b.innerHTML = t.label; b.title = t.title || t.label;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.onclick = () => { mf.executeCommand(['insert', t.tex(mf), { selectionMode: 'placeholder' }]); mf.focus(); };
      tools.appendChild(b);
    }
    pop.querySelector('.mt-ok').onclick = () => closePop(true);
    pop.querySelector('.mt-cancel').onclick = () => closePop(false);
    pop.querySelector('.mt-del').onclick = () => { if (active && active.chip) { const { inst, chip } = active; chip.remove(); active.chip = null; closePop(false); inst.sync(); } };
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); closePop(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(false); }
    }, true);
    // clicking elsewhere keeps what was typed
    document.addEventListener('mousedown', (e) => {
      if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.mathbar') && !e.target.closest('.ML__keyboard')) closePop(true);
    });
    window.addEventListener('resize', () => { if (!pop.hidden && active) place(active.inst.editor); });
  }
  function place(anchor) {
    const r = anchor.getBoundingClientRect();
    const w = Math.min(460, window.innerWidth - 16);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 8)) + 'px';
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
  }
  async function openPop(inst, { chip = null, template = null, kind = 'any' } = {}) {
    if (!(await mathReady())) { // MathLive missing: fall back to typing the code
      if (!chip) inst.insertText(template ? template.replace(/#\?|#@/g, '') : '');
      return;
    }
    if (!pop) buildPop();
    if (!pop.hidden) closePop(true);
    inst.saveRange();
    active = { inst, chip };
    const mf = pop.querySelector('math-field');
    mf.value = chip ? chip.dataset.tex : '';
    pop.querySelector('.mt-hint').innerHTML = HINTS[chip ? 'edit' : kind] || HINTS.any;
    pop.querySelector('.mt-ok').textContent = chip ? 'Update' : 'Insert';
    pop.querySelector('.mt-del').hidden = !chip;
    pop.hidden = false;
    place(inst.editor);
    inst.editor.classList.add('mt-open');
    inst.editor.contentEditable = 'false'; // typing goes to the maths editor while it's open
    mf.focus();
    if (template) mf.executeCommand(['insert', template, { selectionMode: 'placeholder' }]);
    else mf.executeCommand('moveToMathfieldEnd');
  }
  function closePop(commit) {
    if (!pop || pop.hidden || !active) return;
    const { inst, chip } = active;
    const mf = pop.querySelector('math-field');
    let tex = '';
    try { tex = mf.getValue('latex-without-placeholders').trim(); } catch (_) { tex = String(mf.value || '').trim(); }
    tex = braceTex(tex);
    pop.hidden = true; active = null;
    inst.editor.classList.remove('mt-open');
    inst.editor.contentEditable = 'true';
    try { window.mathVirtualKeyboard && window.mathVirtualKeyboard.hide(); } catch (_) { /* no keyboard */ }
    if (commit && tex) {
      if (chip) { chip.dataset.tex = tex; chip.innerHTML = texHTML(tex); inst.sync(); inst.caretAfter(chip); }
      else inst.insertChip(tex);
    } else inst.restore();
  }
  const isOpen = () => !!(pop && !pop.hidden);
  function insertIntoPop(tex) { const mf = pop.querySelector('math-field'); mf.executeCommand(['insert', tex, { selectionMode: 'placeholder' }]); mf.focus(); }

  // ---------- turn a field into a maths-friendly box ----------
  function enhance(input, { label } = {}) {
    if (input._mt) return input._mt;
    const ed = document.createElement('div');
    ed.className = 'mt-edit ' + input.className;
    ed.contentEditable = 'true'; ed.spellcheck = true;
    ed.setAttribute('role', 'textbox');
    ed.setAttribute('aria-label', label || input.getAttribute('aria-label') || input.placeholder || 'Text');
    ed.dataset.placeholder = input.placeholder || '';
    if (input.id) ed.id = input.id + '-box';
    input.hidden = true;
    input.after(ed);
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const setRaw = (v) => desc.set.call(input, v);
    let range = null;

    const inst = {
      input, editor: ed,
      sync() {
        let v = serialize(ed);
        if (!v.trim() && !ed.querySelector('.mt-chip') && ed.innerHTML !== '') ed.innerHTML = ''; // keep the placeholder showing
        caretStops(ed);
        setRaw(v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      },
      saveRange() {
        const sel = getSelection();
        if (sel.rangeCount && ed.contains(sel.getRangeAt(0).commonAncestorContainer)) range = sel.getRangeAt(0).cloneRange();
      },
      restore() {
        ed.focus();
        const sel = getSelection(); sel.removeAllRanges();
        if (range && ed.contains(range.commonAncestorContainer)) sel.addRange(range); else caretToEnd(ed);
      },
      caretAfter(node) {
        ed.focus();
        const r = document.createRange();
        const next = node.nextSibling;
        if (next && next.nodeType === 3) r.setStart(next, next.data.startsWith(ZW) ? 1 : 0); else r.setStartAfter(node);
        r.collapse(true);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        range = r.cloneRange();
      },
      insertText(str) {
        inst.restore();
        if (!document.execCommand('insertText', false, str)) {
          const r = getSelection().getRangeAt(0); r.deleteContents(); const t = document.createTextNode(str); r.insertNode(t); inst.caretAfter(t);
        }
        inst.saveRange(); inst.sync();
      },
      insertChip(tex) {
        inst.restore();
        const sel = getSelection();
        const r = sel.rangeCount ? sel.getRangeAt(0) : null;
        const chip = makeChip(tex);
        if (r && ed.contains(r.commonAncestorContainer)) { r.deleteContents(); r.insertNode(chip); } else ed.appendChild(chip);
        caretStops(ed);
        inst.sync();
        inst.caretAfter(chip);
      },
      openMath(template, kind) { return openPop(inst, { template, kind }); },
    };
    input._mt = inst;

    // Reading .value gives the stored format; setting it redraws the box.
    Object.defineProperty(input, 'value', { configurable: true, get() { return desc.get.call(input); }, set(v) { setRaw(v); render(ed, v); } });
    input.focus = (o) => { ed.focus(o); caretToEnd(ed); };

    ed.addEventListener('input', () => inst.sync());
    ed.addEventListener('focus', () => input.dispatchEvent(new Event('focus')));
    ed.addEventListener('keyup', inst.saveRange);
    ed.addEventListener('mouseup', inst.saveRange);
    ed.addEventListener('blur', inst.saveRange);
    // the maths chip touching the caret (skipping the invisible caret stops), if any
    function chipBeside(dir) {
      const sel = getSelection();
      if (!sel.rangeCount || !sel.isCollapsed) return null;
      let node = sel.anchorNode, off = sel.anchorOffset, cand = null;
      const blank = (t) => !t.replace(/\u200B/g, '');
      if (node.nodeType === 3) {
        if (!blank(dir < 0 ? node.data.slice(0, off) : node.data.slice(off))) return null;
        cand = dir < 0 ? node.previousSibling : node.nextSibling;
      } else cand = node.childNodes[dir < 0 ? off - 1 : off] || null;
      while (cand && cand.nodeType === 3 && blank(cand.data)) cand = dir < 0 ? cand.previousSibling : cand.nextSibling;
      return cand && cand.nodeType === 1 && cand.classList.contains('mt-chip') ? cand : null;
    }
    ed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); return; } // one paragraph; Ctrl+Enter still saves
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const chip = chipBeside(e.key === 'Backspace' ? -1 : 1);
        if (!chip) return;
        e.preventDefault();
        const before = chip.previousSibling;
        chip.remove();
        const r = document.createRange();
        if (before && ed.contains(before)) { if (before.nodeType === 3) r.setStart(before, before.data.length); else r.setStartAfter(before); }
        else r.setStart(ed, 0);
        r.collapse(true);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        inst.sync(); inst.saveRange();
      }
    });
    ed.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ');
      for (const p of parse(text)) { if (p.tex) inst.insertChip(p.tex); else inst.insertText(p.text); }
    });
    ed.addEventListener('drop', (e) => e.preventDefault());
    ed.addEventListener('click', (e) => {
      const chip = e.target.closest('.mt-chip');
      if (chip) { e.preventDefault(); openPop(inst, { chip }); }
    });
    render(ed, desc.get.call(input));
    return inst;
  }

  window.FFMathText = { enhance, parse, serialize, braceTex, isOpen, insertIntoPop, closePop };
})();
