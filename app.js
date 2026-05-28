// ── Constants ──────────────────────────────────────────────
const COLORS = ['#FF453A','#FF9F0A','#FFD60A','#32D74B','#5AC8FA','#0A84FF','#5E5CE6','#BF5AF2','#FF375F','#63E6BE'];
const COLOR_NAMES = ['Rood','Oranje','Geel','Groen','Lichtblauw','Blauw','Indigo','Paars','Roze','Munt'];
const EMOJIS = ['🏃','💪','🧘','📚','✍️','🎯','💧','🥗','😴','🧠','🎨','🎵','🌿','☀️','🧹','🏊','🚴','🧗','🫁','❤️','🦷','🐾','🌱','🧪','💊','🍎','🧴','📝','🎮','🙏'];
const FREQ_LABELS = { daily: 'Dagelijks', weekdays: 'Werkdagen', weekends: 'Weekends', custom: 'Aangepast' };
const DAY_SHORT = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
const DAY_LONG  = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
const MONTH_NAMES = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
const MOTIVATIONS = [
  'Je doet het geweldig! Blijf volhouden.',
  'Elke dag telt. Jij bent op de goede weg!',
  'Consistentie is de sleutel tot succes.',
  'Kleine stappen leiden tot grote veranderingen.',
  'Jij bent sterker dan je denkt!'
];

// ── Router State ───────────────────────────────────────────
const router = { tab: 'today', modal: null, selectedHabitId: null, calMonth: null };

// ── Store ──────────────────────────────────────────────────
function getStore() {
  try {
    const raw = localStorage.getItem('ht_store');
    if (!raw) return defaultStore();
    const data = JSON.parse(raw);
    return migrate(data);
  } catch { return defaultStore(); }
}

function defaultStore() {
  return { version: 2, habits: [], completions: {}, settings: { theme: 'system', installBannerDismissed: false } };
}

function migrate(data) {
  if (!data.version) data.version = 1;
  if (data.version < 2) {
    if (!data.settings) data.settings = {};
    if (data.settings.installBannerDismissed === undefined) data.settings.installBannerDismissed = false;
    data.version = 2;
  }
  if (!data.completions) data.completions = {};
  if (!data.habits) data.habits = [];
  return data;
}

function saveStore(data) {
  try { localStorage.setItem('ht_store', JSON.stringify(data)); } catch {}
}

// ── Date Helpers ───────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateStr_(d);
}

function dateStr_(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDate(s) {
  return new Date(s + 'T00:00:00');
}

function dayOfWeek(s) { return parseDate(s).getDay(); }

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
}

// ── Data Helpers ───────────────────────────────────────────
function isHabitDue(habit, dateS) {
  const dow = dayOfWeek(dateS);
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekdays') return dow >= 1 && dow <= 5;
  if (habit.frequency === 'weekends') return dow === 0 || dow === 6;
  if (habit.frequency === 'custom') return (habit.customDays || []).includes(dow);
  return true;
}

function getCount(store, habitId, dateS) {
  return store.completions[`${dateS}__${habitId}`] || 0;
}

function isDone(store, habitId, dateS) {
  const h = store.habits.find(h => h.id === habitId);
  if (!h) return false;
  return getCount(store, habitId, dateS) >= (h.targetCount || 1);
}

