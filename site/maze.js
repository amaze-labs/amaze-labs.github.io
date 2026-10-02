(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = () => getComputedStyle(document.documentElement);
  const DIRS = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]]; // dx dy wall opposite (N E S W)

  // perfect maze via iterative DFS; walls[i] = [N, E, S, W]
  function carve(W, H, seed) {
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const walls = Array.from({ length: W * H }, () => [true, true, true, true]);
    const seen = new Uint8Array(W * H);
    const stack = [0]; seen[0] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1], x = c % W, y = (c / W) | 0;
      const opts = DIRS.filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < W && ny < H && !seen[ny * W + nx];
      });
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dy, w, o] = opts[(rnd() * opts.length) | 0];
      const n = (y + dy) * W + (x + dx);
      walls[c][w] = false; walls[n][o] = false; seen[n] = 1; stack.push(n);
    }
    return walls;
  }

  function bfs(walls, W, H, from) {
    const dist = new Int32Array(W * H).fill(-1), prev = new Int32Array(W * H).fill(-1);
    const q = [from]; dist[from] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % W, y = (c / W) | 0;
      DIRS.forEach(([dx, dy, w]) => {
        if (walls[c][w]) return;
        const n = (y + dy) * W + (x + dx);
        if (dist[n] < 0) { dist[n] = dist[c] + 1; prev[n] = c; q.push(n); }
      });
    }
    return { dist, prev };
  }

  function strokeWalls(ctx, walls, W, H, s, ox, oy) {
    ctx.beginPath();
    for (let i = 0; i < W * H; i++) {
      const x = ox + (i % W) * s, y = oy + ((i / W) | 0) * s, w = walls[i];
      if (w[0]) { ctx.moveTo(x, y); ctx.lineTo(x + s, y); }
      if (w[1]) { ctx.moveTo(x + s, y); ctx.lineTo(x + s, y + s); }
      if (w[2]) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y + s); }
      if (w[3]) { ctx.moveTo(x, y); ctx.lineTo(x, y + s); }
    }
    ctx.stroke();
  }

  /* ---------- hero maze: fills its box; border-to-border route of about TARGET_DENSITY of the cells ---------- */
  const COLS = 18, TARGET_DENSITY = 140 / 324;
  let C, R, walls, start, end, path, last, side;

  function build(cols, rows) {
    C = cols; R = rows;
    const border = [];
    for (let i = 0; i < C * R; i++) { const x = i % C, y = (i / C) | 0; if (!x || !y || x === C - 1 || y === R - 1) border.push(i); }
    side = c => { const x = c % C, y = (c / C) | 0; return y === 0 ? 0 : x === C - 1 ? 1 : y === R - 1 ? 2 : 3; };
    const target = Math.round(C * R * TARGET_DENSITY);
    let best = null;
    for (let seed = 1; seed <= 40; seed++) {
      const w = carve(C, R, seed);
      for (const a of border) {
        const { dist, prev } = bfs(w, C, R, a);
        for (const b of border) {
          if (side(a) === side(b)) continue;
          const off = Math.abs(dist[b] - target);
          if (!best || off < best.off) best = { w, a, b, prev, off };
        }
      }
    }
    walls = best.w; start = best.a; end = best.b;
    path = [];
    for (let c = end; c !== -1; c = best.prev[c]) path.unshift(c);
    walls[start][side(start)] = false; walls[end][side(end)] = false;
    last = path.length - 1;
  }

  const canvas = document.getElementById('maze');
  const hops = document.getElementById('hops');
  const layer = document.createElement('canvas');
  let ctx, pad = 18, s, dpr, cw, ch, ox, oy, head = 0, pulse = -1;

  // fit the grid to the box, rebuild the maze if the row count changed, pre-render the walls once
  function setupHero() {
    const k = css();
    dpr = window.devicePixelRatio || 1;
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    const rows = Math.max(6, Math.round((ch - pad * 2) / ((cw - pad * 2) / COLS)));
    if (rows !== R) {
      const done = path && head >= last;
      build(COLS, rows);
      head = reduce || done ? last : 0; pulse = -1;
    }
    s = Math.min((cw - pad * 2) / C, (ch - pad * 2) / R);
    ox = (cw - s * C) / 2; oy = (ch - s * R) / 2;
    for (const c of [canvas, layer]) { c.width = cw * dpr; c.height = ch * dpr; }
    const l = layer.getContext('2d');
    l.setTransform(dpr, 0, 0, dpr, 0, 0);
    l.strokeStyle = k.getPropertyValue('--muted').trim();
    l.globalAlpha = 0.5; l.lineWidth = 1.5; l.lineCap = 'round';
    strokeWalls(l, walls, C, R, s, ox, oy);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const cx = c => ox + (c % C) * s + s / 2, cy = c => oy + ((c / C) | 0) * s + s / 2;
  const out = c => { const d = DIRS[side(c)]; return [cx(c) + d[0] * s * 0.7, cy(c) + d[1] * s * 0.7]; };
  // point at fractional position f along the path (0 … last)
  const at = f => {
    const i = Math.min(last, Math.floor(f)), j = Math.min(last, i + 1), t = f - i;
    return [cx(path[i]) + (cx(path[j]) - cx(path[i])) * t, cy(path[i]) + (cy(path[j]) - cy(path[i])) * t];
  };

  function drawHero() {
    const accent = css().getPropertyValue('--accent').trim();
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(layer, 0, 0, cw, ch);

    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(2.5, s * 0.16); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...out(start));
    for (let i = 0; i <= Math.floor(head); i++) ctx.lineTo(cx(path[i]), cy(path[i]));
    ctx.lineTo(...at(head));
    if (head >= last) ctx.lineTo(...out(end));
    ctx.stroke();

    ctx.fillStyle = accent;
    const dot = ([x, y], r, alpha = 1) => { ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; };
    dot([cx(start), cy(start)], s * 0.22);
    if (head < last) {
      dot(at(head), s * 0.24); dot(at(head), s * 0.48, 0.22);
    } else {
      dot([cx(end), cy(end)], s * 0.24);
      if (pulse >= 0) { const p = at(pulse % last); dot(p, s * 0.2); dot(p, s * 0.42, 0.25); }
    }
    hops.textContent = Math.floor(head) + ' steps' + (head >= last ? ' · reached' : '');
  }

  /* ---------- background: a faint maze that fades down the page ---------- */
  const bg = document.getElementById('bg');
  function drawBg() {
    const k = css(), dpr = window.devicePixelRatio || 1;
    const w = bg.clientWidth, h = bg.clientHeight, s = 56;
    bg.width = w * dpr; bg.height = h * dpr;
    const ctx = bg.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const W = Math.ceil(w / s) + 1, H = Math.ceil(h / s) + 1;
    ctx.strokeStyle = k.getPropertyValue('--line').trim();
    ctx.lineWidth = 1.25; ctx.lineCap = 'round';
    strokeWalls(ctx, carve(W, H, 97), W, H, s, -s / 2, -s / 2);
  }

  function drawAll() { drawBg(); setupHero(); drawHero(); }
  drawAll();
  if (!reduce) {
    const SPEED = 24;  // cells per second, constant: no easing
    let prev = performance.now();
    (function tick(t) {
      const dt = Math.min(0.05, (t - prev) / 1000); prev = t;
      if (head < last) head = Math.min(last, head + SPEED * dt);
      else pulse = (pulse < 0 ? 0 : pulse) + SPEED * 0.6 * dt;
      drawHero();
      requestAnimationFrame(tick);
    })(prev);
  }
  addEventListener('resize', drawAll);
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', drawAll);
})();
