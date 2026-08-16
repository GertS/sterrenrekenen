(() => {
  'use strict';

  const STORAGE_KEY = 'sterrenrekenen-v1';
  const DEFAULT_STATE = {
    stars: 0,
    correctMultiply: 0,
    correctSubtract: 0,
    totalAttempts: 0,
    practicedTables: [],
    sound: true,
    lastGameIds: []
  };

  const $ = sel => document.querySelector(sel);
  const screenHost = $('#screenHost');
  const starCount = $('#starCount');
  const homeButton = $('#homeButton');
  const soundButton = $('#soundButton');
  const toast = $('#toast');
  const fxLayer = $('#fxLayer');

  let state = loadState();
  let currentScreen = 'home';
  let practiceMode = null;
  let selectedTable = null;
  let problem = null;
  let answerBuffer = '';
  let wrongAttempts = 0;
  let streak = 0;
  let lockedAnswer = false;
  let lastProblemKey = '';
  let currentGame = null;
  let gameScore = 0;
  let gameTimer = null;
  let gameCleanup = null;
  let deferredInstallPrompt = null;
  let audioCtx = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...DEFAULT_STATE, ...parsed, practicedTables: Array.isArray(parsed.practicedTables) ? parsed.practicedTables : [], lastGameIds: Array.isArray(parsed.lastGameIds) ? parsed.lastGameIds : [] };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (err) { console.warn('Voortgang kon niet worden opgeslagen:', err); }
    updateChrome();
  }

  function updateChrome() {
    starCount.textContent = String(state.stars);
    soundButton.textContent = state.sound ? '🔊' : '🔇';
    soundButton.setAttribute('aria-label', state.sound ? 'Geluid uitzetten' : 'Geluid aanzetten');
    homeButton.classList.toggle('hidden', currentScreen === 'home');
  }

  function renderTemplate(id) {
    // Overlays staan buiten screenHost; ruim ze bij elke schermwissel op.
    document.querySelector('.reward-modal')?.remove();
    const tpl = document.getElementById(id);
    screenHost.replaceChildren(tpl.content.cloneNode(true));
    screenHost.scrollTop = 0;
  }

  function showHome() {
    stopActiveGame(false);
    currentScreen = 'home';
    renderTemplate('homeTemplate');
    $('#unlockCard').classList.toggle('hidden', state.stars < 10);
    updateChrome();
  }

  function showTableChoice() {
    stopActiveGame(false);
    currentScreen = 'tables';
    renderTemplate('tableTemplate');
    const grid = $('#tableGrid');
    for (let n=1; n<=10; n++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'table-btn' + (state.practicedTables.includes(n) ? ' done' : '');
      btn.textContent = `× ${n}`;
      btn.dataset.table = String(n);
      grid.appendChild(btn);
    }
    const all = document.createElement('button');
    all.type='button'; all.className='table-btn all'; all.dataset.table='all'; all.textContent='✨ ALLE TAFELS';
    grid.appendChild(all);
    updateChrome();
  }

  function startPractice(mode, table = null) {
    stopActiveGame(false);
    currentScreen = 'practice';
    practiceMode = mode;
    selectedTable = table;
    streak = 0;
    renderTemplate('practiceTemplate');
    const label = $('#practiceModeLabel');
    if (mode === 'multiply') label.textContent = table ? `✖ Tafel van ${table}` : '✖ Alle tafels';
    else label.textContent = '➖ Aftrekken tot 100';
    makeNextProblem();
    updateChrome();
  }

  function makeNextProblem() {
    answerBuffer=''; wrongAttempts=0; lockedAnswer=false;
    const next = practiceMode === 'multiply' ? makeMultiplyProblem() : makeSubtractProblem();
    problem=next; lastProblemKey=next.key;
    const card=$('#problemCard');
    if (!card) return;
    card.classList.remove('correct','try-again');
    $('#problemText').textContent=next.text;
    $('#answerDisplay').innerHTML='&nbsp;';
    $('#feedbackText').textContent='Tik je antwoord in';
    $('#streakLabel').textContent=`🔥 ${streak} op rij`;
  }

  function makeMultiplyProblem() {
    return window.MathTrainer.makeMultiplyProblem(selectedTable, lastProblemKey);
  }

  function makeSubtractProblem() {
    return window.MathTrainer.makeSubtractProblem(lastProblemKey);
  }

  function keypadInput(key) {
    if (lockedAnswer) return;
    if (key==='back') answerBuffer=answerBuffer.slice(0,-1);
    else if (key==='clear') answerBuffer='';
    else if (/^\d$/.test(key) && answerBuffer.length < 3) {
      if (answerBuffer==='0') answerBuffer=key; else answerBuffer+=key;
    }
    $('#answerDisplay').textContent=answerBuffer || '\u00a0';
    sound('click');
  }

  function submitAnswer() {
    if (lockedAnswer || !problem || answerBuffer==='') return;
    state.totalAttempts++;
    const value=Number(answerBuffer);
    if (value===problem.answer) handleCorrect(); else handleWrong();
  }

  function handleCorrect() {
    lockedAnswer=true; streak++;
    if (practiceMode==='multiply') {
      state.correctMultiply++;
      if (selectedTable && !state.practicedTables.includes(selectedTable)) {
        state.practicedTables.push(selectedTable); state.practicedTables.sort((a,b)=>a-b);
      }
    } else state.correctSubtract++;
    state.stars++;
    saveState();
    const messages=['Goed zo!','Super!','Knap gedaan!','Yes!','Geweldig!','Topper!'];
    $('#problemCard').classList.add('correct');
    $('#feedbackText').textContent=messages[Math.floor(Math.random()*messages.length)];
    $('#streakLabel').textContent=`🔥 ${streak} op rij`;
    sound('correct');
    flyStar();
    const justUnlocked = state.stars % 10 === 0;
    if (justUnlocked) {
      setTimeout(()=>{ confetti(46); sound('unlock'); },140);
      showToast('🎮 Je hebt een spelletje verdiend!');
    }
    setTimeout(() => {
      makeNextProblem();
      if (justUnlocked && currentScreen === 'practice') showRewardPrompt();
    }, 650);
  }

  function handleWrong() {
    wrongAttempts++; streak=0;
    const messages=['Bijna! Probeer nog eens.','Nog een keertje!','Je kunt het! Probeer opnieuw.'];
    const card=$('#problemCard');
    card.classList.remove('try-again'); void card.offsetWidth; card.classList.add('try-again');
    let msg=messages[(wrongAttempts-1)%messages.length];
    if (wrongAttempts>=3) {
      msg += practiceMode === 'multiply'
        ? ` Hint: denk aan de tafel van ${problem.a}.`
        : ` Hint: tel vanaf ${problem.b} door tot ${problem.a}.`;
    }
    $('#feedbackText').textContent=msg;
    $('#streakLabel').textContent='🔥 0 op rij';
    answerBuffer=''; $('#answerDisplay').innerHTML='&nbsp;';
    sound('softBad');
  }


  function showRewardPrompt() {
    document.querySelector('.reward-modal')?.remove();
    const overlay=document.createElement('div');
    overlay.className='reward-modal';
    overlay.innerHTML=`<div class="reward-card"><div class="reward-stars">⭐ 🌟 ⭐</div><div class="eyebrow">10 sterren!</div><h2>Spelletje verdiend!</h2><p>Wil je nu spelen of nog een som maken?</p><button class="primary-btn wide-btn" data-action="choose-game" type="button">🎮 SPEEL EEN SPELLETJE!</button><button class="secondary-btn wide-btn" data-action="close-reward" type="button">➕ Nog een som</button></div>`;
    document.querySelector('#app').appendChild(overlay);
  }

  function showGameChoice() {
    if (state.stars<10) { showToast('Je hebt nog 10 sterren nodig voor een spelletje.'); return; }
    currentScreen='gameChoice'; renderTemplate('gameChoiceTemplate');
    const grid=$('#gameChoiceGrid');
    getGameChoices(3).forEach(game=>{
      const btn=document.createElement('button'); btn.type='button'; btn.className='game-option'; btn.dataset.game=game.id;
      btn.innerHTML=`<span class="emoji">${game.emoji}</span><span class="name">${game.name}</span><span class="desc">${game.desc}</span>`;
      grid.appendChild(btn);
    });
    updateChrome();
  }

  function getGameChoices(count) {
    const all=[...window.MiniGames.catalog];
    const recent=new Set(state.lastGameIds.slice(-2));
    const fresh=all.filter(g=>!recent.has(g.id)).sort(()=>Math.random()-.5);
    const rest=all.filter(g=>recent.has(g.id)).sort(()=>Math.random()-.5);
    return [...fresh,...rest].slice(0,count);
  }

  function startGame(id) {
    if (state.stars<10) { showHome(); return; }
    const game=window.MiniGames.catalog.find(g=>g.id===id); if (!game) return;
    currentScreen='game'; currentGame=game; gameScore=0;
    renderTemplate('gameTemplate');
    $('#gameTitle').textContent=`${game.emoji} ${game.name}`;
    $('#gameInstruction').textContent=game.desc;
    $('#gameTime').textContent=String(game.duration);
    $('#gameScore').textContent='0';
    const arena=$('#gameArena');
    gameCleanup=window.MiniGames.start(id,{
      arena,
      setScore:n=>{ gameScore=n; const el=$('#gameScore'); if(el) el.textContent=String(n); },
      getScore:()=>gameScore,
      sound
    });
    let left=game.duration;
    gameTimer=setInterval(()=>{
      left--;
      const el=$('#gameTime'); if(el) el.textContent=String(Math.max(0,left));
      if (left<=0) finishGame();
    },1000);
    updateChrome();
  }

  function finishGame() {
    if (!currentGame) return;
    if (gameTimer) { clearInterval(gameTimer); gameTimer=null; }
    if (typeof gameCleanup==='function') { try { gameCleanup(); } catch (e) { console.warn(e); } gameCleanup=null; }
    const finished=currentGame;
    currentGame=null;
    state.stars=Math.max(0,state.stars-10);
    state.lastGameIds=[...state.lastGameIds,finished.id].slice(-5);
    saveState();
    currentScreen='result'; renderTemplate('resultTemplate');
    $('#resultTitle').textContent=gameScore>=18?'Wauw, superscore!':gameScore>=9?'Goed gespeeld!':'Lekker geoefend!';
    $('#resultScore').textContent=String(gameScore);
    $('#resultStars').textContent=`10 sterren gebruikt • ${state.stars} ster${state.stars===1?'':'ren'} over`;
    sound('gameOver'); confetti(36); updateChrome();
  }

  function stopActiveGame(showResult=false) {
    if (gameTimer) { clearInterval(gameTimer); gameTimer=null; }
    if (typeof gameCleanup==='function') { try { gameCleanup(); } catch {} gameCleanup=null; }
    if (!showResult) currentGame=null;
  }

  function showProgress() {
    currentScreen='progress'; renderTemplate('progressTemplate');
    const totalCorrect=state.correctMultiply+state.correctSubtract;
    const accuracy=state.totalAttempts ? Math.round(totalCorrect/state.totalAttempts*100) : 0;
    const stats=[
      ['⭐',state.stars,'Sterren nu'],
      ['✖',state.correctMultiply,'Tafels goed'],
      ['➖',state.correctSubtract,'Minsommen goed'],
      ['🎯',`${accuracy}%`,'Goed per poging'],
      ['📚',state.practicedTables.length,'Tafels geoefend'],
      ['✅',totalCorrect,'Sommen goed']
    ];
    $('#progressStats').innerHTML=stats.map(([icon,num,label])=>`<div class="stat-card"><div>${icon}</div><div class="stat-number">${num}</div><div class="stat-label">${label}</div></div>`).join('');
    updateChrome();
  }

  function showSettings() {
    currentScreen='settings'; renderTemplate('settingsTemplate');
    const snd=$('#settingsSound strong'); snd.textContent=state.sound?'🔊 Aan':'🔇 Uit';
    if (deferredInstallPrompt) $('#installButton').classList.remove('hidden');
    if (!document.documentElement.requestFullscreen) $('#fullscreenButton').classList.add('hidden');
    updateChrome();
  }

  function toggleSound() {
    state.sound=!state.sound; saveState();
    if (currentScreen==='settings') $('#settingsSound strong').textContent=state.sound?'🔊 Aan':'🔇 Uit';
    if (state.sound) sound('click');
  }

  async function requestFullscreen() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch { showToast('Volledig scherm is hier niet beschikbaar.'); }
  }

  async function installApp() {
    if (!deferredInstallPrompt) { showToast('Gebruik in Chrome: menu → App installeren / Toevoegen aan startscherm.'); return; }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;
    const b=$('#installButton'); if(b) b.classList.add('hidden');
  }

  function resetProgress() {
    const ok=window.confirm('Weet je zeker dat je alle sterren en voortgang wilt wissen?');
    if (!ok) return;
    const keepSound=state.sound;
    state={...DEFAULT_STATE,sound:keepSound,practicedTables:[],lastGameIds:[]}; saveState();
    showToast('Voortgang is gewist.'); showSettings();
  }

  function showToast(message) {
    toast.textContent=message; toast.classList.add('show');
    clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove('show'),1800);
  }

  function confetti(amount=35) {
    const colors=['#ff6b9f','#ffd166','#2ecc71','#36b5ff','#6c5ce7','#ff9f43'];
    for (let i=0;i<amount;i++) {
      const el=document.createElement('i'); el.className='confetti-piece';
      el.style.left=`${Math.random()*100}%`; el.style.background=colors[i%colors.length];
      el.style.animationDelay=`${Math.random()*.3}s`; el.style.setProperty('--drift',`${(Math.random()-.5)*180}px`);
      fxLayer.appendChild(el); setTimeout(()=>el.remove(),2200);
    }
  }

  function flyStar() {
    const target=$('#starCounter').getBoundingClientRect();
    const source=$('#problemCard').getBoundingClientRect();
    const el=document.createElement('div'); el.className='fly-star'; el.textContent='⭐';
    el.style.left=`${source.left+source.width/2}px`; el.style.top=`${source.top+source.height/2}px`;
    el.style.setProperty('--dx',`${target.left+target.width/2-(source.left+source.width/2)}px`);
    el.style.setProperty('--dy',`${target.top+target.height/2-(source.top+source.height/2)}px`);
    fxLayer.appendChild(el); setTimeout(()=>el.remove(),800);
  }

  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioCtx) {
      const AC=window.AudioContext||window.webkitAudioContext;
      if (!AC) return null;
      audioCtx=new AC();
    }
    if (audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
    return audioCtx;
  }

  function tone(ctx,freq,start,duration,type='sine',volume=.055) {
    const osc=ctx.createOscillator(); const gain=ctx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,start);
    gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(volume,start+.012); gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(gain).connect(ctx.destination); osc.start(start); osc.stop(start+duration+.02);
  }

  function sound(kind) {
    const ctx=ensureAudio(); if(!ctx) return;
    const t=ctx.currentTime+.005;
    if(kind==='click') tone(ctx,420,t,.055,'sine',.025);
    else if(kind==='pop') tone(ctx,650,t,.08,'triangle',.045);
    else if(kind==='softBad') { tone(ctx,260,t,.10,'sine',.025); tone(ctx,220,t+.08,.11,'sine',.02); }
    else if(kind==='correct') { tone(ctx,520,t,.10,'triangle',.05); tone(ctx,660,t+.08,.11,'triangle',.05); tone(ctx,820,t+.16,.14,'triangle',.055); }
    else if(kind==='bonus') { tone(ctx,680,t,.08,'square',.035); tone(ctx,880,t+.07,.10,'triangle',.05); }
    else if(kind==='unlock') { [523,659,784,1047].forEach((f,i)=>tone(ctx,f,t+i*.08,.16,'triangle',.05)); }
    else if(kind==='gameOver') { [784,659,523].forEach((f,i)=>tone(ctx,f,t+i*.11,.16,'triangle',.04)); }
  }

  function handleAction(action) {
    switch(action) {
      case 'choose-multiply': showTableChoice(); break;
      case 'choose-subtract': startPractice('subtract'); break;
      case 'choose-game': showGameChoice(); break;
      case 'progress': showProgress(); break;
      case 'settings': showSettings(); break;
      case 'home': showHome(); break;
      case 'continue-practice':
        if (practiceMode) startPractice(practiceMode,selectedTable); else showHome();
        break;
      case 'toggle-sound': toggleSound(); break;
      case 'fullscreen': requestFullscreen(); break;
      case 'install': installApp(); break;
      case 'reset-progress': resetProgress(); break;
      case 'close-reward': document.querySelector('.reward-modal')?.remove(); break;
    }
  }

  document.addEventListener('pointerdown', e => {
    const actionEl=e.target.closest('[data-action]'); if(actionEl) { sound('click'); handleAction(actionEl.dataset.action); return; }
    const table=e.target.closest('[data-table]'); if(table) { sound('click'); const value=table.dataset.table; startPractice('multiply',value==='all'?null:Number(value)); return; }
    const game=e.target.closest('[data-game]'); if(game) { sound('click'); startGame(game.dataset.game); return; }
    const key=e.target.closest('[data-key]'); if(key) { e.preventDefault(); keypadInput(key.dataset.key); }
  });

  document.addEventListener('click', e => {
    if (e.target.closest('#submitAnswer')) submitAnswer();
  });

  homeButton.addEventListener('click',showHome);
  starCount.addEventListener('click',showProgress);
  soundButton.addEventListener('click',toggleSound);

  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredInstallPrompt=e; if(currentScreen==='settings'){ const b=$('#installButton'); if(b)b.classList.remove('hidden'); } });
  window.addEventListener('appinstalled',()=>{ deferredInstallPrompt=null; showToast('App geïnstalleerd! 🎉'); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(err=>console.warn('Service worker:',err)));
  }

  window.addEventListener('error',e=>console.error('SterrenRekenen fout:',e.error||e.message));

  showHome();
})();
