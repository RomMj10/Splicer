(() => {
  const $ = id => document.getElementById(id);
  const S = {
    img: null, base: 'image', slices: [], selected: new Set(), anchor: -1, n: 0,
    zoom: 1, kx: 1, ky: 1, space: false, moved: false, drew: false, drag: null, sources: []
  };
  const cv = $('imgCanvas'), ov = $('overlay'), stage = $('stage');
  const ictx = cv.getContext('2d', { willReadFrequently: true }), octx = ov.getContext('2d');
  const num = id => Math.max(0, parseInt($(id).value, 10) || 0);
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const typing = t => t && (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' ||
    (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'number')));
  const wf = () => $('workflow').value;
  const isCustom = () => wf() !== 'merge' && $('mode').value === 'custom';

  /* ---------- theme ---------- */
  const themeSel = $('theme');
  themeSel.value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'blueprint';
  themeSel.onchange = () => {
    document.documentElement.dataset.theme = themeSel.value;
    try { localStorage.setItem('splicer-theme', themeSel.value); } catch (e) {}
    draw();
  };

  const PANEL_MIN = 180, PANEL_MAX = 480, STAGE_MIN = 240;
  function initResizer(el, prop, side) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const mine = $(side === 'left' ? 'settings' : 'slicesPanel');
      const other = $(side === 'left' ? 'slicesPanel' : 'settings');
      const startX = e.clientX, startW = mine.getBoundingClientRect().width;
      el.setPointerCapture(e.pointerId);
      el.classList.add('drag'); document.body.classList.add('resizing');
      const move = ev => {
        const dx = ev.clientX - startX;
        const otherOn = !layout.classList.contains(side === 'left' ? 'r-off' : 'l-off');
        const room = window.innerWidth - (otherOn ? other.getBoundingClientRect().width + 12 : 6) - STAGE_MIN;
        const w = Math.max(PANEL_MIN, Math.min(PANEL_MAX, room, startW + (side === 'left' ? dx : -dx)));
        document.documentElement.style.setProperty(prop, w + 'px');
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        el.classList.remove('drag'); document.body.classList.remove('resizing');
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', () => document.documentElement.style.removeProperty(prop));
  }
  initResizer($('resL'), '--wl', 'left');
  initResizer($('resR'), '--wr', 'right');
  const layout = document.querySelector('.layout'), bar = document.querySelector('.bar');
  const compactMQ = matchMedia('(max-width:1000px)'), coarseMQ = matchMedia('(pointer:coarse)');
  const ui = { l: { open: true, float: false }, r: { open: true, float: false } };
  
  function applyUI() {
    const compact = compactMQ.matches;
    layout.classList.toggle('compact', compact);
    for (const k of ['l', 'r']) {
      const u = ui[k], fl = compact || u.float;
      layout.classList.toggle(k + '-hide', !u.open);
      layout.classList.toggle(k + '-float', u.open && fl);
      layout.classList.toggle(k + '-off', !u.open || fl);
      $(k === 'l' ? 'togL' : 'togR').setAttribute('aria-pressed', String(u.open));
      layout.querySelector(`.pin[data-side="${k}"]`).textContent = u.float ? 'Dock' : 'Float';
    }
  }
  function resetUI() {
    for (const k of ['l', 'r']) ui[k] = { open: !compactMQ.matches, float: false };
    applyUI();
  }
  function toggleSide(k) {
    ui[k].open = !ui[k].open;
    if (ui[k].open && compactMQ.matches) ui[k === 'l' ? 'r' : 'l'].open = false; // one floating panel at a time
    applyUI();
  }
  
  $('togL').onclick = () => toggleSide('l');
  $('togR').onclick = () => toggleSide('r');
  layout.querySelectorAll('.pclose').forEach(b => b.onclick = () => { ui[b.dataset.side].open = false; applyUI(); });
  layout.querySelectorAll('.pin').forEach(b => b.onclick = () => { const u = ui[b.dataset.side]; u.float = !u.float; applyUI(); });
  compactMQ.addEventListener('change', resetUI);
  new ResizeObserver(() => document.documentElement.style.setProperty('--hdr', bar.offsetHeight + 'px')).observe(bar);
  resetUI();
  
  /* ---------- load ---------- */
  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const im = new Image();
    im.onload = () => {
      S.img = im; S.slices = []; S.n = 0; S.drag = null; S.sources = []; undoStack.length = 0;
      S.selected.clear(); S.anchor = -1;
      S.base = file.name.replace(/\.[^.]+$/, '');
      cv.width = im.naturalWidth;
      cv.height = im.naturalHeight;
      ictx.drawImage(im, 0, 0);
      $('prefix').value = S.base;
      $('info').textContent = `${S.base} · ${im.naturalWidth}×${im.naturalHeight}px`;
      $('empty').hidden = true; $('stageWrap').hidden = false; $('zoomBar').hidden = false;
      $('applyBtn').disabled = false;
      fit(); renderList();
    };
    im.src = URL.createObjectURL(file);
  }

  let addMode = false;
  function loadFiles(list, append) {
    const files = [...list].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    if (wf() === 'slice') loadFile(files[0]); else loadMerge(files, append);

  }

  async function loadMerge(files, append) {
    if (!append) S.sources = [];
    for (const f of files) {
      try {
        const b = await createImageBitmap(f);
        S.sources.push({ name: f.name.replace(/\.[^.]+$/, ''), img: b, w: b.width, h: b.height });
      } catch (e) {
        console.error('Error loading image:', f.name, e);
      }
    }
    if (!S.sources.length) return;
    S.base = S.sources.length > 1 ? 'atlas' : S.sources[0].name;
    if (!append) $('mName').value = S.base;
    repack(true);
  }

  function repack(fitView) {
    const keep = new Map(S.slices.filter(s => s.key).map(s => [s.key, s.name])); // keep renames
    const r = Pack.run(S.sources, { pad: num('mPad'), max: +$('mMax').value, sort: $('mSort').value, pow2: $('mPow2').checked });
    $('mMsg').textContent = r.error || '';
    if (!r.placed) return;
    S.img = cv; S.drag = null; undoStack.length = 0;
    cv.width = r.W; cv.height = r.H;
    ictx.clearRect(0, 0, r.W, r.H);
    for (const p of r.placed) ictx.drawImage(p.it.img, p.x, p.y);
    // "both" with a single image starts unsliced, so you can slice it right away
    S.slices = (wf() === 'merge' || r.placed.length > 1) ? r.placed.map(p => {
      const rc = { x: p.x, y: p.y, w: p.it.w, h: p.it.h };
      return { ...rc, name: keep.get(p.it) || p.it.name, key: p.it, thumb: thumb(rc) };
    }) : [];
    S.n = S.slices.length; S.selected.clear(); S.anchor = -1;
    $('prefix').value = S.base;
    $('info').textContent = `${S.base} · ${r.W}×${r.H}px · ${r.placed.length} images`;
    $('empty').hidden = true; $('stageWrap').hidden = false; $('zoomBar').hidden = false;
    $('applyBtn').disabled = false;
    fitView ? fit() : setZoom(S.zoom);
    renderList();
  }

  ['mPad', 'mMax', 'mSort', 'mPow2'].forEach(id =>
    $(id).addEventListener(id === 'mPad' ? 'input' : 'change', () => { if (S.sources.length) repack(false); }));
  $('mAddBtn').onclick = () => { addMode = true; $('fileInput').click(); };

  /* ---------- slicing ---------- */
  function computeRects() {
    if (!S.img || isCustom() || wf() === 'merge') return [];
    const W = cv.width, H = cv.height, ox = num('offX'), oy = num('offY'), p = num('pad');
    let cw, ch, cols, rows;
    if ($('mode').value === 'count') {
      cols = Math.max(1, num('cols')); rows = Math.max(1, num('rows'));
      cw = Math.floor((W - ox - p * (cols - 1)) / cols);
      ch = Math.floor((H - oy - p * (rows - 1)) / rows);
    } else {
      cw = num('cellW'); ch = num('cellH');
      if (cw < 1 || ch < 1) return [];
      cols = Math.floor((W - ox + p) / (cw + p));
      rows = Math.floor((H - oy + p) / (ch + p));
    }
    const out = [];
    if (cw < 1 || ch < 1) return out;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out.push({ x: ox + c * (cw + p), y: oy + r * (ch + p), w: cw, h: ch });
    return out;
  }

  const isEmpty = r => {
    const d = ictx.getImageData(r.x, r.y, r.w, r.h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
    return true;
  };

  function thumb(r) {
    const t = document.createElement('canvas');
    t.width = r.w; t.height = r.h;
    t.getContext('2d').drawImage(cv, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return t.toDataURL();
  }

  function apply() {
    const prefix = $('prefix').value.trim() || S.base, skip = $('skipEmpty').checked;
    if (S.slices.length) pushUndo();
    S.slices = computeRects().filter(r => !skip || !isEmpty(r))
      .map((r, i) => ({ ...r, name: `${prefix}_${i}`, thumb: thumb(r) }));
    S.n = S.slices.length;
    S.selected.clear(); S.anchor = -1; renderList();
  }

  /* ---------- undo ---------- */
  const undoStack = [];
  function pushUndo() {
    undoStack.push({ slices: S.slices.map(s => ({ ...s })), selected: [...S.selected], anchor: S.anchor, n: S.n });
    if (undoStack.length > 100) undoStack.shift();
    $('undoBtn').disabled = false;
  }
  function undo() {
    const st = undoStack.pop();
    if (!st) return;
    S.slices = st.slices; S.selected = new Set(st.selected); S.anchor = st.anchor; S.n = st.n;
    renderList();
  }
  $('undoBtn').onclick = undo;

  /* ---------- custom slice: draw, move, resize ---------- */
  let drag = null;
  const HANDLES = [['nw', 0, 0], ['ne', 1, 0], ['sw', 0, 1], ['se', 1, 1], ['n', .5, 0], ['s', .5, 1], ['w', 0, .5], ['e', 1, .5]];
  const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
  const editable = () => (isCustom() && S.selected.size === 1) ? S.slices[[...S.selected][0]] : null;
  const pixelAt = e => {
    const b = ov.getBoundingClientRect();
    return {
      x: Math.min(cv.width - 1, Math.max(0, Math.floor((e.clientX - b.left) / S.zoom))),
      y: Math.min(cv.height - 1, Math.max(0, Math.floor((e.clientY - b.top) / S.zoom)))
    };
  };
  const edgeAt = e => { // nearest pixel edge, for resizing
    const b = ov.getBoundingClientRect();
    return {
      x: Math.min(cv.width, Math.max(0, Math.round((e.clientX - b.left) / S.zoom))),
      y: Math.min(cv.height, Math.max(0, Math.round((e.clientY - b.top) / S.zoom)))
    };
  };
  const boxFrom = (a, b) => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1
  });
  const inside = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  function handleAt(e, r) {
    const tol = e.pointerType === 'touch' ? 18 : 7;
    const b = ov.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    for (const [h, fx, fy] of HANDLES)
      if (Math.abs(mx - (r.x + r.w * fx) * S.zoom) <= tol && Math.abs(my - (r.y + r.h * fy) * S.zoom) <= tol) return h;
    return null;
  }

  ov.addEventListener('mousedown', e => {
    S.drew = false;
    if (e.button !== 0 || S.space || !S.img || !isCustom()) return;
    e.preventDefault();
    const base = { cx: e.clientX, cy: e.clientY, active: false }, r = editable();
    if (r) {
      const idx = [...S.selected][0], h = handleAt(e, r), p = pixelAt(e);
      if (h) { drag = { ...base, kind: 'resize', h, idx, orig: { ...r } }; return; }
      if (inside(p, r)) { drag = { ...base, kind: 'move', idx, orig: { ...r }, p }; return; }
    }
    drag = { ...base, kind: 'new', p: pixelAt(e) };
  });

  ov.addEventListener('mousemove', e => {    // hover cursor
    if (drag || S.space || pan) return;
    const r = editable();
    let c = '';
    if (r) { const h = handleAt(e, r); c = h ? CURSORS[h] : inside(pixelAt(e), r) ? 'move' : ''; }
    ov.style.cursor = c;
  });

  window.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 3) return;
      drag.active = true;
      if (drag.kind !== 'new') pushUndo();
    }
    if (drag.kind === 'new') S.drag = boxFrom(drag.p, pixelAt(e));
    else {
      const sl = S.slices[drag.idx], o = drag.orig;
      if (drag.kind === 'move') {
        const p = pixelAt(e);
        sl.x = Math.min(cv.width - o.w, Math.max(0, o.x + p.x - drag.p.x));
        sl.y = Math.min(cv.height - o.h, Math.max(0, o.y + p.y - drag.p.y));
      } else {
        const q = edgeAt(e), h = drag.h;
        let l = o.x, t = o.y, rt = o.x + o.w, bt = o.y + o.h;
        if (h.includes('w')) l = Math.min(q.x, rt - 1);
        if (h.includes('e')) rt = Math.max(q.x, l + 1);
        if (h.includes('n')) t = Math.min(q.y, bt - 1);
        if (h.includes('s')) bt = Math.max(q.y, t + 1);
        Object.assign(sl, { x: l, y: t, w: rt - l, h: bt - t });
      }
    }
    draw();
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag, box = d.active && d.kind === 'new' ? S.drag : null;
    drag = null; S.drag = null;
    if (d.active && d.kind !== 'new') {
      const sl = S.slices[d.idx];
      sl.thumb = thumb(sl); S.drew = true; renderList();
    } else if (box) {
      pushUndo();
      const prefix = $('prefix').value.trim() || S.base;
      S.slices.push({ ...box, name: `${prefix}_${S.n++}`, thumb: thumb(box) });
      S.drew = true;
      S.selected = new Set([S.slices.length - 1]); S.anchor = S.slices.length - 1;
      renderList();
      $('list').lastElementChild.scrollIntoView({ block: 'nearest' });
    } else draw();
  });

  /* ---------- drawing ----------
     The overlay is rendered at on-screen resolution (not image resolution),
     so lines stay 1 css px wide at any zoom. Anti-aliasing on: lines sit at
     exact fractional positions. Off: lines snap to whole device pixels. */
  function draw() {
    octx.clearRect(0, 0, ov.width, ov.height);
    if (!S.img) return;
    const aa = $('aa').checked;
    const u = S.kx / S.zoom;                       // overlay px per css px
    const lw = Math.max(1, Math.round(u)), half = lw / 2, off = aa ? 0 : (lw % 2) / 2;
    const clamp = (v, max) => Math.min(max - half, Math.max(half, v));
    const sx = v => clamp(aa ? v * S.kx : Math.round(v * S.kx) + off, ov.width);
    const sy = v => clamp(aa ? v * S.ky : Math.round(v * S.ky) + off, ov.height);

    const applied = S.slices.length > 0;
    const rects = applied ? S.slices : computeRects();
    const sky = cssVar('--sky'), rust = cssVar('--rust');
    octx.lineWidth = lw;
    octx.strokeStyle = applied ? sky : rust;
    octx.fillStyle = sky;
    octx.setLineDash(applied ? [] : [6 * u, 4 * u]);
    rects.forEach((r, i) => {
      const ax = sx(r.x), ay = sy(r.y), bx = sx(r.x + r.w), by = sy(r.y + r.h);
      if (applied && S.selected.has(i)) {
        octx.globalAlpha = .3; octx.fillRect(ax, ay, bx - ax, by - ay); octx.globalAlpha = 1;
      }
      octx.strokeRect(ax, ay, bx - ax, by - ay);
    });

    const d = S.drag;
    if (d) {
      const ax = sx(d.x), ay = sy(d.y), bx = sx(d.x + d.w), by = sy(d.y + d.h);
      octx.strokeStyle = rust; octx.fillStyle = rust; octx.setLineDash([6 * u, 4 * u]);
      octx.globalAlpha = .15; octx.fillRect(ax, ay, bx - ax, by - ay); octx.globalAlpha = 1;
      octx.strokeRect(ax, ay, bx - ax, by - ay);
    }

    const er = editable();
    if (er && applied && !d) { // resize handles on the selected slice
      const ax = sx(er.x), ay = sy(er.y), bx = sx(er.x + er.w), by = sy(er.y + er.h), hs = (coarseMQ.matches ? 6 : 3.5) * u;
      octx.setLineDash([]); octx.fillStyle = cssVar('--sky'); octx.strokeStyle = cssVar('--sky');
      for (const [, fx, fy] of HANDLES) {
        const hx = ax + (bx - ax) * fx, hy = ay + (by - ay) * fy;
        octx.fillRect(hx - hs, hy - hs, 2 * hs, 2 * hs); octx.strokeRect(hx - hs, hy - hs, 2 * hs, 2 * hs);
      }
    }

    const ed = drag && drag.active && drag.kind !== 'new' ? S.slices[drag.idx] : null;
    $('count').textContent = ed ? `${ed.w}×${ed.h} at ${ed.x}, ${ed.y}` : d ? `New slice ${d.w}×${d.h} at ${d.x}, ${d.y}`
      : isCustom() ? (applied ? `${rects.length} slices · drag to add more` : 'Drag on the image to add a slice')
      : applied ? `${rects.length} slices applied` : `${rects.length} cells (preview)`;
  }

  /* ---------- list & selection ---------- */
  function updateSelectionUI() {
    [...$('list').children].forEach((li, k) => li.classList.toggle('sel', S.selected.has(k)));
    $('batchBar').hidden = S.selected.size < 2;
    $('selCount').textContent = `${S.selected.size} selected`;

    const n = S.selected.size, has = S.slices.length > 0;
    $('exportBtn').disabled = !n;
    $('exportBtn').textContent = n ? `Export (${n})` : 'Export';
    $('exportMenuBtn').disabled = !has;
    $('exportAllBtn').disabled = !has;
    $('exportAtlasBtn').disabled = !has;
  }

  function renderList() {
    const ul = $('list'); ul.innerHTML = '';
    S.slices.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'item' + (S.selected.has(i) ? ' sel' : '');
      li.innerHTML = '<img alt=""><div><input type="text" aria-label="Slice name"><small></small></div><button class="del" title="Remove slice" aria-label="Remove slice">✕</button>';
      li.querySelector('img').src = s.thumb;
      const inp = li.querySelector('input'); inp.value = s.name;
      li.querySelector('small').textContent = `${s.w}×${s.h} at ${s.x}, ${s.y}`;
      inp.addEventListener('input', () => { s.name = inp.value; });
      inp.addEventListener('click', e => e.stopPropagation());
      li.addEventListener('click', e => pick(i, e.shiftKey, e.ctrlKey || e.metaKey, false));
      li.querySelector('.del').addEventListener('click', e => {
        e.stopPropagation(); pushUndo(); S.slices.splice(i, 1);
        S.selected.clear(); S.anchor = -1; renderList();
      });
      ul.appendChild(li);
    });
    const has = S.slices.length > 0;
    $('clearBtn').disabled = !has;
    $('sliceCount').textContent = S.slices.length;
    $('togCount').textContent = S.slices.length;
    $('undoBtn').disabled = !undoStack.length;
    $('listEmpty').hidden = has; $('listHint').hidden = !has;
    updateSelectionUI();
    draw();
  }

  function pick(i, shift, toggle, scroll) {
    if (i < 0) {
      if (!shift && !toggle) { S.selected.clear(); S.anchor = -1; }
    } else if (shift && S.anchor >= 0) {
      const [a, b] = [Math.min(S.anchor, i), Math.max(S.anchor, i)];
      if (!toggle) S.selected.clear();
      for (let k = a; k <= b; k++) S.selected.add(k);
    } else if (toggle) {
      S.selected.has(i) ? S.selected.delete(i) : S.selected.add(i);
      S.anchor = i;
    } else {
      S.selected = new Set([i]); S.anchor = i;
    }
    updateSelectionUI();
    if (scroll && i >= 0) $('list').children[i].scrollIntoView({ block: 'nearest' });
    draw();
  }

  function deleteSelected() {
    if (!S.selected.size) return;
    pushUndo();
    S.slices = S.slices.filter((_, i) => !S.selected.has(i));
    S.selected.clear(); S.anchor = -1; renderList();
  }
  function renameSelected() {
    pushUndo();
    const pre = $('batchName').value.trim() || $('prefix').value.trim() || S.base;
    [...S.selected].sort((a, b) => a - b).forEach((i, k) => { S.slices[i].name = `${pre}_${k}`; });
    renderList();
  }
  $('deleteBtn').onclick = deleteSelected;
  $('renameBtn').onclick = renameSelected;
  $('batchName').addEventListener('keydown', e => { if (e.key === 'Enter') renameSelected(); });
  $('deselBtn').onclick = () => pick(-1, false, false, false);

  window.addEventListener('keydown', e => {
    if (!S.img || typing(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault(); undo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && S.selected.size) {
      e.preventDefault(); deleteSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && S.slices.length) {
      e.preventDefault();
      S.selected = new Set(S.slices.map((_, i) => i)); updateSelectionUI(); draw();
    }
  });

  ov.addEventListener('pointerdown', e => {
    if (S.space || S.moved) { S.moved = false; return; }   // click that ended a pan
    if (S.drew) { S.drew = false; return; }  // click that ended a custom box
    if (!S.slices.length) return;
    const b = ov.getBoundingClientRect();
    const x = (e.clientX - b.left) / S.zoom, y = (e.clientY - b.top) / S.zoom;
    let hit = -1; // topmost slice wins
    for (let i = S.slices.length - 1; i >= 0; i--) {
      const r = S.slices[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { hit = i; break; }
    }
    pick(hit, e.shiftKey, e.ctrlKey || e.metaKey, true);
  });

  /* ---------- zoom ---------- */
  const MAX_SIDE = 8192, MAX_AREA = 64e6;   // keep the overlay canvas within browser limits
  function setZoom(z) {
    S.zoom = Math.min(16, Math.max(0.05, z));
    cv.style.width = ov.style.width = cv.width * S.zoom + 'px';
    cv.style.height = ov.style.height = cv.height * S.zoom + 'px';
    const k = Math.min(S.zoom * (window.devicePixelRatio || 1),
      MAX_SIDE / Math.max(cv.width, cv.height), Math.sqrt(MAX_AREA / (cv.width * cv.height)));
    ov.width = Math.max(1, Math.round(cv.width * k));
    ov.height = Math.max(1, Math.round(cv.height * k));
    S.kx = ov.width / cv.width; S.ky = ov.height / cv.height;
    $('zoomLabel').textContent = Math.round(S.zoom * 100) + '%';
    draw();
  }
  function fit() {
    setZoom(Math.min(8, (stage.clientWidth - 56) / cv.width, (stage.clientHeight - 56) / cv.height));
  }
  $('zoomIn').onclick = () => setZoom(S.zoom * 1.25);
  $('zoomOut').onclick = () => setZoom(S.zoom / 1.25);
  $('zoomFit').onclick = fit;
  stage.addEventListener('wheel', e => {
    if (!e.ctrlKey || !S.img) return;
    e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });
  window.addEventListener('resize', () => { if (S.img) setZoom(S.zoom); });

  /* ---------- pan (Space+drag, Pan button, or one finger) and pinch zoom ---------- */
  let pan = null, pinch = null;
  const ptrs = new Map();
  function endPan() { pan = null; stage.classList.remove('panning'); }
  function setSpace(on) {
    S.space = on; ov.style.cursor = ''; stage.classList.toggle('pan', on);
    $('panBtn').setAttribute('aria-pressed', String(on));
    if (!on) endPan();
  }
  $('panBtn').onclick = () => setSpace(!S.space);

  window.addEventListener('keydown', e => {
    if (e.code !== 'Space' || !S.img || typing(e.target)) return;
    e.preventDefault();
    if (!e.repeat) setSpace(true);
  });
  window.addEventListener('keyup', e => {
    if (e.code !== 'Space') return;
    if (S.space) e.preventDefault();
    setSpace(false);
  });
  window.addEventListener('blur', () => setSpace(false));

  stage.addEventListener('pointerdown', e => {
    S.moved = false;
    if (e.target.closest('.zoom')) return;
    if (e.pointerType === 'touch') {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        cancelDrag(); endPan();
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: S.zoom };
        return;
      }
    }
  const touchPan = e.pointerType === 'touch' && !isCustom();
  if (!(S.space || touchPan) || e.button !== 0 || ptrs.size > 1) return;
  e.preventDefault();
  pan = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
  stage.classList.add('panning');
  });
  window.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); S.moved = true;
      return;
    }
  if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    stage.scrollLeft = pan.l - dx; stage.scrollTop = pan.t - dy;
    if (Math.hypot(dx, dy) > 4) S.moved = true;   // small jitter still counts as a tap
  });
  const endPtr = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (pan) endPan(); };
  window.addEventListener('pointerup', endPtr);
  window.addEventListener('pointercancel', endPtr);

  /* ---------- export ---------- */
  async function exportZip(list, tag) {
    const scale = parseFloat($('scale').value) || 1;
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const crisp = Number.isInteger(scale) && scale >= 1; // integer upscales keep hard pixel edges
    const used = new Map(), files = [];
    for (const s of list) {
      const base = (s.name.trim() || 'slice').replace(/[\\/:*?"<>|]/g, '_').replace(/\.png$/i, '');
      const n = used.get(base) || 0; used.set(base, n + 1);
      const name = (n ? `${base}_${n}` : base) + suffix + '.png';

      // crop at 1x first so resampling never samples neighbouring cells
      const src = document.createElement('canvas'); src.width = s.w; src.height = s.h;
      src.getContext('2d').drawImage(cv, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);

      const t = document.createElement('canvas');
      t.width = Math.max(1, Math.round(s.w * scale)); t.height = Math.max(1, Math.round(s.h * scale));
      const c = t.getContext('2d');
      c.imageSmoothingEnabled = !crisp; c.imageSmoothingQuality = 'high';
      c.drawImage(src, 0, 0, t.width, t.height);

      const blob = await new Promise(r => t.toBlob(r, 'image/png'));
      files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(Zip.create(files));
    a.download = `${S.base}_${tag}${suffix}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('openBtn').onclick = () => {addMode = false; $('fileInput').click(); };
  $('fileInput').onchange = e => { loadFiles(e.target.files, addMode); addMode = false; e.target.value = ''; };
  $('applyBtn').onclick = () => { apply(); if (compactMQ.matches) { ui.l.open = false; applyUI(); } };
  $('clearBtn').onclick = () => { pushUndo(); S.slices = []; S.n = 0; S.selected.clear(); S.anchor = -1; renderList(); };
  $('aa').addEventListener('change', draw);

  const menu = $('exportMenu'), menuBtn = $('exportMenuBtn');
  const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.onclick = e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  };
  document.addEventListener('click', closeMenu);
  function cancelDrag() {
    if (!drag) return;
    if (drag.active && drag.kind !== 'new') {   // revert the move/resize in progress
      Object.assign(S.slices[drag.idx], drag.orig);
      undoStack.pop(); $('undoBtn').disabled = !undoStack.length;
    }
    drag = null; S.drag = null; draw();
  }
  window.addEventListener('keydown', e => { if (e.key === 'Escape') cancelDrag(); });
  window.addEventListener('pointercancel', cancelDrag);

  $('exportBtn').onclick = () =>
    exportZip([...S.selected].sort((a, b) => a - b).map(i => S.slices[i]), 'selected');
  $('exportAllBtn').onclick = () => { closeMenu(); exportZip(S.slices, 'slices'); };
  $('exportAtlasBtn').onclick = () => { closeMenu(); exportAtlas(); };

  function syncMode() {
    const m = $('mode').value, w = wf(), sl = w !== 'merge';
    $('modeRow').hidden = !sl;
    $('countFields').hidden = !sl || m !== 'count';
    $('sizeFields').hidden = !sl || m !== 'size';
    $('gridFields').hidden = !sl || m === 'custom';
    $('skipRow').hidden = !sl || m === 'custom';
    $('applyBtn').hidden = !sl || m === 'custom';
    $('mergeFields').hidden = w === 'slice';
    $('exportAtlasBtn').hidden = w === 'slice';
    $('emptyTitle').textContent = w === 'slice' ? 'Drop an image here' : 'Drop images here';
    ov.style.cursor = '';
    draw();
  }
  try { const w = localStorage.getItem('splicer-workflow'); if (w) $('workflow').value = w; } catch (e) {}
  if (!$('workflow').value) $('workflow').value = 'slice';
  $('mode').value = 'count'; syncMode();
  $('mode').onchange = syncMode;
  $('workflow').onchange = () => {
    try { localStorage.setItem('splicer-workflow', wf()); } catch (e) {}
    syncMode();
  };

  ['cols', 'rows', 'cellW', 'cellH', 'offX', 'offY', 'pad'].forEach(id =>
    $(id).addEventListener('input', () => { if (!S.slices.length) draw(); }));

  ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.remove('drag'); }));
  
    stage.addEventListener('drop', e => loadFiles(e.dataTransfer.files, false));
    window.Splicer = {
    getSlices: () => S.slices.map(s => {
      const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
      c.getContext('2d').drawImage(cv, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
      return { name: s.name, img: c, w: s.w, h: s.h };
    })
  };

    async function exportAtlas() {
    const safe = s => s.replace(/[\\/:*?"<>|]/g, '_');
    const n = safe($('mName').value.trim() || S.base).replace(/\.png$/i, '');
    const used = new Map();
    const frames = S.slices.map(s => {
      const b = safe(s.name.trim() || 'sprite'), k = used.get(b) || 0; used.set(b, k + 1);
      return { name: k ? `${b}_${k}` : b, x: s.x, y: s.y, w: s.w, h: s.h };
    }).sort((a, b) => a.y - b.y || a.x - b.x);
    const meta = { app: 'Splicer', image: `${n}.png`, size: { w: cv.width, h: cv.height } };
    let json;
    if ($('mFmt').value === 'hash') {
      const hash = {};
      for (const f of frames) hash[f.name] = {
        frame: { x: f.x, y: f.y, w: f.w, h: f.h }, rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h }
      };
      json = { frames: hash, meta };
    } else json = { meta, frames };
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(Zip.create([
      { name: `${n}.png`, data: new Uint8Array(await blob.arrayBuffer()) },
      { name: `${n}.json`, data: new TextEncoder().encode(JSON.stringify(json, null, 2)) }
    ]));
    a.download = `${n}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
})();