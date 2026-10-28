const Pack = (() => {
  const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
  const pow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

  function maxRects(items, W, H, pad) {
    let free = [{ x: 0, y: 0, w: W + pad, h: H + pad }];
    const out = [];
    for (const it of items) {
      const w = it.w + pad, h = it.h + pad;
      let best = null, s1 = Infinity, s2 = Infinity;
      for (const f of free) {
        if (f.w < w || f.h < h) continue;
        const top = f.y + h;
        if (top < s1 || (top === s1 && f.x < s2)) { best = f; s1 = top; s2 = f.x; }
        // const a = Math.min(f.w - w, f.h - h), b = Math.max(f.w - w, f.h - h);
        // if (a < s1 || (a === s1 && b < s2)) { best = f; s1 = a; s2 = b; }
      }
      if (!best) return null;
      const p = { x: best.x, y: best.y, w, h }, next = [];
      for (const f of free) {
        if (p.x >= f.x + f.w || p.x + p.w <= f.x || p.y >= f.y + f.h || p.y + p.h <= f.y) { next.push(f); continue; }
        if (p.x > f.x) next.push({ x: f.x, y: f.y, w: p.x - f.x, h: f.h });
        if (p.x + p.w < f.x + f.w) next.push({ x: p.x + p.w, y: f.y, w: f.x + f.w - p.x - p.w, h: f.h });
        if (p.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: p.y - f.y });
        if (p.y + p.h < f.y + f.h) next.push({ x: f.x, y: p.y + p.h, w: f.w, h: f.y + f.h - p.y - p.h });
      }
      free = next.filter((a, i) => !next.some((b, j) => i !== j && contains(b, a) && (!contains(a, b) || j < i)));
      out.push({ it, x: p.x, y: p.y });
    }
    return out;
  }

  /*
  * items: [{name,img,w,h}], o: {pad,max,sort,pow2} -> {W,H,placed,used} | {error} 
  */
  function run(items, o) {
    const { pad, max } = o, order = items.slice();
    if (o.sort === 'area') order.sort((a, b) => b.w * b.h - a.w * a.h);
    else if (o.sort === 'height') order.sort((a, b) => b.h - a.h || b.w - a.w);
    else if (o.sort === 'name') order.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const mw = Math.max(...items.map(i => i.w)), mh = Math.max(...items.map(i => i.h));
    if (mw > max || mh > max) return { error: `An image is larger than ${max}px` };
    const area = items.reduce((s, i) => s + (i.w + pad) * (i.h + pad), 0);

    let side = Math.max(mw, mh, Math.ceil(Math.sqrt(area))), placed;
    for (;;) {
      const s = Math.min(side, max);
      placed = maxRects(order, s, s, pad);
      if (placed) break;
      if (s >= max) return { error: `Doesn't fit in ${max}×${max}. Raise max size or lower padding` };
      side = Math.ceil(side * 1.04) + 1;
    }
    let W = Math.max(...placed.map(p => p.x + p.it.w)), H = Math.max(...placed.map(p => p.y + p.it.h));
    if (o.pow2) { W = pow2(W); H = pow2(H); }
    return { W, H, placed, used: items.reduce((s, i) => s + i.w * i.h, 0) / (W * H) };
  }
  return { run };
})();