function getStreakForHabit(store, habitId) {
  const h = store.habits.find(h => h.id === habitId);
  if (!h) return 0;
  let streak = 0;
  let d = todayStr();
  // If not done today yet, start checking from yesterday
  if (!isDone(store, habitId, d) || !isHabitDue(h, d)) {
    d = addDays(d, -1);
  }
  for (let i = 0; i < 365; i++) {
    if (!isHabitDue(h, d)) { d = addDays(d, -1); continue; }
    if (!isDone(store, habitId, d)) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

function getLongestStreak(store, habitId) {
  const h = store.habits.find(h => h.id === habitId);
  if (!h) return 0;
  let longest = 0, current = 0;
  const created = h.createdAt || '2020-01-01';
  let d = todayStr();
  for (let i = 0; i < 730; i++) {
    if (d < created) break;
    if (isHabitDue(h, d)) {
      if (isDone(store, habitId, d)) { current++; longest = Math.max(longest, current); }
      else current = 0;
    }
    d = addDays(d, -1);
  }
  return longest;
}

function getCompletionRate(store, habitId, days) {
  const h = store.habits.find(h => h.id === habitId);
  if (!h) return 0;
  let due = 0, done = 0;
  let d = todayStr();
  for (let i = 0; i < days; i++) {
    if (isHabitDue(h, d)) { due++; if (isDone(store, habitId, d)) done++; }
    d = addDays(d, -1);
  }
  return due === 0 ? 0 : Math.round((done/due)*100);
}

function getTodayDue(store) {
  const today = todayStr();
  return store.habits.filter(h => !h.archivedAt && isHabitDue(h, today));
}

function getTodayDone(store) {
  const today = todayStr();
  return getTodayDue(store).filter(h => isDone(store, h.id, today));
}

function getTotalCompletions(store, habitId) {
  return Object.keys(store.completions)
    .filter(k => k.endsWith('__' + habitId))
    .reduce((s, k) => s + store.completions[k], 0);
}

// ── Theme ──────────────────────────────────────────────────
function applyTheme(theme) {
  const app = document.getElementById('app');
  app.classList.remove('theme-light','theme-dark');
  if (theme === 'light') app.classList.add('theme-light');
  else if (theme === 'dark') app.classList.add('theme-dark');
}

// ── Render: Today Tab ──────────────────────────────────────
function renderToday() {
  const store = getStore();
  const today = todayStr();
  const due = getTodayDue(store);
  const done = getTodayDone(store);
  const pct = due.length ? Math.round((done.length / due.length) * 100) : 0;

  const now = new Date();
  const dayName = DAY_LONG[now.getDay()];
  const dateLabel = `${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;

  let html = `
    <div class="view-header">
      <div class="large-title">${dayName}</div>
      <div class="subtitle">${dateLabel}</div>
    </div>
  `;

  if (due.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-icon">✨</div>
        <div class="empty-title">Geen gewoontes nog</div>
        <div class="empty-body">Voeg je eerste gewoonte toe via het tabblad Gewoontes en begin met je streak!</div>
        <button class="empty-cta" data-action="goto-habits">Gewoonte toevoegen</button>
      </div>
    `;
  } else {
    // Progress ring
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (pct / 100) * circumference;
    const ringColor = pct === 100 ? '#32D74B' : (pct >= 50 ? '#0A84FF' : '#5E5CE6');
    const msg = pct === 100 ? '🎉 Alles gedaan!' : `${done.length} van ${due.length} gedaan`;

    html += `
      <div class="progress-hero">
        <div class="ring-wrap">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle class="ring-bg" cx="60" cy="60" r="52"/>
            <circle class="ring-fg" cx="60" cy="60" r="52"
              stroke="${ringColor}"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${offset}"
              style="transition:stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)"/>
          </svg>
          <div class="ring-label">
            <span class="ring-pct">${pct}%</span>
            <span class="ring-sub">vandaag</span>
          </div>
        </div>
        <div class="progress-title">${msg}</div>
      </div>
      <div class="habit-list">
    `;

    due.forEach(h => {
      const count = getCount(store, h.id, today);
      const target = h.targetCount || 1;
      const done_ = count >= target;
      const streak = getStreakForHabit(store, h.id);

      html += `<div class="habit-card${done_ ? ' done' : ''}" data-action="toggle-today" data-id="${h.id}">`;
      html += `<div class="check-circle${done_ ? ' done' : ''}" style="${done_ ? `background:${h.color}` : ''}">`;
      html += `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 7l3.5 3.5L12 3" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg></div>`;
      html += `<span class="habit-icon">${h.icon}</span>`;
      html += `<div class="habit-info">`;
      html += `<div class="habit-name" style="${done_ ? 'text-decoration:line-through;opacity:0.5' : ''}">${h.name}</div>`;
      html += `<div class="habit-meta">${FREQ_LABELS[h.frequency] || 'Dagelijks'}`;
      if (target > 1) html += ` · ${count}/${target}x`;
      html += `</div></div>`;

      if (streak >= 3) {
        html += `<div class="streak-badge">🔥 ${streak}</div>`;
      } else if (target > 1) {
        html += `<div class="multi-dots">`;
        for (let i = 0; i < target; i++) {
          html += `<div class="multi-dot${i < count ? ' filled' : ''}" style="${i < count ? `background:${h.color}` : ''}"></div>`;
        }
        html += `</div>`;
      }

      html += `</div>`;
    });

    html += `</div>`;

    if (pct === 100) {
      const mot = MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];
      html += `<div class="section" style="text-align:center;padding-top:0">
        <div style="font-size:14px;color:var(--text2);font-style:italic">${mot}</div>
      </div>`;
    }
  }

  document.getElementById('view-today').innerHTML = html;
}

