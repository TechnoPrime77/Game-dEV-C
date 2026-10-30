(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const content = $('#panel-content');
  const scene = $('#scene-art');
  const stamp = $('#beat-stamp');
  const labels = [
    { title: 'Ticket check', prompt: 'The checker reaches for your ticket. Let the flashlight sweep past, then move on the green beat.', caption: 'THE TICKET CHECKER HAS A VERY GOOD EAR', stamp: 'THE FLASHLIGHT SWEEPS' },
    { title: 'The lobby crossing', prompt: 'A couple turn around right as your packet settles. Catch the quiet beat between their whispers.', caption: 'SOMEONE NEARBY JUST OPENED A SODA', stamp: 'THE LOBBY LISTENS' },
    { title: 'The seat landing', prompt: 'Your row is close enough to smell the carpet. One last careful step and the chips are yours.', caption: 'YOUR SEAT. YOUR DESTINY. YOUR SNACK.', stamp: 'THE FINAL APPROACH' }
  ];
  const hideNames = ['In your socks', 'Under your hat', 'Taped to your chest'];
  const walkNames = ['Easy-going shuffle', 'Red-carpet glide', 'Nervous tiptoe'];
  const qualityCopy = [
    ['A silent, Oscar-worthy step.', 'The checker blinks. You glide past.', 'You settle in without a sound.'],
    ['A near miss. The packet gives one tiny sigh.', 'A whisper of foil. The couple keep walking.', 'The seat squeaks; the chips almost answer.'],
    ['CRRRK. The checker turns toward you.', 'The packet betrays its leading actor.', 'A full-volume crunch echoes through the lobby.']
  ];

  let moduleRef;
  let api;
  let previousFrame = 0;
  let audioContext;
  let beatTimer;

  function setupApi(mod) {
    moduleRef = mod;
    api = {
      reset: mod.cwrap('game_reset', null, []),
      start: mod.cwrap('game_start', null, []),
      chooseHide: mod.cwrap('game_choose_hide', null, ['number']),
      chooseWalk: mod.cwrap('game_choose_walk', null, ['number']),
      back: mod.cwrap('game_back', null, []),
      tick: mod.cwrap('game_tick', null, ['number']),
      act: mod.cwrap('game_act', 'number', []),
      screen: mod.cwrap('game_get_screen', 'number', []),
      ending: mod.cwrap('game_get_ending', 'number', []),
      hide: mod.cwrap('game_get_hide', 'number', []),
      walk: mod.cwrap('game_get_walk', 'number', []),
      stage: mod.cwrap('game_get_stage', 'number', []),
      lastStage: mod.cwrap('game_get_last_stage', 'number', []),
      lastQuality: mod.cwrap('game_get_last_quality', 'number', []),
      suspicion: mod.cwrap('game_get_suspicion', 'number', []),
      crinkles: mod.cwrap('game_get_crinkles', 'number', []),
      score: mod.cwrap('game_get_score', 'number', []),
      cursor: mod.cwrap('game_get_cursor', 'number', []),
      target: mod.cwrap('game_get_target', 'number', []),
      window: mod.cwrap('game_get_window', 'number', [])
    };
    $('#panel-kicker').textContent = 'A MATINÉE MISSION';
    render();
    requestAnimationFrame(frame);
  }

  /*
   * Keep the game playable when Pages serves the source tree directly (or
   * when someone opens the HTML before an Emscripten build exists). The normal
   * published workflow loads the C/WebAssembly module; this small matching
   * fallback keeps the same game rules available if that optional file is not
   * present yet.
   */
  function createFallbackModule() {
    const s = { screen: 0, ending: 0, hide: -1, walk: -1, stage: 0, lastStage: -1, lastQuality: -1, suspicion: 0, crinkles: 0, score: 0, cursor: 0, direction: 1, target: 56, window: 11 };
    const targets = [56, 38, 71];
    const reset = () => Object.assign(s, { screen: 0, ending: 0, hide: -1, walk: -1, stage: 0, lastStage: -1, lastQuality: -1, suspicion: 0, crinkles: 0, score: 0, cursor: 0, direction: 1, target: 56, window: 11 });
    const methods = {
      game_reset: reset,
      game_start: () => { if (s.screen === 0) s.screen = 1; },
      game_choose_hide: (choice) => { if (s.screen === 1 && choice >= 0 && choice <= 2) { s.hide = choice; s.screen = 2; } },
      game_choose_walk: (choice) => {
        if (s.screen !== 2 || choice < 0 || choice > 2 || s.hide < 0) return;
        const hideHeat = [5, 15, 4], walkHeat = [0, 5, 9], hideWindow = [1, -1.5, 0], walkWindow = [3, .5, -2];
        s.walk = choice; s.stage = 0; s.lastStage = -1; s.lastQuality = -1; s.ending = 0; s.score = 0;
        s.suspicion = hideHeat[s.hide] + walkHeat[choice]; s.crinkles = 0;
        s.window = Math.max(6, Math.min(15, 10 + hideWindow[s.hide] + walkWindow[choice]));
        s.target = targets[0]; s.cursor = 0; s.direction = 1; s.screen = 3;
      },
      game_back: () => { if (s.screen === 2) s.screen = 1; else if (s.screen === 3) s.screen = 2; },
      game_tick: (seconds) => {
        if (s.screen !== 3 || seconds <= 0) return;
        s.cursor += s.direction * 42 * seconds;
        if (s.cursor >= 100) { s.cursor = 100; s.direction = -1; }
        if (s.cursor <= 0) { s.cursor = 0; s.direction = 1; }
      },
      game_act: () => {
        if (s.screen !== 3 || s.stage < 0 || s.stage >= 3) return -1;
        const distance = Math.abs(s.cursor - s.target);
        let quality, heat = 0, noise = 0;
        if (distance <= s.window * .34) { quality = 0; s.score += 100; }
        else if (distance <= s.window) {
          quality = 1; heat = 4 + (s.hide === 1 ? 3 : 0);
          noise = (s.hide === 0 || s.walk === 2) ? 1 : 0; s.score += 48;
        } else {
          quality = 2;
          const hideNoise = [2, 0, 1], walkNoise = [1, 0, 2], excess = distance - s.window;
          heat = 13 + Math.trunc(excess * .42) + (s.hide === 1 ? 7 : 0);
          noise = 2 + hideNoise[s.hide] + walkNoise[s.walk]; s.score += 8;
        }
        s.suspicion = Math.min(100, s.suspicion + heat);
        s.crinkles = Math.min(10, s.crinkles + noise);
        s.lastStage = s.stage; s.lastQuality = quality;
        if (s.suspicion >= 100 || s.crinkles >= 8) { s.ending = 2; s.screen = 4; return quality; }
        s.stage++;
        if (s.stage >= 3) { s.ending = 1; s.screen = 4; }
        else { s.target = targets[s.stage]; s.cursor = s.cursor > 52 ? 100 : 0; s.direction = s.cursor > 50 ? -1 : 1; }
        return quality;
      },
      game_get_screen: () => s.screen, game_get_ending: () => s.ending,
      game_get_hide: () => s.hide, game_get_walk: () => s.walk,
      game_get_stage: () => s.stage, game_get_last_stage: () => s.lastStage,
      game_get_last_quality: () => s.lastQuality, game_get_suspicion: () => s.suspicion,
      game_get_crinkles: () => s.crinkles, game_get_score: () => s.score,
      game_get_cursor: () => s.cursor, game_get_target: () => s.target,
      game_get_window: () => s.window
    };
    return { cwrap: (name) => methods[name] };
  }

  function setupFallback() {
    $('#panel-kicker').textContent = 'A MATINÉE MISSION';
    setupApi(createFallbackModule());
  }

  function meterLabel(value, kind) {
    if (kind === 'heat') return value < 22 ? 'COOL' : value < 45 ? 'WARM' : value < 70 ? 'HOT' : 'BUSTED';
    return value < 2 ? 'SILENT' : value < 4 ? 'A LITTLE FOIL' : value < 7 ? 'LOUDER' : 'VERY LOUD';
  }

  function updateMeters() {
    if (!api) return;
    const heat = api.suspicion();
    const noise = api.crinkles();
    $('#heat-fill').style.width = `${Math.min(100, heat)}%`;
    $('#noise-fill').style.width = `${Math.min(100, noise * 12.5)}%`;
    $('#heat-label').textContent = meterLabel(heat, 'heat');
    $('#noise-label').textContent = meterLabel(noise, 'noise');
    $('#heat-label').style.color = heat >= 70 ? '#e78479' : heat >= 45 ? '#e7b779' : '#93c5b0';
    $('#noise-label').style.color = noise >= 6 ? '#e78479' : noise >= 3 ? '#e7b779' : '#93c5b0';
  }

  function render() {
    if (!api) return;
    const screen = api.screen();
    updateMeters();
    scene.dataset.hide = api.hide() < 0 ? 'none' : ['socks', 'hat', 'chest'][api.hide()];
    scene.dataset.stage = String(Math.min(api.stage(), 2));
    scene.dataset.mood = api.ending() === 2 ? 'caught' : 'calm';

    if (screen === 0) renderTitle();
    if (screen === 1) renderHide();
    if (screen === 2) renderWalk();
    if (screen === 3) renderRun();
    if (screen === 4) renderEnding();
  }

  function renderTitle() {
    $('#panel-kicker').textContent = 'A MATINÉE MISSION';
    content.innerHTML = `
      <div class="eyebrow-small">TONIGHT'S FEATURE &nbsp;·&nbsp; ONE VERY BAD IDEA</div>
      <h2 class="panel-heading">The stakes are delicious.</h2>
      <p class="panel-copy">A whole packet of local banana chips. Theater prices that should be illegal. A ticket checker who can hear a wrapper breathe.</p>
      <div class="objective-list"><div class="objective"><span>01</span> Pick a hiding spot for the packet</div><div class="objective"><span>02</span> Choose your most convincing walk</div><div class="objective"><span>03</span> Time three sneaky steps to the seat</div></div>
      <button class="primary-button" data-action="start"><span>BEGIN THE OPERATION</span><span class="button-arrow">↗</span></button>`;
    content.querySelector('[data-action="start"]').addEventListener('click', () => { sound('select'); api.start(); render(); });
  }

  function renderHide() {
    $('#panel-kicker').textContent = 'ACT I  /  THE CONCEALMENT';
    content.innerHTML = `
      <div class="step-topline"><span class="eyebrow-small">FIRST, THE PACKET</span><span class="step-counter">01 &nbsp;—&nbsp; 03</span></div>
      <h2 class="panel-heading">Where will you hide it?</h2>
      <p class="panel-copy">Every brilliant plan has one tiny, crinkly weakness.</p>
      <div class="choice-grid">
        <button class="choice-card" data-choice="0"><span class="choice-icon">◌</span><span><span class="choice-name">In your socks</span><span class="choice-description">Very hidden. Dramatically uncomfortable.</span></span><span class="choice-stat">HIGH<br>RUSTLE</span></button>
        <button class="choice-card" data-choice="1"><span class="choice-icon">♧</span><span><span class="choice-name">Under your hat</span><span class="choice-description">Quiet packet. Suspiciously tall hairstyle.</span></span><span class="choice-stat">HIGH<br>PROFILE</span></button>
        <button class="choice-card" data-choice="2"><span class="choice-icon">✦</span><span><span class="choice-name">Taped to your chest</span><span class="choice-description">A bold, crunchy second torso.</span></span><span class="choice-stat">BALANCED<br>ABSURDITY</span></button>
      </div>
      <p class="panel-copy">Pick one to move on to the walk.</p>`;
    content.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => {
      sound('select'); api.chooseHide(Number(button.dataset.choice));
      $('#screen-reader-status').textContent = `Snack hidden ${hideNames[api.hide()].toLowerCase()}. Choose how to walk.`;
      render();
    }));
  }

  function renderWalk() {
    $('#panel-kicker').textContent = 'ACT II  /  THE ENTRANCE';
    content.innerHTML = `
      <div class="step-topline"><span class="eyebrow-small">HIDING SPOT LOCKED: ${hideNames[api.hide()].toUpperCase()}</span><span class="step-counter">02 &nbsp;—&nbsp; 03</span></div>
      <h2 class="panel-heading">How do you walk in?</h2>
      <p class="panel-copy">The checker is judging your entire vibe. Give them something else to think about.</p>
      <div class="choice-grid">
        <button class="choice-card" data-choice="0"><span class="choice-icon">♧</span><span><span class="choice-name">Easy-going shuffle</span><span class="choice-description">A relaxed pace with a forgiving timing window.</span></span><span class="choice-stat">STEADY<br>AND SAFE</span></button>
        <button class="choice-card" data-choice="1"><span class="choice-icon">✧</span><span><span class="choice-name">Red-carpet glide</span><span class="choice-description">Confidence for days. A little hard to ignore.</span></span><span class="choice-stat">COOL<br>COMPOSURE</span></button>
        <button class="choice-card" data-choice="2"><span class="choice-icon">⌁</span><span><span class="choice-name">Nervous tiptoe</span><span class="choice-description">Quiet-looking. Suspiciously quiet-looking.</span></span><span class="choice-stat">TIGHT<br>WINDOW</span></button>
      </div>
      <button class="secondary-button" data-action="back">← CHANGE HIDING SPOT</button>`;
    content.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => {
      sound('select'); api.chooseWalk(Number(button.dataset.choice));
      $('#screen-reader-status').textContent = `${walkNames[api.walk()]} selected. Time your steps with Space or the button.`;
      setBeat(0); render();
    }));
    content.querySelector('[data-action="back"]').addEventListener('click', () => { api.back(); render(); });
  }

  function lastNote() {
    if (api.lastQuality() < 0) return '';
    const quality = api.lastQuality();
    const stage = api.lastStage();
    const tone = quality === 0 ? 'perfect' : quality === 2 ? 'miss' : '';
    return `<p class="last-note ${tone}">${qualityCopy[quality][stage]}</p>`;
  }

  function renderRun() {
    const stage = api.stage();
    const info = labels[stage] || labels[2];
    $('#panel-kicker').textContent = `ACT III  /  ${info.title.toUpperCase()}`;
    $('#scene-caption').innerHTML = `<span class="caption-dot"></span> ${info.caption}`;
    if (stage !== Number(scene.dataset.lastStage)) {
      setBeat(stage);
      scene.dataset.lastStage = String(stage);
    }
    const done = Math.min(stage, 3);
    const steps = Array.from({ length: 3 }, (_, i) => `<span class="stage-segment ${i < done ? 'done' : ''}"></span>`).join('');
    const target = api.target();
    const width = api.window() * 2;
    const left = Math.max(0, Math.min(100 - width, target - api.window()));
    content.innerHTML = `
      <div class="step-topline"><span class="eyebrow-small">${info.title.toUpperCase()}</span><span class="step-counter">0${stage + 1} &nbsp;—&nbsp; 03</span></div>
      <h2 class="panel-heading">${info.title}.</h2>
      <p class="panel-copy">${info.prompt}</p>
      <div class="stage-progress" aria-label="Step ${stage + 1} of 3">${steps}</div>
      ${lastNote()}
      <div class="timing-box"><div class="timing-labels"><span>TOO SOON</span><strong>THE QUIET BEAT</strong><span>TOO LATE</span></div><div class="timing-track" aria-label="Moving timing marker and safe zone"><span class="safe-window" style="left:${left}%;width:${width}%"></span><span class="cursor" id="timing-cursor" style="left:${api.cursor()}%"></span></div><div class="timing-tip"><span>✦</span><span>Press <b>SPACE</b> when the ivory needle is inside the green window.</span></div></div>
      <button class="primary-button move-button" data-action="act"><span>${stage === 0 ? 'SLIP PAST THE CHECKER' : stage === 1 ? 'CROSS THE LOBBY' : 'CLAIM YOUR SEAT'}</span><span class="button-arrow">↗</span></button>`;
    content.querySelector('[data-action="act"]').addEventListener('click', doAction);
    updateCursor();
  }

  function renderEnding() {
    const win = api.ending() === 1;
    const last = Math.max(0, api.lastStage());
    $('#panel-kicker').textContent = win ? 'A PERFECT LITTLE MATINÉE' : 'THE OPERATION HAS BEEN DISCOVERED';
    $('#scene-caption').innerHTML = `<span class="caption-dot"></span> ${win ? 'THE ROOM IS DARK. THE PLAN WAS FLAWLESS.' : 'THE PACKET IS GONE. THE STORY WILL LIVE ON.'}`;
    const bestKey = 'after-hours-snack-sneaker-best';
    try {
      const best = Number(localStorage.getItem(bestKey) || 0);
      if (win && api.score() > best) localStorage.setItem(bestKey, String(api.score()));
    } catch (_) { /* A blocked save must never interrupt the ending. */ }
    const copy = win
      ? 'You make it to your seat. The lights fade. The banana chips are yours. For the next two hours, you are untouchable.'
      : api.suspicion() >= 100
        ? 'The guard clocked your suspiciously shaped silhouette. Your chips have been taken into evidence.'
        : 'The packet crinkles like a standing ovation. Security appears. The chips are confiscated with theatrical finality.';
    content.innerHTML = `
      <div class="result-seal ${win ? '' : 'loss'}">${win ? '✦' : '×'}</div>
      <h2 class="result-title ${win ? 'win' : 'loss'}">${win ? 'Seat secured.' : 'Caught in the act.'}</h2>
      <p class="panel-copy">${copy}</p>
      <div class="result-stats"><span class="stat-chip">SCORE <b>${api.score()}</b></span><span class="stat-chip">STEPS <b>${last + 1}/3</b></span><span class="stat-chip">${win ? 'SNACKS' : 'CRINKLES'} <b>${win ? 'YOURS' : api.crinkles()}</b></span></div>
      <button class="primary-button" data-action="replay"><span>RUN IT BACK</span><span class="button-arrow">↻</span></button>`;
    content.querySelector('[data-action="replay"]').addEventListener('click', () => { sound('select'); api.reset(); scene.dataset.lastStage = ''; render(); });
  }

  function updateCursor() {
    const cursor = $('#timing-cursor');
    if (cursor && api) cursor.style.left = `${api.cursor()}%`;
  }

  function frame(timestamp) {
    if (!api) return;
    const delta = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.05) : 0;
    previousFrame = timestamp;
    if (api.screen() === 3) { api.tick(delta); updateCursor(); }
    requestAnimationFrame(frame);
  }

  function setBeat(index) {
    clearTimeout(beatTimer);
    const info = labels[index] || labels[0];
    stamp.textContent = info.stamp;
    stamp.classList.add('show');
    beatTimer = setTimeout(() => stamp.classList.remove('show'), 1450);
  }

  function doAction() {
    if (!api || api.screen() !== 3) return;
    const quality = api.act();
    if (quality < 0) return;
    sound(quality === 0 ? 'perfect' : quality === 1 ? 'close' : 'miss');
    scene.classList.remove('pulse');
    void scene.offsetWidth;
    scene.classList.add('pulse');
    $('#screen-reader-status').textContent = qualityCopy[quality][api.lastStage()];
    if (api.ending() === 2) sound('caught');
    else if (api.ending() === 1) sound('win');
    render();
  }

  function sound(kind) {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain); gain.connect(audioContext.destination);
      const notes = { select: [520, 640], perfect: [660, 880], close: [430, 310], miss: [210, 130], caught: [145, 95], win: [523, 659] }[kind] || [440, 440];
      oscillator.type = kind === 'miss' || kind === 'caught' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(notes[0], now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(55, notes[1]), now + (kind === 'select' ? .07 : .18));
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === 'select' ? .025 : .06, now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + (kind === 'win' ? .42 : .22));
      oscillator.start(now); oscillator.stop(now + .45);
    } catch (_) { /* Audio is decorative; gameplay never depends on it. */ }
  }

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || !api || api.screen() !== 3) return;
    event.preventDefault(); doAction();
  });

  const title = $('#panel-content');
  title.innerHTML = `<div class="eyebrow-small">LOADING THE FEATURE</div><h2 class="panel-heading">A moment, please.</h2><p class="panel-copy">The projector is warming up.</p>`;
  if (location.protocol === 'file:') {
    setupFallback();
  } else {
    const engineScript = document.createElement('script');
    engineScript.src = new URL('game.js', document.baseURI).href;
    engineScript.onload = () => {
      if (window.createSnackSneaker) window.createSnackSneaker().then(setupApi).catch(setupFallback);
      else setupFallback();
    };
    engineScript.onerror = setupFallback;
    document.head.appendChild(engineScript);
  }

  function showLoadError(error) {
    $('#panel-kicker').textContent = 'THE PROJECTOR ISN’T READY';
    content.innerHTML = `<div class="eyebrow-small">GAME ENGINE NOT FOUND</div><h2 class="panel-heading">Almost showtime.</h2><p class="panel-copy">The browser version needs the C game engine compiled to WebAssembly. GitHub Pages builds it automatically from the source files.</p>${error ? '<p class="last-note miss">Reload once the site build finishes.</p>' : ''}`;
  }
})();
