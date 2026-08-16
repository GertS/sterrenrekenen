(() => {
  'use strict';

  const catalog = [
    { id: 'catch', name: 'Sterren vangen', emoji: '🧺', desc: 'Sleep het mandje en vang sterren.', duration: 30 },
    { id: 'balloons', name: 'Ballonnen prikken', emoji: '🎈', desc: 'Tik zo veel mogelijk ballonnen stuk.', duration: 30 },
    { id: 'moles', name: 'Diertjes tikken', emoji: '🐹', desc: 'Tik de diertjes zodra ze opduiken.', duration: 30 },
    { id: 'space', name: 'Ruimteschip', emoji: '🚀', desc: 'Pak sterren en ontwijk meteorieten.', duration: 30 },
    { id: 'memory', name: 'Schatkist-memory', emoji: '🧰', desc: 'Zoek dezelfde schatten bij elkaar.', duration: 45 }
  ];

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function pointerXInArena(event, arena) {
    const r = arena.getBoundingClientRect();
    return clamp(event.clientX - r.left, 0, r.width);
  }

  function startCatch(ctx) {
    const { arena, setScore, getScore, sound } = ctx;
    arena.innerHTML = '<div class="catcher-basket" aria-hidden="true">🧺</div>';
    const basket = arena.querySelector('.catcher-basket');
    const items = [];
    let basketX = arena.clientWidth / 2;
    let running = true;
    let raf = 0;
    let last = performance.now();
    let spawnClock = 0;

    const moveBasket = (e) => {
      basketX = pointerXInArena(e, arena);
      basket.style.left = `${basketX}px`;
    };
    arena.addEventListener('pointerdown', moveBasket);
    arena.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') moveBasket(e); });

    const spawn = () => {
      const bad = Math.random() < 0.18;
      const el = document.createElement('div');
      el.className = 'falling-item';
      el.textContent = bad ? '🪨' : (Math.random() < 0.16 ? '🌟' : '⭐');
      const item = {
        el,
        x: rand(24, Math.max(25, arena.clientWidth - 48)),
        y: -55,
        speed: rand(120, 190),
        bad,
        bonus: !bad && el.textContent === '🌟'
      };
      arena.appendChild(el);
      items.push(item);
    };

    const tick = now => {
      if (!running) return;
      const dt = Math.min(.035, (now - last) / 1000);
      last = now;
      spawnClock += dt;
      if (spawnClock > .62) { spawnClock = 0; spawn(); }
      const basketY = arena.clientHeight - 58;

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += it.speed * dt;
        it.el.style.transform = `translate3d(${it.x}px,${it.y}px,0)`;
        const hitX = Math.abs((it.x + 24) - basketX) < 63;
        const hitY = it.y + 42 > basketY && it.y < basketY + 45;
        if (hitX && hitY) {
          if (it.bad) {
            setScore(Math.max(0, getScore() - 1));
            sound('softBad');
          } else {
            setScore(getScore() + (it.bonus ? 3 : 1));
            sound('pop');
          }
          it.el.remove();
          items.splice(i, 1);
        } else if (it.y > arena.clientHeight + 60) {
          it.el.remove();
          items.splice(i, 1);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      arena.replaceWith(arena.cloneNode(false));
    };
  }

  function startBalloons(ctx) {
    const { arena, setScore, getScore, sound } = ctx;
    const balloons = [];
    let running = true;
    let raf = 0;
    let last = performance.now();
    let spawnClock = .5;
    const balloonChars = ['🎈','🎈','🎈','🎈','🎈'];

    const spawn = () => {
      const special = Math.random() < .13;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'balloon';
      el.setAttribute('aria-label', special ? 'Speciale ballon' : 'Ballon');
      el.textContent = special ? '🎁' : pick(balloonChars);
      const b = {
        el,
        x: rand(4, Math.max(5, arena.clientWidth - 80)),
        y: arena.clientHeight + 95,
        speed: rand(65, 115),
        special,
        dead: false
      };
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (b.dead || !running) return;
        b.dead = true;
        setScore(getScore() + (special ? 3 : 1));
        sound(special ? 'bonus' : 'pop');
        el.classList.add('pop');
        setTimeout(() => el.remove(), 180);
      });
      arena.appendChild(el);
      balloons.push(b);
    };

    const tick = now => {
      if (!running) return;
      const dt = Math.min(.035, (now-last)/1000);
      last = now;
      spawnClock += dt;
      if (spawnClock > .55) { spawnClock = 0; spawn(); }
      for (let i = balloons.length - 1; i >= 0; i--) {
        const b = balloons[i];
        if (b.dead) { balloons.splice(i,1); continue; }
        b.y -= b.speed * dt;
        b.el.style.left = `${b.x}px`;
        b.el.style.top = `${b.y}px`;
        if (b.y < -110) { b.el.remove(); balloons.splice(i,1); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      balloons.forEach(b => b.el.remove());
    };
  }

  function startMoles(ctx) {
    const { arena, setScore, getScore, sound } = ctx;
    arena.innerHTML = '<div class="mole-grid"></div>';
    const grid = arena.querySelector('.mole-grid');
    const targets = [];
    const animals = ['🐹','🐰','🐸','🐱','🐶','🦊'];
    let running = true;
    let active = -1;
    let showTimer = 0;
    let hideTimer = 0;
    let startTime = performance.now();

    for (let i = 0; i < 9; i++) {
      const hole = document.createElement('div');
      hole.className = 'mole-hole';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mole-target';
      btn.setAttribute('aria-label', 'Tik het diertje');
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!running || active !== i || !btn.classList.contains('up')) return;
        setScore(getScore() + 1);
        sound('pop');
        btn.classList.remove('up');
        active = -1;
        clearTimeout(hideTimer);
        schedule();
      });
      hole.appendChild(btn);
      grid.appendChild(hole);
      targets.push(btn);
    }

    function schedule() {
      if (!running) return;
      clearTimeout(showTimer);
      const elapsed = (performance.now() - startTime) / 1000;
      const wait = clamp(620 - elapsed * 7, 330, 620);
      showTimer = setTimeout(showOne, wait);
    }

    function showOne() {
      if (!running) return;
      if (active >= 0) targets[active].classList.remove('up');
      let idx;
      do idx = Math.floor(Math.random()*targets.length); while (idx === active && targets.length > 1);
      active = idx;
      const btn = targets[idx];
      btn.textContent = pick(animals);
      btn.classList.add('up');
      const elapsed = (performance.now() - startTime) / 1000;
      const visibleFor = clamp(850 - elapsed * 9, 430, 850);
      hideTimer = setTimeout(() => {
        btn.classList.remove('up');
        active = -1;
        schedule();
      }, visibleFor);
    }
    schedule();

    return () => {
      running = false;
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      targets.forEach(t => t.classList.remove('up'));
    };
  }

  function startSpace(ctx) {
    const { arena, setScore, getScore, sound } = ctx;
    arena.classList.add('space-arena');
    arena.innerHTML = '<div class="space-flash"></div><div class="spaceship" aria-hidden="true">🚀</div>';
    const ship = arena.querySelector('.spaceship');
    const flash = arena.querySelector('.space-flash');
    const items = [];
    let shipX = arena.clientWidth/2;
    let running = true;
    let raf = 0;
    let last = performance.now();
    let spawnClock = 0;

    const move = e => {
      shipX = pointerXInArena(e, arena);
      ship.style.left = `${shipX}px`;
    };
    arena.addEventListener('pointerdown', move);
    arena.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') move(e); });

    const spawn = () => {
      const chance = Math.random();
      const kind = chance < .27 ? 'meteor' : chance < .40 ? 'gem' : 'star';
      const el = document.createElement('div');
      el.className = 'space-item';
      el.textContent = kind === 'meteor' ? '☄️' : kind === 'gem' ? '💎' : '⭐';
      const item = { el, kind, x:rand(14,Math.max(15,arena.clientWidth-54)), y:-55, speed:rand(120,220) };
      arena.appendChild(el);
      items.push(item);
    };

    const tick = now => {
      if (!running) return;
      const dt = Math.min(.035,(now-last)/1000); last=now; spawnClock += dt;
      if (spawnClock > .48) { spawnClock=0; spawn(); }
      const shipY = arena.clientHeight - 78;
      for (let i=items.length-1;i>=0;i--) {
        const it=items[i]; it.y += it.speed*dt;
        it.el.style.transform=`translate3d(${it.x}px,${it.y}px,0)`;
        const hitX=Math.abs((it.x+23)-shipX)<47;
        const hitY=it.y+42>shipY && it.y<shipY+62;
        if (hitX && hitY) {
          if (it.kind==='meteor') {
            setScore(Math.max(0,getScore()-1)); sound('softBad');
            flash.classList.remove('hit'); void flash.offsetWidth; flash.classList.add('hit');
          } else {
            setScore(getScore()+(it.kind==='gem'?3:1)); sound(it.kind==='gem'?'bonus':'pop');
          }
          it.el.remove(); items.splice(i,1);
        } else if (it.y>arena.clientHeight+60) { it.el.remove(); items.splice(i,1); }
      }
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);

    return () => {
      running=false; cancelAnimationFrame(raf); items.forEach(i=>i.el.remove()); arena.classList.remove('space-arena');
    };
  }

  function startMemory(ctx) {
    const { arena, setScore, getScore, sound } = ctx;
    const symbols = ['💎','👑','🪙','🔑','🦄','🌈'];
    let running = true;
    let first = null;
    let second = null;
    let lock = false;
    let resetTimer = 0;
    let roundTimer = 0;
    let cards = [];

    const buildRound = () => {
      if (!running) return;
      arena.innerHTML = '<div class="memory-grid"></div>';
      const grid = arena.querySelector('.memory-grid');
      const deck = [...symbols,...symbols].sort(() => Math.random() - .5);
      cards = deck.map((symbol, index) => {
        const btn = document.createElement('button');
        btn.type='button'; btn.className='memory-card'; btn.dataset.index=index; btn.dataset.symbol=symbol;
        btn.setAttribute('aria-label','Schatkist');
        btn.addEventListener('pointerdown', e => { e.preventDefault(); flip(btn); });
        grid.appendChild(btn);
        return btn;
      });
      first=null; second=null; lock=false;
    };

    const flip = btn => {
      if (!running || lock || btn.classList.contains('matched') || btn===first) return;
      btn.classList.add('revealed'); btn.textContent=btn.dataset.symbol; sound('click');
      if (!first) { first=btn; return; }
      second=btn; lock=true;
      if (first.dataset.symbol===second.dataset.symbol) {
        first.classList.add('matched'); second.classList.add('matched');
        first.classList.remove('revealed'); second.classList.remove('revealed');
        setScore(getScore()+2); sound('bonus');
        first=null; second=null; lock=false;
        if (cards.every(c=>c.classList.contains('matched'))) roundTimer=setTimeout(buildRound,800);
      } else {
        resetTimer=setTimeout(()=>{
          if (!running) return;
          [first,second].forEach(c=>{ if(c){c.classList.remove('revealed');c.textContent='';} });
          first=null; second=null; lock=false;
        },700);
      }
    };

    buildRound();
    return () => { running=false; clearTimeout(resetTimer); clearTimeout(roundTimer); };
  }

  const starters = { catch:startCatch, balloons:startBalloons, moles:startMoles, space:startSpace, memory:startMemory };

  window.MiniGames = {
    catalog,
    start(id, ctx) {
      if (!starters[id]) throw new Error(`Onbekend spel: ${id}`);
      return starters[id](ctx);
    }
  };
})();
