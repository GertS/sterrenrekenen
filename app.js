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
    lastGameIds: [],
    tablePractice: null,
    city: null
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
  let cityCleanup = null;
  let practiceMode = null;
  let selectedTables = [];
  let allTablesMode = false;
  let pendingTableSelection = [];
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
  let retryQueue = [];
  let nextProblemTimer = null;
  let subtractQuestionIndex = 0;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...DEFAULT_STATE, ...parsed, city: window.StarCityModel.normalize(parsed.city), stars: Number.isSafeInteger(parsed.stars) && parsed.stars >= 0 ? parsed.stars : 0, practicedTables: Array.isArray(parsed.practicedTables) ? parsed.practicedTables : [], lastGameIds: Array.isArray(parsed.lastGameIds) ? parsed.lastGameIds : [] };
    } catch {
      return { ...DEFAULT_STATE, city: window.StarCityModel.initial() };
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

  function clearCity() {
    if (cityCleanup) { cityCleanup(); cityCleanup = null; }
    screenHost.classList.remove('showing-city');
  }

  function renderTemplate(id) {
    clearCity();
    clearTimeout(nextProblemTimer);
    nextProblemTimer = null;
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

  function showCity() {
    stopActiveGame(false);
    clearTimeout(nextProblemTimer);
    document.querySelector('.reward-modal')?.remove();
    clearCity();
    currentScreen = 'city';
    screenHost.classList.add('showing-city');
    screenHost.scrollTop = 0;
    cityCleanup = window.StarCity.mount(screenHost, {
      getState: () => state,
      reload: () => { state = loadState(); updateChrome(); },
      commit: action => {
        // Read the shared wallet again before purchasing, also when another tab changed it.
        const latest = loadState();
        const result = window.StarCityModel.apply(latest.city, latest.stars, action);
        if (result.error) { state = latest; updateChrome(); return result; }
        const next = { ...latest, city: result.city, stars: result.stars };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
        catch { return { error: 'Opslaan lukt niet. Je sterren zijn niet uitgegeven. Maak opslagruimte vrij en probeer opnieuw.' }; }
        state = next; updateChrome(); return result;
      },
      toast: showToast,
      sound
    });
    updateChrome();
  }

  function availableTables() {
    state.tablePractice = window.MathTrainer.tableProgress(state.tablePractice);
    return Array.from({ length: 10 }, (_, i) => i + 1).filter(n => !state.tablePractice.tables[n].locked);
  }

  function recordPracticeAnswer(correct) {
    if (practiceMode !== 'multiply') return false;
    const result = window.MathTrainer.recordTableAnswer(state.tablePractice, problem.table, correct);
    state.tablePractice = result.progress;
    if (result.newlyLocked) showToast(`Tafel ${problem.table}: drie foutloze reeksen! Kies nu een andere tafel.`);
    return result.newlyLocked;
  }

  function showTableChoice() {
    stopActiveGame(false);
    currentScreen = 'tables';
    pendingTableSelection = [];
    renderTemplate('tableTemplate');
    const available = availableTables();
    const grid = $('#tableGrid');
    for (let n=1; n<=10; n++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'table-btn' + (state.practicedTables.includes(n) ? ' done' : '');
      const progress = state.tablePractice.tables[n];
      btn.disabled = !available.includes(n);
      btn.innerHTML = `<span>× ${n}</span>${progress.locked ? `<small>🔒 Morgen vrij, of nog ${6 - progress.others} andere reeksen</small>` : ''}`;
      btn.dataset.table = String(n);
      btn.setAttribute('aria-pressed', 'false');
      grid.appendChild(btn);
    }
    const all = document.createElement('button');
    all.type='button'; all.className='table-btn all'; all.dataset.table='all'; all.textContent='✨ ALLE TAFELS'; all.setAttribute('aria-pressed','false');
    grid.appendChild(all);
    updateChrome();
  }

  function toggleTableSelection(value) {
    const available = availableTables();
    if (value === 'all') {
      pendingTableSelection = pendingTableSelection.length === 10 ? [] : Array.from({length:10}, (_,i) => i + 1);
    } else {
      const table = Number(value);
      if (!available.includes(table)) { showTableChoice(); return; }
      pendingTableSelection = pendingTableSelection.filter(n => available.includes(n));
      pendingTableSelection = pendingTableSelection.includes(table)
        ? pendingTableSelection.filter(item => item !== table)
        : [...pendingTableSelection, table].sort((a,b)=>a-b);
    }
    document.querySelectorAll('[data-table]').forEach(btn => {
      const selected = btn.dataset.table === 'all'
        ? pendingTableSelection.length === 10
        : pendingTableSelection.includes(Number(btn.dataset.table));
      btn.classList.toggle('selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    $('#startTablesButton').disabled = pendingTableSelection.length === 0;
  }

  function startPractice(mode, tables = []) {
    stopActiveGame(false);
    currentScreen = 'practice';
    practiceMode = mode;
    allTablesMode = mode === 'multiply' && new Set(tables).size === 10;
    selectedTables = mode === 'multiply' ? (allTablesMode ? Array.from({length:10}, (_,i) => i + 1) : tables.filter(n => availableTables().includes(n))) : [];
    if (mode === 'multiply' && !selectedTables.length) { showTableChoice(); return; }
    retryQueue = [];
    subtractQuestionIndex = 0;
    streak = 0;
    renderTemplate('practiceTemplate');
    const label = $('#practiceModeLabel');
    if (mode === 'multiply') {
      label.textContent = selectedTables.length === 10
        ? '✖ Alle tafels'
        : `✖ Tafels van ${selectedTables.join(', ')}`;
    }
    else label.textContent = '➖ Aftrekken tot 100';
    makeNextProblem();
    updateChrome();
  }

  function makeNextProblem() {
    if (practiceMode === 'multiply') {
      const available = availableTables();
      if (!allTablesMode) {
        selectedTables = selectedTables.filter(n => available.includes(n));
        retryQueue = retryQueue.filter(item => available.includes(item.problem.table));
      }
      if (!selectedTables.length) { showTableChoice(); return; }
      $('#practiceModeLabel').textContent = allTablesMode ? '✖ Alle tafels' : `✖ Tafels van ${selectedTables.join(', ')}`;
    }
    answerBuffer=''; wrongAttempts=0; lockedAnswer=false;
    const dueIndex = retryQueue.findIndex(item => item.remaining <= 0);
    let next;
    if (dueIndex >= 0) {
      next = retryQueue.splice(dueIndex, 1)[0].problem;
    } else {
      next = practiceMode === 'multiply' ? makeMultiplyProblem() : makeSubtractProblem();
    }
    retryQueue.forEach(item => item.remaining--);
    problem=next; lastProblemKey=next.key;
    const card=$('#problemCard');
    if (!card) return;
    card.classList.remove('correct','try-again');
    $('#problemText').textContent=next.text;
    $('#answerDisplay').innerHTML='&nbsp;';
    $('#feedbackText').textContent = practiceMode === 'multiply' && !state.tablePractice.tables[next.table].locked ? `Tafel ${next.table} · som ${state.tablePractice.tables[next.table].attempts + 1}/10 · ${state.tablePractice.tables[next.table].perfect}/3 foutloze reeksen` : 'Tik je antwoord in';
    $('#streakLabel').textContent=`🔥 ${streak} op rij`;
  }

  function makeMultiplyProblem() {
    return window.MathTrainer.makeMultiplyProblem(selectedTables, lastProblemKey);
  }

  function makeSubtractProblem() {
    const step = subtractQuestionIndex % 10 + 1;
    subtractQuestionIndex++;
    return window.MathTrainer.makeSubtractProblem(lastProblemKey, step);
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
    if (practiceMode === 'multiply' && !allTablesMode && !availableTables().includes(problem.table)) { makeNextProblem(); return; }
    state.totalAttempts++;
    const value=Number(answerBuffer);
    if (value===problem.answer) handleCorrect(); else handleWrong();
  }

  function handleCorrect() {
    lockedAnswer=true; streak++;
    if (practiceMode==='multiply') {
      state.correctMultiply++;
      const practicedTable = problem.table;
      if (practicedTable && !state.practicedTables.includes(practicedTable)) {
        state.practicedTables.push(practicedTable); state.practicedTables.sort((a,b)=>a-b);
      }
    } else state.correctSubtract++;
    state.stars++;
    const tableLocked = recordPracticeAnswer(true);
    saveState();
    const messages=['Goed zo!','Super!','Knap gedaan!','Yes!','Geweldig!','Topper!'];
    $('#problemCard').classList.add('correct');
    $('#feedbackText').textContent=messages[Math.floor(Math.random()*messages.length)];
    $('#streakLabel').textContent=`🔥 ${streak} op rij`;
    sound('correct');
    flyStar();
    const justUnlocked = !tableLocked && state.stars % 10 === 0;
    if (justUnlocked) {
      setTimeout(()=>{ confetti(46); sound('unlock'); },140);
      showToast('🎮 Je hebt een spelletje verdiend!');
    }
    nextProblemTimer=setTimeout(() => {
      makeNextProblem();
      if (justUnlocked && currentScreen === 'practice') showRewardPrompt();
    }, 650);
  }

  function handleWrong() {
    lockedAnswer=true; wrongAttempts++; streak=0;
    recordPracticeAnswer(false);
    retryQueue.push({ problem: {...problem}, remaining: 2 });
    saveState();
    const card=$('#problemCard');
    card.classList.remove('try-again'); void card.offsetWidth; card.classList.add('try-again');
    $('#feedbackText').textContent=`Het juiste antwoord is ${problem.answer}. Deze som komt straks terug.`;
    $('#streakLabel').textContent='🔥 0 op rij';
    $('#answerDisplay').textContent=String(problem.answer);
    sound('softBad');
    nextProblemTimer=setTimeout(makeNextProblem,1600);
  }


  function showRewardPrompt() {
    document.querySelector('.reward-modal')?.remove();
    const overlay=document.createElement('div');
    overlay.className='reward-modal';
    overlay.innerHTML=`<div class="reward-card"><div class="reward-stars">⭐ 🌟 ⭐</div><div class="eyebrow">10 sterren!</div><h2>Wat ga jij doen?</h2><p>Speel een spelletje of spaar voor jouw stad.</p><button class="secondary-btn wide-btn" data-action="city" type="button">🌷 NAAR MIJN STERRENSTAD</button><button class="primary-btn wide-btn" data-action="choose-game" type="button">🎮 SPEEL EEN SPELLETJE!</button><button class="secondary-btn wide-btn" data-action="close-reward" type="button">➕ Nog een som</button></div>`;
    document.querySelector('#app').appendChild(overlay);
  }

  function showGameChoice() {
    if (state.stars<10) { showToast('Je hebt nog 10 sterren nodig voor een spelletje.'); return; }
    currentScreen='gameChoice'; renderTemplate('gameChoiceTemplate');
    const grid=$('#gameChoiceGrid');
    getGameChoices(3).forEach(game=>{
      const btn=document.createElement('button'); btn.type='button'; btn.className='game-option' + (game.featured ? ' featured' : ''); btn.dataset.game=game.id;
      btn.innerHTML=`${game.featured?'<span class="new-badge">NIEUW!</span>':''}<span class="emoji">${game.emoji}</span><span class="name">${game.name}</span><span class="desc">${game.desc}</span>`;
      grid.appendChild(btn);
    });
    updateChrome();
  }

  function getGameChoices(count) {
    const all=[...window.MiniGames.catalog];
    const recent=new Set(state.lastGameIds.slice(-2));
    const fresh=all.filter(g=>!recent.has(g.id)).sort(()=>Math.random()-.5);
    const rest=all.filter(g=>recent.has(g.id)).sort(()=>Math.random()-.5);
    const featuredIndex=fresh.findIndex(g=>g.featured);
    if(featuredIndex>0) fresh.unshift(fresh.splice(featuredIndex,1)[0]);
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
    const ok=window.confirm('Weet je zeker dat je alle sterren, voortgang én je hele stad wilt wissen?');
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
      case 'city': showCity(); break;
      case 'choose-game': showGameChoice(); break;
      case 'progress': showProgress(); break;
      case 'settings': showSettings(); break;
      case 'home': showHome(); break;
      case 'continue-practice':
        if (practiceMode) startPractice(practiceMode,selectedTables); else showHome();
        break;
      case 'start-tables': startPractice('multiply',pendingTableSelection); break;
      case 'toggle-sound': toggleSound(); break;
      case 'fullscreen': requestFullscreen(); break;
      case 'install': installApp(); break;
      case 'reset-progress': resetProgress(); break;
      case 'close-reward': document.querySelector('.reward-modal')?.remove(); break;
    }
  }

  document.addEventListener('click', e => {
    const actionEl=e.target.closest('[data-action]'); if(actionEl) { sound('click'); handleAction(actionEl.dataset.action); return; }
    const table=e.target.closest('[data-table]'); if(table) { sound('click'); toggleTableSelection(table.dataset.table); return; }
    const game=e.target.closest('[data-game]'); if(game) { sound('click'); startGame(game.dataset.game); return; }
    const key=e.target.closest('[data-key]'); if(key) { keypadInput(key.dataset.key); return; }
    if (e.target.closest('#submitAnswer')) submitAnswer();
  });

  document.addEventListener('keydown', e => {
    if (currentScreen === 'practice') {
      if (/^\d$/.test(e.key)) { e.preventDefault(); keypadInput(e.key); }
      else if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); }
      else if (e.key === 'Backspace') { e.preventDefault(); keypadInput('back'); }
      else if (e.key === 'Delete' || e.key === 'Escape') { e.preventDefault(); keypadInput('clear'); }
    } else if (currentScreen === 'tables') {
      const table = e.key === '0' ? 10 : Number(e.key);
      if (table >= 1 && table <= 10) { e.preventDefault(); toggleTableSelection(String(table)); }
      else if (e.key === 'Enter' && pendingTableSelection.length) { e.preventDefault(); startPractice('multiply',pendingTableSelection); }
    }
  });

  homeButton.addEventListener('click',showHome);
  $('#starCounter').addEventListener('click', () => { stopActiveGame(false); showProgress(); });
  soundButton.addEventListener('click',toggleSound);

  window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY) return;
    state = loadState(); updateChrome();
    if (currentScreen === 'home') $('#unlockCard').classList.toggle('hidden', state.stars < 10);
    if (currentScreen === 'tables') showTableChoice();
  });

  function refreshTableDay() {
    if (currentScreen === 'tables' && state.tablePractice?.day !== window.MathTrainer.tableProgress(null).day) showTableChoice();
  }
  window.addEventListener('focus', refreshTableDay);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshTableDay(); });

  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredInstallPrompt=e; if(currentScreen==='settings'){ const b=$('#installButton'); if(b)b.classList.remove('hidden'); } });
  window.addEventListener('appinstalled',()=>{ deferredInstallPrompt=null; showToast('App geïnstalleerd! 🎉'); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(err=>console.warn('Service worker:',err)));
  }

  window.addEventListener('error',e=>console.error('SterrenRekenen fout:',e.error||e.message));

  showHome();
})();
