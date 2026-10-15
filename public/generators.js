// Skill-based question generators. Each skill makes fresh questions with random numbers,
// and multiple-choice distractors built from common mistakes.
(function (root) {
  // ---------- helpers ----------
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const LETTERS = ['a', 'b', 'c', 'd', 'h', 'k', 'm', 'n', 'p', 'q', 'r', 't', 'w', 'x', 'y'];
  const twoLetters = () => { const s = shuffle(LETTERS); const [u, v] = [s[0], s[1]].sort(); return [u, v]; };
  const M = (s) => `$${s}$`; // wrap as maths

  // A term like 3x, x, −2ab, 5 (LaTeX, without sign handling for the first term)
  const termTex = (c, vars, first) => {
    const abs = Math.abs(c);
    const body = vars ? (abs === 1 ? vars : abs + vars) : String(abs);
    if (first) return (c < 0 ? '-' : '') + body;
    return (c < 0 ? ' - ' : ' + ') + body;
  };
  const exprTex = (terms) => terms.map((t, i) => termTex(t.c, t.v, i === 0)).join('');
  const plain = (tex) => tex.replace(/\s+/g, '');
  const one1 = (tex) => tex.replace(/(^|[^\d])1(?=[a-z])/g, '$1'); // "1x" -> "x"

  function numDistractors(ans, ideas, n = 3) {
    const out = [];
    for (const d of ideas) {
      if (d == null || !Number.isFinite(d)) continue;
      const v = Math.round(d * 1000) / 1000;
      if (v !== ans && !out.includes(v)) out.push(v);
      if (out.length >= n) return out;
    }
    const near = shuffle([ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10, ans * 2, ans + 5]);
    for (const v of near) { if (v !== ans && v >= 0 && !out.includes(v)) out.push(v); if (out.length >= n) break; }
    return out;
  }

  // Build a question in the requested style. `answer` is the display form; `accept` the typed answers.
  function build({ q, answer, accept, distractors, skill, mcOnly }, style) {
    const useMC = mcOnly || style === 'mc' || (style === 'mix' && Math.random() < 0.5);
    const norm = (x) => String(x).replace(/\s+/g, '');
    const uniq = (distractors || []).filter((d, i, arr) => norm(d) !== norm(answer) && arr.findIndex((e) => norm(e) === norm(d)) === i);
    distractors = uniq;
    if (useMC && distractors.length >= 3) {
      const opts = [answer, ...distractors.slice(0, 3)];
      return { type: 'mc', q, options: opts, correct: 0, skill };
    }
    return { type: 'text', q, answers: accept || [plain(String(answer).replace(/\$/g, ''))], skill };
  }
  const n2s = (v) => String(v);

  // ---------- Year 7 Algebra ----------
  const alg = [];

  alg.push({
    id: 'alg-terms', name: 'Terms, coefficients and constants',
    gen(level) {
      const [u, v] = twoLetters();
      const cu = ri(2, 9), cv = level > 1 ? pick([1, ri(2, 9)]) : pick([1, 1, ri(2, 9)]), cuv = pick([1, ri(2, 9)]), k = ri(2, 15);
      const sub = level > 1 && Math.random() < 0.6;
      const terms = shuffle([{ c: cu, v: u }, { c: sub ? -cv : cv, v }, { c: cuv, v: u + v }]);
      if (level > 1 && Math.random() < 0.4) terms.push({ c: ri(2, 6), v: u + '^2' });
      terms.push({ c: k, v: '' });
      const ex = M(exprTex(terms));
      const all = terms.map((t) => t.c);
      const kind = pick(['count', 'const', 'coef', 'coef', 'coefuv']);
      const skill = this.name;
      if (kind === 'count') {
        const n = terms.length;
        return { skill, q: `How many terms are in the expression ${ex}?`, answer: n2s(n), distractors: numDistractors(n, [n - 1, n + 1, 2, n + 2]).map(n2s) };
      }
      if (kind === 'const') {
        return { skill, q: `What is the constant term in ${ex}?`, answer: n2s(k), distractors: numDistractors(k, [0, ...all.filter((x) => x !== k).map(Math.abs)]).map(n2s) };
      }
      const want = kind === 'coefuv' ? u + v : pick([u, v]);
      const target = terms.find((t) => t.v === want);
      const ans = target.c;
      return {
        skill, q: `In the expression ${ex}, what is the coefficient of ${M(target.v)}?`, answer: n2s(ans), accept: [n2s(ans)],
        distractors: numDistractors(ans, [0, -ans, k, ...all.filter((x) => x !== ans).map(Math.abs)]).map(n2s),
      };
    },
  });

  alg.push({
    id: 'alg-words', name: 'Writing expressions from words',
    gen(level) {
      const u = pick(LETTERS), v = pick(LETTERS.filter((x) => x !== u)), a = ri(2, 9), b = ri(2, 6);
      const T = [
        () => [`the product of ${M(u)} and ${a}`, `${a}${u}`, [`${a}${u}`], [`${u} + ${a}`, `\\frac{${u}}{${a}}`, `${u}^{${a}}`]],
        () => [`${a} less than ${M(u)}`, `${u} - ${a}`, [`${u}-${a}`], [`${a} - ${u}`, `${u} + ${a}`, `${a}${u}`]],
        () => [`${a} more than ${M(u)}`, `${u} + ${a}`, [`${u}+${a}`], [`${u} - ${a}`, `${a}${u}`, `${a} - ${u}`]],
        () => [`${M(u)} is doubled, then ${a} is subtracted`, `2${u} - ${a}`, [`2${u}-${a}`], [`2(${u} - ${a})`, `${u} - 2 \\times ${a}`, `2${u} + ${a}`]],
        () => [`${a} is added to ${M(u)}, and the result is multiplied by ${b}`, `${b}(${u} + ${a})`, [`${b}(${u}+${a})`, `${b}${u}+${b * a}`], [`${b}${u} + ${a}`, `${u} + ${b * a}`, `${b} + ${u} + ${a}`]],
        () => [`${M(u)} is multiplied by ${b}, then ${a} is added`, `${b}${u} + ${a}`, [`${b}${u}+${a}`], [`${b}(${u} + ${a})`, `${u} + ${a * b}`, `${a}${u} + ${b}`]],
        () => [`the sum of ${M(u)} and ${M(v)} is divided by ${b}`, `\\frac{${u} + ${v}}{${b}}`, [`(${u}+${v})/${b}`], [`${u} + \\frac{${v}}{${b}}`, `\\frac{${u}}{${b}} + ${v}`, `${b}(${u} + ${v})`]],
        () => [`${M(u)} is divided by ${b}`, `\\frac{${u}}{${b}}`, [`${u}/${b}`], [`\\frac{${b}}{${u}}`, `${b}${u}`, `${u} - ${b}`]],
      ];
      if (level > 1) T.push(
        () => [`the square of ${M(u)}`, `${u}^{2}`, [`${u}^2`], [`2${u}`, `${u} + 2`, `${u} \\times 2`]],
        () => [`${M(u)} is squared, then ${a} is added`, `${u}^{2} + ${a}`, [`${u}^2+${a}`], [`(${u} + ${a})^{2}`, `2${u} + ${a}`, `${u} + ${a}^{2}`]],
        () => [`${b} times the sum of ${M(u)} and ${M(v)}`, `${b}(${u} + ${v})`, [`${b}(${u}+${v})`, `${b}${u}+${b}${v}`], [`${b}${u} + ${v}`, `${u} + ${b}${v}`, `${b} + ${u} + ${v}`]],
      );
      const [words, ans, accept, wrong] = pick(T)();
      const q = Math.random() < 0.5 ? `Which expression means "${words}"?` : `Write an expression for: ${words}.`;
      return { skill: this.name, q, answer: M(ans), accept, distractors: wrong.map(M) };
    },
  });

  alg.push({
    id: 'alg-sub1', name: 'Substitution (one pronumeral)',
    gen(level) {
      const u = pick(LETTERS), v = level > 1 ? ri(3, 12) : ri(2, 9), a = ri(2, 9), b = ri(1, 12);
      const forms = [
        () => [`${a}${u} + ${b}`, a * v + b, [Number(`${a}${v}`) + b, a + v + b, a * (v + b), a * v - b]],
        () => { const bb = Math.min(b, a * v - 1); return [`${a}${u} - ${bb}`, a * v - bb, [Number(`${a}${v}`) - bb, a * v + bb, a - v + bb, a * (v - bb)]]; },
        () => [`${u}^{2} + ${b}`, v * v + b, [2 * v + b, (v + b) ** 2, v + b, v * v]],
        () => { const k = v * ri(2, 6); return [`\\frac{${k}}{${u}} + ${u}`, k / v + v, [k / v, (k + v) / v, k - v + v * 0, k / v + 1]]; },
      ];
      if (level > 1) forms.push(
        () => [`${a}(${u} + ${b})`, a * (v + b), [a * v + b, a + v + b, a * b + v]],
        () => { const bb = Math.min(b, v * v - 1); return [`${u}^{2} - ${bb}`, v * v - bb, [2 * v - bb, (v - bb) ** 2, v * v + bb]]; },
        () => [`${a}${u}^{2}`, a * v * v, [(a * v) ** 2, 2 * a * v, a * v + 2]],
      );
      const [ex, ans, ideas] = pick(forms)();
      return {
        skill: this.name, q: `If ${M(`${u} = ${v}`)}, what is the value of ${M(ex)}?`,
        answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, ideas).map(n2s),
      };
    },
  });

  alg.push({
    id: 'alg-sub2', name: 'Substitution (two pronumerals)',
    gen(level) {
      const [u, w] = twoLetters();
      const x = ri(2, level > 1 ? 9 : 6), y = ri(2, level > 1 ? 9 : 6), a = ri(2, 6), b = ri(2, 6);
      const forms = [
        () => [`${a}${u} + ${b}${w}`, a * x + b * y, [a * x + b + y, (a + b) * (x + y), a + x + b + y]],
        () => [`${u}${w} - ${w}`, x * y - y, [x * y, x - y * y, x * y + y]],
        () => [`${a}${u}^{2} + ${w}`, a * x * x + y, [(a * x) ** 2 + y, 2 * a * x + y, a * x + y]],
        () => [`${u}${w} + ${a}`, x * y + a, [x + y + a, Number(`${x}${y}`) + a, x * (y + a)]],
      ];
      if (level > 1) forms.push(
        () => [`${a}(${u} + ${w}) - ${w}^{2}`, a * (x + y) - y * y, [a * x + y - y * y, a * (x + y) - 2 * y, a * (x + y) + y * y]],
        () => {
          const [p, c, r] = pick([[3, 16, 5], [4, 9, 5], [6, 64, 10], [8, 36, 10], [5, 144, 13], [12, 25, 13]]);
          return [`\\sqrt{${u}^{2} + ${c}}`, r, [p + Math.sqrt(c), p * p + c, p + c], { [u]: p }];
        },
      );
      const [ex, ans, ideas, fixed] = pick(forms)();
      const given = fixed ? M(`${u} = ${fixed[u]}`) : `${M(`${u} = ${x}`)} and ${M(`${w} = ${y}`)}`;
      return {
        skill: this.name, q: `If ${given}, what is the value of ${M(ex)}?`,
        answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, ideas).map(n2s),
      };
    },
  });

  alg.push({
    id: 'alg-like', name: 'Identifying like terms',
    gen(level) {
      const [u, v] = twoLetters();
      const c1 = ri(2, 9), c2 = ri(2, 9);
      const like = pick([
        [`${c1}${u}`, `${c2}${u}`], [`${c1}${u}${v}`, `${c2}${v}${u}`], [`${c1}${u}^{2}`, `${c2}${u}^{2}`], [`${u}`, `${c2}${u}`],
      ]);
      const unlike = shuffle([
        [`${c1}${u}`, `${c1}${v}`], [`${c1}${u}`, `${c1}${u}^{2}`], [`${c1}${u}`, `${c1}`], [`${c1}${u}${v}`, `${c1}${u}`], [`${c2}${v}^{2}`, `${c2}${v}`],
      ]);
      const pair = (p) => `${M(p[0])} and ${M(p[1])}`;
      if (level > 1 && Math.random() < 0.5) {
        const likes = shuffle([[`${c1}${u}`, `${c2}${u}`], [`${c1}${u}${v}`, `${c2}${v}${u}`], [`${c1}`, `${c2 + 1}`], [`${u}^{2}`, `${c2}${u}^{2}`]]);
        return { skill: this.name, mcOnly: true, q: 'Which pair are NOT like terms?', answer: pair(unlike[0]), distractors: likes.slice(0, 3).map(pair) };
      }
      if (Math.random() < 0.4) {
        const t = `${c1}${u}`;
        return { skill: this.name, mcOnly: true, q: `Which term is a like term to ${M(t)}?`, answer: M(`${c2 + 1}${u}`), distractors: [M(`${c1}${v}`), M(`${c1}${u}^{2}`), M(`${c1}${u}${v}`)] };
      }
      return { skill: this.name, mcOnly: true, q: 'Which of the following is a pair of like terms?', answer: pair(like), distractors: unlike.slice(0, 3).map(pair) };
    },
  });

  // Combine like terms, keeping the order in which each kind first appears.
  function collect(terms) {
    const order = [], sum = {};
    for (const t of terms) { if (!(t.key in sum)) { order.push(t.key); sum[t.key] = 0; } sum[t.key] += t.c; }
    return order.filter((k) => sum[k] !== 0).sort((a, b) => (a === '') - (b === '')).map((k) => ({ c: sum[k], v: k })); // constants last
  }

  alg.push({
    id: 'alg-collect', name: 'Collecting like terms',
    gen(level) {
      const [u, v] = twoLetters();
      let terms;
      const shape = level > 1 ? pick(['uvmix', 'twoconst', 'two']) : pick(['one', 'const', 'two']);
      const c = () => ri(1, 9);
      if (shape === 'one') { const a = ri(3, 9), b = ri(2, 6), d = ri(1, Math.min(a + b - 1, 5)); terms = [{ c: a, v: u }, { c: b, v: u }, { c: -d, v: u }]; }
      else if (shape === 'const') { const a = ri(2, 8), k1 = ri(3, 12), b = ri(2, 6), k2 = ri(1, k1 - 1); terms = [{ c: a, v: u }, { c: k1, v: '' }, { c: b, v: u }, { c: -k2, v: '' }]; }
      else if (shape === 'two') { const a = ri(4, 9), d = ri(1, a - 1); terms = [{ c: a, v: u }, { c: c(), v }, { c: -d, v: u }, { c: c(), v }]; }
      else if (shape === 'twoconst') { const a = ri(3, 9), d = ri(1, a - 1); terms = [{ c: a, v: u }, { c: ri(2, 9), v: '' }, { c: c(), v }, { c: -d, v: u }, { c: -ri(1, 2), v: '' }]; }
      else { const a = ri(3, 8), d = ri(1, a - 1); terms = [{ c: a, v: u + v }, { c: ri(2, 7), v: u }, { c: -d, v: v + u }, { c: ri(2, 9), v: '' }, { c: ri(1, 3), v: u }]; }
      for (const t of terms) t.key = t.v.split('').sort().join('');
      const res = collect(terms).map((t) => ({ c: t.c, v: terms.find((x) => x.key === t.v).key }));
      const ansTex = exprTex(res);
      // mistakes: add every coefficient, ignore the subtraction signs, lump unlike terms together
      const allPos = collect(terms.map((t) => ({ ...t, c: Math.abs(t.c) }))).map((t) => ({ c: t.c, v: t.v }));
      const lump = (() => { const s = terms.reduce((acc, t) => acc + t.c, 0); return [{ c: s, v: [...new Set(terms.map((t) => t.key).join(''))].sort().join('') }]; })();
      const dropLast = res.length > 1 ? res.slice(0, -1) : [{ c: res[0].c + 1, v: res[0].v }];
      const wrong = [exprTex(allPos), exprTex(lump), exprTex(dropLast)].filter((w, i, arr) => w !== ansTex && arr.indexOf(w) === i);
      while (wrong.length < 3) wrong.push(exprTex(res.map((t, i) => (i === 0 ? { ...t, c: t.c + wrong.length + 1 } : t))));
      return { skill: this.name, q: `Simplify ${M(exprTex(terms))} by collecting like terms.`, answer: M(ansTex), accept: [plain(ansTex)], distractors: wrong.map(M) };
    },
  });

  alg.push({
    id: 'alg-equiv', name: 'Equivalent expressions',
    gen(level) {
      const u = pick(LETTERS), a = ri(2, 9), b = ri(2, 5), n = ri(3, 9), val = ri(2, 6);
      const kinds = ['bracket', 'times', 'value', 'pair'];
      if (level > 1) kinds.push('check');
      const kind = pick(kinds);
      const s = this.name;
      if (kind === 'bracket') {
        const shown = Math.random() < 0.5 ? `(${u} + ${a}) \\times ${b}` : `${b}(${u} + ${a})`;
        return { skill: s, q: `Which expression is equivalent to ${M(shown)}?`, answer: M(`${b}${u} + ${a * b}`), accept: [`${b}${u}+${a * b}`], distractors: [M(`${b}${u} + ${a}`), M(`${u} + ${a * b}`), M(`${a * b}${u}`)] };
      }
      if (kind === 'times') {
        const p = ri(1, n - 1);
        return {
          skill: s, mcOnly: true, q: `Which expression is equivalent to ${M(`${n}${u}`)}?`, answer: M(one1(`${p}${u} + ${n - p}${u}`)),
          distractors: [M(`${u} + ${n}`), M(n <= 5 ? Array(n).fill(u).join(' \\times ') : `${u}^{${n}}`), M(one1(`${p}${u} + ${n - p}`))],
        };
      }
      if (kind === 'value') {
        const ans = b * (val + a);
        return { skill: s, q: `When ${M(`${u} = ${val}`)}, what is the value of ${M(`${b}(${u} + ${a})`)}?`, answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, [b * val + a, b + val + a, b * a + val]).map(n2s) };
      }
      if (kind === 'pair') {
        const pr = (x, y) => `${M(x)} and ${M(y)}`;
        return {
          skill: s, mcOnly: true, q: 'Which two expressions are equivalent?', answer: pr(`${b}${u} + ${a * b}`, `${b}(${u} + ${a})`),
          distractors: [pr(`${b}${u} + ${a}`, `${b}(${u} + ${a})`), pr(`${u} + ${a}`, `${a}${u}`), pr(`${a * b}${u}`, `${b}${u} + ${a * b}`)],
        };
      }
      const p = ri(2, 7), q2 = ri(2, 9), w = ri(2, 5);
      const left = p * w + q2, right = (p + q2) * w;
      return {
        skill: s, mcOnly: true, q: `Jo says ${M(`${p}${u} + ${q2}`)} is equivalent to ${M(`${p + q2}${u}`)}. Substitute ${M(`${u} = ${w}`)}. Is Jo right?`,
        answer: `No: ${M(`${p}${u} + ${q2} = ${left}`)} but ${M(`${p + q2}${u} = ${right}`)}`,
        distractors: [`Yes: ${M(`${p} + ${q2} = ${p + q2}`)}`, `Yes: both give ${left}`, 'Yes: both expressions contain the same letter'],
      };
    },
  });

  alg.push({
    id: 'alg-pattern', name: 'Generalising patterns',
    gen(level) {
      const k = ri(2, level > 1 ? 7 : 5), x = ri(2, 9), y = ri(10, 20);
      const rep = (t) => Array(k).fill(t).join(' + ');
      const kind = pick(['rule', 'write', 'power']);
      if (kind === 'rule') {
        return {
          skill: this.name, mcOnly: true,
          q: `${M(`${rep(x)} = ${k} \\times ${x}`)} and ${M(`${rep(y)} = ${k} \\times ${y}`)}. Which rule works for any number ${M('n')}?`,
          answer: M(`${rep('n')} = ${k}n`), distractors: [M(`n + ${k} = ${k}n`), M(`${Array(k).fill('n').join(' \\times ')} = ${k}n`), M(`${rep('n')} = n + ${k}`)],
        };
      }
      if (kind === 'write') {
        return { skill: this.name, q: `Write ${M(rep('n'))} in its simplest form.`, answer: M(`${k}n`), accept: [`${k}n`], distractors: [M(`n^{${k}}`), M(`n + ${k}`), M(`${k + 1}n`)] };
      }
      const j = ri(2, 4);
      return { skill: this.name, q: `Write ${M(Array(j).fill('n').join(' \\times '))} using a power.`, answer: M(`n^{${j}}`), accept: [`n^${j}`], distractors: [M(`${j}n`), M(`n + ${j}`), M(`${j}^{n}`)] };
    },
  });

  const ITEMS = [['sandwiches', 'sandwich', 's', 'drinks', 'drink'], ['pies', 'pie', 'p', 'juices', 'juice'], ['notebooks', 'notebook', 'n', 'pens', 'pen'],
    ['tickets', 'ticket', 't', 'programs', 'program'], ['burgers', 'burger', 'b', 'bottles of water', 'bottle of water'], ['cupcakes', 'cupcake', 'c', 'cookies', 'cookie']];
  const NAMES = ['Mia', 'Jake', 'Aisha', 'Lucas', 'Priya', 'Noah', 'Mai', 'Tom', 'Zara', 'Leo'];

  alg.push({
    id: 'alg-model', name: 'Writing and using expressions in context',
    gen(level) {
      const [many, one, L, many2, one2] = pick(ITEMS);
      const p = ri(2, 5), a = ri(2, 6), b = ri(1, 4), v = ri(3, 9), name = pick(NAMES);
      const intro = `${many[0].toUpperCase() + many.slice(1)} cost ${M(`\\$${L}`)} each and ${many2} cost ${M(`\\$${p}`)} each.`;
      const kinds = ['one', 'two', 'eval', 'rect-p'];
      if (level > 1) kinds.push('combine', 'rect-a', 'rect-pv');
      const kind = pick(kinds);
      const s = this.name;
      if (kind === 'one') {
        return { skill: s, q: `${intro} Write an expression for the cost of ${a} ${many}.`, answer: M(`${a}${L}`), accept: [`${a}${L}`], distractors: [M(`${L} + ${a}`), M(`${a} + ${L}`), M(`${a}${L} + ${p}`)] };
      }
      if (kind === 'two') {
        return {
          skill: s, q: `${intro} Write an expression for the total cost of ${a} ${many} and ${b} ${b === 1 ? one2 : many2}.`,
          answer: M(`${a}${L} + ${b * p}`), accept: [`${a}${L}+${b * p}`], distractors: [M(`${a}${L} + ${b}`), M(`${a + b * p}${L}`), M(`${a}${L} + ${b} + ${p}`)],
        };
      }
      if (kind === 'eval') {
        const ans = a * v + b * p;
        return { skill: s, q: `${intro} A ${one} costs ${M(`\\$${v}`)}. What is the total cost, in dollars, of ${a} ${many} and ${b} ${b === 1 ? one2 : many2}?`, answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, [a * v + b, (a + b) * v, a * v + p]).map(n2s) };
      }
      if (kind === 'combine') {
        const c1 = ri(2, 4), c2 = ri(1, 3), d1 = ri(1, 3), d2 = ri(1, 2);
        const ans = `${c1 + c2}${L} + ${(d1 + d2) * p}`;
        return {
          skill: s, q: `${intro} ${name} buys ${c1} ${many} and ${d1} ${d1 === 1 ? one2 : many2}. Later ${name} buys ${c2} more ${c2 === 1 ? one : many} and ${d2} more ${d2 === 1 ? one2 : many2}. Write a simplified expression for the total amount spent.`,
          answer: M(ans), accept: [plain(ans)], distractors: [M(`${c1 + c2}${L} + ${d1 + d2}`), M(`${c1 + c2 + (d1 + d2) * p}${L}`), M(`${c1}${L} + ${c2}${L} + ${d1 + d2}`)],
        };
      }
      const r = ri(2, 9);
      const rect = `A rectangle has a length of ${M(`(x + ${r})`)} cm and a width of ${M('x')} cm.`;
      if (kind === 'rect-p') {
        return { skill: s, q: `${rect} Write a simplified expression for its perimeter.`, answer: M(`4x + ${2 * r}`), accept: [`4x+${2 * r}`], distractors: [M(`2x + ${r}`), M(`4x + ${r}`), M(`2x + ${2 * r}`)] };
      }
      if (kind === 'rect-pv') {
        const ans = 4 * v + 2 * r;
        return { skill: s, q: `${rect} What is its perimeter, in cm, when ${M(`x = ${v}`)}?`, answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, [2 * v + r, v + r + v, 2 * (v + r)]).map(n2s) };
      }
      const ans = v * (v + r);
      return { skill: s, q: `${rect} What is its area, in cm², when ${M(`x = ${v}`)}?`, answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, [v * v + r, 4 * v + 2 * r, v + v + r]).map(n2s) };
    },
  });

  // ---------- Number ----------
  const num = [];
  num.push({
    id: 'num-times', name: 'Times tables',
    gen(level) {
      const a = ri(2, level > 1 ? 15 : 12), b = ri(2, 12), ans = a * b;
      return { skill: this.name, q: `What is ${M(`${a} \\times ${b}`)}?`, answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, [a * (b + 1), a * (b - 1), (a + 1) * b, a + b]).map(n2s) };
    },
  });
  num.push({
    id: 'num-integers', name: 'Adding and subtracting integers',
    gen(level) {
      const a = ri(-12, 12) || 3, b = ri(1, 12), op = pick(['+', '-']), neg = level > 1 && Math.random() < 0.5;
      const bTex = neg ? `(-${b})` : `${b}`, bv = neg ? -b : b;
      const ans = op === '+' ? a + bv : a - bv;
      return { skill: this.name, q: `What is ${M(`${a} ${op} ${bTex}`)}?`, answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, [-ans, op === '+' ? a - bv : a + bv, Math.abs(a) + b]).map(n2s) };
    },
  });
  num.push({
    id: 'num-order', name: 'Order of operations',
    gen(level) {
      const a = ri(2, 9), b = ri(2, 9), c = ri(2, 6), d = ri(2, 5);
      const forms = [
        [`${a} + ${b} \\times ${c}`, a + b * c, [(a + b) * c, a * b + c]],
        [`${a * c} \\div ${c} + ${b}`, a + b, [(a * c) / (c + b), a * c + b]],
        [`(${a} + ${b}) \\times ${c}`, (a + b) * c, [a + b * c, a * b * c]],
      ];
      if (level > 1) forms.push([`${a} + ${b} \\times ${c} - ${d}^{2}`, a + b * c - d * d, [(a + b) * c - d * d, a + b * c - 2 * d]]);
      const [ex, ans, ideas] = pick(forms);
      return { skill: this.name, q: `Evaluate ${M(ex)}.`, answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, ideas).map(n2s) };
    },
  });
  num.push({
    id: 'num-fraction-of', name: 'Fraction of an amount',
    gen(level) {
      const d = pick([2, 3, 4, 5, 8, 10]), nn = ri(1, level > 1 ? d - 1 : Math.min(3, d - 1)), base = d * ri(2, 12), ans = (base / d) * nn;
      return { skill: this.name, q: `What is ${M(`\\frac{${nn}}{${d}}`)} of ${base}?`, answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, [base / d, base / nn, base - ans]).map(n2s) };
    },
  });
  num.push({
    id: 'num-percent-of', name: 'Percentage of an amount',
    gen(level) {
      const pc = pick(level > 1 ? [5, 15, 35, 45, 60, 75, 12.5] : [10, 20, 25, 50, 75]), base = pick([40, 60, 80, 120, 200, 240, 360, 400]), ans = (pc * base) / 100;
      return { skill: this.name, q: `What is ${pc}% of ${base}?`, answer: n2s(ans), accept: [n2s(ans)], distractors: numDistractors(ans, [base / pc, base - ans, pc, ans * 10]).map(n2s) };
    },
  });

  const TOPICS = [
    { id: 'y7-algebra', name: 'Year 7 Algebra', skills: alg },
    { id: 'number', name: 'Number', skills: num },
  ];
  const SKILLS = Object.fromEntries(TOPICS.flatMap((t) => t.skills.map((s) => [s.id, s])));

  // Make `count` different questions for one skill.
  function generate(skillId, count, level = 1, style = 'mix') {
    const s = SKILLS[skillId];
    if (!s) return [];
    const out = [], seen = new Set();
    for (let tries = 0; out.length < count && tries < count * 25; tries++) {
      const raw = s.gen(level);
      if (seen.has(raw.q)) continue;
      seen.add(raw.q);
      out.push(build(raw, style));
    }
    return out;
  }

  const api = { TOPICS, SKILLS, generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FFGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
