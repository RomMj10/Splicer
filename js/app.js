(() => {
  const $ = id => document.getElementById(id);
  const S = {
    img: null, base: 'image', slices: [], selected: new Set(), anchor: -1, n: 0,
    zoom: 1, kx: 1, ky: 1, space: false, moved: false, drew: false, drag: null
  };
  const cv = $('imgCanvas'), ov = $('overlay'), stage = $('stage');
  const ictx = cv.getContext('2d', { willReadFrequently: true }), octx = ov.getContext('2d');
  const num = id => Math.max(0, parseInt($(id).value, 10) || 0);
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const typing = t => t && (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' ||
    (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'number')));
  const isCustom = () => $('mode').value === 'custom';

  /* ---------- theme ---------- */
  const themeSel = $('theme');
  themeSel.value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'blueprint';
  themeSel.onchange = () => {
    document.documentElement.dataset.theme = themeSel.value;
    try { localStorage.setItem('splicer-theme', themeSel.value); } catch (e) {}
    draw();
  };

  /* ---------- resizable side panels ---------- */
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
        const room = window.innerWidth - other.getBoundingClientRect().width - 12 - STAGE_MIN;
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

  /* ---------- load ---------- */
  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const im = new Image();
    im.onload = () => {
      S.img = im; S.slices = []; S.n = 0; S.drag = null; undoStack.length = 0;
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

  /* ---------- slicing ---------- */
  function computeRects() {
    if (!S.img || isCustom()) return [];
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
    const b = ov.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    for (const [h, fx, fy] of HANDLES)
      if (Math.abs(mx - (r.x + r.w * fx) * S.zoom) <= 7 && Math.abs(my - (r.y + r.h * fy) * S.zoom) <= 7) return h;
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

  window.addEventListener('mousemove', e => {
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

  window.addEventListener('mouseup', () => {
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

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !drag) return;
    if (drag.active && drag.kind !== 'new') {   // revert the move/resize in progress
      Object.assign(S.slices[drag.idx], drag.orig);
      undoStack.pop(); $('undoBtn').disabled = !undoStack.length;
    }
    drag = null; S.drag = null; draw();
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
      const ax = sx(er.x), ay = sy(er.y), bx = sx(er.x + er.w), by = sy(er.y + er.h), hs = 3.5 * u;
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
    $('clearBtn').disabled = !has; $('exportBtn').disabled = !has;
    $('sliceCount').textContent = S.slices.length;
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

  ov.addEventListener('click', e => {
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

  /* ---------- pan (hold Space + left mouse) ---------- */
  let pan = null;
  function endPan() { pan = null; stage.classList.remove('panning'); }
  function setSpace(on) { S.space = on; ov.style.cursor = ''; stage.classList.toggle('pan', on); if (!on) endPan(); }

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

  stage.addEventListener('mousedown', e => {
    S.moved = false;
    if (!S.space || e.button !== 0) return;
    e.preventDefault();
    pan = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
    stage.classList.add('panning');
  });
  window.addEventListener('mousemove', e => {
    if (!pan) return;
    stage.scrollLeft = pan.l - (e.clientX - pan.x);
    stage.scrollTop = pan.t - (e.clientY - pan.y);
    S.moved = true;
  });
  window.addEventListener('mouseup', () => { if (pan) endPan(); });

  /* ---------- export ---------- */
  async function exportZip() {
    const scale = parseFloat($('scale').value) || 1;
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const crisp = Number.isInteger(scale) && scale >= 1;   // integer upscales keep hard pixel edges
    const used = new Map(), files = [];
    for (const s of S.slices) {
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
    a.download = `${S.base}_slices${suffix}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('openBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = e => { loadFile(e.target.files[0]); e.target.value = ''; };
  $('applyBtn').onclick = apply;
  $('clearBtn').onclick = () => { pushUndo(); S.slices = []; S.n = 0; S.selected.clear(); S.anchor = -1; renderList(); };
  $('exportBtn').onclick = exportZip;
  $('aa').addEventListener('change', draw);

  function syncMode() {
    const m = $('mode').value;
    $('countFields').hidden = m !== 'count';
    $('sizeFields').hidden = m !== 'size';
    $('gridFields').hidden = m === 'custom';
    $('skipRow').hidden = m === 'custom';
    $('applyBtn').hidden = m === 'custom';
    ov.style.cursor = '';
    draw();
  }
  $('mode').value = 'count'; syncMode();//debug: default to count mode on load
  $('mode').onchange = syncMode;
  ['cols', 'rows', 'cellW', 'cellH', 'offX', 'offY', 'pad'].forEach(id =>
    $(id).addEventListener('input', () => { if (!S.slices.length) draw(); }));

  ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.remove('drag'); }));
  stage.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
})();