// ── Render: Habits Tab ─────────────────────────────────────
function renderHabits() {
  const store = getStore();
  const active = store.habits.filter(h => !h.archivedAt).sort((a,b) => a.sortOrder - b.sortOrder);
  const today = todayStr();

  let html = `
    <div class="view-header">
      <div class="large-title">Gewoontes</div>
    </div>
  `;

  if (active.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">Nog geen gewoontes</div>
        <div class="empty-body">Tik op + om je eerste gewoonte toe te voegen.</div>
      </div>
    `;
  } else {
    html += `<div style="padding:0 16px 100px" id="habits-list">`;
    active.forEach(h => {
      const streak = getStreakForHabit(store, h.id);
      const rate = getCompletionRate(store, h.id, 30);
      html += `
        <div class="habit-row-wrap" data-id="${h.id}">
          <div class="delete-bg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Verwijder
          </div>
          <div class="habit-row" data-action="edit-habit" data-id="${h.id}" style="transform:translateX(0);transition:transform 0.2s ease">
            <div class="habit-row-icon" style="background:${h.color}22">${h.icon}</div>
            <div class="habit-row-info">
              <div class="habit-row-name">${h.name}</div>
              <div class="habit-row-sub">${FREQ_LABELS[h.frequency] || 'Dagelijks'} · ${rate}% (30d)</div>
            </div>
            ${streak >= 1 ? `<div class="habit-row-streak">${streak >= 3 ? '🔥' : '⚡'} ${streak}</div>` : ''}
            <svg class="chevron" width="8" height="14" viewBox="0 0 8 14" fill="none">
              <path d="M1 1l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  document.getElementById('view-habits').innerHTML = html;

  // FAB
  let fab = document.querySelector('.fab');
  if (!fab) {
    fab = document.createElement('button');
    fab.className = 'fab';
    fab.setAttribute('data-action', 'new-habit');
    fab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    document.getElementById('app').appendChild(fab);
  }
  fab.style.display = router.tab === 'habits' ? 'flex' : 'none';

  initSwipeToDelete();
}

// ── Swipe to Delete ────────────────────────────────────────
function initSwipeToDelete() {
  document.querySelectorAll('.habit-row-wrap').forEach(wrap => {
    const row = wrap.querySelector('.habit-row');
    if (!row) return;
    let startX = 0, currentX = 0, swiping = false, committed = false;
    const THRESHOLD = 80;

    row.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX; currentX = 0; swiping = true; committed = false;
      row.setPointerCapture(e.pointerId);
      row.style.transition = 'none';
    }, { passive: true });

    row.addEventListener('pointermove', e => {
      if (!swiping) return;
      const dx = e.clientX - startX;
      if (dx > 0) { row.style.transform = 'translateX(0)'; return; }
      currentX = dx;
      row.style.transform = `translateX(${Math.max(dx, -100)}px)`;
    }, { passive: true });

    row.addEventListener('pointerup', () => {
      if (!swiping) return;
      swiping = false;
      row.style.transition = 'transform 0.2s ease';
      if (currentX < -THRESHOLD) {
        committed = true;
        row.style.transform = 'translateX(-90px)';
        // Show delete confirm after brief pause
        setTimeout(() => {
          const id = wrap.dataset.id;
          if (confirm('Gewoonte verwijderen?')) {
            deleteHabit(id);
          } else {
            row.style.transform = 'translateX(0)';
          }
        }, 100);
      } else {
        row.style.transform = 'translateX(0)';
      }
    });

    row.addEventListener('pointercancel', () => {
      swiping = false;
      row.style.transition = 'transform 0.2s ease';
      row.style.transform = 'translateX(0)';
    });
  });
}

