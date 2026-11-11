(() => {
  "use strict";

  const DIFF_LABELS = {
    easy: "쉬움",
    medium: "보통",
    hard: "어려움",
    expert: "전문가",
    dc_easy: "일일(쉬움)",
    dc_medium: "일일(보통)",
    dc_hard: "일일(어려움)",
    dc_expert: "일일(전문가)"
  };

  const THEME_COLORS = {
    light: "#ffffff",
    sepia: "#f2eadb",
    dark: "#17171a"
  };

  const STORAGE_KEYS = {
    SAVED_GAME: "sudoku_pwa_saved_game_v1",
    SETTINGS: "sudoku_pwa_settings_v1",
    STATS: "sudoku_pwa_stats_v1",
    DC_COMPLETED: "sudoku_pwa_dc_completed_v1",
    THEME: "sudoku_pwa_theme_v1"
  };

  const puzzleCache = {};

  let settings = loadJSON(STORAGE_KEYS.SETTINGS, {
    sound: true,
    mistakeLimit: true,
    autoRemoveNotes: true,
    highlightSame: true,
    highlightArea: true
  });

  let stats = loadJSON(STORAGE_KEYS.STATS, {
    easy: { started: 0, won: 0, bestTime: null, totalTime: 0, currentStreak: 0, bestStreak: 0 },
    medium: { started: 0, won: 0, bestTime: null, totalTime: 0, currentStreak: 0, bestStreak: 0 },
    hard: { started: 0, won: 0, bestTime: null, totalTime: 0, currentStreak: 0, bestStreak: 0 },
    expert: { started: 0, won: 0, bestTime: null, totalTime: 0, currentStreak: 0, bestStreak: 0 }
  });

  let dcCompleted = loadJSON(STORAGE_KEYS.DC_COMPLETED, {});
  let currentTheme = localStorage.getItem(STORAGE_KEYS.THEME) || "light";

  let game = null;
  let timerInterval = null;
  let audioCtx = null;

  // 일일 챌린지 달력 상태
  const now = new Date();
  let dcViewYear = now.getFullYear();
  let dcViewMonth = now.getMonth();
  let dcSelectedDateKey = formatDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
  let activeStatsTab = "easy";

  // DOM 참조
  const el = {
    btnBackHome: document.getElementById("btn-back-home"),
    headerTitle: document.getElementById("header-title"),
    datasetBadge: document.getElementById("dataset-badge"),
    btnTheme: document.getElementById("btn-theme"),
    btnSettings: document.getElementById("btn-settings"),
    screenHome: document.getElementById("screen-home"),
    screenGame: document.getElementById("screen-game"),
    screenDc: document.getElementById("screen-dc"),
    screenStats: document.getElementById("screen-stats"),
    bottomNav: document.getElementById("bottom-nav"),
    homeDcDate: document.getElementById("home-dc-date"),
    homeDcStatus: document.getElementById("home-dc-status"),
    btnPlayTodayDc: document.getElementById("btn-play-today-dc"),
    btnContinueGame: document.getElementById("btn-continue-game"),
    continueMeta: document.getElementById("continue-meta"),
    btnOpenNewGame: document.getElementById("btn-open-new-game"),
    infoDifficulty: document.getElementById("info-difficulty"),
    infoMistakes: document.getElementById("info-mistakes"),
    infoScore: document.getElementById("info-score"),
    infoTimer: document.getElementById("info-timer"),
    btnPause: document.getElementById("btn-pause"),
    board: document.getElementById("sudoku-board"),
    pauseOverlay: document.getElementById("pause-overlay"),
    btnResume: document.getElementById("btn-resume"),
    btnUndo: document.getElementById("btn-undo"),
    btnErase: document.getElementById("btn-erase"),
    btnNotes: document.getElementById("btn-notes"),
    notesBadge: document.getElementById("notes-badge"),
    btnFastMode: document.getElementById("btn-fast-mode"),
    fastBadge: document.getElementById("fast-badge"),
    btnHint: document.getElementById("btn-hint"),
    numpad: document.getElementById("numpad"),
    dcPrevMonth: document.getElementById("dc-prev-month"),
    dcNextMonth: document.getElementById("dc-next-month"),
    dcMonthTitle: document.getElementById("dc-month-title"),
    dcCalendarGrid: document.getElementById("dc-calendar-grid"),
    dcProgressText: document.getElementById("dc-progress-text"),
    btnStartSelectedDc: document.getElementById("btn-start-selected-dc"),
    statsTabs: document.getElementById("stats-tabs"),
    statsContent: document.getElementById("stats-content"),
    btnResetStats: document.getElementById("btn-reset-stats"),
    modalNewGame: document.getElementById("modal-new-game"),
    btnCloseNewGame: document.getElementById("btn-close-new-game"),
    inputPuzzleIndex: document.getElementById("input-puzzle-index"),
    modalSettings: document.getElementById("modal-settings"),
    btnCloseSettings: document.getElementById("btn-close-settings"),
    setSound: document.getElementById("set-sound"),
    setMistakeLimit: document.getElementById("set-mistake-limit"),
    setAutoRemoveNotes: document.getElementById("set-auto-remove-notes"),
    setHighlightSame: document.getElementById("set-highlight-same"),
    setHighlightArea: document.getElementById("set-highlight-area"),
    modalResult: document.getElementById("modal-result"),
    resultTitle: document.getElementById("result-title"),
    resultSubtitle: document.getElementById("result-subtitle"),
    resultStats: document.getElementById("result-stats"),
    btnSecondChance: document.getElementById("btn-second-chance"),
    btnResultNew: document.getElementById("btn-result-new"),
    btnResultHome: document.getElementById("btn-result-home")
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage quota ignore
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function formatDateKey(y, m, d) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function triggerHaptic(type) {
    if (!navigator.vibrate) return;
    try {
      if (type === "tap") navigator.vibrate(10);
      else if (type === "value") navigator.vibrate(18);
      else if (type === "note") navigator.vibrate(12);
      else if (type === "error") navigator.vibrate([35, 40, 35]);
      else if (type === "win") navigator.vibrate([20, 40, 30, 40, 50]);
    } catch {
      // ignore
    }
  }

  // Web Audio 효과음 (iOS Safari 호환) + 햅틱 연동
  function playTone(type) {
    triggerHaptic(type);
    if (!settings.sound) return;
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const t = audioCtx.currentTime;

      if (type === "tap") {
        osc.frequency.setValueAtTime(520, t);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
      } else if (type === "value") {
        osc.frequency.setValueAtTime(660, t);
        gain.gain.setValueAtTime(0.07, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.start(t);
        osc.stop(t + 0.07);
      } else if (type === "note") {
        osc.frequency.setValueAtTime(820, t);
        gain.gain.setValueAtTime(0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.start(t);
        osc.stop(t + 0.04);
      } else if (type === "error") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(190, t);
        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t);
        osc.stop(t + 0.18);
      } else if (type === "win") {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g);
          g.connect(audioCtx.destination);
          o.frequency.setValueAtTime(freq, t + i * 0.08);
          g.gain.setValueAtTime(0.07, t + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
          o.start(t + i * 0.08);
          o.stop(t + i * 0.08 + 0.2);
        });
      }
    } catch {
      // ignore audio context restrictions
    }
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    const color = THEME_COLORS[theme] || "#ffffff";
    const metaLight = document.getElementById("meta-theme-light");
    const metaDark = document.getElementById("meta-theme-dark");
    if (metaLight) metaLight.setAttribute("content", color);
    if (metaDark) metaDark.setAttribute("content", color);
  }

  async function loadDataset(name) {
    if (puzzleCache[name]) return puzzleCache[name];
    const res = await fetch(`./data/${name}.json`);
    if (!res.ok) throw new Error(`데이터 로드 실패: ${name}`);
    const data = await res.json();
    puzzleCache[name] = data;
    return data;
  }

  // 초기 보드 DOM 생성
  function initBoardDOM() {
    el.board.innerHTML = "";
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sudoku-cell";
      cell.dataset.index = String(i);
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.setAttribute("role", "gridcell");
      cell.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onCellTap(i);
      });
      el.board.appendChild(cell);
    }

    el.numpad.innerHTML = "";
    for (let d = 1; d <= 9; d++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "num-btn";
      btn.dataset.digit = String(d);
      btn.innerHTML = `<span class="num-digit">${d}</span><span class="num-remain" id="remain-${d}">9</span>`;

      let holdTimer = null;
      let didHold = false;

      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        didHold = false;
        holdTimer = setTimeout(() => {
          didHold = true;
          toggleDigitLock(d);
        }, 360);
      });

      btn.addEventListener("pointerup", (e) => {
        e.preventDefault();
        if (holdTimer) clearTimeout(holdTimer);
        if (!didHold) {
          onDigitTap(d);
        }
      });

      btn.addEventListener("pointercancel", () => {
        if (holdTimer) clearTimeout(holdTimer);
      });

      el.numpad.appendChild(btn);
    }
  }

  function toggleDigitLock(digit) {
    if (!game || game.paused) return;
    triggerHaptic("value");
    if (game.fastMode && game.lockedDigit === digit) {
      game.fastMode = false;
      game.lockedDigit = null;
    } else {
      game.fastMode = true;
      game.lockedDigit = digit;
    }
    renderGame();
  }

  async function startNewGame(datasetName, specificIndex1Based = null, dcDateKey = null) {
    const list = await loadDataset(datasetName);
    let chosenIdx = 0;
    if (specificIndex1Based !== null && specificIndex1Based >= 1 && specificIndex1Based <= list.length) {
      chosenIdx = specificIndex1Based - 1;
    } else {
      chosenIdx = Math.floor(Math.random() * list.length);
    }

    const entry = list[chosenIdx];
    // entry 포맷: [initial81, solution81, originalId, subscore, featured]
    const initialStr = entry[0];
    const solutionStr = entry[1];
    const originalId = entry[2];

    const given = [];
    const values = [];
    const solution = [];
    const notes = [];

    for (let i = 0; i < 81; i++) {
      const g = Number(initialStr[i]);
      const s = Number(solutionStr[i]);
      given.push(g !== 0);
      values.push(g);
      solution.push(s);
      notes.push([]);
    }

    game = {
      datasetName,
      datasetIndex: chosenIdx + 1,
      originalId,
      dcDateKey,
      given,
      values,
      solution,
      notes,
      mistakes: 0,
      score: 0,
      elapsed: 0,
      selectedCell: findFirstEmptyCell(values),
      notesMode: false,
      fastMode: false,
      lockedDigit: null,
      paused: false,
      history: []
    };

    const baseDiff = datasetName.replace(/^dc_/, "");
    if (stats[baseDiff]) {
      stats[baseDiff].started += 1;
      saveJSON(STORAGE_KEYS.STATS, stats);
    }

    saveCurrentGame();
    showScreen("game");
    renderGame();
    startTimer();
  }

  function findFirstEmptyCell(values) {
    const idx = values.findIndex((v) => v === 0);
    return idx >= 0 ? idx : 0;
  }

  function saveCurrentGame() {
    if (!game) {
      localStorage.removeItem(STORAGE_KEYS.SAVED_GAME);
    } else {
      saveJSON(STORAGE_KEYS.SAVED_GAME, game);
    }
    updateHomeContinueButton();
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      if (!game || game.paused) return;
      game.elapsed += 1;
      el.infoTimer.textContent = formatTime(game.elapsed);
      if (game.elapsed % 5 === 0) {
        saveJSON(STORAGE_KEYS.SAVED_GAME, game);
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function pushHistory() {
    if (!game) return;
    game.history.push({
      values: [...game.values],
      notes: game.notes.map((n) => [...n]),
      score: game.score
    });
    if (game.history.length > 60) {
      game.history.shift();
    }
  }

  function onCellTap(index) {
    if (!game || game.paused) return;
    game.selectedCell = index;

    if (game.fastMode && game.lockedDigit) {
      applyDigitToCell(index, game.lockedDigit);
    } else {
      playTone("tap");
      renderGame();
    }
  }

  function onDigitTap(digit) {
    if (!game || game.paused) return;
    if (game.fastMode) {
      game.lockedDigit = game.lockedDigit === digit ? null : digit;
      playTone("tap");
      renderGame();
      return;
    }
    if (game.selectedCell === null || game.selectedCell < 0) return;
    applyDigitToCell(game.selectedCell, digit);
  }

  function applyDigitToCell(cellIdx, digit) {
    if (game.given[cellIdx]) return;
    // 이미 정답이 입력된 셀은 수정하지 않음
    if (game.values[cellIdx] === game.solution[cellIdx]) return;

    pushHistory();

    if (game.notesMode) {
      game.values[cellIdx] = 0;
      const arr = game.notes[cellIdx];
      const pos = arr.indexOf(digit);
      if (pos >= 0) {
        arr.splice(pos, 1);
      } else {
        arr.push(digit);
        arr.sort((a, b) => a - b);
      }
      playTone("note");
      saveCurrentGame();
      renderGame();
      return;
    }

    // 일반 숫자 입력
    if (game.values[cellIdx] === digit) {
      game.values[cellIdx] = 0;
      playTone("tap");
      saveCurrentGame();
      renderGame();
      return;
    }

    game.values[cellIdx] = digit;
    game.notes[cellIdx] = [];

    if (digit === game.solution[cellIdx]) {
      playTone("value");
      game.score += 15;
      if (settings.autoRemoveNotes) {
        removePeerNotes(cellIdx, digit);
      }
      saveCurrentGame();
      renderGame();
      checkWinCondition();
    } else {
      playTone("error");
      game.mistakes += 1;
      saveCurrentGame();
      renderGame();
      if (settings.mistakeLimit && game.mistakes >= 3) {
        onGameOver();
      }
    }
  }

  function removePeerNotes(cellIdx, digit) {
    const r = Math.floor(cellIdx / 9);
    const c = cellIdx % 9;
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;

    for (let i = 0; i < 81; i++) {
      const ir = Math.floor(i / 9);
      const ic = i % 9;
      if (ir === r || ic === c || (ir >= br && ir < br + 3 && ic >= bc && ic < bc + 3)) {
        const pos = game.notes[i].indexOf(digit);
        if (pos >= 0) game.notes[i].splice(pos, 1);
      }
    }
  }

  function onUndo() {
    if (!game || game.paused || game.history.length === 0) return;
    const prev = game.history.pop();
    game.values = prev.values;
    game.notes = prev.notes;
    game.score = prev.score;
    playTone("tap");
    saveCurrentGame();
    renderGame();
  }

  function onErase() {
    if (!game || game.paused || game.selectedCell === null) return;
    const idx = game.selectedCell;
    if (game.given[idx]) return;
    if (game.values[idx] === game.solution[idx]) return;
    if (game.values[idx] === 0 && game.notes[idx].length === 0) return;

    pushHistory();
    game.values[idx] = 0;
    game.notes[idx] = [];
    playTone("tap");
    saveCurrentGame();
    renderGame();
  }

  function onHint() {
    if (!game || game.paused) return;
    let idx = game.selectedCell;
    if (idx === null || game.values[idx] === game.solution[idx]) {
      idx = game.values.findIndex((v, i) => v !== game.solution[i]);
      if (idx < 0) return;
      game.selectedCell = idx;
    }

    pushHistory();
    const ans = game.solution[idx];
    game.values[idx] = ans;
    game.notes[idx] = [];
    if (settings.autoRemoveNotes) {
      removePeerNotes(idx, ans);
    }
    playTone("value");
    saveCurrentGame();
    renderGame();
    checkWinCondition();
  }

  function checkWinCondition() {
    if (!game) return;
    for (let i = 0; i < 81; i++) {
      if (game.values[i] !== game.solution[i]) return;
    }

    stopTimer();
    playTone("win");

    const baseDiff = game.datasetName.replace(/^dc_/, "");
    if (stats[baseDiff]) {
      const st = stats[baseDiff];
      st.won += 1;
      st.totalTime += game.elapsed;
      st.currentStreak += 1;
      if (st.currentStreak > st.bestStreak) st.bestStreak = st.currentStreak;
      if (st.bestTime === null || game.elapsed < st.bestTime) {
        st.bestTime = game.elapsed;
      }
      saveJSON(STORAGE_KEYS.STATS, stats);
    }

    if (game.dcDateKey) {
      dcCompleted[game.dcDateKey] = {
        time: game.elapsed,
        dataset: game.datasetName,
        originalId: game.originalId
      };
      saveJSON(STORAGE_KEYS.DC_COMPLETED, dcCompleted);
    }

    const finishedGame = game;
    game = null;
    saveCurrentGame();

    el.resultTitle.textContent = "퍼즐 완료";
    el.resultSubtitle.textContent = `${DIFF_LABELS[finishedGame.datasetName]} #${finishedGame.datasetIndex}`;
    el.resultStats.innerHTML = `
      <div class="result-stat-row"><span>소요 시간</span><strong>${formatTime(finishedGame.elapsed)}</strong></div>
      <div class="result-stat-row"><span>실수 횟수</span><strong>${finishedGame.mistakes}회</strong></div>
      <div class="result-stat-row"><span>최종 점수</span><strong>${finishedGame.score}점</strong></div>
    `;
    el.btnSecondChance.hidden = true;
    el.modalResult.hidden = false;
  }

  function onGameOver() {
    stopTimer();
    const baseDiff = game.datasetName.replace(/^dc_/, "");
    if (stats[baseDiff]) {
      stats[baseDiff].currentStreak = 0;
      saveJSON(STORAGE_KEYS.STATS, stats);
    }

    el.resultTitle.textContent = "게임 오버";
    el.resultSubtitle.textContent = "실수 3회를 초과했습니다.";
    el.resultStats.innerHTML = `
      <div class="result-stat-row"><span>진행 시간</span><strong>${formatTime(game.elapsed)}</strong></div>
      <div class="result-stat-row"><span>난이도</span><strong>${DIFF_LABELS[game.datasetName]} #${game.datasetIndex}</strong></div>
    `;
    el.btnSecondChance.hidden = false;
    el.modalResult.hidden = false;
  }

  function renderGame() {
    if (!game) return;

    el.infoDifficulty.textContent = DIFF_LABELS[game.datasetName] || "";
    el.infoMistakes.textContent = settings.mistakeLimit ? `${game.mistakes}/3` : `${game.mistakes}`;
    if (el.infoScore) el.infoScore.textContent = String(game.score);
    el.infoTimer.textContent = formatTime(game.elapsed);

    el.btnNotes.classList.toggle("is-active", game.notesMode);
    el.notesBadge.textContent = game.notesMode ? "ON" : "OFF";

    if (el.btnFastMode) {
      el.btnFastMode.classList.toggle("is-active", game.fastMode);
      if (el.fastBadge) el.fastBadge.textContent = game.fastMode ? "ON" : "OFF";
    }

    el.pauseOverlay.hidden = !game.paused;

    const selIdx = game.selectedCell;
    const selRow = selIdx !== null ? Math.floor(selIdx / 9) : -1;
    const selCol = selIdx !== null ? selIdx % 9 : -1;
    const selBoxR = selRow >= 0 ? Math.floor(selRow / 3) * 3 : -1;
    const selBoxC = selCol >= 0 ? Math.floor(selCol / 3) * 3 : -1;
    const activeDigit = game.fastMode && game.lockedDigit
      ? game.lockedDigit
      : (selIdx !== null && game.values[selIdx] !== 0 ? game.values[selIdx] : null);

    const digitCounts = Array(10).fill(0);
    for (let i = 0; i < 81; i++) {
      if (game.values[i] !== 0 && game.values[i] === game.solution[i]) {
        digitCounts[game.values[i]] += 1;
      }
    }

    const cells = el.board.children;
    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const r = Math.floor(i / 9);
      const c = i % 9;
      const val = game.values[i];
      const isGiven = game.given[i];
      const isSelected = i === selIdx;
      const inArea = settings.highlightArea && selIdx !== null && (
        r === selRow || c === selCol || (r >= selBoxR && r < selBoxR + 3 && c >= selBoxC && c < selBoxC + 3)
      );
      const isSame = settings.highlightSame && activeDigit !== null && val === activeDigit;
      const isError = val !== 0 && val !== game.solution[i];

      cell.className = "sudoku-cell";
      if (isGiven) cell.classList.add("is-given");
      else if (val !== 0) cell.classList.add("is-user");

      if (inArea) cell.classList.add("is-area");
      if (isSame) cell.classList.add("is-same");
      if (isSelected) cell.classList.add("is-selected");
      if (isError) cell.classList.add("is-error");

      if (game.paused) {
        cell.innerHTML = "";
      } else if (val !== 0) {
        cell.textContent = String(val);
      } else if (game.notes[i].length > 0) {
        let notesHtml = `<div class="notes-grid">`;
        for (let n = 1; n <= 9; n++) {
          const has = game.notes[i].includes(n);
          const hl = settings.highlightSame && activeDigit === n ? " is-highlight" : "";
          notesHtml += `<span class="note-item${hl}">${has ? n : ""}</span>`;
        }
        notesHtml += `</div>`;
        cell.innerHTML = notesHtml;
      } else {
        cell.innerHTML = "";
      }
    }

    const numBtns = el.numpad.children;
    for (let d = 1; d <= 9; d++) {
      const btn = numBtns[d - 1];
      const remain = Math.max(0, 9 - digitCounts[d]);
      const remainEl = document.getElementById(`remain-${d}`);
      if (remainEl) remainEl.textContent = String(remain);
      btn.classList.toggle("is-completed", remain === 0);
      btn.classList.toggle("is-locked", game.fastMode && game.lockedDigit === d);
    }
  }

  // 화면 전환
  function showScreen(name) {
    el.screenHome.hidden = name !== "home";
    el.screenGame.hidden = name !== "game";
    el.screenDc.hidden = name !== "dc";
    el.screenStats.hidden = name !== "stats";

    el.bottomNav.hidden = name === "game";
    el.btnBackHome.hidden = name !== "game";

    if (name === "game") {
      el.headerTitle.textContent = "스도쿠 플레이";
    } else if (name === "dc") {
      el.headerTitle.textContent = "일일 챌린지";
      renderDcCalendar();
    } else if (name === "stats") {
      el.headerTitle.textContent = "통계";
      renderStats();
    } else {
      el.headerTitle.textContent = "스도쿠";
      stopTimer();
      updateHomeContinueButton();
    }

    Array.from(el.bottomNav.querySelectorAll(".nav-item")).forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.target === name);
    });
  }

  function updateHomeContinueButton() {
    const saved = loadJSON(STORAGE_KEYS.SAVED_GAME, null);
    if (saved && saved.values) {
      game = saved;
      el.btnContinueGame.hidden = false;
      el.continueMeta.textContent = `${DIFF_LABELS[saved.datasetName]} #${saved.datasetIndex} (ID:${saved.originalId}) · ${formatTime(saved.elapsed)}`;
    } else {
      el.btnContinueGame.hidden = true;
    }

    const todayKey = formatDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
    el.homeDcDate.textContent = `${now.getMonth() + 1}월 ${now.getDate()}일`;
    if (dcCompleted[todayKey]) {
      el.homeDcStatus.textContent = `오늘의 챌린지 완료 (${formatTime(dcCompleted[todayKey].time)})`;
    } else {
      el.homeDcStatus.textContent = "오늘의 원본 일일 퍼즐 도전 가능";
    }
  }

  // 일일 챌린지 달력 렌더링
  function renderDcCalendar() {
    el.dcMonthTitle.textContent = `${dcViewYear}년 ${dcViewMonth + 1}월`;
    el.dcCalendarGrid.innerHTML = "";

    const firstDay = new Date(dcViewYear, dcViewMonth, 1).getDay();
    const daysInMonth = new Date(dcViewYear, dcViewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement("div");
      empty.className = "dc-day is-empty";
      el.dcCalendarGrid.appendChild(empty);
    }

    let monthCompleted = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = formatDateKey(dcViewYear, dcViewMonth + 1, d);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dc-day";
      btn.textContent = String(d);
      if (dcCompleted[key]) {
        btn.classList.add("is-completed");
        monthCompleted += 1;
      }
      if (key === dcSelectedDateKey) {
        btn.classList.add("is-selected");
      }
      btn.addEventListener("click", () => {
        dcSelectedDateKey = key;
        renderDcCalendar();
      });
      el.dcCalendarGrid.appendChild(btn);
    }

    el.dcProgressText.textContent = `이달의 완료: ${monthCompleted} / ${daysInMonth}일`;
  }

  function startDailyChallengeForDateKey(dateKey) {
    const parts = dateKey.split("-").map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    const startOfYear = new Date(parts[0], 0, 0);
    const dayOfYear = Math.max(1, Math.min(365, Math.floor((dt - startOfYear) / 86400000)));
    const dcSets = ["dc_easy", "dc_medium", "dc_hard", "dc_expert"];
    const ds = dcSets[(parts[2] + parts[1]) % dcSets.length];
    startNewGame(ds, dayOfYear, dateKey);
  }

  // 통계 렌더링
  function renderStats() {
    const s = stats[activeStatsTab] || { started: 0, won: 0, bestTime: null, totalTime: 0, currentStreak: 0, bestStreak: 0 };
    const winRate = s.started > 0 ? Math.round((s.won / s.started) * 100) : 0;
    const avgTime = s.won > 0 ? Math.round(s.totalTime / s.won) : null;

    el.statsContent.innerHTML = `
      <div class="stat-card"><span class="stat-label">시작한 게임</span><span class="stat-val">${s.started}</span></div>
      <div class="stat-card"><span class="stat-label">완료한 게임</span><span class="stat-val">${s.won}</span></div>
      <div class="stat-card"><span class="stat-label">승률</span><span class="stat-val">${winRate}%</span></div>
      <div class="stat-card"><span class="stat-label">최고 기록</span><span class="stat-val">${s.bestTime !== null ? formatTime(s.bestTime) : "-"}</span></div>
      <div class="stat-card"><span class="stat-label">평균 시간</span><span class="stat-val">${avgTime !== null ? formatTime(avgTime) : "-"}</span></div>
      <div class="stat-card"><span class="stat-label">현재 / 최고 연승</span><span class="stat-val">${s.currentStreak} / ${s.bestStreak}</span></div>
    `;
  }

  // 이벤트 바인딩
  function bindEvents() {
    el.btnTheme.addEventListener("click", () => {
      const order = ["light", "sepia", "dark"];
      const next = order[(order.indexOf(currentTheme) + 1) % order.length];
      applyTheme(next);
    });

    el.btnBackHome.addEventListener("click", () => {
      showScreen("home");
    });

    el.btnSettings.addEventListener("click", () => {
      el.setSound.checked = settings.sound;
      el.setMistakeLimit.checked = settings.mistakeLimit;
      el.setAutoRemoveNotes.checked = settings.autoRemoveNotes;
      el.setHighlightSame.checked = settings.highlightSame;
      el.setHighlightArea.checked = settings.highlightArea;
      el.modalSettings.hidden = false;
    });

    el.btnCloseSettings.addEventListener("click", () => {
      el.modalSettings.hidden = true;
    });

    [el.setSound, el.setMistakeLimit, el.setAutoRemoveNotes, el.setHighlightSame, el.setHighlightArea].forEach((input) => {
      input.addEventListener("change", () => {
        settings = {
          sound: el.setSound.checked,
          mistakeLimit: el.setMistakeLimit.checked,
          autoRemoveNotes: el.setAutoRemoveNotes.checked,
          highlightSame: el.setHighlightSame.checked,
          highlightArea: el.setHighlightArea.checked
        };
        saveJSON(STORAGE_KEYS.SETTINGS, settings);
        if (game) renderGame();
      });
    });

    el.btnOpenNewGame.addEventListener("click", () => {
      el.inputPuzzleIndex.value = "";
      el.modalNewGame.hidden = false;
    });

    el.btnCloseNewGame.addEventListener("click", () => {
      el.modalNewGame.hidden = true;
    });

    Array.from(el.modalNewGame.querySelectorAll(".sheet-option")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const diff = btn.dataset.diff;
        const customIdx = parseInt(el.inputPuzzleIndex.value, 10);
        el.modalNewGame.hidden = true;
        startNewGame(diff, Number.isFinite(customIdx) ? customIdx : null);
      });
    });

    el.btnContinueGame.addEventListener("click", () => {
      if (!game) return;
      game.paused = false;
      showScreen("game");
      renderGame();
      startTimer();
    });

    el.btnPlayTodayDc.addEventListener("click", () => {
      const todayKey = formatDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
      startDailyChallengeForDateKey(todayKey);
    });

    el.btnPause.addEventListener("click", () => {
      if (!game) return;
      game.paused = !game.paused;
      renderGame();
    });

    el.btnResume.addEventListener("click", () => {
      if (!game) return;
      game.paused = false;
      renderGame();
    });

    el.btnUndo.addEventListener("click", onUndo);
    el.btnErase.addEventListener("click", onErase);
    el.btnNotes.addEventListener("click", () => {
      if (!game || game.paused) return;
      game.notesMode = !game.notesMode;
      playTone("tap");
      renderGame();
    });
    if (el.btnFastMode) {
      el.btnFastMode.addEventListener("click", () => {
        if (!game || game.paused) return;
        game.fastMode = !game.fastMode;
        if (game.fastMode && !game.lockedDigit) {
          game.lockedDigit = 1;
        } else if (!game.fastMode) {
          game.lockedDigit = null;
        }
        playTone("tap");
        renderGame();
      });
    }
    el.btnHint.addEventListener("click", onHint);

    Array.from(el.bottomNav.querySelectorAll(".nav-item")).forEach((btn) => {
      btn.addEventListener("click", () => {
        showScreen(btn.dataset.target);
      });
    });

    el.dcPrevMonth.addEventListener("click", () => {
      dcViewMonth -= 1;
      if (dcViewMonth < 0) {
        dcViewMonth = 11;
        dcViewYear -= 1;
      }
      renderDcCalendar();
    });

    el.dcNextMonth.addEventListener("click", () => {
      dcViewMonth += 1;
      if (dcViewMonth > 11) {
        dcViewMonth = 0;
        dcViewYear += 1;
      }
      renderDcCalendar();
    });

    el.btnStartSelectedDc.addEventListener("click", () => {
      startDailyChallengeForDateKey(dcSelectedDateKey);
    });

    Array.from(el.statsTabs.querySelectorAll(".stats-tab")).forEach((tab) => {
      tab.addEventListener("click", () => {
        activeStatsTab = tab.dataset.diff;
        Array.from(el.statsTabs.querySelectorAll(".stats-tab")).forEach((t) => {
          t.classList.toggle("active", t === tab);
        });
        renderStats();
      });
    });

    el.btnResetStats.addEventListener("click", () => {
      stats = {
        easy: { started: 0, won: 0, bestTime: null, totalTime: 0, currentStreak: 0, bestStreak: 0 },
        medium: { started: 0, won: 0, bestTime: null, totalTime: 0, currentStreak: 0, bestStreak: 0 },
        hard: { started: 0, won: 0, bestTime: null, totalTime: 0, currentStreak: 0, bestStreak: 0 },
        expert: { started: 0, won: 0, bestTime: null, totalTime: 0, currentStreak: 0, bestStreak: 0 }
      };
      saveJSON(STORAGE_KEYS.STATS, stats);
      renderStats();
    });

    // 모달 backdrop 클릭 시 닫기
    [el.modalNewGame, el.modalSettings].forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) backdrop.hidden = true;
      });
    });

    // 키보드 Escape 키 닫기 (접근성)
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        el.modalNewGame.hidden = true;
        el.modalSettings.hidden = true;
        if (game && !el.pauseOverlay.hidden) {
          game.paused = false;
          renderGame();
          startTimer();
        }
      }
    });

    // 바텀 시트 스와이프 다운 닫기 제스처 (애플 디자인)
    function attachSwipeDown(modalBackdrop) {
      const sheet = modalBackdrop.querySelector(".bottom-sheet");
      if (!sheet) return;
      let startY = 0;
      let currentY = 0;
      let tracking = false;

      sheet.addEventListener("touchstart", (e) => {
        if (sheet.scrollTop > 5) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        tracking = true;
      }, { passive: true });

      sheet.addEventListener("touchmove", (e) => {
        if (!tracking) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
          sheet.style.transform = `translateY(${diff}px)`;
        }
      }, { passive: true });

      sheet.addEventListener("touchend", () => {
        if (!tracking) return;
        tracking = false;
        const diff = currentY - startY;
        if (diff > 75) {
          sheet.style.transition = "transform 140ms ease-out";
          sheet.style.transform = "translateY(100%)";
          setTimeout(() => {
            modalBackdrop.hidden = true;
            sheet.style.transform = "";
            sheet.style.transition = "";
          }, 140);
        } else {
          sheet.style.transition = "transform 140ms ease-out";
          sheet.style.transform = "translateY(0)";
          setTimeout(() => {
            sheet.style.transform = "";
            sheet.style.transition = "";
          }, 140);
        }
      }, { passive: true });
    }

    attachSwipeDown(el.modalNewGame);
    attachSwipeDown(el.modalSettings);

    el.btnSecondChance.addEventListener("click", () => {
      if (!game) return;
      game.mistakes = 2;
      el.modalResult.hidden = true;
      saveCurrentGame();
      renderGame();
      startTimer();
    });

    el.btnResultNew.addEventListener("click", () => {
      el.modalResult.hidden = true;
      el.modalNewGame.hidden = false;
    });

    el.btnResultHome.addEventListener("click", () => {
      el.modalResult.hidden = true;
      showScreen("home");
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && game && !game.paused) {
        game.paused = true;
        saveCurrentGame();
        renderGame();
      }
    });
  }

  // 서비스 워커 등록
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  applyTheme(currentTheme);
  initBoardDOM();
  bindEvents();
  updateHomeContinueButton();
})();
