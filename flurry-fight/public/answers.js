// Typed-answer checking, shared by the server (which marks answers) and the teacher's
// builder (which previews what will be accepted).
// "Smart" marking accepts any answer that is algebraically equivalent to an accepted
// answer (7m = m7, 3p + 15 = 15 + 3p, x/2 = ½x) but still rejects unsimplified answers
// with more terms than the accepted one, brackets when the accepted answer is expanded,
// and × or ÷ when the accepted answer has none.
(function (root) {
  // ---------- tiny expression parser ----------
  function tokenize(src) {
    const s = src
      .replace(/\\left|\\right/g, '')
      .replace(/\\times|×|·|⋅/g, '*').replace(/\\div|÷/g, '/')
      .replace(/−|–/g, '-').replace(/\\sqrt|√|sqrt/g, '#')
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
      .replace(/[{]/g, '(').replace(/[}]/g, ')')
      .replace(/\$/g, '').replace(/\s+/g, '').toLowerCase();
    const out = [];
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (/[0-9.]/.test(c)) {
        let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const v = Number(s.slice(i, j)); if (!Number.isFinite(v)) return null;
        out.push({ t: 'n', v }); i = j;
      } else if (c === '#') { out.push({ t: 'sqrt' }); i++; }
      else if (/[a-z]/.test(c)) { out.push({ t: 'v', v: c }); i++; }
      else if ('+-*/^()'.includes(c)) { out.push({ t: c }); i++; }
      else if (c === '²') { out.push({ t: '^' }, { t: 'n', v: 2 }); i++; }
      else if (c === '³') { out.push({ t: '^' }, { t: 'n', v: 3 }); i++; }
      else return null;
    }
    return out;
  }

  // Returns { fn(vars) -> number, terms, vars:Set } or null if it isn't an expression.
  function parse(src) {
    const toks = tokenize(String(src || ''));
    if (!toks || !toks.length) return null;
    let i = 0;
    const vars = new Set();
    const peek = () => toks[i];
    const startsAtom = (t) => t && (t.t === 'n' || t.t === 'v' || t.t === '(' || t.t === 'sqrt');
    function expr() {
      let terms = 1;
      let left = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = toks[i++].t; const right = term(); const l = left; terms++;
        left = op === '+' ? (v) => l(v) + right(v) : (v) => l(v) - right(v);
      }
      left.terms = terms;
      return left;
    }
    function term() {
      let left = unary();
      for (;;) {
        const t = peek();
        if (t && (t.t === '*' || t.t === '/')) {
          i++; const right = unary(); const l = left;
          left = t.t === '*' ? (v) => l(v) * right(v) : (v) => l(v) / right(v);
        } else if (startsAtom(t)) { // implicit multiplication: 3x, ab, 2(x+1)
          const right = power(); const l = left; left = (v) => l(v) * right(v);
        } else break;
      }
      return left;
    }
    function unary() {
      const t = peek();
      if (t && t.t === '-') { i++; const u = unary(); return (v) => -u(v); }
      if (t && t.t === '+') { i++; return unary(); }
      return power();
    }
    function power() {
      const base = atom();
      if (peek() && peek().t === '^') { i++; const e = unary(); return (v) => Math.pow(base(v), e(v)); }
      return base;
    }
    function atom() {
      const t = toks[i++];
      if (!t) throw new Error('end');
      if (t.t === 'n') { const n = t.v; return () => n; }
      if (t.t === 'v') { vars.add(t.v); const name = t.v; return (v) => v[name]; }
      if (t.t === 'sqrt') { const a = atom(); return (v) => Math.sqrt(a(v)); }
      if (t.t === '(') { const e = expr(); if (!toks[i] || toks[i].t !== ')') throw new Error('paren'); i++; return e; }
      throw new Error('bad');
    }
    try {
      const fn = expr();
      if (i !== toks.length) return null;
      return { fn, terms: fn.terms, vars };
    } catch (_) { return null; }
  }

  // ---------- helpers ----------
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/[$\\]/g, '').replace(/−|–/g, '-');
  function toNumber(s) {
    const t = norm(s).replace(/,/g, '');
    if (/^[-+]?\d*\.?\d+$/.test(t)) return parseFloat(t);
    const f = t.match(/^([-+]?\d*\.?\d+)\/([-+]?\d*\.?\d+)$/);
    if (f && parseFloat(f[2]) !== 0) return parseFloat(f[1]) / parseFloat(f[2]);
    return null;
  }
  const hasTimes = (s) => /[×*÷]|\\times|\\div/.test(s);

  // For number answers: allow "x = 5", "$14", "26 cm", "30°" and a trailing full stop.
  const UNIT = /^([-+]?[\d.,/]+)\s*(cm\^?[23]?|mm\^?[23]?|km\^?[23]?|m\^?[23]?|cm²|m²|mm²|cm³|m|kg|g|mg|ml|l|kl|min|mins|hrs?|hours?|minutes?|seconds?|s|degrees?|°|dollars?|cents?|units?(\^?2)?|sq\.?\s*units?)\.?$/i;
  function numericForm(s) {
    let t = String(s).trim().replace(/\$/g, '').replace(/\\circ|\^\{?\\circ\}?/g, '°').replace(/[.;]+$/, '').trim();
    t = t.replace(/^[a-z]\s*=\s*(?=.)/i, '');
    const u = t.match(UNIT);
    return u ? u[1] : t;
  }

  // Does an accepted answer look like algebra (rather than a word answer like "yes")?
  function looksAlgebraic(a) {
    const s = String(a).replace(/\$/g, '').trim();
    if (!s || /[a-z]{2,}\s+[a-z]/i.test(s)) return false;           // several words
    if (!/[a-z]/i.test(s)) return false;                               // pure number: numeric marking
    if (/[0-9+\-*/^()×÷√²³]|\\frac|\\sqrt/.test(s)) return parse(s) !== null;
    return /^[a-z]{1,2}$/i.test(s.replace(/\s/g, '')) && parse(s) !== null; // x, ab, mn
  }

  function equivalent(pa, pb) {
    const names = [...new Set([...pa.vars, ...pb.vars])];
    let compared = 0;
    for (let k = 0; k < 8; k++) {
      const v = {};
      for (const n of names) v[n] = 1.3 + ((k * 7 + n.charCodeAt(0) * 13) % 37) / 10 + k * 0.17;
      const x = pa.fn(v), y = pb.fn(v);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (Math.abs(x - y) > 1e-7 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
      compared++;
    }
    return compared >= 3;
  }

  // mode: 'auto' (default: smart for algebra, numbers by value, text exactly) or 'exact'
  function check(given, accepted, mode = 'auto') {
    if (!accepted || !accepted.length || !norm(given)) return false;
    // Number answers may come with "x =", a dollar sign or a unit.
    if (accepted.every((a) => toNumber(a) !== null)) given = numericForm(given);
    const g = norm(given);
    if (!g) return false;
    for (const a of accepted) {
      const n = norm(a);
      if (g === n) return true;
      const gn = toNumber(given), an = toNumber(a);
      // 0.5 = 1/2, but a whole-number answer has to be typed as a whole number
      const wholeOnly = /^[-+]?\d+$/.test(n) && /\//.test(g);
      if (gn !== null && an !== null && !wholeOnly && Math.abs(gn - an) < 1e-9) return true;
    }
    if (mode === 'exact') return false;
    const algebraic = accepted.filter(looksAlgebraic);
    if (!algebraic.length) return false;
    if (hasTimes(given) && !algebraic.some(hasTimes)) return false;
    if (/[()]/.test(given) && !algebraic.some((a) => /[()]|\\frac/.test(a))) return false; // must be expanded
    const pg = parse(given);
    if (!pg) return false;
    const maxTerms = Math.max(...algebraic.map((a) => (parse(a) || { terms: 1 }).terms));
    if (pg.terms > maxTerms) return false;
    return algebraic.some((a) => { const pa = parse(a); return pa && equivalent(pg, pa); });
  }

  const answersMatch = (given, accepted, mode) => check(given, accepted, mode);
  const api = { answersMatch, check, parse, looksAlgebraic, toNumber };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FFAnswers = api;
})(typeof window !== 'undefined' ? window : globalThis);
