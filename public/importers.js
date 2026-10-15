// Turn an uploaded file (Word, PDF, CSV, text or a saved set) into questions.
// Word and PDF tests rarely include answers, so imported questions are marked
// "needs answer" for the teacher to finish in the editor.
(function (root) {
  // ---------- spreadsheet-style rows ----------
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  // Rows of: question, correct answer, wrong answers…  An optional header row is skipped,
  // and a column headed "Skill" (from the template) is read as the question's skill.
  function rowsToQuestions(rows) {
    const out = [];
    let skillCol = -1;
    rows.forEach((r, i) => {
      const cells = r.map((x) => String(x == null ? '' : x).trim());
      if (i === 0 && cells[0] && /^question/i.test(cells[0])) { skillCol = cells.findIndex((c) => /^skill/i.test(c)); return; }
      const skill = skillCol >= 0 ? cells[skillCol] : '';
      const f = cells.filter((c, k) => c && k !== skillCol);
      if (f.length < 2) return;
      const q = f.length === 2
        ? { type: 'text', q: f[0], answers: f[1].split(';').map((s) => s.trim()).filter(Boolean) }
        : { type: 'mc', q: f[0], options: f.slice(1, 7), correct: 0 };
      if (skill) q.skill = skill;
      out.push(q);
    });
    return out;
  }
  function parsePasted(text) {
    const rows = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => (l.includes('\t') ? l.split('\t') : l.split('|')));
    return rowsToQuestions(rows);
  }
  const looksPasted = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    return lines.length > 0 && lines.filter((l) => /\t|\|/.test(l)).length >= lines.length * 0.6;
  };

  // ---------- Word equations (OMML) to LaTeX ----------
  const kids = (n) => Array.from(n.childNodes).filter((c) => c.nodeType === 1);
  const child = (n, name) => kids(n).find((c) => c.localName === name);
  function omml(n) {
    if (!n) return '';
    const all = () => kids(n).map(omml).join('');
    switch (n.localName) {
      case 'r': return kids(n).filter((c) => c.localName === 't').map((t) => t.textContent).join('')
        .replace(/\u00d7/g, '\\times ').replace(/\u00f7/g, '\\div ').replace(/[\u2212\u2013]/g, '-').replace(/\u2264/g, '\\le ').replace(/\u2265/g, '\\ge ').replace(/\u03c0/g, '\\pi ').replace(/\u00b0/g, '^{\\circ}').replace(/\$/g, '\\$');
      case 'f': return `\\frac{${omml(child(n, 'num'))}}{${omml(child(n, 'den'))}}`;
      case 'rad': {
        const deg = omml(child(n, 'deg'));
        return deg ? `\\sqrt[${deg}]{${omml(child(n, 'e'))}}` : `\\sqrt{${omml(child(n, 'e'))}}`;
      }
      case 'sSup': return `{${omml(child(n, 'e'))}}^{${omml(child(n, 'sup'))}}`;
      case 'sSub': return `{${omml(child(n, 'e'))}}_{${omml(child(n, 'sub'))}}`;
      case 'sSubSup': return `{${omml(child(n, 'e'))}}_{${omml(child(n, 'sub'))}}^{${omml(child(n, 'sup'))}}`;
      case 'd': {
        const pr = child(n, 'dPr');
        const val = (name, dflt) => { const el = pr && child(pr, name); return el ? (el.getAttribute('m:val') ?? el.getAttributeNS(el.namespaceURI, 'val') ?? dflt) : dflt; };
        const beg = val('begChr', '('), end = val('endChr', ')'), sep = val('sepChr', ',');
        const fix = (c) => (c === '{' ? '\\{' : c === '}' ? '\\}' : c);
        return fix(beg) + kids(n).filter((c) => c.localName === 'e').map(omml).join(sep) + fix(end);
      }
      case 'rPr': case 'ctrlPr': case 'fPr': case 'radPr': case 'sSupPr': case 'sSubPr': case 'dPr': case 'naryPr': case 'oMathParaPr': return '';
      default: return all();
    }
  }
  const tidyTex = (t) => t.replace(/\{([A-Za-z0-9])\}\^/g, '$1^').replace(/\s+/g, ' ').trim();

  // ---------- Word documents ----------
  function paragraphText(p) {
    let out = '';
    const walk = (n) => {
      for (const c of kids(n)) {
        const ln = c.localName;
        if (ln === 'oMath' || ln === 'oMathPara') { out += ' $' + tidyTex(omml(c)) + '$ '; continue; }
        if (ln === 't') { out += c.textContent.replace(/\$/g, '\u0001'); continue; } // literal dollar signs
        if (ln === 'tab') { out += '  '; continue; }
        if (ln === 'br' || ln === 'cr') { out += '  '; continue; }
        if (ln === 'pPr' || ln === 'rPr' || ln === 'drawing' || ln === 'pict' || ln === 'fldChar') {
          if (ln === 'drawing' || ln === 'pict') out += ' [picture] ';
          continue;
        }
        walk(c);
      }
    };
    walk(p);
    // A real "$" (money) can't sit in text next to $…$ maths, so turn it into maths itself.
    out = out.replace(/\u0001\s*\$([^$]*)\$/g, (_, m) => '$\\$' + m.trim() + '$')
      .replace(/\u0001(\d+(?:\.\d+)?)/g, (_, d) => '$\\$' + d + '$')
      .replace(/\u0001/g, () => '$\\$$');
    return out.replace(/\$\s+\$/g, '').replace(/[  ]+$/g, '').replace(/^\s+/, '');
  }
  function docxLines(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const body = doc.getElementsByTagNameNS('*', 'body')[0];
    const lines = [];
    const walk = (n) => {
      for (const c of kids(n)) {
        if (c.localName === 'p') lines.push(paragraphText(c));
        else if (c.localName === 'tbl' || c.localName === 'tr' || c.localName === 'tc' || c.localName === 'sdt' || c.localName === 'sdtContent') walk(c);
        else if (c.localName === 'tblPr' || c.localName === 'sectPr') continue;
      }
    };
    if (body) walk(body);
    return lines;
  }
  async function readDocx(buf) {
    if (!root.JSZip) throw new Error('The Word reader did not load. Check your connection and refresh the page.');
    const zip = await root.JSZip.loadAsync(buf);
    const f = zip.file('word/document.xml');
    if (!f) throw new Error("That file doesn't look like a Word document.");
    return docxLines(await f.async('string'));
  }

  // ---------- PDFs ----------
  let pdfjs = null;
  async function readPdf(buf) {
    if (!pdfjs) {
      pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    }
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const lines = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const rows = [];
      for (const it of content.items) {
        if (!it.str || !it.str.trim()) continue;
        const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || 10;
        let row = rows.find((r) => Math.abs(r.y - y) < h * 0.45);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x, w: it.width, s: it.str, h });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x);
        let line = '', end = null;
        for (const it of r.items) {
          if (end !== null) { const gap = it.x - end; line += gap > it.h * 1.2 ? '   ' : gap > it.h * 0.15 ? ' ' : ''; }
          line += it.s; end = it.x + it.w;
        }
        lines.push(line);
      }
    }
    return lines;
  }

  // ---------- turning lines of a test into questions ----------
  const SKIP = /^(section\s+[a-z0-9]+\b|end of (section|test|paper|exam)|to gain full marks|show (all )?(your )?working|answer all|instructions|reading time|writing time|time allowed|total marks|name\s*[:_]|student name|class\s*[:_]|date\s*[:_]|teacher\s*[:_]|score\s*[:_]|page \d+( of \d+)?$|\(?\d+\s*marks?\)?$|\[\s*\d+\s*marks?\s*\]$|technology (free|active)|calculators? (allowed|not allowed))/i;
  const RULE = /^[\s_\-–—.·…]*$/;
  const QSTART = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):]\s+(.*)$|^q(?:uestion)?\s*(\d{1,3})\s*$/i;
  const PART = /^\(([a-h]|i{1,3}|iv|v)\)\s*(.*)$|^([a-h])\)\s+(.*)$/;
  const ANSWER = /^ans(?:wer)?s?\s*[:=\-–]\s*(.+)$/i;
  const VISUAL = /\b(table|diagram|graph|figure|shown|above|below|picture|image|grid|number line|map)\b|\[picture\]/i;
  const OPEN = /\b(explain|show that|show why|describe|justify|why|sketch|draw|construct|complete the|prove|discuss|compare)\b/i;
  const LETTERS = 'ABCDEF';

  function splitOptions(line, expected) {
    // "A 0   B 5   C 1" → ['0', '5', '1'] when markers run in order from `expected`
    const re = /(?:^|\s)\(?([A-F])[.):]?\s+(?=\S)/g;
    const marks = [];
    let m;
    while ((m = re.exec(line))) marks.push({ letter: m[1], at: m.index + (m[0].startsWith(' ') ? 1 : 0), end: re.lastIndex });
    if (marks.length < 2 || marks[0].at !== 0) return null;
    for (let i = 0; i < marks.length; i++) if (marks[i].letter !== LETTERS[LETTERS.indexOf(expected) + i]) return null;
    return marks.map((mk, i) => line.slice(mk.end, i + 1 < marks.length ? marks[i + 1].at : undefined).trim());
  }

  function parseLines(rawLines) {
    let title = '';
    const out = [];
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const stem = cur.stem.replace(/\s+/g, ' ').trim();
      if (cur.options.length === 1) cur.stem += ' ' + cur.options.pop(); // a lone "A …" line was text, not an option
      if (cur.options.length >= 2 && !cur.parts.length) {
        let correct = -1;
        if (cur.answer) { const k = LETTERS.indexOf(cur.answer.trim().charAt(0).toUpperCase()); if (k >= 0 && k < cur.options.length && cur.answer.trim().length <= 3) correct = k; else correct = cur.options.findIndex((o) => o.replace(/\s+/g, '') === cur.answer.replace(/\s+/g, '')); }
        out.push({ type: 'mc', q: stem, options: cur.options.slice(0, 6).map((o) => o.replace(/\s+/g, ' ')), correct });
      } else if (cur.parts.length) {
        for (const p of cur.parts) {
          const q = (stem ? stem + ' ' : '') + p.text.replace(/\s+/g, ' ').trim();
          out.push({ type: 'text', q, answers: p.answer ? p.answer.split(';').map((s) => s.trim()).filter(Boolean) : [] });
        }
      } else if (stem) {
        out.push({ type: 'text', q: stem, answers: cur.answer ? cur.answer.split(';').map((s) => s.trim()).filter(Boolean) : [] });
      }
      cur = null;
    };

    for (let raw of rawLines) {
      raw = String(raw).replace(/ /g, ' ').replace(/\s+$/, '');
      const line = raw.trim();
      if (!line || RULE.test(line)) continue;
      if (/^end of test$|^end of (the )?(test|exam|paper)\b/i.test(line)) { flush(); continue; }
      if (SKIP.test(line)) { if (/^section/i.test(line)) flush(); continue; }

      const ans = line.match(ANSWER);
      if (ans && cur) {
        const lastPart = cur.parts[cur.parts.length - 1];
        if (lastPart) lastPart.answer = ans[1]; else cur.answer = ans[1];
        continue;
      }
      const qs = line.match(QSTART);
      if (qs) { flush(); cur = { stem: qs[2] || '', options: [], parts: [] }; continue; }

      if (cur && !cur.parts.length) {
        const expected = LETTERS[cur.options.length];
        const multi = splitOptions(line.replace(/\s{2,}/g, '   '), expected);
        if (multi) { cur.options.push(...multi); continue; }
        const one = line.match(/^\(?([A-F])[.):]?\s+(.+)$/);
        if (one && one[1] === expected && (one[2].length < 80 || cur.options.length)) { cur.options.push(one[2].trim()); continue; }
      }
      const part = line.match(PART);
      if (part) {
        if (!cur) cur = { stem: '', options: [], parts: [] };
        cur.parts.push({ text: (part[2] ?? part[4] ?? '').trim() });
        continue;
      }
      if (cur) {
        const lastPart = cur.parts[cur.parts.length - 1];
        if (lastPart) lastPart.text += ' ' + line;
        else if (!cur.options.length) cur.stem += ' ' + line;
      } else if (!title && line.length < 90) title = line.replace(/\$/g, '');
    }
    flush();

    for (const q of out) {
      q.q = q.q.replace(/\s+/g, ' ').replace(/\s+([,.?:;])/g, '$1').trim();
      q.flags = [];
      if (VISUAL.test(q.q)) q.flags.push('visual');
      if (q.type === 'text' && OPEN.test(q.q)) q.flags.push('open');
      if (q.type === 'mc' ? q.correct < 0 : !q.answers.length) q.flags.push('answer');
      q.q = q.q.replace(/\s*\[picture\]\s*/g, ' ').trim();
    }
    return { title, questions: out.filter((q) => q.q.length > 2) };
  }

  // ---------- entry point ----------
  async function readFile(file) {
    const name = file.name || 'Imported set';
    const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const ext = (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
    if (ext === 'json') {
      const data = JSON.parse(await file.text());
      const list = (Array.isArray(data) ? data : [data]).filter((d) => d && Array.isArray(d.questions));
      if (!list.length) throw new Error("That file doesn't contain a Flurry Fight question set.");
      return { sets: list.map((d) => ({ title: d.title || base, questions: d.questions })) };
    }
    if (ext === 'csv' || ext === 'tsv') {
      const text = await file.text();
      const rows = ext === 'tsv' ? text.split(/\r?\n/).map((l) => l.split('\t')) : parseCSV(text);
      return { title: base, questions: rowsToQuestions(rows) };
    }
    if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
      if (!root.XLSX) throw new Error('The spreadsheet reader did not load. Check your connection and refresh the page.');
      const wb = root.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = root.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      return { title: base, questions: rowsToQuestions(rows) };
    }
    if (ext === 'txt' || ext === 'md') {
      const text = await file.text();
      if (looksPasted(text)) return { title: base, questions: parsePasted(text) };
      const r = parseLines(text.split(/\r?\n/));
      return { title: r.title || base, questions: r.questions };
    }
    if (ext === 'docx') {
      const r = parseLines(await readDocx(await file.arrayBuffer()));
      return { title: r.title || base, questions: r.questions };
    }
    if (ext === 'pdf') {
      const r = parseLines(await readPdf(await file.arrayBuffer()));
      return { title: r.title || base, questions: r.questions };
    }
    if (ext === 'doc') throw new Error('Older .doc files can’t be read. In Word, choose File › Save As › Word Document (.docx), then upload that.');
    throw new Error('Upload a Word (.docx), PDF, Excel (.xlsx), CSV, text or Flurry Fight (.json) file.');
  }

  const api = { readFile, parseLines, parsePasted, parseCSV, rowsToQuestions, docxLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FFImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
