(() => {
  const $ = id => document.getElementById(id);
  const S = { img: null, base: 'image', slices: [], sel: -1, zoom: 1 };
  const cv = $('imgCanvas'), ov = $('overlay');
  const ictx = cv.getContext('2d', { willReadFrequently: true }), octx = ov.getContext('2d');
  const num = id => Math.max(0, parseInt($(id).value, 10) || 0);

  /* ---------- load ---------- */
  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const im = new Image();
    im.onload = () => {
      S.img = im; S.slices = []; S.sel = -1;
      S.base = file.name.replace(/\.[^.]+$/, '');
      cv.width = ov.width = im.naturalWidth;
      cv.height = ov.height = im.naturalHeight;
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

  /* ---------- drawing ---------- */
  function draw() {
    octx.clearRect(0, 0, ov.width, ov.height);
    if (!S.img) return;
    const lw = Math.max(1, 1 / S.zoom);
    octx.lineWidth = lw;
    const applied = S.slices.length > 0;
    const rects = applied ? S.slices : computeRects();
    octx.strokeStyle = applied ? '#4c9aff' : '#ffb23e';
    octx.setLineDash(applied ? [] : [4 * lw, 3 * lw]);
    rects.forEach((r, i) => {
      if (applied && i === S.sel) { octx.fillStyle = 'rgba(76,154,255,.35)'; octx.fillRect(r.x, r.y, r.w, r.h); }
      octx.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw);
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
    if (!S.slices.length) return;
    const b = ov.getBoundingClientRect();
    const x = (e.clientX - b.left) / S.zoom, y = (e.clientY - b.top) / S.zoom;
    select(S.slices.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), true);
  });

  /* ---------- zoom ---------- */
  function setZoom(z) {
    S.zoom = Math.min(16, Math.max(0.05, z));
    cv.style.width = ov.style.width = cv.width * S.zoom + 'px';
    cv.style.height = ov.style.height = cv.height * S.zoom + 'px';
    $('zoomLabel').textContent = Math.round(S.zoom * 100) + '%';
    draw();
  }
  function fit() {
    const st = $('stage');
    setZoom(Math.min(8, (st.clientWidth - 56) / cv.width, (st.clientHeight - 56) / cv.height));
  }
  $('zoomIn').onclick = () => setZoom(S.zoom * 1.25);
  $('zoomOut').onclick = () => setZoom(S.zoom / 1.25);
  $('zoomFit').onclick = fit;
  $('stage').addEventListener('wheel', e => {
    if (!e.ctrlKey || !S.img) return;
    e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });

  /* ---------- export ---------- */
  async function exportZip() {
    const used = new Map(), files = [];
    for (const s of S.slices) {
      const base = (s.name.trim() || 'slice').replace(/[\\/:*?"<>|]/g, '_').replace(/\.png$/i, '');
      const n = used.get(base) || 0; used.set(base, n + 1);
      const name = (n ? `${base}_${n}` : base) + '.png';
      const t = document.createElement('canvas'); t.width = s.w; t.height = s.h;
      t.getContext('2d').drawImage(cv, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
      const blob = await new Promise(r => t.toBlob(r, 'image/png'));
      files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(Zip.create(files));
    a.download = `${S.base}_slices.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- wiring ---------- */
  $('openBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = e => { loadFile(e.target.files[0]); e.target.value = ''; };
  $('applyBtn').onclick = apply;
  $('clearBtn').onclick = () => { S.slices = []; S.sel = -1; renderList(); };
  $('exportBtn').onclick = exportZip;
  $('mode').onchange = () => {
    const c = $('mode').value === 'count';
    $('countFields').hidden = !c; $('sizeFields').hidden = c; draw();
  };
  ['cols', 'rows', 'cellW', 'cellH', 'offX', 'offY', 'pad'].forEach(id =>
    $(id).addEventListener('input', () => { if (!S.slices.length) draw(); }));

  const stage = $('stage');
  ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.remove('drag'); }));
  stage.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
})();