function deleteHabit(id) {
  const store = getStore();
  const h = store.habits.find(h => h.id === id);
  if (h) h.archivedAt = todayStr();
  saveStore(store);
  renderCurrentTab();
}

// ── Render: Stats Tab ──────────────────────────────────────
function renderStats() {
  const store = getStore();
  const active = store.habits.filter(h => !h.archivedAt);
  const today = todayStr();

  // Global stats
  const totalDone = getTodayDone(store).length;
  const totalDue  = getTodayDue(store).length;
  let bestStreak = 0, totalAllTime = 0;
  active.forEach(h => {
    bestStreak = Math.max(bestStreak, getStreakForHabit(store, h.id));
    totalAllTime += getTotalCompletions(store, h.id);
  });

  let html = `
    <div class="view-header">
      <div class="large-title">Statistieken</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--blue)">${totalDue ? Math.round(totalDone/totalDue*100) : 0}%</div>
        <div class="stat-label">Vandaag</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--orange)">${bestStreak >= 3 ? '🔥' : ''}${bestStreak}</div>
        <div class="stat-label">Beste streak nu</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--green)">${totalAllTime}</div>
        <div class="stat-label">Totaal voltooid</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--purple)">${active.length}</div>
        <div class="stat-label">Actieve gewoontes</div>
      </div>
    </div>
  `;

  // Heatmap (last 28 days, 4 weeks)
  html += renderHeatmap(store, active);

  // Per-habit bars
  if (active.length > 0) {
    html += `<div style="padding:0 0 8px"><div class="section-header" style="padding-left:16px">Gewoontes (30 dagen)</div></div>`;
    active.forEach(h => {
      const rate = getCompletionRate(store, h.id, 30);
      html += `
        <div class="habit-stat-row" data-action="show-habit-detail" data-id="${h.id}">
          <span style="font-size:20px">${h.icon}</span>
          <div class="habit-stat-bar-wrap">
            <div class="habit-stat-name">${h.name}</div>
            <div class="habit-stat-bar-bg">
              <div class="habit-stat-bar-fg" style="width:${rate}%;background:${h.color}"></div>
            </div>
          </div>
          <div class="habit-stat-pct" style="color:${h.color}">${rate}%</div>
        </div>
      `;
    });
  }

  html += `<div style="height:32px"></div>`;
  document.getElementById('view-stats').innerHTML = html;
}

function renderHeatmap(store, habits) {
  const today = todayStr();
  let html = `<div class="heatmap-wrap">
    <div class="heatmap-title">Activiteit (28 dagen)</div>
    <div class="heatmap-grid">
  `;
  // Day labels
  DAY_SHORT.forEach(d => { html += `<div class="heatmap-day-label">${d}</div>`; });

  // Find start: go back to the Sunday 4 weeks ago
  const todayDate = parseDate(today);
  const startDate = new Date(todayDate);
  startDate.setDate(todayDate.getDate() - 27 - todayDate.getDay()); // align to Sunday

  for (let i = 0; i < 35; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const ds = dateStr_(d);
    const isFuture = ds > today;
    const isToday_ = ds === today;

    if (isFuture) {
      html += `<div class="heatmap-cell" style="opacity:0.2"></div>`;
      continue;
    }

    // Level: how many habits done that day vs due
    const due = habits.filter(h => !h.archivedAt && isHabitDue(h, ds));
    const done = due.filter(h => isDone(store, h.id, ds));
    let level = 0;
    if (due.length > 0) {
      const ratio = done.length / due.length;
      if (ratio > 0 && ratio < 0.4) level = 1;
      else if (ratio >= 0.4 && ratio < 0.8) level = 2;
      else if (ratio >= 0.8) level = 3;
    }

    html += `<div class="heatmap-cell level-${level}${isToday_ ? ' today' : ''}" title="${ds}: ${done.length}/${due.length}"></div>`;
  }

  html += `</div></div>`;
  return html;
}

