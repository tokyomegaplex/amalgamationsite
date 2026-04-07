// Autonomous text animation for work grid letters
// Adapted from animate-text-mouse-movement effect
// Only runs when the #work section is in view

(function () {
  const workSection = document.getElementById('work');
  if (!workSection) return;

  // Collect letter spans
  const letterDivs = workSection.querySelectorAll('.work-letter');
  if (!letterDivs.length) return;

  const spans = Array.from(letterDivs).map(d => d.querySelector('span'));

  // --- Create fake cursor ---
  const cursorEl = document.createElement('div');
  cursorEl.id = 'grid-cursor';
  cursorEl.innerHTML = `
    <svg class="arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M5 3l14 9-7 1.5L8 21z" fill="#fff" stroke="#000" stroke-width="1"/>
    </svg>
    <svg class="grab" width="22" height="22" viewBox="0 0 28 28" fill="none">
      <g fill="#fff" stroke="#000" stroke-width="0.8">
        <rect x="7" y="14" width="14" height="10" rx="4"/>
        <rect x="8" y="6" width="3" height="10" rx="1.5"/>
        <rect x="12" y="4" width="3" height="12" rx="1.5"/>
        <rect x="16" y="6" width="3" height="10" rx="1.5"/>
        <rect x="20" y="9" width="3" height="8" rx="1.5"/>
      </g>
    </svg>
    <svg class="grabbing" width="22" height="22" viewBox="0 0 28 28" fill="none">
      <g fill="#fff" stroke="#000" stroke-width="0.8">
        <rect x="7" y="12" width="14" height="12" rx="4"/>
        <rect x="8" y="9" width="3" height="6" rx="1.5"/>
        <rect x="12" y="8" width="3" height="7" rx="1.5"/>
        <rect x="16" y="9" width="3" height="6" rx="1.5"/>
        <rect x="20" y="10" width="3" height="5" rx="1.5"/>
      </g>
    </svg>
    <svg class="resize-nwse" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <g stroke="#000" stroke-width="3.5" stroke-linecap="round" opacity="0.3"><line x1="5" y1="5" x2="19" y2="19"/></g>
      <g stroke="#fff" stroke-width="2" stroke-linecap="round">
        <line x1="5" y1="5" x2="19" y2="19"/>
        <polyline points="5,11 5,5 11,5"/>
        <polyline points="19,13 19,19 13,19"/>
      </g>
    </svg>
    <svg class="resize-nesw" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <g stroke="#000" stroke-width="3.5" stroke-linecap="round" opacity="0.3"><line x1="19" y1="5" x2="5" y2="19"/></g>
      <g stroke="#fff" stroke-width="2" stroke-linecap="round">
        <line x1="19" y1="5" x2="5" y2="19"/>
        <polyline points="13,5 19,5 19,11"/>
        <polyline points="11,19 5,19 5,13"/>
      </g>
    </svg>`;
  cursorEl.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9999;opacity:0;transition:opacity 0.3s;will-change:transform;';
  document.body.appendChild(cursorEl);

  // --- Create transform box ---
  const tBox = document.createElement('div');
  tBox.id = 'grid-transform-box';
  tBox.innerHTML = '<div class="border"></div>' +
    ['tl','tc','tr','ml','mr','bl','bc','br'].map(h => `<div class="handle ${h}"></div>`).join('');
  tBox.style.cssText = 'position:fixed;pointer-events:none;z-index:9998;display:none;';
  document.body.appendChild(tBox);

  // --- Inject scoped styles ---
  const style = document.createElement('style');
  style.textContent = `
    #grid-cursor svg { display: none; }
    #grid-cursor .arrow { display: block; }
    #grid-cursor.grab .arrow { display: none; }
    #grid-cursor.grab .grab { display: block; }
    #grid-cursor.grabbing .arrow { display: none; }
    #grid-cursor.grabbing .grabbing { display: block; }
    #grid-cursor.nwse .arrow { display: none; }
    #grid-cursor.nwse .resize-nwse { display: block; }
    #grid-cursor.nesw .arrow { display: none; }
    #grid-cursor.nesw .resize-nesw { display: block; }
    #grid-transform-box .border {
      position: absolute; inset: 0;
      border: 1.5px dashed rgba(120, 170, 255, 0.7);
    }
    #grid-transform-box .handle {
      position: absolute; width: 7px; height: 7px;
      background: #fff; border: 1.5px solid rgba(120, 170, 255, 0.9);
    }
    #grid-transform-box .handle.tl { top: -3px; left: -3px; }
    #grid-transform-box .handle.tc { top: -3px; left: calc(50% - 3px); }
    #grid-transform-box .handle.tr { top: -3px; right: -3px; }
    #grid-transform-box .handle.ml { top: calc(50% - 3px); left: -3px; }
    #grid-transform-box .handle.mr { top: calc(50% - 3px); right: -3px; }
    #grid-transform-box .handle.bl { bottom: -3px; left: -3px; }
    #grid-transform-box .handle.bc { bottom: -3px; left: calc(50% - 3px); }
    #grid-transform-box .handle.br { bottom: -3px; right: -3px; }
  `;
  document.head.appendChild(style);

  // --- Per-span state ---
  function recalcBase() {
    return spans.map(el => {
      const r = el.getBoundingClientRect();
      return {
        x: 0, y: 0,
        scaleX: 1, scaleY: 1,
        naturalHW: r.width / 2,
        naturalHH: r.height / 2,
        baseCenterX: r.left + r.width / 2,
        baseCenterY: r.top + r.height / 2,
      };
    });
  }

  let pairState = recalcBase();

  // --- Utilities ---
  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function mouseEase(t) {
    if (t < 0.15) { const s = t / 0.15; return 0.15 * s * s; }
    if (t < 0.7) return 0.15 + (t - 0.15) * (0.75 / 0.55);
    const s = (t - 0.7) / 0.3;
    return Math.min(0.9 + 0.1 * (1 - Math.pow(1 - s, 3)) * 1.02, 1.005);
  }

  function tremor(t, seed) {
    return Math.sin(t * 47.3 + seed) * 0.7
      + Math.sin(t * 91.7 + seed * 2.3) * 0.4
      + Math.sin(t * 23.1 + seed * 0.7) * 0.5;
  }

  function genPath(x0, y0, x1, y1, n) {
    const pts = [];
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / dist, py = dx / dist;
    const arc = rand(-dist * 0.08, dist * 0.08);
    const seed = Math.random() * 1000;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const e = mouseEase(t);
      let x = lerp(x0, x1, e) + px * arc * Math.sin(t * Math.PI);
      let y = lerp(y0, y1, e) + py * arc * Math.sin(t * Math.PI);
      x += tremor(t * 10, seed) * 1.2;
      y += tremor(t * 10, seed + 500) * 1.2;
      pts.push({ x, y });
    }
    return pts;
  }

  function moveDur(d) { return 80 + Math.sqrt(d) * 10 + rand(0, 60); }
  function dragDur(d) { return 100 + Math.sqrt(d) * 14 + rand(0, 80); }

  // --- Transform box helpers ---
  const CORNERS = ['tl', 'tr', 'bl', 'br'];

  function handlePos(rect, h) {
    const m = {
      tl: [rect.left, rect.top], tc: [rect.left + rect.width / 2, rect.top],
      tr: [rect.left + rect.width, rect.top],
      ml: [rect.left, rect.top + rect.height / 2],
      mr: [rect.left + rect.width, rect.top + rect.height / 2],
      bl: [rect.left, rect.top + rect.height],
      bc: [rect.left + rect.width / 2, rect.top + rect.height],
      br: [rect.left + rect.width, rect.top + rect.height],
    };
    return { x: m[h][0], y: m[h][1] };
  }

  function anchorOf(h) {
    return { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl', tc: 'bc', bc: 'tc', ml: 'mr', mr: 'ml' }[h];
  }

  function handleCursor(h) {
    return (h === 'tl' || h === 'br') ? 'nwse' : 'nesw';
  }

  function pairBox(i) {
    const ps = pairState[i];
    const cx = ps.baseCenterX + ps.x;
    const cy = ps.baseCenterY + ps.y;
    const hw = ps.naturalHW * ps.scaleX;
    const hh = ps.naturalHH * ps.scaleY;
    return { left: cx - hw, top: cy - hh, width: hw * 2, height: hh * 2 };
  }

  function updateTBox(i) {
    const b = pairBox(i);
    tBox.style.left = b.left + 'px';
    tBox.style.top = b.top + 'px';
    tBox.style.width = b.width + 'px';
    tBox.style.height = b.height + 'px';
  }

  function showTBox(i) { tBox.style.display = 'block'; updateTBox(i); }
  function hideTBox() { tBox.style.display = 'none'; }

  // --- Cursor state machine ---
  const cur = {
    x: 0, y: 0, target: -1, phase: 'idle',
    path: [], pathStart: 0, pathDur: 0,
    dsx: 0, dsy: 0, dpx: 0, dpy: 0,
    idle: 0, hover: 0,
    action: 'drag', handle: 'br',
    ax: 0, ay: 0, ssx: 1, ssy: 1, shx: 0, shy: 0,
    signX: 1, signY: 1,
  };

  function followPath(now) {
    const t = Math.min((now - cur.pathStart) / cur.pathDur, 1);
    const idx = Math.min(Math.floor(t * (cur.path.length - 1)), cur.path.length - 1);
    cur.x = cur.path[idx].x;
    cur.y = cur.path[idx].y;
    return t;
  }

  function pick() {
    let n;
    do { n = Math.floor(Math.random() * spans.length); }
    while (n === cur.target && Math.random() > 0.3);
    return n;
  }

  function center(i) {
    const r = spans[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Phase functions
  function goIdle() {
    cur.phase = 'idle';
    cur.idle = rand(200, 600);
    cursorEl.className = '';
    hideTBox();
  }

  function goMove() {
    cur.target = pick();
    cur.action = Math.random() < 0.4 ? 'transform' : 'drag';
    const c = center(cur.target);
    const ax = c.x + rand(-10, 10), ay = c.y + rand(-8, 8);
    const d = Math.sqrt((ax - cur.x) ** 2 + (ay - cur.y) ** 2);
    cur.path = genPath(cur.x, cur.y, ax, ay, 60);
    cur.pathStart = performance.now();
    cur.pathDur = moveDur(d);
    cur.phase = 'move';
    cursorEl.className = '';
  }

  function goHover() {
    cur.phase = 'hover';
    cur.hover = rand(80, 250);
    cursorEl.className = 'grab';
    if (cur.action === 'transform') showTBox(cur.target);
  }

  function goMoveHandle() {
    cur.handle = CORNERS[Math.floor(Math.random() * 4)];
    const b = pairBox(cur.target);
    const hp = handlePos(b, cur.handle);
    const d = Math.sqrt((hp.x - cur.x) ** 2 + (hp.y - cur.y) ** 2);
    cur.path = genPath(cur.x, cur.y, hp.x, hp.y, 40);
    cur.pathStart = performance.now();
    cur.pathDur = moveDur(d);
    cur.phase = 'moveHandle';
  }

  function goHandleHover() {
    cur.phase = 'handleHover';
    cur.hover = rand(50, 150);
    cursorEl.className = handleCursor(cur.handle);
  }

  function goGrab() {
    cur.phase = 'grab';
    cur.hover = rand(30, 80);
    cursorEl.className = 'grabbing';
    cur.dpx = pairState[cur.target].x;
    cur.dpy = pairState[cur.target].y;
    cur.dsx = cur.x;
    cur.dsy = cur.y;
  }

  function goTransformGrab() {
    cur.phase = 'tGrab';
    cur.hover = rand(30, 70);
    const ah = anchorOf(cur.handle);
    const b = pairBox(cur.target);
    const ap = handlePos(b, ah);
    const hp = handlePos(b, cur.handle);
    cur.ax = ap.x; cur.ay = ap.y;
    cur.shx = hp.x; cur.shy = hp.y;
    cur.ssx = pairState[cur.target].scaleX;
    cur.ssy = pairState[cur.target].scaleY;
    cur.signX = Math.sign(hp.x - ap.x) || 1;
    cur.signY = Math.sign(hp.y - ap.y) || 1;
  }

  function goDrag() {
    const ps = pairState[cur.target];
    const dist = rand(20, 60);
    const ang = Math.random() * Math.PI * 2;
    const ox = ps.x, oy = ps.y;
    const fromO = Math.sqrt(ox * ox + oy * oy);
    let bias = ang;
    if (fromO > 20) bias = lerp(ang, Math.atan2(-oy, -ox), 0.4 + Math.random() * 0.3);
    const dx = cur.x + Math.cos(bias) * dist;
    const dy = cur.y + Math.sin(bias) * dist;
    const d = Math.sqrt((dx - cur.x) ** 2 + (dy - cur.y) ** 2);
    cur.path = genPath(cur.x, cur.y, dx, dy, 60);
    cur.pathStart = performance.now();
    cur.pathDur = dragDur(d);
    cur.phase = 'drag';
    cur.dsx = cur.x;
    cur.dsy = cur.y;
    cur.dpx = ps.x;
    cur.dpy = ps.y;
  }

  function biasScale(c) {
    if (c > 1.3) return rand(0.7, 1.1);
    if (c < 0.7) return rand(0.9, 1.4);
    return rand(0.6, 1.5);
  }

  function goTransformDrag() {
    const ps = pairState[cur.target];
    const tsx = biasScale(ps.scaleX);
    const tsy = biasScale(ps.scaleY);
    const dx = cur.ax + cur.signX * 2 * ps.naturalHW * tsx;
    const dy = cur.ay + cur.signY * 2 * ps.naturalHH * tsy;
    const d = Math.sqrt((dx - cur.x) ** 2 + (dy - cur.y) ** 2);
    cur.path = genPath(cur.x, cur.y, dx, dy, 60);
    cur.pathStart = performance.now();
    cur.pathDur = dragDur(d);
    cur.phase = 'tDrag';
  }

  function goRelease() {
    cur.phase = 'release';
    cur.hover = rand(50, 180);
    cursorEl.className = cur.action === 'drag' ? 'grab' : handleCursor(cur.handle);
  }

  function goTRelease() {
    cur.phase = 'tRelease';
    cur.hover = rand(80, 250);
    cursorEl.className = '';
  }

  // --- Animation loop ---
  let running = false;
  let animId = null;
  let lastT = 0;

  function animate(now) {
    if (!running) { cursorEl.style.opacity = '0'; hideTBox(); return; }
    const dt = Math.min(now - lastT, 50);
    lastT = now;

    switch (cur.phase) {
      case 'idle':
        cur.idle -= dt;
        if (cur.idle <= 0) goMove();
        break;
      case 'move':
        if (followPath(now) >= 1) goHover();
        break;
      case 'hover':
        cur.hover -= dt;
        cur.x += tremor(now * 0.01, 42) * 0.15;
        cur.y += tremor(now * 0.01, 99) * 0.15;
        if (cur.hover <= 0) {
          if (cur.action === 'transform') goMoveHandle();
          else goGrab();
        }
        break;
      case 'grab':
        cur.hover -= dt;
        if (cur.hover <= 0) goDrag();
        break;
      case 'drag': {
        const t = followPath(now);
        pairState[cur.target].x = cur.dpx + (cur.x - cur.dsx);
        pairState[cur.target].y = cur.dpy + (cur.y - cur.dsy);
        if (t >= 1) goRelease();
        break;
      }
      case 'release':
        cur.hover -= dt;
        cur.x += tremor(now * 0.01, 77) * 0.12;
        cur.y += tremor(now * 0.01, 33) * 0.12;
        if (cur.hover <= 0) goIdle();
        break;
      case 'moveHandle':
        if (followPath(now) >= 1) goHandleHover();
        break;
      case 'handleHover':
        cur.hover -= dt;
        cur.x += tremor(now * 0.01, 55) * 0.12;
        cur.y += tremor(now * 0.01, 66) * 0.12;
        if (cur.hover <= 0) goTransformGrab();
        break;
      case 'tGrab':
        cur.hover -= dt;
        if (cur.hover <= 0) goTransformDrag();
        break;
      case 'tDrag': {
        const t = followPath(now);
        const ps = pairState[cur.target];
        ps.scaleX = clamp(Math.abs(cur.x - cur.ax) / (2 * ps.naturalHW), 0.3, 2.5);
        ps.scaleY = clamp(Math.abs(cur.y - cur.ay) / (2 * ps.naturalHH), 0.3, 2.5);
        const ncx = cur.ax + cur.signX * ps.naturalHW * ps.scaleX;
        const ncy = cur.ay + cur.signY * ps.naturalHH * ps.scaleY;
        ps.x = ncx - ps.baseCenterX;
        ps.y = ncy - ps.baseCenterY;
        updateTBox(cur.target);
        if (t >= 1) goTRelease();
        break;
      }
      case 'tRelease':
        cur.hover -= dt;
        cur.x += tremor(now * 0.01, 88) * 0.1;
        cur.y += tremor(now * 0.01, 44) * 0.1;
        if (cur.hover <= 0) goIdle();
        break;
    }

    // Render cursor
    cursorEl.style.transform = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px)`;

    // Render letter transforms
    spans.forEach((el, i) => {
      const ps = pairState[i];
      el.style.transform = `translate(${ps.x.toFixed(1)}px, ${ps.y.toFixed(1)}px) scale(${ps.scaleX.toFixed(3)}, ${ps.scaleY.toFixed(3)})`;
    });

    if (tBox.style.display !== 'none' && cur.target >= 0) updateTBox(cur.target);

    animId = requestAnimationFrame(animate);
  }

  function start() {
    if (running) return;
    running = true;
    pairState = recalcBase();
    // Reset transforms
    spans.forEach(el => el.style.transform = '');
    pairState.forEach(ps => { ps.x = 0; ps.y = 0; ps.scaleX = 1; ps.scaleY = 1; });
    // Position cursor near center of grid
    const gridRect = workSection.getBoundingClientRect();
    cur.x = gridRect.left + gridRect.width / 2;
    cur.y = gridRect.top + gridRect.height / 2;
    cursorEl.style.opacity = '1';
    lastT = performance.now();
    goIdle();
    animId = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    cursorEl.style.opacity = '0';
    hideTBox();
    // Reset letter positions smoothly
    spans.forEach(el => {
      el.style.transition = 'transform 0.5s ease';
      el.style.transform = '';
      setTimeout(() => el.style.transition = '', 600);
    });
    pairState.forEach(ps => { ps.x = 0; ps.y = 0; ps.scaleX = 1; ps.scaleY = 1; });
  }

  // --- Scroll-triggered activation ---
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
          start();
        } else {
          stop();
        }
      });
    },
    { threshold: [0, 0.3, 0.5] }
  );
  observer.observe(workSection);
})();
