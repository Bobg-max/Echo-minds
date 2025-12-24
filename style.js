  // --------- Data & State ----------
  const EMOTIONS = [
    {key:'joy', label:'Joy', icon:'😂', hint:'Big smile, upbeat rhythm'},
    {key:'anger', label:'Anger', icon:'😡', hint:'Strong, sharp beats'},
    {key:'fear', label:'Fear', icon:'😱', hint:'Fast, nervous taps'},
    {key:'calm', label:'Calm', icon:'😌', hint:'Slow, smooth motions'},
    {key:'curiosity', label:'Curiosity', icon:'🤔', hint:'Tilt head, questioning beats'},
    {key:'surprise', label:'Surprise', icon:'😲', hint:'Sudden loud clap'}
  ];
  const TARGET_SCORE = 10;
  const state = {
    players: [
      {id:0, name:'Player 1', score:0},
      {id:1, name:'Player 2', score:0},
      {id:2, name:'Player 3', score:0},
      {id:3, name:'Player 4', score:0}
    ],
    round:1, pkIndex:0, secret:[], guesses:{}, timer:30, interval:null, phase:'idle'
  };

  // --------- Audio (WebAudio) ----------
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let soundEnabled = true;

  function beep(frequency=440, duration=0.12, type='sine', when=0){
    if(!soundEnabled) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = frequency;
    g.gain.value = 0;
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime + when;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    o.start(now); o.stop(now + duration + 0.02);
  }
  function countdownTick(){ beep(880,0.06,'square'); }
  function startSound(){ beep(660,0.12,'sine'); beep(880,0.08,'square',0.12); }
  function revealSound(correctCount){ if(correctCount===0) beep(220,0.28,'sawtooth'); else if(correctCount===3) { beep(880,0.14,'triangle'); beep(1320,0.12,'sine',0.12);} else beep(440,0.12,'sine'); }

  // --------- UI Helpers ----------
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  function toast(msg){ const t = $('#toast'); t.textContent = msg; t.style.display='block'; setTimeout(()=> t.style.display='none', 2000); }

  function renderScores(){
    const wrap = $('#scores'); wrap.innerHTML = '';
    state.players.forEach((p,i)=>{
      const div = document.createElement('div');
      div.className = 'score' + (i===state.pkIndex? ' pk' : '');
      div.innerHTML = `<div class="name">${p.name}</div><div class="role">${i===state.pkIndex? 'Pattern Keeper' : 'Guesser'}</div><div class="pts">${p.score}</div>`;
      wrap.appendChild(div);
    });
    $('#pkName').textContent = state.players[state.pkIndex].name;
    $('#roundNum').textContent = state.round;
  }

  function emotionChip(key){
    const e = EMOTIONS.find(x=>x.key===key); return `<span class="chip"><span class="emo">${e.icon}</span> ${e.label}</span>`;
  }

  function renderGuesses(){
    const wrap = $('#guesses'); wrap.innerHTML = '';
    state.players.forEach((p,i)=>{
      if(i===state.pkIndex) return;
      const div = document.createElement('div'); div.className = 'score';
      const g = state.guesses[p.id] || [];
      div.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center">
          <div><div class="name">${p.name}</div><div class="role">Select two emotions</div></div>
          <button class="btn alt" ${state.phase!=='guess'?'disabled':''} data-player="${p.id}">Select Guess</button>
        </div>
        <div class="player-guess" style="margin-top:10px">${g.length? g.map(emotionChip).join('') : '<span class="notice">No selection yet</span>'}</div>`;
      wrap.appendChild(div);
    });
    $$('button[data-player]').forEach(btn=> btn.onclick = ()=> openGuessModal(parseInt(btn.dataset.player)));
  }

  function renderReference(){
    const ref = $('#reference'); ref.innerHTML = '';
    EMOTIONS.forEach(e=>{ const c = document.createElement('div'); c.className='card'; c.innerHTML = `<div class="emo">${e.icon}</div><div style="font-weight:700">${e.label}</div><div class="label">${e.hint}</div>`; ref.appendChild(c); });
  }

  function setPhase(phase){
    state.phase = phase;
    $('#chooseSecretBtn').disabled = !(phase==='idle' || phase==='picking');
    $('#startEchoBtn').disabled = !(phase==='ready');
    $('#revealBtn').disabled = !(phase==='guess-ready' || phase==='guess-done');
    $('#nextRoundBtn').disabled = !(phase==='revealed');
    renderGuesses();
  }

  // --------- Secret Modal ----------
  let secretSelection = [];
  function openSecretModal(){ secretSelection = [...state.secret]; updateSecretModal(); $('#secretModal').style.display='flex'; setPhase('picking'); }
  function closeSecretModal(){ $('#secretModal').style.display='none'; }
  function updateSecretModal(){ const grid = $('#secretGrid'); grid.innerHTML = ''; EMOTIONS.forEach(e=>{ const d=document.createElement('div'); d.className='card'+(secretSelection.includes(e.key)?' selected':''); d.innerHTML=`<div class="emo">${e.icon}</div><div style="font-weight:700">${e.label}</div>`; d.onclick=()=>{ if(secretSelection.includes(e.key)) secretSelection=secretSelection.filter(k=>k!==e.key); else if(secretSelection.length<2) secretSelection.push(e.key); updateSecretModal(); }; grid.appendChild(d); }); $('#secretPicked').textContent=`${secretSelection.length} / 2 selected`; $('#lockSecretBtn').disabled = secretSelection.length!==2; }
  function clearSecret(){ secretSelection=[]; updateSecretModal(); }
  function lockSecret(){ state.secret = [...secretSelection]; closeSecretModal(); setPhase('ready'); toast('Secret locked. Start the Echo Phase!'); if(soundEnabled){ startSound(); } }

  // --------- Guess Modal ----------
  let guessSelection = []; let guessPlayerId = null;
  function openGuessModal(playerId){ guessPlayerId = playerId; guessSelection = [...(state.guesses[playerId]||[])]; updateGuessModal(); $('#guessingFor').textContent = state.players[playerId].name; $('#guessModal').style.display='flex'; }
  function closeGuessModal(){ $('#guessModal').style.display='none'; }
  function updateGuessModal(){ const grid = $('#guessGrid'); grid.innerHTML=''; EMOTIONS.forEach(e=>{ const d=document.createElement('div'); d.className='card'+(guessSelection.includes(e.key)?' selected':''); d.innerHTML=`<div class="emo">${e.icon}</div><div style="font-weight:700">${e.label}</div>`; d.onclick=()=>{ if(guessSelection.includes(e.key)) guessSelection=guessSelection.filter(k=>k!==e.key); else if(guessSelection.length<2) guessSelection.push(e.key); updateGuessModal(); }; grid.appendChild(d); }); $('#guessPicked').textContent=`${guessSelection.length} / 2 selected`; $('#saveGuessBtn').disabled = guessSelection.length!==2; }
  function clearGuess(){ guessSelection=[]; updateGuessModal(); }
  function saveGuess(){ state.guesses[guessPlayerId] = [...guessSelection]; closeGuessModal(); renderGuesses(); checkAllGuessesReady(); }

  function checkAllGuessesReady(){ const needed = state.players.filter((_,i)=> i!==state.pkIndex).length; const have = Object.keys(state.guesses).length; if(have===needed){ $('#revealBtn').disabled = false; state.phase = 'guess-done'; } }

  // --------- Timer & Echo ----------
  function updateTimerDisplay(){ const t = state.timer; const mm = String(Math.floor(t/60)).padStart(2,'0'); const ss = String(t%60).padStart(2,'0'); $('#timer').textContent = `${mm}:${ss}`; }
  function startEcho(){
    if(state.secret.length!==2){ toast('PK must lock a secret first.'); return; }
    const requested = parseInt($('#roundLen').value) || 30;
    state.timer = Math.max(10, Math.min(120, requested));
    soundEnabled = $('#soundToggle').checked;
    if(soundEnabled) audioCtx.resume().catch(()=>{}); // ensure context is running
    updateTimerDisplay(); state.phase='echo'; $('#startEchoBtn').disabled=true;
    if(soundEnabled) startSound();
    state.interval = setInterval(()=>{
      state.timer--; updateTimerDisplay();
      if(state.timer<=0){ clearInterval(state.interval); state.interval=null; toast('Echo Phase over. Submit guesses!'); state.phase='guess'; renderGuesses(); if(soundEnabled) revealSound(0); }
      else {
        // play tick in final 5 seconds
        if(state.timer<=5 && soundEnabled) countdownTick();
      }
    }, 1000);
  }

  // --------- Reveal & Scoring ----------
  function revealAndScore(){
    const guessers = state.players.filter((_,i)=> i!==state.pkIndex);
    const secretSet = new Set(state.secret);
    let correctCount = 0;
    const details = [];
    guessers.forEach(g=>{ const sel = state.guesses[g.id] || []; const ok = sel.length===2 && sel.every(k=> secretSet.has(k)); if(ok) correctCount++; details.push({player:g, sel, ok}); });
    let summary = '';
    if(correctCount===guessers.length){ details.forEach(d=> d.player.score += 2); summary = 'All guessers matched! Each gets +2.'; }
    else if(correctCount===0){ state.players[state.pkIndex].score += 2; summary = 'No one matched. Pattern Keeper +2.'; }
    else { details.filter(d=>d.ok).forEach(d=> d.player.score += 1); summary = `${correctCount} correct. Each correct +1.`; }
    let html = `<div style="margin-bottom:10px"><strong>Secret was:</strong> ${state.secret.map(emotionChip).join('')}</div>`;
    details.forEach(d=>{ html += `<div style="margin-bottom:6px">${d.player.name}: ${d.sel.length? d.sel.map(emotionChip).join('') : '<span class="notice">No guess</span>'} ${d.ok? '✅' : '❌'}</div>` });
    html += `<div style="margin-top:10px" class="tag">${summary}</div>`;
    toast('Scores updated.');
    const controlsPanel = document.querySelector('.board .panel .body');
    let res = document.getElementById('resultsInline');
    if(!res){ res = document.createElement('div'); res.id = 'resultsInline'; res.style.marginTop = '12px'; res.style.padding = '12px'; res.style.border = '1px dashed rgba(255,255,255,.15)'; res.style.borderRadius = '12px'; controlsPanel.appendChild(res); }
    res.innerHTML = html;
    renderScores(); $('#nextRoundBtn').disabled = false; setPhase('revealed');
    if(soundEnabled) revealSound(correctCount);
    const winner = state.players.find(p=> p.score >= TARGET_SCORE);
    if(winner){ showWinner(winner); }
  }

  function nextRound(){
    state.round++; state.pkIndex = (state.pkIndex + 1) % state.players.length; state.secret = []; state.guesses = {}; $('#resultsInline')?.remove(); renderScores(); renderGuesses(); updateTimerDisplay(); setPhase('idle');
  }

  function showWinner(w){ $('#winnerTitle').textContent = 'Winner!'; $('#winnerBody').innerHTML = `<div style="margin-bottom:10px">${w.name} reached ${w.score} points.</div>`; $('#winnerModal').style.display='flex'; setPhase('done'); $('#nextRoundBtn').disabled=true; $('#revealBtn').disabled=true; $('#startEchoBtn').disabled=true; $('#chooseSecretBtn').disabled=true; }

  function closeWinner(){ $('#winnerModal').style.display='none'; }

  // --------- Persistence ----------
  function save(){ localStorage.setItem('echo-minds-state', JSON.stringify({ players: state.players, round: state.round, pkIndex: state.pkIndex })); }
  function load(){ const raw = localStorage.getItem('echo-minds-state'); if(!raw) return; try{ const data = JSON.parse(raw); if(Array.isArray(data.players) && data.players.length===4){ state.players = data.players; state.round = data.round||1; state.pkIndex = data.pkIndex||0; } }catch(e){} }

  function resetGame(){ state.players.forEach(p=> p.score=0); state.round=1; state.pkIndex=0; state.secret=[]; state.guesses={}; $('#resultsInline')?.remove(); renderScores(); renderGuesses(); updateTimerDisplay(); setPhase('idle'); save(); closeWinner(); toast('Game reset.'); }

  // --------- Init & Bind ----------
  function bind(){ $('#chooseSecretBtn').onclick = openSecretModal; $('#startEchoBtn').onclick = startEcho; $('#revealBtn').onclick = revealAndScore; $('#nextRoundBtn').onclick = nextRound; $('#resetBtn').onclick = resetGame; $('#lockSecretBtn').onclick = lockSecret; window.addEventListener('beforeunload', save); $('#roundLen').onchange = ()=> { if(state.phase==='idle') { updateTimerDisplay(); } }; $('#soundToggle').onchange = ()=> { soundEnabled = $('#soundToggle').checked; toast('Sounds ' + (soundEnabled? 'enabled' : 'disabled')); if(soundEnabled) audioCtx.resume().catch(()=>{}); }; }
  function render(){ renderScores(); renderGuesses(); renderReference(); updateTimerDisplay(); setPhase('idle'); }
  function enableRename(){ $('#scores').addEventListener('click', (e)=>{ const card = e.target.closest('.score'); if(!card) return; const idx = Array.from($('#scores').children).indexOf(card); const current = state.players[idx].name; const next = prompt('Enter player name', current); if(next && next.trim()){ state.players[idx].name = next.trim(); renderScores(); } }); }

  load(); bind(); render(); enableRename();