// ── Render: Settings Tab ───────────────────────────────────
function renderSettings() {
  const store = getStore();
  const theme = store.settings.theme || 'system';
  const isStandalone = window.navigator.standalone === true;

  let html = `
    <div class="view-header">
      <div class="large-title">Instellingen</div>
    </div>
  `;

  // Install card
  html += `<div class="install-card">`;
  if (isStandalone) {
    html += `
      <div class="install-card-title">📱 Geïnstalleerd</div>
      <div class="installed-badge">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="10" fill="#32D74B"/>
          <path d="M5 10l3.5 3.5L15 7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Je gebruikt de geïnstalleerde app
      </div>
    `;
  } else {
    html += `
      <div class="install-card-title">📲 Zet op beginscherm</div>
      <div class="install-step">
        <div class="step-num">1</div>
        <div>Tik op het <strong>Deel</strong>-icoon onderaan Safari <svg style="display:inline;vertical-align:middle" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2v12M8 6l4-4 4 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></div>
      </div>
      <div class="install-step">
        <div class="step-num">2</div>
        <div>Scroll naar beneden en tik op <strong>Zet op beginscherm</strong></div>
      </div>
      <div class="install-step">
        <div class="step-num">3</div>
        <div>Tik op <strong>Voeg toe</strong> rechtsboven</div>
      </div>
    `;
  }
  html += `</div>`;

  // Theme
  html += `
    <div class="section-header" style="padding-left:16px">Weergave</div>
    <div class="settings-group">
      <div class="settings-row">
        <span class="settings-row-icon">🎨</span>
        <span class="settings-row-label">Thema</span>
        <div class="segmented" style="width:180px">
          <div class="seg-btn${theme==='system'?' active':''}" data-action="set-theme" data-theme="system">Systeem</div>
          <div class="seg-btn${theme==='light'?' active':''}" data-action="set-theme" data-theme="light">Licht</div>
          <div class="seg-btn${theme==='dark'?' active':''}" data-action="set-theme" data-theme="dark">Donker</div>
        </div>
      </div>
    </div>
  `;

  // Data
  html += `
    <div class="section-header" style="padding-left:16px">Gegevens</div>
    <div class="settings-group">
      <div class="settings-row tappable" data-action="export-data">
        <span class="settings-row-icon">📤</span>
        <span class="settings-row-label">Exporteer gegevens</span>
        <svg class="chevron" width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="settings-row tappable" data-action="import-data">
        <span class="settings-row-icon">📥</span>
        <span class="settings-row-label">Importeer gegevens</span>
        <svg class="chevron" width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="settings-row tappable destructive" data-action="clear-data">
        <span class="settings-row-icon">🗑️</span>
        <span class="settings-row-label">Wis alle gegevens</span>
      </div>
    </div>
    <div style="height:32px"></div>
    <div style="text-align:center;font-size:13px;color:var(--text3);padding-bottom:32px">Habits v1.0 · Gemaakt met ❤️</div>
  `;

  document.getElementById('view-settings').innerHTML = html;
}

