(() => {
  'use strict';
  const M = window.StarCityModel;
  const ATLAS = 'assets/city-atlas.png';
  // Visible front tip of each grass base, measured within its atlas cell.
  // The second atlas row has more transparent space below its tiles.
  const GROUND_ANCHORS = [0.950, 0.976, 0.965, 0.979, 0.865, 0.874, 0.874, 0.874];
  const SPRITE_SIZE = 114;
  const GROUND_TIP_Y = 30;
  // Keep the buildings at their original size; reserve a wider corridor around each plot.
  const HALF_TILE_WIDTH = 92;
  const HALF_TILE_HEIGHT = 46;
  const STREET_WIDTH = 22;
  const SIDEWALK_WIDTH = 34;
  const sprite = (item, cls = '') => `<span class="city-sprite ${cls}" style="--sx:${item.sprite % 4};--sy:${Math.floor(item.sprite / 4)}" aria-hidden="true"></span>`;

  function mount(host, api) {
    let city = M.normalize(api.getState().city);
    let selected = 'park', target = null, moving = null, inspecting = null;
    let cursor = { x: 3, y: 4 }, zoom = city.tiles.length < 10 ? 1.7 : 1.25, pan = { x: 0, y: 0 }, drag = null;
    let width = 0, height = 0, scale = 1, frame = 0, lastTime = 0, elapsed = 0, disposed = false;
    let roadEdges = [], graph = new Map(), actors = [];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let paused = reducedMotion.matches;
    const atlas = new Image(); atlas.src = ATLAS;
    host.innerHTML = `<section class="screen city-screen">
      <div class="city-heading"><div><div class="eyebrow">Jouw eigen wereld</div><h1>Mijn sterrenstad <span>✦</span></h1><p id="cityStats"></p></div><button class="secondary-btn" data-action="home" type="button">⭐ Verdien sterren</button></div>
      <div class="city-world-wrap">
        <div class="city-world-badge"><span class="city-sun">☀</span><span id="cityLevel">Een nieuw begin</span></div>
        <canvas id="cityCanvas" tabindex="0" role="group" aria-label="Jouw stad. Gebruik de pijltjestoetsen om een vak te kiezen en Enter om het te selecteren. Sleep om rond te kijken."></canvas>
        <div class="city-world-controls"><button type="button" data-city-control="in" aria-label="Inzoomen">+</button><button type="button" data-city-control="out" aria-label="Uitzoomen">−</button><button type="button" data-city-control="fit" aria-label="Hele stad bekijken">⌖</button><button type="button" data-city-control="pause" aria-label="${paused ? 'Verkeer afspelen' : 'Verkeer pauzeren'}" aria-pressed="${paused}">${paused ? '▶' : 'Ⅱ'}</button></div>
        <div class="city-world-tip">Sleep om rond te kijken · tik op een vak om te bouwen</div>
      </div>
      <div class="city-build-panel" id="cityBuildPanel"></div>
      <section class="city-shop" aria-label="Tegelwinkel"><div class="city-shop-heading"><div><h2>Tegelwinkel</h2><p>Spaar sterren, bouw jouw wereld.</p></div><span class="city-save-note">Op dit apparaat bewaard</span></div><div class="city-shop-grid">${M.catalog.map(t => `<button type="button" class="city-item" data-city-item="${t.id}" aria-pressed="false">${sprite(t)}<strong>${t.name}</strong><span class="city-price">⭐ ${t.cost}</span><small></small></button>`).join('')}</div></section>
      <p class="city-footnote">Je eerste woning is een cadeautje. Nieuwe tegels kosten sterren; verplaatsen is gratis. Wegen groeien vanzelf mee.</p>
    </section>`;
    const canvas = host.querySelector('canvas'); const ctx = canvas.getContext('2d');
    const panel = host.querySelector('#cityBuildPanel');
    const abort = new AbortController(); const on = (el, event, fn, options = {}) => el.addEventListener(event, fn, { ...options, signal: abort.signal });

    function currentAction(x, y) {
      return moving ? { kind: 'move', fromX: moving.x, fromY: moving.y, x, y } : { kind: 'buy', type: selected, x, y };
    }
    function refresh() {
      city = M.normalize(api.getState().city);
      const stars = api.getState().stars;
      const count = city.tiles.length;
      const residents = city.tiles.reduce((n, t) => n + M.byId[t.type].residents, 0);
      host.querySelector('#cityStats').textContent = `${count} ${count === 1 ? 'tegel' : 'tegels'} · ${residents} bewoners · ${M.SIZE * M.SIZE - count} vrije plekken`;
      host.querySelector('#cityLevel').textContent = count < 4 ? 'Een nieuw begin' : count < 10 ? 'Een gezellige buurt' : count < 22 ? 'Een bruisend dorp' : 'Een echte sterrenstad';
      host.querySelectorAll('[data-city-item]').forEach(btn => {
        const item = M.byId[btn.dataset.cityItem];
        btn.classList.toggle('selected', selected === item.id && !moving && !inspecting);
        btn.setAttribute('aria-pressed', String(selected === item.id && !moving && !inspecting));
        btn.classList.toggle('saving', stars < item.cost);
        btn.querySelector('small').textContent = stars < item.cost ? `Nog ${item.cost - stars} sparen` : 'Klaar om te bouwen';
      });
      refreshPanel(); rebuildRoads();
    }
    function refreshPanel() {
      host.querySelectorAll('[data-city-item]').forEach(btn => {
        const active = selected === btn.dataset.cityItem && !moving && !inspecting;
        btn.classList.toggle('selected', active); btn.setAttribute('aria-pressed', String(active));
      });
      const item = M.byId[moving?.type || inspecting?.type || selected];
      const result = target ? M.apply(city, api.getState().stars, currentAction(target.x, target.y)) : null;
      const full = city.tiles.length === M.SIZE * M.SIZE;
      let message = moving ? 'Kies een nieuwe plek. Verplaatsen is gratis.' : inspecting ? 'Deze tegel staat in jouw stad.' : full ? 'Je stad is vol! Je kunt je tegels nog verplaatsen.' : 'Kies een vrij vak naast je stad.';
      if (target) message = result.error || `${item.name} ${moving ? 'verplaatsen' : 'bouwen'} op rij ${target.y + 1}, kolom ${target.x + 1}?`;
      panel.innerHTML = `<div class="city-build-copy">${sprite(item, 'city-selected-sprite')}<div><strong>${moving ? 'Verplaats: ' : ''}${item.name}${!moving && !inspecting ? ` <span>⭐ ${item.cost}</span>` : ''}</strong><p id="cityBuildMessage" role="status">${message}</p></div></div><div class="city-build-actions">${inspecting ? '<button type="button" class="primary-btn" data-city-control="move">Verplaatsen</button>' : `<button type="button" class="primary-btn" data-city-control="confirm" ${!target || result?.error ? 'disabled' : ''}>${moving ? 'Zet hier neer' : `Bouw voor ⭐ ${item.cost}`}</button>`}${target || moving || inspecting ? '<button type="button" class="secondary-btn" data-city-control="cancel">Annuleren</button>' : ''}</div>`;
    }
    function rebuildRoads() {
      roadEdges = M.roads(city); graph = new Map();
      for (const e of roadEdges) for (const [a, b] of [[e.a, e.b], [e.b, e.a]]) {
        const k = a.join(','); if (!graph.has(k)) graph.set(k, []); graph.get(k).push(b);
      }
      actors = Array.from({ length: Math.min(30, city.tiles.length * 2) }, (_, i) => {
        const e = roadEdges[i * 7 % roadEdges.length];
        return { a: e.a, b: e.b, t: (i * .37) % 1, speed: i % 3 === 0 ? .28 : .12, car: i % 3 === 0, color: ['#fb6c68', '#ffcc49', '#48a9e4', '#9866dc', '#f58abc'][i % 5] };
      });
    }
    function choose(x, y) {
      cursor = { x, y };
      const existing = city.tiles.find(t => t.x === x && t.y === y);
      if (existing) {
        if (moving) { api.toast('Kies een vrij vak om deze tegel te verplaatsen.'); return; }
        inspecting = existing; target = null;
      } else { inspecting = null; target = { x, y }; }
      refreshPanel();
    }
    function control(action) {
      if (action === 'in') zoom = Math.min(2.3, zoom + .2);
      if (action === 'out') zoom = Math.max(.65, zoom - .2);
      if (action === 'fit') { zoom = 1; pan = { x: 0, y: 0 }; }
      if (action === 'pause') {
        paused = !paused;
        const b = host.querySelector('[data-city-control="pause"]'); b.textContent = paused ? '▶' : 'Ⅱ'; b.setAttribute('aria-pressed', String(paused)); b.setAttribute('aria-label', paused ? 'Verkeer afspelen' : 'Verkeer pauzeren');
      }
      if (action === 'cancel') { moving = null; inspecting = null; target = null; refresh(); }
      if (action === 'move' && inspecting) { moving = { ...inspecting }; inspecting = null; target = null; refreshPanel(); }
      if (action === 'confirm' && target) {
        const result = api.commit(currentAction(target.x, target.y));
        if (result.error) { api.toast(result.error); refresh(); return; }
        api.sound('correct'); api.toast(moving ? 'Je tegel staat op zijn nieuwe plek!' : `${M.byId[selected].name} gebouwd! Je stad groeit 🌷`);
        target = null; moving = null; inspecting = null; refresh();
      }
    }
    on(host, 'click', e => {
      const item = e.target.closest('[data-city-item]');
      if (item) { selected = item.dataset.cityItem; target = null; inspecting = null; moving = null; refresh(); api.sound('click'); panel.scrollIntoView({ block: 'end', behavior: reducedMotion.matches ? 'instant' : 'smooth' }); return; }
      const button = e.target.closest('[data-city-control]'); if (button) control(button.dataset.cityControl);
    });
    function project(x, y, z = 0) { return { x: (x - y) * HALF_TILE_WIDTH, y: (x + y) * HALF_TILE_HEIGHT - z }; }
    function origin() { return { x: width / 2 + pan.x, y: height / 2 - (M.SIZE * HALF_TILE_HEIGHT - 12) * scale * zoom + pan.y }; }
    function pick(e) {
      const rect = canvas.getBoundingClientRect(), o = origin(), s = scale * zoom;
      const px = (e.clientX - rect.left - o.x) / s, py = (e.clientY - rect.top - o.y) / s;
      const x = Math.floor((px / HALF_TILE_WIDTH + py / HALF_TILE_HEIGHT) / 2), y = Math.floor((py / HALF_TILE_HEIGHT - px / HALF_TILE_WIDTH) / 2);
      return x >= 0 && y >= 0 && x < M.SIZE && y < M.SIZE ? { x, y } : null;
    }
    on(canvas, 'pointerdown', e => { if (!e.isPrimary) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }; canvas.setPointerCapture(e.pointerId); });
    on(canvas, 'pointermove', e => {
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 7) drag.moved = true;
        if (drag.moved) pan = { x: Math.max(-width, Math.min(width, drag.px + dx)), y: Math.max(-height, Math.min(height, drag.py + dy)) };
      } else { const p = pick(e); if (p) cursor = p; }
    });
    on(canvas, 'pointerup', e => { if (!drag || drag.id !== e.pointerId) return; if (!drag.moved) { const p = pick(e); if (p) choose(p.x, p.y); } drag = null; });
    on(canvas, 'pointercancel', () => { drag = null; });
    on(canvas, 'wheel', e => { e.preventDefault(); zoom = Math.max(.65, Math.min(2.3, zoom - Math.sign(e.deltaY) * .1)); }, { passive: false });
    on(canvas, 'keydown', e => {
      const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (steps[e.key]) { e.preventDefault(); cursor.x = Math.max(0, Math.min(M.SIZE - 1, cursor.x + steps[e.key][0])); cursor.y = Math.max(0, Math.min(M.SIZE - 1, cursor.y + steps[e.key][1])); choose(cursor.x, cursor.y); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(cursor.x, cursor.y); }
      if (e.key === 'Escape') { e.preventDefault(); control('cancel'); }
    });
    on(window, 'storage', e => { if (e.key === 'sterrenrekenen-v1') { target = null; inspecting = null; moving = null; api.reload(); refresh(); } });
    const resize = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect(); width = r.width; height = r.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      scale = Math.min(width / (M.SIZE * HALF_TILE_WIDTH * 2 + 130), height / (M.SIZE * HALF_TILE_HEIGHT * 2 + 115)); if (width < 600) scale = Math.max(scale, .5);
    }); resize.observe(canvas);

    function poly(points, fill, stroke, lineWidth = 1) {
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
    }
    function circle(x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
    function line(a, b, color, w) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); }
    function tree(x, y, seed) {
      const p = project(x, y);
      ctx.fillStyle = '#4c843d30'; ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 2, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
      line(p, { x: p.x, y: p.y - 22 }, '#9b7045', 4);
      circle(p.x, p.y - 27, 13, seed % 3 === 0 ? '#f3a2bd' : '#5d9e47');
      circle(p.x - 5, p.y - 31, 9, seed % 3 === 0 ? '#ffc0d4' : '#85be52');
      circle(p.x + 6, p.y - 26, 8, seed % 3 === 0 ? '#ed8fb2' : '#70ac43');
    }
    function flower(x, y, seed) {
      const p = project(x, y); line(p, { x: p.x, y: p.y - 4 }, '#648b3e', 1);
      circle(p.x, p.y - 5, 2.2, ['#fff0a6', '#fa83ac', '#c1a1f2', '#fffdf1'][seed % 4]);
      circle(p.x, p.y - 5, .7, '#ffd35e');
    }
    function drawSprite(item, x, y, alpha = 1) {
      const p = project(x + .5, y + .5);
      ctx.globalAlpha = alpha;
      if (atlas.complete && atlas.naturalWidth) {
        const sw = atlas.naturalWidth / 4, sh = atlas.naturalHeight / 2;
        // Align the visible grass tip, not the transparent bottom of the atlas cell.
        const top = p.y + GROUND_TIP_Y - GROUND_ANCHORS[item.sprite] * SPRITE_SIZE;
        ctx.drawImage(atlas, item.sprite % 4 * sw, Math.floor(item.sprite / 4) * sh, sw, sh, p.x - SPRITE_SIZE / 2, top, SPRITE_SIZE, SPRITE_SIZE);
      } else {
        poly([project(x+.2,y+.2),project(x+.8,y+.2),project(x+.8,y+.8),project(x+.2,y+.8)], '#9dd372');
        ctx.font = '36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(['🏡','🏢','🌳','🏫','🐄','🌻','🏫','🌷'][item.sprite], p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }
    function tickActors(dt) {
      for (const a of actors) {
        a.t += dt * a.speed;
        if (a.t >= 1) {
          const options = graph.get(a.b.join(',')) || [a.a];
          const forward = options.filter(p => p.join(',') !== a.a.join(','));
          const pool = forward.length ? forward : options;
          a.a = a.b; a.b = pool[Math.floor(Math.random() * pool.length)]; a.t %= 1;
        }
      }
    }
    function drawActor(a) {
      const x = a.a[0] + (a.b[0] - a.a[0]) * a.t, y = a.a[1] + (a.b[1] - a.a[1]) * a.t;
      const p = project(x, y), start = project(...a.a), end = project(...a.b);
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const offset = a.car ? 5 : 14;
      p.x += -Math.sin(angle) * offset; p.y += Math.cos(angle) * offset;
      if (a.car) {
        ctx.save(); ctx.translate(p.x, p.y - 3); ctx.rotate(angle);
        ctx.fillStyle = '#30445335'; ctx.fillRect(-8, -3, 17, 8);
        ctx.fillStyle = '#344054'; for (const xx of [-5, 5]) for (const yy of [-4, 4]) ctx.fillRect(xx - 2, yy - 1, 4, 2);
        ctx.fillStyle = a.color; ctx.beginPath(); ctx.roundRect(-9, -4, 18, 8, 3); ctx.fill();
        ctx.fillStyle = '#d9f4ff'; ctx.fillRect(-3, -3, 6, 6); ctx.fillStyle = '#fff2b3'; ctx.fillRect(6, -3, 2, 2); ctx.fillRect(6, 1, 2, 2); ctx.restore();
      } else {
        const step = paused ? 0 : Math.sin(elapsed * 9 + a.t * 5) * 1.3;
        line({ x: p.x - 1, y: p.y - 3 }, { x: p.x - 1 + step, y: p.y }, '#41516a', 1.5);
        line({ x: p.x + 1, y: p.y - 3 }, { x: p.x + 1 - step, y: p.y }, '#41516a', 1.5);
        line({ x: p.x, y: p.y - 8 }, { x: p.x, y: p.y - 3 }, a.color, 4);
        circle(p.x, p.y - 10, 2.5, '#e7b48a'); circle(p.x, p.y - 12, 1.8, '#654d39');
      }
    }
    function draw(time) {
      if (disposed) return;
      frame = requestAnimationFrame(draw);
      const dt = Math.min((time - lastTime) / 1000 || 0, .05); lastTime = time;
      if (document.hidden || !width) return;
      if (!paused) { elapsed += dt; tickActors(dt); }
      const dpr = canvas.width / width;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      const bg = ctx.createLinearGradient(0, 0, 0, height); bg.addColorStop(0, '#dbf2ef'); bg.addColorStop(.45, '#e9f3d3'); bg.addColorStop(1, '#d5e9b6'); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
      const o = origin(); ctx.translate(o.x, o.y); ctx.scale(scale * zoom, scale * zoom);
      // A stream and flower meadow frame the expandable tile grid.
      const stream = [project(-1.3,-2), project(-1.15,1), project(-1.45,3), project(-.9,5), project(-1.3,9)];
      ctx.beginPath(); ctx.moveTo(stream[0].x, stream[0].y); for (let i=1;i<stream.length;i++) ctx.lineTo(stream[i].x,stream[i].y);
      ctx.strokeStyle='#f8edcc';ctx.lineWidth=48;ctx.lineJoin='round';ctx.stroke();ctx.strokeStyle='#75c8d6';ctx.lineWidth=35;ctx.stroke();
      for (let i = 0; i < 32; i++) {
        const x = i % 2 ? 7.6 + (i % 3) * .35 : -.55, y = (i * .71) % 9 - .7;
        if (i % 3 === 0) tree(x, y, i + Math.floor(i / 3)); else { flower(x, y, i); flower(x + .13, y + .08, i + 1); }
      }
      for (let depth = 0; depth <= 12; depth++) for (let x = 0; x < M.SIZE; x++) {
        const y = depth - x; if (y < 0 || y >= M.SIZE) continue;
        poly([project(x,y),project(x+1,y),project(x+1,y+1),project(x,y+1)], (x+y)%2 ? '#b9db8b' : '#c1df94', '#d5eab4', 1.2);
        if ((x * 7 + y) % 3 === 0) for (let i=0;i<3;i++) flower(x+.17+i*.12,y+.75,i+x+y);
      }
      // Sidewalk, asphalt and lane markings are generated from occupied tiles.
      for (const e of roadEdges) line(project(...e.a), project(...e.b), '#f6edda', SIDEWALK_WIDTH);
      for (const e of roadEdges) line(project(...e.a), project(...e.b), '#8a98a0', STREET_WIDTH);
      ctx.setLineDash([5, 8]); for (const e of roadEdges) line(project(...e.a), project(...e.b), '#eaf0df', 1); ctx.setLineDash([]);
      const highlight = target || (!inspecting ? cursor : inspecting);
      if (highlight) {
        const {x,y} = highlight;
        ctx.setLineDash([5,4]); poly([project(x+.04,y+.04),project(x+.96,y+.04),project(x+.96,y+.96),project(x+.04,y+.96)], '#ffffff30', '#7a58e1', 2.5);ctx.setLineDash([]);
      }
      // Sort buildings by their plot centre, so traffic on the front street stays in front.
      const objects = city.tiles.map(t => ({ depth: t.x + t.y + 1, draw: () => drawSprite(M.byId[t.type], t.x, t.y, moving && moving.x === t.x && moving.y === t.y ? .45 : 1) }));
      for (const a of actors) objects.push({ depth: a.a[0]+a.a[1]+((a.b[0]+a.b[1])-(a.a[0]+a.a[1]))*a.t, draw: () => drawActor(a) });
      if (target && !city.tiles.some(t => t.x === target.x && t.y === target.y)) objects.push({ depth: target.x+target.y+1, draw: () => drawSprite(M.byId[moving?.type || selected], target.x,target.y,.55) });
      objects.sort((a,b)=>a.depth-b.depth).forEach(obj=>obj.draw());
      if (highlight && !city.tiles.some(t => t.x === highlight.x && t.y === highlight.y) && !target) {
        const p=project(highlight.x+.5,highlight.y+.5); circle(p.x,p.y,10,'#ffffffbb');ctx.fillStyle='#7555d8';ctx.font='bold 17px sans-serif';ctx.textAlign='center';ctx.fillText('+',p.x,p.y+6);
      }
    }
    refresh(); frame = requestAnimationFrame(draw);
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); abort.abort(); atlas.onload = null; };
  }
  window.StarCity = { mount };
})();
