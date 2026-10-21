// Host (teacher) client.
(() => {
  const F = window.FF, R = window.FFRender, A = window.FFAnswers, GEN = window.FFGen, IMP = window.FFImport, MT = window.FFMathText;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const socket = io();
  const SETS_KEY = 'flurry-sets';
  const HOST_KEY = 'flurry-host';
  const OPTS_KEY = 'flurry-options';
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function typeset(el) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }, { left: '\\(', right: '\\)', display: false }],
        throwOnError: false,
      });
    } catch (_) { /* leave as text */ }
  }
  const mathHTML = (s) => { const d = document.createElement('span'); d.textContent = s; typeset(d); return d.innerHTML; };

  // ---------- storage ----------
  const fromPreset = (p) => ({ ...clone(p), modified: clone(p.modified || []), id: uid(), from: p.id, presetVersion: p.version || 1 });
  // Every set has a main list and a modified list. Starter sets saved before an update get the new questions.
  function tidySets(list) {
    for (const s of list) {
      if (!Array.isArray(s.questions)) s.questions = [];
      if (!Array.isArray(s.modified)) s.modified = [];
      const p = (window.FFPresets || []).find((x) => x.id === s.from);
      if (p && p.version && (s.presetVersion || 1) < p.version) {
        Object.assign(s, { title: p.title, description: p.description, questions: clone(p.questions), modified: clone(p.modified || []), presetVersion: p.version });
      }
    }
    return list;
  }
  function loadSets() {
    try { const s = JSON.parse(localStorage.getItem(SETS_KEY) || 'null'); if (Array.isArray(s) && s.length) return tidySets(s); } catch (_) { /* fall through */ }
    return (window.FFPresets || []).map(fromPreset);
  }
  const LISTS = ['questions', 'modified'];
  const listName = (k) => (k === 'modified' ? 'modified list' : 'main list');
  let sets = loadSets();
  let current = sets[0];
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(SETS_KEY, JSON.stringify(sets)); } catch (_) { /* storage blocked */ } }, 200);
  }

  // ---------- steps ----------
  function step(name) {
    for (const s of ['setup', 'lobby', 'live', 'results']) $('h-' + s).hidden = s !== name;
    document.querySelectorAll('.host-top nav span').forEach((el) => el.classList.toggle('on', el.dataset.step === name));
    G.step = name;
    if (name === 'live' && !G.looping) { G.looping = true; requestAnimationFrame(loop); }
  }

  // ---------- question helpers ----------
  function isValid(q) {
    if (!q || !q.q || !q.q.trim()) return false;
    if (q.type === 'text') return (q.answers || []).some((a) => String(a).trim());
    const opts = q.options || [];
    return opts.filter((o) => String(o).trim()).length >= 2 && q.correct >= 0 && opts[q.correct] && String(opts[q.correct]).trim() !== '';
  }
  const flagsOf = (q) => (q.flags || []).filter((f) => f !== 'answer');
  const needsAttention = (q) => !isValid(q) || flagsOf(q).length > 0;
  const countTodo = (s) => s.questions.filter(needsAttention).length + (s.modified || []).filter(needsAttention).length;

  // ---------- sets list ----------
  function renderSets() {
    const el = $('sets'); el.textContent = '';
    for (const s of sets) {
      const b = document.createElement('button');
      b.className = 'set-card'; b.type = 'button';
      b.setAttribute('aria-pressed', String(s === current));
      const n = s.questions.length, m = (s.modified || []).length, todo = countTodo(s);
      b.innerHTML = `<span class="t">${esc(s.title || 'Untitled set')}</span><span class="m">${n} question${n === 1 ? '' : 's'}${m ? ` + ${m} modified` : ''}${todo ? ` · <b>${todo} to finish</b>` : ''}</span>`;
      b.onclick = () => { current = s; cancelEdit(); renderAll(); };
      el.appendChild(b);
    }
  }

  function renderSummary() {
    const n = current.questions.length + current.modified.length, todo = countTodo(current);
    const ready = current.questions.filter(isValid).length, modReady = current.modified.filter(isValid).length;
    const left = n - ready - modReady;
    $('set-summary').textContent = n ? `${current.questions.length} question${current.questions.length === 1 ? '' : 's'}${current.modified.length ? ` + ${current.modified.length} in the modified list` : ''}${todo ? `, ${todo} need${todo === 1 ? 's' : ''} attention` : ', all ready'}` : 'No questions yet';
    $('ready-count').textContent = ready || modReady
      ? `${ready} question${ready === 1 ? '' : 's'} ready${modReady ? ` + ${modReady} modified` : ''}${left ? ` (${left} without an answer will be left out)` : ''}`
      : 'Add at least one complete question to start a game';
    $('create').disabled = !ready && !modReady;
    $('filter-todo').textContent = todo ? `Needs attention (${todo})` : 'Needs attention';
  }

  function renderAll() { renderSets(); $('set-title').value = current.title || ''; renderList(); renderSummary(); refreshSkillList(); }
  function changed() { save(); renderSets(); renderList(); renderSummary(); }

  $('set-title').oninput = (e) => { current.title = e.target.value; save(); renderSets(); };
  $('new-set').onclick = () => {
    current = { id: uid(), title: '', questions: [], modified: [] };
    sets.unshift(current); save(); cancelEdit(); renderAll();
    $('set-title').focus();
  };
  $('dup-set').onclick = () => { const c = clone(current); c.id = uid(); c.title = (current.title || 'Set') + ' (copy)'; sets.unshift(c); current = c; save(); renderAll(); };
  $('del-set').onclick = () => {
    const gone = current, at = sets.indexOf(current);
    sets.splice(at, 1);
    if (!sets.length) sets.push({ id: uid(), title: '', questions: [], modified: [] });
    current = sets[0]; save(); cancelEdit(); renderAll();
    showUndo(`Deleted "${gone.title || 'Untitled set'}"`, () => { sets.splice(at, 0, gone); current = gone; save(); renderAll(); });
  };
  $('export-set').onclick = () => download(`${(current.title || 'question-set').replace(/[^\w-]+/g, '-')}.json`, JSON.stringify({ title: current.title, questions: current.questions, modified: current.modified }, null, 2), 'application/json');

  // Starter sets
  $('starter-open').onclick = () => {
    const list = $('starter-list'); list.textContent = '';
    for (const p of window.FFPresets || []) {
      const have = sets.some((s) => s.from === p.id);
      const item = document.createElement('div'); item.className = 'starter-item';
      item.innerHTML = `<div class="row"><b>${esc(p.title)}</b><span class="spacer"></span><span class="preview">${p.questions.length} questions${(p.modified || []).length ? ` + ${p.modified.length} modified` : ''}</span></div><p>${esc(p.description || '')}</p>`;
      const b = document.createElement('button'); b.className = 'btn-small'; b.style.justifySelf = 'start';
      b.textContent = have ? 'Add another copy' : 'Add to my sets';
      b.onclick = () => { const s = fromPreset(p); sets.unshift(s); current = s; save(); renderAll(); $('starter').close(); };
      item.appendChild(b);
      list.appendChild(item);
    }
    $('starter').showModal();
  };
  $('starter-close').onclick = () => $('starter').close();

  // Undo toast
  let undoFn = null, undoTimer = null;
  function showUndo(text, fn) {
    undoFn = fn; $('undo-text').textContent = text; $('undo').hidden = false;
    clearTimeout(undoTimer); undoTimer = setTimeout(() => { $('undo').hidden = true; undoFn = null; }, 6000);
  }
  $('undo-btn').onclick = () => { if (undoFn) undoFn(); undoFn = null; $('undo').hidden = true; };

  // ---------- tabs ----------
  const TABS = ['write', 'gen', 'upload', 'paste'];
  function showTab(name) {
    for (const t of TABS) { $('tab-' + t).setAttribute('aria-selected', String(t === name)); $('pane-' + t).hidden = t !== name; }
    if (name === 'gen') renderSkills();
  }
  TABS.forEach((t, i) => {
    $('tab-' + t).onclick = () => showTab(t);
    $('tab-' + t).onkeydown = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      showTab(n); $('tab-' + n).focus();
    };
  });

  function choice(id, initial, onChange) {
    const el = $(id);
    const set = (v) => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    el.querySelectorAll('button').forEach((b) => { b.onclick = () => { set(b.dataset.v); if (onChange) onChange(b.dataset.v); }; });
    if (initial) set(initial);
    return { get: () => el.querySelector('[aria-pressed="true"]').dataset.v, set };
  }

  // ---------- write a question ----------
  let editing = null; // the question object open in the editor
  const addTarget = choice('add-target', 'questions', () => { if (!editing) $('c-add').textContent = addTarget.get() === 'modified' ? 'Add to modified list' : 'Add question'; });
  const targetList = () => current[addTarget.get()];
  const listOf = (q) => LISTS.find((k) => current[k].includes(q));
  let lastField = $('c-q');
  const cType = choice('c-type', 'mc', (v) => { $('c-mc').hidden = v !== 'mc'; $('c-text').hidden = v !== 'text'; updateTry(); });

  function wrongRow(value = '') {
    const row = document.createElement('div'); row.className = 'wrong-row';
    const inp = document.createElement('input'); inp.value = value; inp.placeholder = 'Wrong answer';
    inp.setAttribute('aria-label', 'Wrong answer');
    inp.addEventListener('focus', () => { lastField = inp; });
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove this wrong answer');
    x.onclick = () => { if ($('c-wrong').children.length > 1) row.remove(); else inp.value = ''; };
    row.append(inp, x);
    MT.enhance(inp, { label: 'Wrong answer' });
    return row;
  }
  const wrongInputs = () => [...$('c-wrong').querySelectorAll('input')];
  function setWrongs(list) {
    const box = $('c-wrong'); box.textContent = '';
    const vals = list.length ? list : ['', '', ''];
    for (const v of vals) box.appendChild(wrongRow(v));
  }
  $('c-add-wrong').onclick = () => { if (wrongInputs().length < 5) { const r = wrongRow(); $('c-wrong').appendChild(r); r.querySelector('input').focus(); } };

  ['c-q', 'c-correct', 'c-answer', 'c-also', 'c-try'].forEach((id) => $(id).addEventListener('focus', () => { lastField = $(id); }));

  // The question, correct answer and wrong answers show maths as real fractions/powers/roots.
  MT.enhance($('c-q'), { label: 'Question' });
  MT.enhance($('c-correct'), { label: 'Correct answer' });
  document.querySelector('label[for="c-q"]').addEventListener('click', () => $('c-q').focus());
  document.querySelector('label[for="c-correct"]').addEventListener('click', () => $('c-correct').focus());

  // Maths buttons: fractions, powers and roots open the maths editor in those boxes;
  // typed-answer boxes get the plain forms students type (3/4, x^2), which the marker reads.
  const plainField = (el) => ['c-answer', 'c-also', 'c-try'].includes(el.id);
  const TEMPLATES = { frac: '\\frac{#?}{#?}', pow: '#?^{#?}', sqrt: '\\sqrt{#?}' };
  const POP_TEX = { '×': '\\times', '÷': '\\div', '−': '-', 'π': '\\pi', '°': '^{\\circ}', '≤': '\\le', '≥': '\\ge', $: '\\$' };
  document.querySelectorAll('.mathbar button').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the field
    b.onclick = () => {
      const el = lastField || $('c-q');
      const k = b.dataset.ins;
      if (MT.isOpen()) { MT.insertIntoPop(TEMPLATES[k] || POP_TEX[k] || k); return; }
      if (el._mt) {
        if (TEMPLATES[k]) el._mt.openMath(TEMPLATES[k], k);
        else el._mt.insertText(k);
        return;
      }
      const text = plainField(el) ? ({ frac: '/', pow: '^2', sqrt: '√', '−': '-', $: '' }[k] ?? k) : k;
      const s0 = el.selectionStart ?? el.value.length, e2 = el.selectionEnd ?? s0;
      el.value = el.value.slice(0, s0) + text + el.value.slice(e2);
      el.focus();
      el.setSelectionRange(s0 + text.length, s0 + text.length);
      el.dispatchEvent(new Event('input'));
    };
  });

  function updatePreview() {
    const src = $('c-q').value.trim();
    const box = $('c-q-prev');
    box.textContent = src;
    typeset(box);
    const dollars = (src.replace(/\\\$/g, '').match(/\$/g) || []).length;
    if (dollars % 2) { const w = document.createElement('span'); w.className = 'warn'; w.textContent = 'There’s an unmatched $ sign. Maths goes between two $ signs; use the $ button for money.'; box.appendChild(w); }
  }
  $('c-q').addEventListener('input', updatePreview);

  function acceptedList() {
    return [$('c-answer').value, ...$('c-also').value.split(';')].map((s) => s.trim()).filter(Boolean);
  }
  function updateTry() {
    const out = $('c-try-result');
    const t = $('c-try').value.trim(), acc = acceptedList();
    if (!t || !acc.length) { out.textContent = ''; out.className = 'try-result'; return; }
    const ok = A.answersMatch(t, acc);
    out.textContent = ok ? '✓ Marked correct' : '✗ Marked wrong';
    out.className = 'try-result ' + (ok ? 'good' : 'bad');
  }
  ['c-answer', 'c-also', 'c-try'].forEach((id) => $(id).addEventListener('input', updateTry));

  // Suggest wrong answers from common mistakes.
  function suggestWrong(correct) {
    const c = correct.replace(/\$/g, '').trim();
    const out = [];
    const add = (v) => {
      const s = String(v).trim();
      if (!s || out.includes(s) || s.replace(/\s/g, '') === c.replace(/\s/g, '')) return;
      if (A.answersMatch(s, [c])) return;
      out.push(s);
    };
    const fr = c.match(/^(-?\d+)\s*\/\s*(\d+)$|^\\frac\{(-?\d+)\}\{(\d+)\}$/);
    if (fr) {
      const a = +(fr[1] ?? fr[3]), b = +(fr[2] ?? fr[4]);
      const tex = /\\frac/.test(c);
      const f = (p, q) => (tex ? `\\frac{${p}}{${q}}` : `${p}/${q}`);
      [[b, a], [a, b * 2], [a + 1, b + 1], [a, a + b], [a * 2, b]].forEach(([p, q]) => { if (q) add(f(p, q)); });
      return out.slice(0, 3);
    }
    const n = A.toNumber(c);
    if (n !== null) {
      const ideas = Number.isInteger(n)
        ? [n + 1, n - 1, n * 2, n + 10, n - 10, -n, n * 10, Math.round(n / 2)]
        : [n * 10, n / 10, n + 1, n - 1, 1 / n, -n].map((v) => Math.round(v * 1000) / 1000);
      ideas.filter((v) => Number.isFinite(v)).forEach(add);
      return out.slice(0, 3);
    }
    // expressions: split into terms like "8k", "+6"
    const terms = c.replace(/\s+/g, '').replace(/−/g, '-').match(/[+-]?[^+-]+/g);
    if (!terms) return out;
    const num = (t) => { const m = t.match(/^([+-]?)(\d*\.?\d*)(.*)$/); const k = m[2] === '' ? 1 : parseFloat(m[2]); return { sign: m[1] === '-' ? -1 : 1, k, rest: m[3] }; };
    const show = (list) => list.map((t, i) => {
      const k = t.sign * t.k;
      const body = (Math.abs(k) === 1 && t.rest ? '' : Math.abs(k)) + t.rest;
      return i === 0 ? (k < 0 ? '-' : '') + body : (k < 0 ? ' - ' : ' + ') + body;
    }).join('');
    const parts = terms.map(num);
    if (parts.length > 1) {
      // add every coefficient together as one term (the classic "8k + 6 = 14k")
      const letters = [...new Set(parts.map((p) => p.rest.replace(/[^a-z]/gi, '')).join(''))].sort().join('');
      if (letters) add(parts.reduce((s, p) => s + p.sign * p.k, 0) + letters);
      add(show(parts.map((p, i) => (i === parts.length - 1 ? { ...p, sign: -p.sign } : p))));        // sign slip
      add(show(parts.map((p, i) => (i === 0 ? { ...p, k: p.k + 1 } : p))));                          // off by one
      if (letters) add(show(parts.filter((p) => p.rest)));                                              // dropped constant
      add(show(parts.map((p, i) => (i === parts.length - 1 ? { ...p, k: p.k * 2 } : p))));
    } else {
      const p = parts[0];
      add(show([{ ...p, k: p.k + 1 }]));
      if (p.rest) { add(show([{ ...p, k: p.k }]).replace(p.rest, p.rest + '^2')); add(`${p.k} + ${p.rest}`); }
      add(show([{ ...p, sign: -p.sign }]));
    }
    return out.slice(0, 3);
  }
  $('c-suggest').onclick = () => {
    const correct = $('c-correct').value.trim();
    if (!correct) { flash('c-msg', 'Type the correct answer first.', true); $('c-correct').focus(); return; }
    const ideas = suggestWrong(correct);
    if (!ideas.length) { flash('c-msg', 'No suggestions for that answer. Type your own wrong answers.', true); return; }
    const wrap = /\$/.test(correct) ? (s) => `$${s}$` : (s) => s;
    const empty = wrongInputs().filter((i) => !i.value.trim());
    for (const idea of ideas) {
      let slot = empty.shift();
      if (!slot && wrongInputs().length < 5) { const r = wrongRow(); $('c-wrong').appendChild(r); slot = r.querySelector('input'); }
      if (slot) slot.value = wrap(idea);
    }
    flash('c-msg', 'Suggestions added. Check them before saving.');
  };

  function flash(id, text, bad) {
    const el = $(id);
    el.textContent = text; el.style.color = bad ? 'var(--mitten)' : '';
    clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, 4000);
  }

  function readComposer() {
    const q = { q: $('c-q').value.trim(), type: cType.get() };
    const skill = $('c-skill').value.trim();
    if (skill) q.skill = skill;
    if (q.type === 'mc') {
      const correct = $('c-correct').value.trim();
      const wrongs = wrongInputs().map((i) => i.value.trim()).filter(Boolean);
      q.options = [correct, ...wrongs]; q.correct = 0;
    } else q.answers = acceptedList();
    return q;
  }
  function problemWith(q) {
    if (!q.q) return ['c-q', 'Type the question.'];
    if (q.type === 'mc') {
      if (!q.options[0]) return ['c-correct', 'Type the correct answer.'];
      if (q.options.length < 2) return [wrongInputs()[0].id || null, 'Add at least one wrong answer (or use Suggest wrong answers).'];
      const dup = q.options.slice(1).find((o) => A.answersMatch(o.replace(/\$/g, ''), [q.options[0].replace(/\$/g, '')]));
      if (dup) return [null, `“${dup}” means the same as the correct answer. Change it so only one option is right.`];
    } else if (!q.answers.length) return ['c-answer', 'Type the answer students should give.'];
    return null;
  }

  function resetComposer(keep) {
    $('c-q').value = ''; $('c-correct').value = ''; $('c-answer').value = ''; $('c-also').value = ''; $('c-try').value = '';
    setWrongs([]);
    if (!keep) $('c-skill').value = '';
    updatePreview(); updateTry();
  }

  function saveComposer() {
    const q = readComposer();
    const p = problemWith(q);
    if (p) { flash('c-msg', p[1], true); if (p[0] && $(p[0])) $(p[0]).focus(); else if (!q.options || q.options.length < 2) (wrongInputs()[0] || $('c-q')).focus(); return; }
    const k = editing && listOf(editing);
    if (k) {
      const i = current[k].indexOf(editing);
      current[k][i] = q;
      cancelEdit(true);
      flash('c-msg', `Question ${i + 1} in the ${listName(k)} saved.`);
    } else {
      const list = targetList();
      list.push(q);
      resetComposer(true);
      flash('c-msg', `Added as question ${list.length} in the ${listName(addTarget.get())}. Write the next one.`);
    }
    changed(); refreshSkillList();
    $('c-q').focus();
  }
  $('c-add').onclick = saveComposer;
  $('pane-write').addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveComposer(); } });

  function editQuestion(q) {
    const k = listOf(q), i = current[k].indexOf(q);
    editing = q;
    showTab('write');
    $('c-q').value = q.q || '';
    cType.set(q.type === 'text' ? 'text' : 'mc');
    $('c-mc').hidden = q.type === 'text'; $('c-text').hidden = q.type !== 'text';
    if (q.type === 'text') {
      const ans = q.answers || [];
      $('c-answer').value = ans[0] || ''; $('c-also').value = ans.slice(1).join('; ');
      $('c-correct').value = ''; setWrongs([]);
    } else {
      const opts = q.options || [];
      const ci = q.correct >= 0 ? q.correct : -1;
      $('c-correct').value = ci >= 0 ? opts[ci] : '';
      setWrongs(opts.filter((_, k) => k !== ci));
      $('c-answer').value = ''; $('c-also').value = '';
    }
    $('c-skill').value = q.skill || '';
    $('c-add').textContent = 'Save changes';
    let banner = $('edit-banner');
    if (!banner) {
      banner = document.createElement('div'); banner.id = 'edit-banner'; banner.className = 'editing-banner';
      $('pane-write').prepend(banner);
    }
    banner.innerHTML = `<span>Editing question ${i + 1} in the ${listName(k)}</span><span class="spacer"></span>`;
    const cancel = document.createElement('button'); cancel.className = 'btn-ghost btn-small'; cancel.textContent = 'Cancel';
    cancel.onclick = () => cancelEdit();
    banner.appendChild(cancel);
    if (q.type === 'mc' && q.correct < 0) flash('c-msg', 'This question came from a file without an answer key. Type the correct answer and at least one wrong one.', true);
    updatePreview(); updateTry(); renderList();
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $(q.q ? (q.type === 'text' ? 'c-answer' : 'c-correct') : 'c-q').focus({ preventScroll: true });
  }
  function cancelEdit(quiet) {
    editing = null;
    $('c-add').textContent = addTarget.get() === 'modified' ? 'Add to modified list' : 'Add question';
    const b = $('edit-banner'); if (b) b.remove();
    resetComposer(false);
    if (!quiet) renderList();
  }

  // ---------- question lists (main + modified, side by side) ----------
  const listFilter = choice('list-filter', 'all', () => renderList());
  function renderList() {
    const nm = current.questions.length, nd = current.modified.length;
    $('list-heading').textContent = `Questions in this set (${nm}${nd ? ` + ${nd} modified` : ''})`;
    $('count-main').textContent = nm;
    $('count-mod').textContent = nd;
    renderColumn('questions', $('q-list'));
    renderColumn('modified', $('q-list-mod'));
  }
  function questionRow(q, i, k) {
    const row = document.createElement('div');
    row.className = 'q-row' + (q === editing ? ' editing' : '');
    row.draggable = true;
    row.dataset.i = i; row.dataset.list = k;
    const tags = [];
    tags.push(`<span class="tag">${q.type === 'text' ? 'Typed' : 'Options'}</span>`);
    if (q.skill) tags.push(`<span class="tag">${esc(q.skill)}</span>`);
    if (!isValid(q)) tags.push('<span class="tag todo">Needs an answer</span>');
    for (const f of flagsOf(q)) tags.push(`<span class="tag check">${f === 'visual' ? 'Check: mentions a table, diagram or picture' : 'Check: open-ended, may not suit a quick answer'}</span>`);
    let ans = '';
    if (q.type === 'text') ans = (q.answers || []).length ? `Answer: <span class="ok">${(q.answers || []).map(mathHTML).join(' or ')}</span>` : '';
    else if (q.correct >= 0) ans = `<span class="ok">✓ ${mathHTML(q.options[q.correct])}</span> · ${q.options.filter((_, j) => j !== q.correct).map(mathHTML).join(', ')}`;
    row.innerHTML = `<span class="grip" aria-hidden="true" title="Drag to move">⠿</span><span class="num">${i + 1}</span><div class="body"><div class="qt">${mathHTML(q.q || '(no question text)')}</div><div class="ans">${ans}</div><div class="tags">${tags.join('')}</div></div>`;
    // Quick finish: click the right option, or type the answer, without opening the editor.
    const ansBox = row.querySelector('.ans');
    if (q.type === 'mc' && !(q.correct >= 0) && (q.options || []).length >= 2) {
      const lab = document.createElement('span'); lab.className = 'quick-label'; lab.textContent = 'Click the correct answer:';
      ansBox.appendChild(lab);
      q.options.forEach((o, j) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'quick-opt';
        b.innerHTML = `<b>${'ABCDEF'[j]}</b> ${mathHTML(o)}`;
        b.setAttribute('aria-label', `Option ${'ABCDEF'[j]} is correct`);
        b.onclick = () => { q.correct = j; changed(); };
        ansBox.appendChild(b);
      });
    } else if (q.type === 'text' && !(q.answers || []).length) {
      const f = document.createElement('form'); f.className = 'quick-ans';
      f.innerHTML = `<input aria-label="Answer for question ${i + 1}" placeholder="Type the answer, then press Enter"><button class="btn-small" type="submit">Save</button>`;
      f.onsubmit = (e) => {
        e.preventDefault();
        const v = f.querySelector('input').value.split(';').map((x) => x.trim()).filter(Boolean);
        if (!v.length) return;
        q.answers = v;
        changed();
        const next = [...document.querySelectorAll(`.q-row[data-list="${k}"] .quick-ans input, .q-row[data-list="${k}"] .quick-opt`)].find((x) => Number(x.closest('.q-row').dataset.i) > i);
        if (next) next.focus();
      };
      ansBox.appendChild(f);
    }
    const other = k === 'questions' ? 'modified' : 'questions';
    const acts = document.createElement('div'); acts.className = 'acts';
    const act = (label, aria, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); if (cls) b.className = cls; b.onclick = fn; acts.appendChild(b); };
    const where = `question ${i + 1} in the ${listName(k)}`;
    act('Edit', `Edit ${where}`, () => editQuestion(q));
    act('↑', `Move ${where} up`, () => moveWithin(k, i, -1));
    act('↓', `Move ${where} down`, () => moveWithin(k, i, 1));
    act('Copy', `Duplicate ${where}`, () => { current[k].splice(i + 1, 0, clone(q)); changed(); });
    act(k === 'questions' ? 'Copy to modified →' : '← Copy to main', `Copy ${where} to the ${listName(other)}`, () => {
      current[other].push(clone(q)); changed();
      flash('list-msg', `Copied to the ${listName(other)} as question ${current[other].length}.`);
    }, 'to-other');
    act('Delete', `Delete ${where}`, () => {
      const [gone] = current[k].splice(i, 1);
      if (gone === editing) cancelEdit(true);
      changed();
      showUndo(`Deleted ${where}`, () => { current[k].splice(i, 0, gone); changed(); });
    });
    row.querySelector('.body').appendChild(acts);
    return row;
  }
  function renderColumn(k, box) {
    box.textContent = '';
    const onlyTodo = listFilter.get() === 'todo';
    let shown = 0;
    current[k].forEach((q, i) => {
      if (onlyTodo && !needsAttention(q)) return;
      shown++;
      box.appendChild(questionRow(q, i, k));
    });
    if (!shown) {
      const p = document.createElement('p'); p.className = 'empty-list';
      p.textContent = onlyTodo ? 'Nothing needs attention here.'
        : k === 'modified' ? 'No modified questions yet. Drag questions here, use “Copy to modified”, or choose “Modified list” under Add questions.'
          : 'No questions yet. Write one above, generate some from skills, or upload a test.';
      box.appendChild(p);
    }
  }
  function moveWithin(k, i, d) {
    const qs = current[k], j = i + d;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    changed();
  }

  // Drag a question to reorder it, or across to the other list to move it there.
  let drag = null;
  function dropIndex(box, y) {
    const rows = [...box.querySelectorAll('.q-row')];
    for (const r of rows) { const b = r.getBoundingClientRect(); if (y < b.top + b.height / 2) return Number(r.dataset.i); }
    return null; // after the last one
  }
  function clearDropMarks() { document.querySelectorAll('.drop-before, .drop-end').forEach((el) => el.classList.remove('drop-before', 'drop-end')); }
  for (const [k, id] of [['questions', 'q-list'], ['modified', 'q-list-mod']]) {
    const box = $(id), col = box.closest('.qcol');
    box.addEventListener('dragstart', (e) => {
      const row = e.target.closest && e.target.closest('.q-row');
      if (!row) return;
      drag = { list: row.dataset.list, i: Number(row.dataset.i) };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'flurry-question'); } catch (_) { /* some browsers */ }
      row.classList.add('dragging');
    });
    box.addEventListener('dragend', () => { drag = null; clearDropMarks(); document.querySelectorAll('.dragging').forEach((r) => r.classList.remove('dragging')); document.querySelectorAll('.qcol.over').forEach((c) => c.classList.remove('over')); });
    col.addEventListener('dragover', (e) => {
      if (!drag) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      col.classList.add('over');
      clearDropMarks();
      const at = dropIndex(box, e.clientY);
      const target = at == null ? null : box.querySelector(`.q-row[data-i="${at}"]`);
      if (target) target.classList.add('drop-before'); else box.classList.add('drop-end');
    });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) { col.classList.remove('over'); clearDropMarks(); } });
    col.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      col.classList.remove('over'); clearDropMarks();
      let at = dropIndex(box, e.clientY);
      const from = current[drag.list];
      const [q] = from.splice(drag.i, 1);
      const to = current[k];
      if (at == null) at = to.length;
      else if (drag.list === k && drag.i < at) at--;
      to.splice(at, 0, q);
      const moved = drag.list !== k;
      drag = null;
      changed();
      if (moved) flash('list-msg', `Moved to the ${listName(k)}. Use “Copy” instead to keep it in both lists.`);
    });
  }

  function refreshSkillList() {
    const names = new Set();
    for (const s of sets) for (const q of s.questions) if (q.skill) names.add(q.skill);
    for (const t of GEN.TOPICS) for (const s of t.skills) names.add(s.name);
    $('skill-list').innerHTML = [...names].sort().map((n) => `<option value="${esc(n)}"></option>`).join('');
  }

  // ---------- generate from skills ----------
  const gLevel = choice('g-level', '1', () => renderSkills(true));
  const gStyle = choice('g-style', 'mix');
  $('g-topic').innerHTML = GEN.TOPICS.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  $('g-topic').onchange = () => renderSkills(true);
  let skillsFor = null;
  function renderSkills(force) {
    const topic = GEN.TOPICS.find((t) => t.id === $('g-topic').value) || GEN.TOPICS[0];
    if (!force && skillsFor === topic.id + gLevel.get()) return;
    skillsFor = topic.id + gLevel.get();
    const checked = new Set([...$('g-skills').querySelectorAll('input:checked')].map((i) => i.value));
    const box = $('g-skills'); box.textContent = '';
    for (const s of topic.skills) {
      const [eg] = GEN.generate(s.id, 1, Number(gLevel.get()), 'text');
      const lab = document.createElement('label'); lab.className = 'skill-opt';
      lab.innerHTML = `<input type="checkbox" value="${s.id}"${checked.has(s.id) ? ' checked' : ''}><span><b>${esc(s.name)}</b><span class="eg">e.g. ${mathHTML(eg ? eg.q : '')}</span></span>`;
      box.appendChild(lab);
    }
  }
  $('g-new-examples').onclick = () => renderSkills(true);
  $('g-all').onclick = () => {
    const boxes = [...$('g-skills').querySelectorAll('input')];
    const all = boxes.every((b) => b.checked);
    boxes.forEach((b) => { b.checked = !all; });
    $('g-all').textContent = all ? 'Select all' : 'Clear all';
  };
  $('g-add').onclick = () => {
    const ids = [...$('g-skills').querySelectorAll('input:checked')].map((i) => i.value);
    if (!ids.length) { flash('g-msg', 'Tick at least one skill.', true); return; }
    const count = F.clamp(Math.round(Number($('g-count').value) || 4), 1, 20);
    let added = 0;
    for (const id of ids) { const qs = GEN.generate(id, count, Number(gLevel.get()), gStyle.get()); targetList().push(...qs); added += qs.length; }
    if (!current.title) { const t = GEN.TOPICS.find((x) => x.id === $('g-topic').value); current.title = t ? t.name + ' practice' : 'Practice'; $('set-title').value = current.title; }
    changed(); refreshSkillList();
    flash('g-msg', `Added ${added} questions to the end of the ${listName(addTarget.get())} below.`);
  };

  // ---------- upload a file ----------
  const uTarget = choice('u-target', 'new');
  async function handleFile(file) {
    const rep = $('u-report');
    rep.hidden = false; rep.className = 'upload-report'; rep.textContent = `Reading ${file.name}…`;
    try {
      const r = await IMP.readFile(file);
      if (r.sets) {
        for (const s of r.sets) sets.unshift({ id: uid(), title: s.title, questions: s.questions, modified: s.modified || [] });
        current = sets[0]; save(); cancelEdit(); renderAll();
        rep.textContent = `Added ${r.sets.length} set${r.sets.length === 1 ? '' : 's'} from ${file.name}.`;
        return;
      }
      if (!r.questions.length) { rep.className = 'upload-report bad'; rep.textContent = `No questions found in ${file.name}. Questions need to be numbered (1. 2. 3. or Q1, Q2…), or laid out as rows of question, answer, wrong answers.`; return; }
      if (uTarget.get() === 'new' || !current.questions.length && !current.title) {
        const s = { id: uid(), title: r.title || file.name.replace(/\.[^.]+$/, ''), questions: r.questions, modified: [] };
        if (uTarget.get() === 'new') { sets.unshift(s); current = s; } else { current.title = s.title; targetList().push(...s.questions); }
      } else targetList().push(...r.questions);
      save(); cancelEdit(); renderAll();
      const noAns = r.questions.filter((q) => !isValid(q)).length;
      const visual = r.questions.filter((q) => (q.flags || []).includes('visual')).length;
      const open = r.questions.filter((q) => (q.flags || []).includes('open')).length;
      const bits = [];
      if (noAns) bits.push(`${noAns} need${noAns === 1 ? 's' : ''} an answer`);
      if (visual) bits.push(`${visual} mention${visual === 1 ? 's' : ''} a table, diagram or picture`);
      if (open) bits.push(`${open} ${open === 1 ? 'is' : 'are'} open-ended`);
      rep.innerHTML = `<b>Found ${r.questions.length} questions in ${esc(file.name)}.</b> ${bits.length ? esc(bits.join(', ')) + '. ' : 'All have answers. '}`;
      if (bits.length) {
        rep.innerHTML += 'Click <b>Edit</b> on each one in the list below to finish it; ';
        const b = document.createElement('button'); b.className = 'btn-small'; b.textContent = 'Show the ones that need attention';
        b.onclick = () => { listFilter.set('todo'); renderList(); $('list-panel').scrollIntoView({ behavior: 'smooth' }); };
        rep.appendChild(b);
        listFilter.set('todo'); renderList();
      }
    } catch (err) {
      rep.className = 'upload-report bad';
      rep.textContent = err && err.message ? err.message : `Couldn't read ${file.name}.`;
    }
  }
  $('upload-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) handleFile(f); };
  const dz = $('dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

  $('u-template').onclick = () => {
    const rows = [
      ['Question', 'Correct answer', 'Wrong answer 1', 'Wrong answer 2', 'Wrong answer 3', 'Wrong answer 4', 'Skill'],
      ['What is 7 × 8?', '56', '54', '48', '64', '', 'Times tables'],
      ['Simplify $6a + 4b - 2a + b$', '$4a + 5b$', '$8a + 5b$', '$4a + 4b$', '$9ab$', '', 'Collecting like terms'],
      ['If $n = 6$, evaluate $4n - 7$', '17', '', '', '', '', 'Substitution'],
      ['Write an expression for 3 less than $k$ (typed answer: leave wrong answers empty)', 'k-3', '', '', '', '', 'Writing expressions'],
    ];
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    download('flurry-fight-question-template.csv', '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv');
  };

  // ---------- paste a list ----------
  $('paste-add').onclick = () => {
    const qs = IMP.parsePasted($('paste-text').value);
    if (!qs.length) { flash('p-msg', 'No questions found. Each line needs a question and at least one answer, separated by |.', true); return; }
    targetList().push(...qs); changed(); $('paste-text').value = '';
    flash('p-msg', `Added ${qs.length} question${qs.length === 1 ? '' : 's'}.`);
  };

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- options ----------
  function choiceOpt(id, initial) {
    const el = $(id);
    const set = (v) => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    el.querySelectorAll('button').forEach((b) => { b.onclick = () => { set(b.dataset.v); saveOptions(); }; });
    if (initial) set(initial);
    return () => el.querySelector('[aria-pressed="true"]').dataset.v;
  }
  let savedOpts = {};
  try { savedOpts = JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') || {}; } catch (_) { /* defaults */ }
  const getMode = choiceOpt('opt-mode', savedOpts.teams ? 'teams' : 'ffa');
  const getLate = choiceOpt('opt-late', savedOpts.lateJoin === false ? 'off' : 'on');
  const getPickups = choiceOpt('opt-pickups', savedOpts.pickups === false ? 'off' : 'on');
  const getMap = choiceOpt('opt-map', F.MAPS[savedOpts.map] ? savedOpts.map : 'meadow');
  // little previews of each map, drawn with the same code as the live view
  window.FFSprites.ready.then(() => {
    const was = F.mapId;
    for (const btn of $('opt-map').querySelectorAll('button')) {
      const c = btn.querySelector('canvas');
      F.useMap(btn.dataset.v);
      const zoom = Math.min(c.width / F.MAP.width, c.height / F.MAP.height);
      R.draw(c.getContext('2d'), c.width, c.height, { x: F.MAP.width / 2, y: F.MAP.height / 2, zoom }, R.newWorld(false, true), 0);
    }
    F.useMap(G.settings ? G.settings.map : was);
  });
  if (savedOpts.duration) $('opt-duration').value = String(savedOpts.duration);
  if (savedOpts.ammoPerCorrect) $('opt-ammo').value = String(savedOpts.ammoPerCorrect);
  if (savedOpts.wrongDelay != null) $('opt-wrong').value = String(savedOpts.wrongDelay);
  function options() {
    return {
      duration: Number($('opt-duration').value),
      teams: getMode() === 'teams',
      ammoPerCorrect: F.clamp(Math.round(Number($('opt-ammo').value) || 3), 1, 10),
      wrongDelay: Number($('opt-wrong').value),
      lateJoin: getLate() === 'on',
      pickups: getPickups() === 'on',
      map: getMap(),
    };
  }
  function saveOptions() { try { localStorage.setItem(OPTS_KEY, JSON.stringify(options())); } catch (_) { /* ignore */ } }
  ['opt-duration', 'opt-ammo', 'opt-wrong'].forEach((id) => { $(id).onchange = saveOptions; });

  // ---------- game ----------
  const G = { code: null, step: 'setup', world: R.newWorld(false, true), stats: new Map(), results: null, looping: false, settings: null, mods: new Set(), modCount: 0 };

  // Students who get the modified list. Remembered by name in this browser, so they're ticked again next game.
  const MOD_KEY = 'flurry-modified-names';
  const nameKey = (n) => String(n || '').trim().toLowerCase();
  function savedModNames() { try { return new Set(JSON.parse(localStorage.getItem(MOD_KEY) || '[]')); } catch (_) { return new Set(); } }
  function rememberMod(name, on) {
    const set = savedModNames();
    if (on) set.add(nameKey(name)); else set.delete(nameKey(name));
    try { localStorage.setItem(MOD_KEY, JSON.stringify([...set])); } catch (_) { /* storage blocked */ }
  }
  function setMod(p, on, remember = true) {
    if (!G.modCount) return;
    if (on) G.mods.add(p.id); else G.mods.delete(p.id);
    if (remember) rememberMod(p.name, on);
    socket.emit('host:modified', { id: p.id, on }, (res) => {
      if (res && res.ok) { if (res.on) G.mods.add(p.id); else G.mods.delete(p.id); }
      refreshModViews();
    });
    refreshModViews();
  }
  const autoModDone = new Set();
  function autoTickMods(players) {
    if (!G.modCount) return;
    const saved = savedModNames();
    for (const p of players) {
      if (autoModDone.has(p.id)) continue;
      autoModDone.add(p.id);
      if (saved.has(nameKey(p.name)) && !G.mods.has(p.id)) setMod(p, true, false);
    }
  }
  function refreshModViews() {
    if (G.step === 'lobby') renderLobby([...G.world.roster.values()]);
    if (G.step === 'live') renderLive(performance.now());
  }

  $('create').onclick = () => {
    $('create-err').textContent = '';
    saveOptions();
    const strip = (list) => list.filter(isValid).map(({ flags, ...q }) => q);
    socket.emit('host:create', { title: current.title, questions: strip(current.questions), modified: strip(current.modified), settings: options() }, (res) => {
      if (!res || !res.ok) { $('create-err').textContent = (res && res.error) || 'Could not create the game. Check your connection.'; return; }
      G.code = res.code; G.settings = res.settings; F.useMap(res.settings.map);
      G.mods = new Set(); G.modCount = res.modifiedCount || 0; autoModDone.clear();
      sessionStorage.setItem(HOST_KEY, JSON.stringify({ code: res.code, hostToken: res.hostToken }));
      showLobby();
    });
  };

  function showLobby() {
    step('lobby');
    $('lobby-code').textContent = G.code;
    $('join-url').textContent = location.host;
    const qr = $('qr'); qr.textContent = '';
    if (window.qrcode) {
      const q = window.qrcode(0, 'M');
      q.addData(`${location.origin}/?code=${G.code}`); q.make();
      qr.innerHTML = q.createSvgTag({ cellSize: 5, margin: 0, scalable: true });
      const svg = qr.querySelector('svg'); if (svg) { svg.style.width = '150px'; svg.style.height = '150px'; }
      qr.hidden = false;
    } else qr.hidden = true;
    renderLobby([]);
  }

  // A plain dot, so a projected lobby or live view doesn't announce who has the modified list.
  function paintToggle(b, p) {
    const on = G.mods.has(p.id);
    if (b.getAttribute('aria-pressed') === String(on)) return;
    b.setAttribute('aria-pressed', String(on));
    b.title = 'Switch question list';
    b.setAttribute('aria-label', `${p.name}: switch question list`);
  }
  function modToggle(p) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mod-toggle';
    paintToggle(b, p);
    b.onclick = () => setMod(p, !G.mods.has(p.id));
    return b;
  }
  function renderLobby(players) {
    const el = $('lobby-players'); el.textContent = '';
    const live = players.filter((p) => p.connected);
    $('lobby-count').textContent = live.length ? `${live.length} player${live.length === 1 ? '' : 's'} ready` : 'Waiting for players';
    $('start').disabled = !live.length;
    for (const p of live) {
      const pill = document.createElement('span'); pill.className = 'pill';
      const d = document.createElement('span'); d.className = 'dot'; d.style.background = p.colour;
      const x = document.createElement('button'); x.textContent = '×'; x.className = 'kick'; x.setAttribute('aria-label', `Remove ${p.name}`);
      x.onclick = () => socket.emit('host:kick', { id: p.id });
      pill.append(d, document.createTextNode(p.name));
      if (G.modCount) pill.appendChild(modToggle(p));
      pill.appendChild(x);
      el.appendChild(pill);
    }
  }

  socket.on('roster', (r) => {
    G.world.roster = new Map(r.players.map((p) => [p.id, p]));
    if (r.settings) { G.settings = r.settings; G.world.teams = !!r.settings.teams; F.useMap(r.settings.map); }
    autoTickMods(r.players.filter((p) => p.connected));
    if (G.step === 'lobby') renderLobby(r.players);
  });
  socket.on('started', () => { step('live'); $('live-code').textContent = G.code; });
  socket.on('state', (s) => R.applySnapshot(G.world, s, performance.now()));
  socket.on('stats', (list) => { G.stats = new Map(list.map((p) => [p.id, p])); });
  socket.on('ko', (e) => {
    const now = performance.now();
    R.burst(G.world, e.x, e.y, '#ffffff', 22, 70, 7, now);
    G.world.particles.push({ kind: 'text', text: 'KO!', x: e.x, y: e.y - 20, colour: '#ffc93c', t0: now, life: 900 });
  });
  socket.on('splat', (e) => R.burst(G.world, e.x, e.y, '#ffffff', 7, 26, 3.5, performance.now()));
  socket.on('hit', (e) => { const p = G.world.players.get(e.pid); if (p) p.hitAt = performance.now(); });
  socket.on('ended', (res) => showResults(res));
  socket.on('closed', () => { sessionStorage.removeItem(HOST_KEY); step('setup'); });

  $('start').onclick = () => socket.emit('host:start', {}, (res) => { if (res && !res.ok && res.error) alert(res.error); });
  $('end').onclick = () => { if (confirm('End the game now and show results?')) socket.emit('host:end', {}); };
  $('cancel-game').onclick = () => { if (!confirm('Cancel this game? Players in the lobby will be sent back to the join screen.')) return; socket.emit('host:cancel'); sessionStorage.removeItem(HOST_KEY); G.code = null; step('setup'); };
  $('again').onclick = () => { sessionStorage.removeItem(HOST_KEY); G.code = null; G.world = R.newWorld(false, true); step('setup'); };

  // Resume hosting after a refresh.
  socket.on('connect', () => {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(HOST_KEY) || 'null'); } catch (_) { /* ignore */ }
    if (!saved) return;
    socket.emit('host:resume', saved, (res) => {
      if (!res || !res.ok) { sessionStorage.removeItem(HOST_KEY); return; }
      G.code = res.code; G.settings = res.settings; F.useMap(res.settings.map);
      G.mods = new Set(res.mods || []); G.modCount = res.modifiedCount || 0;
      for (const p of res.players) autoModDone.add(p.id);
      G.world.teams = !!res.settings.teams;
      G.world.roster = new Map(res.players.map((p) => [p.id, p]));
      if (res.state === 'lobby') { showLobby(); renderLobby(res.players); }
      else if (res.state === 'playing') { step('live'); $('live-code').textContent = G.code; }
      else if (res.results) showResults(res.results);
    });
  });

  // ---------- live view ----------
  const spec = $('spec'), sctx = spec.getContext('2d');
  function fmtTime(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  let lastFrame = performance.now(), lastTable = 0;
  function loop(now) {
    if (G.step !== 'live') { G.looping = false; return; }
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    const w = G.world;
    const rect = spec.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
    if (spec.width !== W || spec.height !== H) { spec.width = W; spec.height = H; }
    R.easeOthers(w, dt);
    const zoom = Math.min(W / (F.MAP.width + 40), H / (F.MAP.height + 40));
    R.draw(sctx, W, H, { x: F.MAP.width / 2, y: F.MAP.height / 2, zoom }, w, now);
    if (now - lastTable > 250) { lastTable = now; renderLive(now); }
    requestAnimationFrame(loop);
  }

  function renderLive(now) {
    const w = G.world;
    $('live-timer').textContent = fmtTime(w.timeLeft - (now - w.timeAt));
    const tm = $('live-teams');
    if (w.teams && w.teamScores) {
      const b = w.teamScores.blue, r = w.teamScores.red, tot = Math.max(1, b + r);
      tm.innerHTML = `<div class="teambar" style="color:#fff;margin:12px 0"><div style="flex:${Math.max(0.15, b / tot)};background:${F.TEAM_COLOURS.blue}">Blue ${b}</div><div style="flex:${Math.max(0.15, r / tot)};background:${F.TEAM_COLOURS.red}">Red ${r}</div></div>`;
    } else tm.textContent = '';
    const rows = [...w.roster.values()].map((p) => {
      const s = G.stats.get(p.id) || {}, live = w.players.get(p.id) || {};
      return { ...p, kos: live.kos != null ? live.kos : (s.kos || 0), correct: s.correct || 0, attempted: s.attempted || 0 };
    }).sort((a, b) => b.kos - a.kos || b.correct - a.correct);
    $('live-mod-th').hidden = !G.modCount;
    // Update rows in place (rebuilding them would swap the Modified buttons out from under the cursor),
    // and only re-sort while the pointer isn't over the table.
    const tbody = $('live-table');
    const old = new Map([...tbody.children].map((tr) => [tr.dataset.id, tr]));
    const set = (el, text) => { if (el.textContent !== String(text)) el.textContent = text; };
    const trs = rows.map((p) => {
      let tr = old.get(p.id);
      if (!tr) {
        tr = document.createElement('tr'); tr.dataset.id = p.id;
        tr.innerHTML = '<td><span class="dot"></span> <span class="nm"></span></td><td class="n"></td><td class="n"></td>';
        if (G.modCount) { const td = document.createElement('td'); td.appendChild(modToggle(p)); tr.appendChild(td); }
        tbody.appendChild(tr);
      }
      old.delete(p.id);
      tr.style.opacity = p.connected ? '' : '.5';
      tr.querySelector('.dot').style.background = w.teams && p.team ? F.TEAM_COLOURS[p.team] : p.colour;
      set(tr.querySelector('.nm'), p.name + (p.connected ? '' : ' (offline)'));
      set(tr.children[1], p.kos);
      set(tr.children[2], `${p.correct}/${p.attempted}`);
      const b = tr.querySelector('.mod-toggle'); if (b) paintToggle(b, p);
      return tr;
    });
    for (const tr of old.values()) tr.remove();
    const order = rows.map((p) => p.id).join();
    if (!tbody.matches(':hover') && tbody.dataset.order !== order) { for (const tr of trs) tbody.appendChild(tr); tbody.dataset.order = order; }
  }

  // ---------- results ----------
  function showResults(res) {
    G.results = res;
    step('results');
    const ps = res.players;
    let line = 'Results';
    if (res.teams) {
      const { blue, red } = res.teams;
      line = blue === red ? `Draw, ${blue} knockouts each` : `${blue > red ? 'Blue' : 'Red'} team wins ${Math.max(blue, red)} to ${Math.min(blue, red)}`;
    } else if (ps[0]) line = ps[0].kos > 0 ? `${ps[0].name} wins with ${ps[0].kos} knockout${ps[0].kos === 1 ? '' : 's'}` : `No knockouts. ${ps[0].name} tops the board on correct answers`;
    $('res-line').textContent = line;
    renderSkillResults(res);
    $('res-players').innerHTML = ps.map((p, i) => {
      const acc = p.attempted ? Math.round(100 * p.correct / p.attempted) : 0;
      const col = res.teams && p.team ? F.TEAM_COLOURS[p.team] : p.colour;
      return `<tr><td>${i + 1}</td><td><span class="dot" style="background:${col}"></span> ${esc(p.name)}${p.mod ? ' <span class="alt-dot" title="List B"></span>' : ''}</td><td class="n">${p.kos}</td><td class="n">${p.deaths}</td><td class="n">${p.correct}/${p.attempted}</td><td><span class="acc" style="width:${acc * 0.8}px"></span>${p.attempted ? acc + '%' : '–'}</td></tr>`;
    }).join('');
    const qs = res.questions.slice().sort((a, b) => (a.attempts ? a.correct / a.attempts : 2) - (b.attempts ? b.correct / b.attempts : 2));
    const unreached = qs.filter((q) => !q.attempts).length;
    $('res-questions').innerHTML = qs.filter((q) => q.attempts).map((q) => {
      const acc = q.attempts ? Math.round(100 * q.correct / q.attempts) : null;
      return `<tr><td>${mathHTML(q.q)}${q.list === 'mod' ? ' <span class="alt-dot" title="List B"></span>' : ''}</td><td>${esc(q.skill || '')}</td><td class="n">${q.attempts}</td><td>${acc == null ? 'Not attempted' : `<span class="acc" style="width:${acc * 0.8}px;background:${acc < 50 ? 'var(--mitten)' : 'var(--good)'}"></span>${acc}%`}</td></tr>`;
    }).join('') + (unreached ? `<tr><td colspan="4" class="help">${unreached} question${unreached === 1 ? '' : 's'} weren’t reached this game. They’re still in the CSV.</td></tr>` : '');
  }

  function renderSkillResults(res) {
    const by = new Map();
    for (const q of res.questions) {
      if (!q.skill) continue;
      const s = by.get(q.skill) || { attempts: 0, correct: 0 };
      s.attempts += q.attempts; s.correct += q.correct; by.set(q.skill, s);
    }
    const rows = [...by.entries()].filter(([, s]) => s.attempts).sort((a, b) => a[1].correct / a[1].attempts - b[1].correct / b[1].attempts);
    $('res-skills-panel').hidden = !rows.length;
    $('res-skills').innerHTML = rows.map(([name, s]) => {
      const acc = Math.round(100 * s.correct / s.attempts);
      return `<tr><td>${esc(name)}</td><td class="n">${s.attempts}</td><td><span class="acc" style="width:${acc * 0.8}px;background:${acc < 50 ? 'var(--mitten)' : acc < 75 ? 'var(--sun)' : 'var(--good)'}"></span>${acc}%</td></tr>`;
    }).join('');
  }

  $('csv').onclick = () => {
    const res = G.results; if (!res) return;
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Player', 'Team', 'Question list', 'Knockouts', 'Times knocked out', 'Correct', 'Attempted', 'Accuracy %'].map(cell).join(',')];
    for (const p of res.players) lines.push([p.name, p.team || '', p.mod ? 'Modified' : 'Main', p.kos, p.deaths, p.correct, p.attempted, p.attempted ? Math.round(100 * p.correct / p.attempted) : ''].map(cell).join(','));
    lines.push('', ['Question', 'List', 'Skill', 'Attempts', 'Correct', 'Accuracy %'].map(cell).join(','));
    for (const q of res.questions) lines.push([q.q.replace(/\\\$/g, '\u0000').replace(/\$/g, '').replace(/\u0000/g, '$'), q.list === 'mod' ? 'Modified' : 'Main', q.skill || '', q.attempts, q.correct, q.attempts ? Math.round(100 * q.correct / q.attempts) : ''].map(cell).join(','));
    const skills = new Map();
    for (const q of res.questions) if (q.skill) { const s = skills.get(q.skill) || [0, 0]; s[0] += q.attempts; s[1] += q.correct; skills.set(q.skill, s); }
    if (skills.size) {
      lines.push('', ['Skill', 'Answers', 'Correct', 'Accuracy %'].map(cell).join(','));
      for (const [k, [a, c]] of skills) lines.push([k, a, c, a ? Math.round(100 * c / a) : ''].map(cell).join(','));
    }
    const date = new Date().toISOString().slice(0, 10);
    download(`flurry-fight-results-${date}.csv`, lines.join('\n'), 'text/csv');
  };

  setWrongs([]);
  renderAll();
  showTab('write');
  updatePreview();
  step('setup');
})();