// ── Tab Navigation ─────────────────────────────────────────
function switchTab(tab) {
  router.tab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${tab}`));
  const fab = document.querySelector('.fab');
  if (fab) fab.style.display = tab === 'habits' ? 'flex' : 'none';
  renderCurrentTab();
}

function renderCurrentTab() {
  if (router.tab === 'today') renderToday();
  else if (router.tab === 'habits') renderHabits();
  else if (router.tab === 'stats') renderStats();
  else if (router.tab === 'settings') renderSettings();
}

// ── Sheet System ───────────────────────────────────────────
function openSheet(title, bodyHTML, onSave) {
  document.getElementById('sheet-title').textContent = title;
  document.getElementById('sheet-body').innerHTML = bodyHTML;
  // Reset header buttons to defaults
  const saveBtn   = document.getElementById('sheet-save');
  const cancelBtn = document.getElementById('sheet-cancel');
  saveBtn.style.display   = onSave ? '' : 'none';
  cancelBtn.textContent   = 'Annuleer';
  const backdrop = document.getElementById('sheet-backdrop');
  const sheet = document.getElementById('bottom-sheet');
  backdrop.style.display = 'block';
  sheet.style.display = 'block';
  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
    sheet.classList.add('open');
  });
  saveBtn.onclick   = () => { if (!onSave || onSave() !== false) closeSheet(); };
  cancelBtn.onclick = closeSheet;
  backdrop.onclick  = closeSheet;
  setTimeout(initSheetInteractions, 50);
}

function closeSheet() {
  const backdrop = document.getElementById('sheet-backdrop');
  const sheet = document.getElementById('bottom-sheet');
  backdrop.classList.remove('visible');
  sheet.classList.remove('open');
  setTimeout(() => {
    backdrop.style.display = 'none';
    sheet.style.display = 'none';
  }, 380);
}

function initSheetInteractions() {
  // Emoji picker
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });
  // Color swatches
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.onclick = () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    };
  });
  // Day buttons
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.onclick = () => btn.classList.toggle('active');
  });
  // Frequency select
  const freqEl = document.getElementById('freq-select');
  const customDays = document.getElementById('custom-days-wrap');
  if (freqEl && customDays) {
    freqEl.addEventListener('change', () => {
      customDays.style.display = freqEl.value === 'custom' ? 'block' : 'none';
    });
  }
  // Stepper
  const stepDown = document.getElementById('step-down');
  const stepUp   = document.getElementById('step-up');
  const stepVal  = document.getElementById('step-val');
  if (stepDown && stepUp && stepVal) {
    stepDown.onclick = () => {
      const v = parseInt(stepVal.textContent);
      if (v > 1) { stepVal.textContent = v - 1; stepDown.disabled = v - 1 <= 1; }
    };
    stepUp.onclick = () => {
      const v = parseInt(stepVal.textContent);
      if (v < 10) { stepVal.textContent = v + 1; stepDown.disabled = false; }
    };
  }
}

// ── Habit Editor Sheet ─────────────────────────────────────
function openHabitEditor(habitId) {
  const store = getStore();
  let h = habitId ? store.habits.find(h => h.id === habitId) : null;
  const isNew = !h;
  if (isNew) {
    h = { id: uuid(), name: '', icon: '⭐', color: COLORS[5], frequency: 'daily', customDays: [1,2,3,4,5], targetCount: 1, createdAt: todayStr(), archivedAt: null, sortOrder: store.habits.length };
  }

  const emojiHTML = EMOJIS.map(e =>
    `<div class="emoji-btn${e === h.icon ? ' selected' : ''}" data-emoji="${e}">${e}</div>`
  ).join('');

  const colorHTML = COLORS.map((c,i) =>
    `<div class="color-swatch${c === h.color ? ' selected' : ''}" data-color="${c}" style="background:${c}" title="${COLOR_NAMES[i]}"></div>`
  ).join('');

  const daysHTML = DAY_SHORT.map((d,i) =>
    `<div class="day-btn${(h.customDays||[]).includes(i) ? ' active' : ''}" data-day="${i}">${d}</div>`
  ).join('');

  const body = `
    <div class="form-group">
      <label class="form-label">Naam</label>
      <input class="form-input" id="habit-name" placeholder="bijv. Mediteren" value="${h.name}" maxlength="40">
    </div>
    <div class="form-group">
      <label class="form-label">Icoon</label>
      <div class="emoji-grid">${emojiHTML}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Kleur</label>
      <div class="color-grid">${colorHTML}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Frequentie</label>
      <select class="form-input" id="freq-select">
        ${Object.entries(FREQ_LABELS).map(([v,l]) => `<option value="${v}"${h.frequency===v?' selected':''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" id="custom-days-wrap" style="display:${h.frequency==='custom'?'block':'none'}">
      <label class="form-label">Dagen</label>
      <div class="days-grid">${daysHTML}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Doel per dag</label>
      <div class="stepper">
        <button class="stepper-btn" id="step-down"${h.targetCount<=1?' disabled':''}>−</button>
        <div class="stepper-val" id="step-val">${h.targetCount || 1}</div>
        <button class="stepper-btn" id="step-up">+</button>
      </div>
    </div>
    ${!isNew ? `<div style="margin-top:8px"><button style="width:100%;padding:14px;background:var(--red);color:#fff;border-radius:var(--radius);font-size:16px;font-weight:600" data-action="archive-habit" data-id="${h.id}">Verwijder gewoonte</button></div>` : ''}
  `;

  openSheet(isNew ? 'Nieuwe gewoonte' : 'Bewerk gewoonte', body, () => {
    const name = document.getElementById('habit-name').value.trim();
    if (!name) { document.getElementById('habit-name').style.borderColor = 'var(--red)'; return false; }
    const icon = document.querySelector('.emoji-btn.selected')?.dataset.emoji || h.icon;
    const color = document.querySelector('.color-swatch.selected')?.dataset.color || h.color;
    const frequency = document.getElementById('freq-select').value;
    const customDays = [...document.querySelectorAll('.day-btn.active')].map(b => parseInt(b.dataset.day));
    const targetCount = parseInt(document.getElementById('step-val').textContent) || 1;

    const store2 = getStore();
    if (isNew) {
      store2.habits.push({ ...h, name, icon, color, frequency, customDays, targetCount });
    } else {
      const idx = store2.habits.findIndex(hh => hh.id === h.id);
      if (idx >= 0) store2.habits[idx] = { ...store2.habits[idx], name, icon, color, frequency, customDays, targetCount };
    }
    saveStore(store2);
    renderCurrentTab();
    renderToday(); // refresh today ring too
  });
}

// ── Habit Detail Sheet (Stats) ─────────────────────────────
function openHabitDetail(habitId) {
  const store = getStore();
  const h = store.habits.find(h => h.id === habitId);
  if (!h) return;

  const streak = getStreakForHabit(store, habitId);
  const longest = getLongestStreak(store, habitId);
  const r7  = getCompletionRate(store, habitId, 7);
  const r30 = getCompletionRate(store, habitId, 30);
  const r90 = getCompletionRate(store, habitId, 90);
  const total = getTotalCompletions(store, habitId);

  const now = new Date();
  if (!router.calMonth) router.calMonth = { y: now.getFullYear(), m: now.getMonth() };
  const calHTML = renderMiniCal(store, h, router.calMonth.y, router.calMonth.m);

  const body = `
    <div class="detail-header">
      <div class="detail-icon-wrap" style="background:${h.color}22">
        <span style="font-size:26px">${h.icon}</span>
      </div>
      <div>
        <div class="detail-name">${h.name}</div>
        <div class="detail-freq">${FREQ_LABELS[h.frequency] || 'Dagelijks'} · ${h.targetCount || 1}x per dag</div>
      </div>
    </div>
    <div class="rate-row">
      <div class="rate-card">
        <div class="rate-val" style="color:var(--blue)">${r7}%</div>
        <div class="rate-lbl">7 dagen</div>
      </div>
      <div class="rate-card">
        <div class="rate-val" style="color:var(--blue)">${r30}%</div>
        <div class="rate-lbl">30 dagen</div>
      </div>
      <div class="rate-card">
        <div class="rate-val" style="color:var(--blue)">${r90}%</div>
        <div class="rate-lbl">90 dagen</div>
      </div>
    </div>
    <div class="rate-row">
      <div class="rate-card">
        <div class="rate-val" style="color:var(--orange)">${streak >= 3 ? '🔥' : ''}${streak}</div>
        <div class="rate-lbl">Huidige streak</div>
      </div>
      <div class="rate-card">
        <div class="rate-val" style="color:var(--yellow)">${longest}</div>
        <div class="rate-lbl">Langste streak</div>
      </div>
      <div class="rate-card">
        <div class="rate-val" style="color:var(--green)">${total}</div>
        <div class="rate-lbl">Totaal</div>
      </div>
    </div>
    <div id="mini-cal-wrap" data-habitid="${habitId}">${calHTML}</div>
  `;

  openSheet(h.name, body, null);
  document.getElementById('sheet-cancel').textContent = 'Sluiten';
}

function renderMiniCal(store, h, year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  let html = `<div class="mini-cal">
    <div class="mini-cal-header">
      <div class="cal-nav" data-action="cal-prev">‹</div>
      <div class="mini-cal-title">${MONTH_NAMES[month]} ${year}</div>
      <div class="cal-nav" data-action="cal-next">›</div>
    </div>
    <div class="mini-cal-grid">`;

  DAY_SHORT.forEach(d => { html += `<div class="cal-day-label">${d}</div>`; });

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday = ds === today;
    const isFuture = ds > today;
    const due = isHabitDue(h, ds);
    const count = getCount(store, h.id, ds);
    const target = h.targetCount || 1;
    let cls = 'cal-cell';
    if (isToday) cls += ' today';
    if (!due) cls += ' not-due';
    else if (!isFuture) {
      if (count >= target) cls += ' done';
      else if (count > 0) cls += ' partial';
    }
    html += `<div class="${cls}">${day}</div>`;
  }

  html += `</div></div>`;
  return html;
}

// ── Event Delegation ───────────────────────────────────────
document.getElementById('app').addEventListener('click', e => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'dismiss-banner') { dismissBanner(); return; }

  if (action === 'toggle-today') {
    const id = target.dataset.id;
    const store = getStore();
    const h = store.habits.find(h => h.id === id);
    if (!h) return;
    const today = todayStr();
    const key = `${today}__${id}`;
    const count = store.completions[key] || 0;
    const target_ = h.targetCount || 1;
    if (count >= target_) {
      store.completions[key] = 0;
      if (store.completions[key] === 0) delete store.completions[key];
    } else {
      store.completions[key] = count + 1;
    }
    saveStore(store);
    target.classList.add('completing');
    setTimeout(() => target.classList.remove('completing'), 300);
    if (navigator.vibrate) navigator.vibrate(10);
    renderToday();
    return;
  }

  if (action === 'goto-habits') { switchTab('habits'); return; }
  if (action === 'new-habit') { openHabitEditor(null); return; }
  if (action === 'edit-habit') { openHabitEditor(target.dataset.id); return; }
  if (action === 'show-habit-detail') { router.calMonth = null; openHabitDetail(target.dataset.id); return; }

  if (action === 'archive-habit') {
    if (confirm('Gewoonte verwijderen?')) {
      deleteHabit(target.dataset.id);
      closeSheet();
    }
    return;
  }

  if (action === 'set-theme') {
    const theme = target.dataset.theme;
    const store = getStore();
    store.settings.theme = theme;
    saveStore(store);
    applyTheme(theme);
    renderSettings();
    return;
  }

  if (action === 'export-data') {
    const data = localStorage.getItem('ht_store') || '{}';
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habits-export-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (action === 'import-data') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = e2 => {
      const file = e2.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.habits) throw new Error('Ongeldig formaat');
          saveStore(migrate(data));
          renderCurrentTab();
          alert('Gegevens geïmporteerd!');
        } catch { alert('Kon bestand niet importeren.'); }
      };
      reader.readAsText(file);
    };
    input.click();
    return;
  }

  if (action === 'clear-data') {
    if (confirm('Alle gegevens wissen? Dit kan niet ongedaan worden gemaakt.')) {
      localStorage.removeItem('ht_store');
      renderCurrentTab();
    }
    return;
  }

  if (action === 'cal-prev') {
    if (!router.calMonth) return;
    let { y, m } = router.calMonth;
    m--; if (m < 0) { m = 11; y--; }
    router.calMonth = { y, m };
    const wrap = document.getElementById('mini-cal-wrap');
    if (wrap) {
      const store = getStore();
      const h = store.habits.find(h => h.id === wrap.dataset.habitid);
      if (h) wrap.innerHTML = renderMiniCal(store, h, y, m);
    }
    return;
  }

  if (action === 'cal-next') {
    if (!router.calMonth) return;
    let { y, m } = router.calMonth;
    m++; if (m > 11) { m = 0; y++; }
    router.calMonth = { y, m };
    const wrap = document.getElementById('mini-cal-wrap');
    if (wrap) {
      const store = getStore();
      const h = store.habits.find(h => h.id === wrap.dataset.habitid);
      if (h) wrap.innerHTML = renderMiniCal(store, h, y, m);
    }
    return;
  }
});

// Tab bar clicks
document.getElementById('tab-bar').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (btn) switchTab(btn.dataset.tab);
});

// ── Install Banner ─────────────────────────────────────────
function dismissBanner() {
  document.getElementById('install-banner').classList.remove('visible');
  const s = getStore();
  s.settings.installBannerDismissed = true;
  saveStore(s);
}

function initInstallBanner() {
  const isStandalone = window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const store = getStore();
  if (isStandalone || !isIOS || store.settings.installBannerDismissed) return;
  setTimeout(() => {
    document.getElementById('install-banner').classList.add('visible');
  }, 1500);
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const store = getStore();
  applyTheme(store.settings.theme || 'system');
  renderToday();
  renderHabits();
  // Lazy render other tabs on first switch — but pre-render today/habits for instant feel
  initInstallBanner();
});
