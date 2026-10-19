(() => {
  const $ = id => document.getElementById(id);
  const S = { img: null, base: 'image', slices: [], sel: -1, zoom: 1, kx: 1, ky: 1, space: false, moved: false };
  const cv = $('imgCanvas'), ov = $('overlay'), stage = $('stage');
  const ictx = cv.getContext('2d', { willReadFrequently: true }), octx = ov.getContext('2d');
  const num = id => Math.max(0, parseInt($(id).value, 10) || 0);
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  const themeSel = $('theme');
  themeSel.value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'blueprint';
  themeSel.onchange = () => {
    document.documentElement.dataset.theme = themeSel.value;
    try { localStorage.setItem('splicer-theme', themeSel.value); } catch (e) {}
    draw();
  };

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const im = new Image();
    im.onload = () => {
      S.img = im; S.slices = []; S.sel = -1;
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
    if (!S.img) return [];
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
    S.slices = computeRects().filter(r => !skip || !isEmpty(r))
      .map((r, i) => ({ ...r, name: `${prefix}_${i}`, thumb: thumb(r) }));
    S.sel = -1; renderList();
  }

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
    octx.lineWidth = lw;
    octx.strokeStyle = cssVar(applied ? '--sky' : '--rust');
    octx.fillStyle = cssVar('--sky');
    octx.setLineDash(applied ? [] : [6 * u, 4 * u]);
    rects.forEach((r, i) => {
      const ax = sx(r.x), ay = sy(r.y), bx = sx(r.x + r.w), by = sy(r.y + r.h);
      if (applied && i === S.sel) {
        octx.globalAlpha = .3; octx.fillRect(ax, ay, bx - ax, by - ay); octx.globalAlpha = 1;
      }
      octx.strokeRect(ax, ay, bx - ax, by - ay);
    });
    $('count').textContent = applied ? `${rects.length} slices applied` : `${rects.length} cells (preview)`;
  }

  /* ---------- list ---------- */
  function renderList() {
    const ul = $('list'); ul.innerHTML = '';
    S.slices.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'item' + (i === S.sel ? ' sel' : '');
      li.innerHTML = '<img alt=""><div><input type="text" aria-label="Slice name"><small></small></div><button class="del" title="Remove slice" aria-label="Remove slice">✕</button>';
      li.querySelector('img').src = s.thumb;
      const inp = li.querySelector('input'); inp.value = s.name;
      li.querySelector('small').textContent = `${s.w}×${s.h} at ${s.x}, ${s.y}`;
      inp.addEventListener('input', () => { s.name = inp.value; });
      inp.addEventListener('click', e => e.stopPropagation());
      li.addEventListener('click', () => select(i, false));
      li.querySelector('.del').addEventListener('click', e => {
        e.stopPropagation(); S.slices.splice(i, 1); S.sel = -1; renderList();
      });
      ul.appendChild(li);
    });
    const has = S.slices.length > 0;
    $('clearBtn').disabled = !has; $('exportBtn').disabled = !has;
    $('sliceCount').textContent = S.slices.length;
    $('listEmpty').hidden = has;
    draw();
  }

  function select(i, scroll) {
    S.sel = i;
    [...$('list').children].forEach((li, k) => li.classList.toggle('sel', k === i));
    if (scroll && i >= 0) $('list').children[i].scrollIntoView({ block: 'nearest' });
    draw();
  }

  ov.addEventListener('click', e => {
    if (S.space || S.moved) { S.moved = false; return; }   // click that ended a pan
    if (!S.slices.length) return;
    const b = ov.getBoundingClientRect();
    const x = (e.clientX - b.left) / S.zoom, y = (e.clientY - b.top) / S.zoom;
    select(S.slices.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), true);
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
  const typing = t => t && (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' ||
    (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'number')));
  function endPan() { pan = null; stage.classList.remove('panning'); }
  function setSpace(on) { S.space = on; stage.classList.toggle('pan', on); if (!on) endPan(); }

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
  $('clearBtn').onclick = () => { S.slices = []; S.sel = -1; renderList(); };
  $('exportBtn').onclick = exportZip;
  $('aa').addEventListener('change', draw);
  $('mode').onchange = () => {
    const c = $('mode').value === 'count';
    $('countFields').hidden = !c; $('sizeFields').hidden = c; draw();
  };
  ['cols', 'rows', 'cellW', 'cellH', 'offX', 'offY', 'pad'].forEach(id =>
    $(id).addEventListener('input', () => { if (!S.slices.length) draw(); }));

  ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.remove('drag'); }));
  stage.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
})();