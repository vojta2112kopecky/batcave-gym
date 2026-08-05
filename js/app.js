// ============================================================
// BATCAVE GYM – core
// Vanilla JS, bez závislostí. Mobile-first, 1 klik = posun dál.
// ============================================================
"use strict";

const DB = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); Sync.queue(); },
};

// Cloud sync adapter – připraveno, zatím vypnuto (multidevice až s iPhone buildem)
const Sync = {
  enabled: false, endpoint: null,
  queue() { if (!this.enabled) return; clearTimeout(this._t); this._t = setTimeout(() => this.push(), 2000); },
  async push() {}, async pull() {},
};

let plan = DB.get("plan", null);
if (!plan || (plan.version || 0) < DEFAULT_PLAN.version) { plan = JSON.parse(JSON.stringify(DEFAULT_PLAN)); DB.set("plan", plan); }
let overrides = DB.get("overrides", {}); // exId -> {step, rest, restPrep, defaultWeight}
let history = DB.get("history", []);
let session = DB.get("session", null);
let tab = "workout";
let dashEx = null;
let dashView = "list"; // list | settings

function applyOverrides() {
  for (const w of plan.workouts) for (const e of w.exercises) {
    const o = overrides[e.id]; if (!o) continue;
    for (const k of ["step", "rest", "restPrep", "defaultWeight"]) if (o[k] != null) e[k] = o[k];
  }
}
applyOverrides();

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const fmtW = (w) => (w % 1 === 0 ? String(w) : String(w).replace(".", ","));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
const fmtDate = (s) => `${+s.slice(8)}. ${+s.slice(5, 7)}.`;
const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const wo = (id) => plan.workouts.find((w) => w.id === id);
const allEx = () => { const seen = new Set(), o = []; for (const w of plan.workouts) for (const e of w.exercises) if (!seen.has(e.id)) { seen.add(e.id); o.push(e); } return o; };

// sety včetně těch, co si přidám během tréninku
function exSets(ex) {
  const extra = (session && session.extra && session.extra[ex.id]) || 0;
  if (!extra) return ex.sets;
  const last = ex.sets[ex.sets.length - 1];
  return ex.sets.concat(Array.from({ length: extra }, () => ({ ...last, bonus: true })));
}
const setSpec = (ex, i) => { const s = exSets(ex); return s[Math.min(i, s.length - 1)]; };

function exHistory(exId) {
  const out = [];
  for (const s of history) {
    const e = s.exercises.find((x) => x.id === exId);
    if (e && e.sets.length) out.push({ date: s.date, sets: e.sets, rpe: e.rpe });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
const lastEntry = (id) => { const h = exHistory(id); return h.length ? h[h.length - 1] : null; };
const lastSet = (id, i) => { const le = lastEntry(id); return le ? le.sets[Math.min(i, le.sets.length - 1)] || null : null; };
const workSets = (sets) => { const w = sets.filter((s) => s.t !== "prep"); return w.length ? w : sets; };
const topW = (sets) => Math.max(...workSets(sets).map((s) => s.w));

function recommendWeight(ex, i) {
  const ls = lastSet(ex.id, i);
  if (!ls) return ex.defaultWeight;
  return ls.r >= setSpec(ex, i).to ? ls.w + ex.step : ls.w;
}
function predictReps(ex, i, weight) {
  const sp = setSpec(ex, i), h = exHistory(ex.id);
  if (!h.length) return sp.from;
  const pts = h.map((e) => e.sets[Math.min(i, e.sets.length - 1)]).filter(Boolean);
  const last = pts[pts.length - 1];
  if (!last) return sp.from;
  if (weight > last.w) return sp.from;
  if (weight < last.w) return Math.min(last.r + 2, sp.to);
  const prev = pts[pts.length - 2];
  const trend = prev && prev.w === last.w && last.r > prev.r ? 1 : 0;
  return Math.min(last.r + trend, sp.to);
}
const prWeight = (id) => { let p = 0; for (const e of exHistory(id)) for (const s of e.sets) if (s.w > p) p = s.w; return p; };

// ---------- audio ----------
let actx = null;
function beep(f = 880, d = 0.09, g = 0.08) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const o = actx.createOscillator(), gn = actx.createGain();
    o.type = "sine"; o.frequency.value = f;
    gn.gain.setValueAtTime(0, actx.currentTime);
    gn.gain.linearRampToValueAtTime(g, actx.currentTime + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
    o.connect(gn).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + d + 0.02);
  } catch {}
}
const gong = () => { beep(660, 0.5, 0.12); setTimeout(() => beep(990, 0.7, 0.12), 170); };

// ---------- wake lock ----------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && session) keepAwake(true); });

// ---------- session ----------
function startWorkout(id) {
  const w = wo(id);
  session = {
    workoutId: id, workoutName: w.name, focus: w.focus, date: today(), startedAt: Date.now(),
    exIndex: 0, setIndex: 0, phase: "work", workStart: Date.now(),
    restEnd: null, restTotal: 0, _beeped: {}, pendingW: null, pendingR: null, entries: {}, extra: {},
  };
  DB.set("session", session); keepAwake(true); tab = "workout"; render();
}
const curW = () => wo(session.workoutId);
const curEx = () => curW().exercises[session.exIndex];
const restFor = (ex, i) => (setSpec(ex, i).type === "prep" ? ex.restPrep || 90 : ex.rest || 120);

function finishSet() {
  const ex = curEx();
  session.phase = "log";
  session.pendingW = session.pendingW ?? recommendWeight(ex, session.setIndex);
  session.pendingR = session.pendingR ?? predictReps(ex, session.setIndex, session.pendingW);
  DB.set("session", session); render();
}
function confirmSet() {
  const ex = curEx();
  const e = (session.entries[ex.id] = session.entries[ex.id] || { id: ex.id, name: ex.name, sets: [], rpe: null });
  e.sets.push({ w: session.pendingW, r: session.pendingR, t: setSpec(ex, session.setIndex).type });
  session.pendingW = null; session.pendingR = null;
  if (session.setIndex >= exSets(ex).length - 1) session.phase = "rpe";
  else startRest(restFor(ex, session.setIndex + 1));
  DB.set("session", session); render();
}
function startRest(sec) { session.phase = "rest"; session.restTotal = sec; session.restEnd = Date.now() + sec * 1000; session._beeped = {}; }
function adjustRest(d) { session.restEnd += d * 1000; session.restTotal = Math.max(1, session.restTotal + d); DB.set("session", session); }
function endRest() {
  if (session._afterRpe) session._afterRpe = false;
  else session.setIndex++;
  session.phase = "work"; session.workStart = Date.now();
  DB.set("session", session); render();
}
// vrátit poslední uložený set (překlep ve váze/opakováních)
function undoSet() {
  const ex = curEx(), e = session.entries[ex.id];
  if (!e || !e.sets.length) return;
  const s = e.sets.pop();
  session.setIndex = e.sets.length; // další na řadě = kolik jich je uložených
  session.phase = "work"; session.workStart = Date.now();
  session.pendingW = s.w; session.pendingR = s.r;
  DB.set("session", session); render();
}
function addSet() {
  const ex = curEx();
  session.extra[ex.id] = (session.extra[ex.id] || 0) + 1;
  if (session.phase === "rpe") { session.phase = "rest"; startRest(restFor(ex, session.setIndex + 1)); session.setIndex = session.setIndex; }
  DB.set("session", session); render();
}
function saveRpe(v) {
  const ex = curEx();
  session.entries[ex.id].rpe = v;
  const w = curW();
  if (session.exIndex >= w.exercises.length - 1) return finishWorkout();
  session.exIndex++; session.setIndex = 0; session._afterRpe = true;
  startRest(restFor(curEx(), 0));
  DB.set("session", session); render();
}
function finishWorkout() {
  const rec = {
    date: session.date, workoutId: session.workoutId, workoutName: session.workoutName,
    durationMin: Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)),
    exercises: Object.values(session.entries).filter((e) => e.sets.length),
  };
  history.push(rec); DB.set("history", history);
  session.phase = "summary"; session.lastRecord = rec;
  DB.set("session", session); keepAwake(false); render();
}
function closeSummary() { session = null; DB.set("session", null); render(); }
function abortWorkout() {
  if (!confirm("Zrušit rozdělaný trénink? Nic se neuloží.")) return;
  session = null; DB.set("session", null); keepAwake(false); render();
}
// ukončit cvik: co je odcvičené se uloží, jde se na RPE
function endExercise() {
  const ex = curEx();
  if (session.entries[ex.id]?.sets.length) { session.phase = "rpe"; DB.set("session", session); return render(); }
  const w = curW();
  if (session.exIndex >= w.exercises.length - 1) return finishWorkout();
  session.exIndex++; session.setIndex = 0; session.phase = "work"; session.workStart = Date.now();
  DB.set("session", session); render();
}

// ---------- globální hodiny (běží i na dashboardu) ----------
setInterval(() => {
  if (!session) return;
  if (session.phase === "work") {
    const el = $("#workTimer");
    if (el) el.textContent = fmtTime((Date.now() - session.workStart) / 1000);
  } else if (session.phase === "rest") {
    const left = Math.max(0, (session.restEnd - Date.now()) / 1000);
    const el = $("#restTimer"), bar = $("#restBar"), mini = $("#navRest");
    if (el) { el.textContent = fmtTime(Math.ceil(left)); el.classList.toggle("ending", left <= 10 && left > 0); }
    if (bar) bar.style.transform = `scaleX(${Math.max(0, left / session.restTotal)})`;
    if (mini) mini.textContent = fmtTime(Math.ceil(left));
    const s = Math.ceil(left);
    if (s <= 10 && s > 0 && !session._beeped[s]) { session._beeped[s] = 1; beep(s <= 3 ? 1150 : 880, 0.08, 0.07); }
    if (left <= 0) { gong(); endRest(); }
  }
}, 200);

// ---------- render ----------
function render() {
  let html;
  if (tab === "dash") html = dashView === "settings" ? viewSettings() : dashEx ? viewExDetail(dashEx) : viewDash();
  else if (!session) html = viewHome();
  else if (session.phase === "work") html = viewWork();
  else if (session.phase === "log") html = viewLog();
  else if (session.phase === "rest") html = viewRest();
  else if (session.phase === "rpe") html = viewRpe();
  else html = viewSummary();
  $("#app").innerHTML = html + viewNav();
  if (tab === "dash" && dashEx && dashView !== "settings") drawChart("chartW", exHistory(dashEx).map((e) => ({ v: topW(e.sets) })));
}
function viewNav() {
  const resting = session && session.phase === "rest" && tab !== "workout";
  return `<nav>
    <button class="${tab === "workout" ? "active" : ""}" onclick="switchTab('workout')">${I.dumbbell()}${resting ? `<b id="navRest" style="color:var(--gold)">--:--</b>` : "Trénink"}${session && !resting ? '<i class="live"></i>' : ""}</button>
    <button class="${tab === "dash" ? "active" : ""}" onclick="switchTab('dash')">${I.chart()}Dashboardy</button>
  </nav>`;
}
function switchTab(t) { tab = t; dashEx = null; dashView = "list"; render(); }

// ---------- home ----------
const DOW = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
function weekDays() {
  const now = new Date(), off = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setDate(now.getDate() - off); mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const key = iso(d);
    const ov = plan.overrides || {};
    const workoutId = key in ov ? ov[key] : plan.schedule[i + 1] || null;
    return { date: d, key, dow: DOW[i], num: d.getDate(), workoutId,
      done: history.find((h) => h.date === key) || null, isToday: key === today() };
  });
}
function viewHome() {
  const days = weekDays(), t = days.find((d) => d.isToday);
  const todayW = t.done ? null : t.workoutId ? wo(t.workoutId) : null;
  const midnight = new Date(new Date().setHours(0, 0, 0, 0));
  const nextD = todayW ? null : days.find((d) => d.workoutId && !d.done && d.date >= midnight);
  const cal = days.map((d) => `<div class="${["day", d.workoutId ? "has" : "rest", d.done ? "done" : "", d.isToday ? "today" : ""].join(" ")}"
      onclick="${d.workoutId ? `startWorkout('${d.workoutId}')` : ""}">
      <div class="dow">${d.dow}</div><div class="num">${d.num}</div>
      <div class="tag">${d.done ? I.check() : d.workoutId || "–"}</div></div>`).join("");

  let hero;
  if (session) {
    const w = wo(session.workoutId);
    hero = `<div class="hero"><div class="kicker">Rozdělaný trénink</div>
      <div class="htitle">${esc(w.name)}</div>
      <div class="hfocus">cvik ${session.exIndex + 1}/${w.exercises.length} · ${esc(curEx().name)}</div>
      <button class="btn btn-primary" onclick="render()">${I.bolt()}Pokračovat</button></div>`;
  } else if (todayW) {
    hero = `<div class="hero"><div class="kicker">Dnes tě čeká</div>
      <div class="htitle">${esc(todayW.name)}</div>
      <div class="hfocus">${esc(todayW.focus)} · ${todayW.exercises.length} cviků · ${todayW.exercises.reduce((a, e) => a + e.sets.length, 0)} setů</div>
      <button class="btn btn-primary" onclick="startWorkout('${todayW.id}')">${I.bolt()}Začít trénink</button></div>`;
  } else if (t.done) {
    hero = `<div class="hero"><div class="kicker">Dnes hotovo</div>
      <div class="htitle">${esc(t.done.workoutName)}</div>
      <div class="hfocus">${t.done.durationMin} min · ${t.done.exercises.reduce((a, e) => a + e.sets.length, 0)} setů odcvičeno</div></div>`;
  } else {
    hero = `<div class="hero"><div class="kicker">Dnes volno</div><div class="htitle">Rest day</div>
      <div class="hfocus">${nextD ? `další: ${esc(wo(nextD.workoutId).name)} · ${nextD.dow}` : "tento týden máš hotovo"}</div></div>`;
  }

  const cards = plan.workouts.map((w) => {
    const last = [...history].reverse().find((h) => h.workoutId === w.id);
    return `<div class="card" onclick="startWorkout('${w.id}')">
      <div class="body">
        <div class="title">${esc(w.name)}</div>
        <div class="meta">${esc(w.focus)} · ${w.exercises.length} cviků${last ? ` · naposledy ${fmtDate(last.date)}` : ""}</div>
      </div><div class="go">${I.chevronR()}</div></div>`;
  }).join("");

  return `<div class="screen">
    <h1 class="brand">Batcave <em>Gym</em></h1>
    <div class="sub">${esc(plan.source)}</div>
    <h2>${I.calendar()}Tento týden</h2>
    <div class="week">${cal}</div>
    <div class="spacer"></div>
    ${hero}
    ${SpotifyUI.bar()}
    <h2>${I.dumbbell()}Všechny tréninky</h2>
    ${cards}
  </div>`;
}

// ---------- workout ----------
function head(ex) {
  const w = curW(), sets = exSets(ex), sp = setSpec(ex, session.setIndex);
  const dots = sets.map((s, i) => `<i class="${i < session.setIndex ? "done" : i === session.setIndex ? "cur" : ""} ${s.type === "prep" ? "prep" : ""}"></i>`).join("");
  return `<div class="topbar"><button class="back" onclick="abortWorkout()">${I.close()}</button></div>
  <div class="ex-head">
    <div class="sub" style="margin:0 0 8px">${esc(w.name)} · cvik ${session.exIndex + 1}/${w.exercises.length}</div>
    <div class="ex-sub">${esc(ex.sub)}</div>
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="setdots">${dots}</div>
    <div class="ex-set">Set ${session.setIndex + 1}/${sets.length} <span class="type">· ${sp.type === "prep" ? "přípravný" : "pracovní"}${sp.bonus ? " +" : ""}</span></div>
    <div class="ex-target">cíl ${sp.from}–${sp.to} opakování</div>
  </div>`;
}
function viewWork() {
  const ex = curEx(), i = session.setIndex;
  const ls = lastSet(ex.id, i), rec = recommendWeight(ex, i), pred = predictReps(ex, i, rec);
  const logged = session.entries[ex.id]?.sets.length || 0;
  return `<div class="screen">
    ${head(ex)}
    <div class="chips">
      ${ls ? `<div class="chip">${I.history()}naposledy <b>${ls.r}×</b> @ <b>${fmtW(ls.w)} kg</b></div>` : `<div class="chip">${I.history()}první záznam</div>`}
      <div class="chip accent">${I.target()}doporučeno <b>${fmtW(rec)} kg</b></div>
      <div class="chip violet">${I.arrowUp()}predikce <b>${pred} op.</b></div>
    </div>
    <div class="timer-wrap">
      <div class="timer work" id="workTimer">0:00</div>
      <div class="timer-label">${I.clock()}Work time</div>
    </div>
    <button class="btn btn-primary" onclick="finishSet()">${I.check()}Set hotový</button>
    <div class="btn-row">
      ${logged ? `<button class="btn btn-ghost" style="opacity:.55" onclick="undoSet()">${I.undo()}Vrátit set</button>` : ""}
      <button class="btn btn-ghost" style="opacity:.55" onclick="addSet()">${I.plus()}Set navíc</button>
      <button class="btn btn-ghost" style="opacity:.45" onclick="endExercise()">${I.skip()}Konec cviku</button>
    </div>
    ${SpotifyUI.bar()}
  </div>`;
}
function viewLog() {
  const ex = curEx();
  return `<div class="screen">
    ${head(ex)}
    <div class="stepper">
      <div class="label">Váha</div>
      <div class="row">
        <button class="step-btn" onclick="bumpW(-1)">${I.minus()}<span>${fmtW(ex.step)}</span></button>
        <div class="val" id="wVal">${fmtW(session.pendingW)}<small> kg</small></div>
        <button class="step-btn" onclick="bumpW(1)">${I.plus()}<span>${fmtW(ex.step)}</span></button>
      </div>
    </div>
    <div class="stepper">
      <div class="label">Opakování</div>
      <div class="row">
        <button class="step-btn" onclick="bumpR(-1)">${I.minus()}<span>1</span></button>
        <div class="val" id="rVal">${session.pendingR}</div>
        <button class="step-btn" onclick="bumpR(1)">${I.plus()}<span>1</span></button>
      </div>
    </div>
    <button class="btn btn-primary" onclick="confirmSet()">${I.check()}Uložit set</button>
  </div>`;
}
function bumpW(d) { session.pendingW = Math.max(0, Math.round((session.pendingW + d * curEx().step) * 100) / 100); $("#wVal").innerHTML = `${fmtW(session.pendingW)}<small> kg</small>`; DB.set("session", session); }
function bumpR(d) { session.pendingR = Math.max(0, session.pendingR + d); $("#rVal").textContent = session.pendingR; DB.set("session", session); }

function viewRest() {
  const ex = curEx(), nextIdx = session._afterRpe ? 0 : session.setIndex + 1, sp = setSpec(ex, nextIdx);
  return `<div class="screen">
    ${head(ex)}
    <div class="timer-wrap">
      <div class="timer rest" id="restTimer">--:--</div>
      <div class="timer-label">${I.clock()}Rest</div>
      <div class="rest-bar"><i id="restBar"></i></div>
    </div>
    <div class="center muted">další: set ${nextIdx + 1}/${exSets(ex).length} · ${sp.from}–${sp.to} op. · ${esc(ex.name)}</div>
    <div class="spacer"></div>
    <button class="btn btn-blue" onclick="endRest()">${I.bolt()}Jdu na set</button>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="adjustRest(-30)">${I.minus()}30 s</button>
      <button class="btn btn-ghost" onclick="adjustRest(30)">${I.plus()}30 s</button>
    </div>
    <div class="btn-row"><button class="btn btn-ghost" style="opacity:.5" onclick="undoSet()">${I.undo()}Vrátit poslední set</button></div>
    ${SpotifyUI.bar()}
  </div>`;
}
function viewRpe() {
  const ex = curEx(), sets = session.entries[ex.id].sets.map((s) => `${s.r}×${fmtW(s.w)}`).join(" · ");
  return `<div class="screen">
    <div class="ex-head" style="margin-top:26px">
      <div class="ex-sub">${esc(ex.sub)}</div>
      <div class="ex-name">${esc(ex.name)}</div>
      <div class="ex-set">Hotovo · ${sets}</div>
      <div class="ex-target">Jak náročné to bylo? RPE 1–10</div>
    </div>
    <div class="rpe-grid">${[1,2,3,4,5,6,7,8,9,10].map((v) => `<button class="rpe-btn" onclick="saveRpe(${v})">${v}</button>`).join("")}</div>
    <div class="center muted">1 = pohoda · 10 = absolutní selhání</div>
    <div class="btn-row"><button class="btn btn-ghost" style="opacity:.5" onclick="addSet()">${I.plus()}Ještě jeden set</button></div>
  </div>`;
}
function viewSummary() {
  const r = session.lastRecord;
  const sets = r.exercises.reduce((a, e) => a + e.sets.length, 0);
  const ton = r.exercises.reduce((a, e) => a + e.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
  const prs = r.exercises.filter((e) => {
    const before = Math.max(0, ...exHistory(e.id).slice(0, -1).flatMap((h) => h.sets.map((s) => s.w)));
    return topW(e.sets) > before;
  });
  return `<div class="screen">
    <div class="summary-ico">${I.trophy()}</div>
    <h1 class="brand">Trénink hotový</h1>
    <div class="sub">${esc(r.workoutName)} · ${r.durationMin} min</div>
    <div class="chips">
      <div class="chip"><b>${sets}</b> setů</div>
      <div class="chip"><b>${Math.round(ton).toLocaleString("cs-CZ")}</b> kg objem</div>
      ${prs.length ? `<div class="chip accent">${I.trophy()}<b>${prs.length}×</b> nový PR</div>` : ""}
    </div>
    ${prs.map((e) => `<div class="pr-line">${I.arrowUp()}${esc(e.name)} – ${fmtW(topW(e.sets))} kg</div>`).join("")}
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="closeSummary()">${I.check()}Zavřít</button>
  </div>`;
}

// ---------- doporučení ----------
function recos() {
  const out = [];
  for (const ex of allEx()) {
    const h = exHistory(ex.id);
    if (!h.length) continue;
    const last = h[h.length - 1], sp = ex.sets[ex.sets.length - 1];
    const tw = topW(last.sets), ws = workSets(last.sets);
    const hitTop = ws.every((s) => s.r >= sp.to);
    const belowBottom = ws.some((s) => s.r < sp.from);
    const sameW = h.slice(-3).filter((e) => topW(e.sets) === tw).length;
    if (h.length >= 3 && sameW >= 3 && !hitTop) {
      out.push({ p: 1, ex, txt: `Stojí 3 tréninky na ${fmtW(tw)} kg. Zkus deload na ${fmtW(Math.round(tw * 0.9 / ex.step) * ex.step)} kg a vyjeď to znovu.` });
    } else if (hitTop && (last.rpe == null || last.rpe <= 8)) {
      out.push({ p: 0, ex, txt: `Dal jsi horní hranici opakování${last.rpe ? ` při RPE ${last.rpe}` : ""}. Jdi na ${fmtW(tw + ex.step)} kg.` });
    } else if (last.rpe >= 9 && belowBottom) {
      out.push({ p: 2, ex, txt: `RPE ${last.rpe} a pod cílový rozsah. Drž ${fmtW(tw)} kg, dokud nedáš ${sp.from}+ opakování.` });
    }
  }
  return out.sort((a, b) => a.p - b.p);
}
function weekStats() {
  const days = weekDays(), keys = days.map((d) => d.key);
  const hs = history.filter((h) => keys.includes(h.date));
  const sets = hs.reduce((a, h) => a + h.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
  const ton = hs.reduce((a, h) => a + h.exercises.reduce((b, e) => b + e.sets.reduce((c, s) => c + s.w * s.r, 0), 0), 0);
  const rpes = hs.flatMap((h) => h.exercises.map((e) => e.rpe)).filter((x) => x != null);
  return { n: hs.length, sets, ton, rpe: rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1).replace(".", ",") : null };
}

// ---------- dashboard ----------
function viewDash() {
  const ws = weekStats(), rc = recos();
  const cards = allEx().map((e) => {
    const h = exHistory(e.id), last = h.length ? h[h.length - 1] : null;
    return `<div class="card" onclick="openEx('${e.id}')">
      <div class="body">
        <div class="title">${esc(e.name)}</div>
        <div class="meta">${h.length ? `${h.length}× · PR <span class="pr">${fmtW(prWeight(e.id))} kg</span> · naposledy ${last.sets.map((s) => s.r + "×" + fmtW(s.w)).join(", ")}` : `${esc(e.part)} · zatím žádná data`}</div>
      </div><div class="go">${I.chevronR()}</div></div>`;
  }).join("");
  const tot = history.reduce((a, h) => a + h.exercises.reduce((b, e) => b + e.sets.reduce((c, s) => c + s.w * s.r, 0), 0), 0);
  return `<div class="screen">
    <h1 class="brand">Dashboardy</h1>
    <div class="sub">${history.length} ${plural(history.length, "trénink", "tréninky", "tréninků")} · ${Math.round(tot).toLocaleString("cs-CZ")} kg celkem</div>
    <h2>${I.calendar()}Tento týden</h2>
    <div class="chips">
      <div class="chip"><b>${ws.n}</b> ${plural(ws.n, "trénink", "tréninky", "tréninků")}</div>
      <div class="chip"><b>${ws.sets}</b> setů</div>
      <div class="chip"><b>${Math.round(ws.ton).toLocaleString("cs-CZ")}</b> kg</div>
      ${ws.rpe ? `<div class="chip accent">${I.flame()}RPE <b>${ws.rpe}</b></div>` : ""}
    </div>
    <h2>${I.bulb()}Doporučení</h2>
    ${rc.length ? rc.map((r) => `<div class="card" onclick="openEx('${r.ex.id}')">
        <div class="dot ${r.p === 0 ? "up" : r.p === 1 ? "down" : "hold"}"></div>
        <div class="body">
          <div class="title" style="font-size:14px">${esc(r.ex.name)}</div>
          <div class="meta">${esc(r.txt)}</div>
        </div><div class="go">${I.chevronR()}</div></div>`).join("")
      : `<div class="muted">Odcvič pár tréninků a začnu ti radit, kdy přidat a kdy podržet váhu.</div>`}
    <h2>${I.dumbbell()}Cviky</h2>
    ${cards}
    <h2>${I.gear()}Nastavení a data</h2>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="dashView='settings';render()">${I.gear()}Kroky vah</button>
      <button class="btn btn-ghost" onclick="exportData()">Export</button>
      <button class="btn btn-ghost" onclick="importPrompt()">Import</button>
    </div>
    <div id="ioArea"></div>
  </div>`;
}
function openEx(id) { dashEx = id; render(); }
function viewExDetail(id) {
  const ex = allEx().find((e) => e.id === id);
  const h = exHistory(id);
  const rows = [...h].reverse().map((e) => `<tr><td>${fmtDate(e.date)}</td>
    <td>${e.sets.map((s) => `${s.r}×${fmtW(s.w)}`).join(" · ")}</td><td>${e.rpe ?? "–"}</td></tr>`).join("");
  return `<div class="screen">
    <div class="topbar"><button class="back" onclick="dashEx=null;render()">${I.chevronL()}</button></div>
    <div class="ex-head">
      <div class="ex-sub">${esc(ex ? ex.sub : "")}</div>
      <div class="ex-name">${esc(ex ? ex.name : id)}</div>
      <div class="ex-target">PR <span class="pr">${fmtW(prWeight(id))} kg</span> · ${h.length} ${plural(h.length, "záznam", "záznamy", "záznamů")}</div>
    </div>
    <h2>${I.chart()}Progres váhy (top set)</h2>
    <canvas class="chart" id="chartW" width="440" height="170"></canvas>
    <h2>${I.history()}Historie</h2>
    <table class="log"><tr><th>Datum</th><th>Sety</th><th>RPE</th></tr>
      ${rows || `<tr><td colspan="3" class="muted">Zatím nic – jdi cvičit</td></tr>`}</table>
  </div>`;
}

// ---------- nastavení kroků vah ----------
const STEPS = [0.5, 1, 1.25, 2, 2.5, 5, 10];
function viewSettings() {
  const rows = allEx().map((e) => `<div class="panel">
    <div class="title">${esc(e.name)}</div>
    <div class="meta">${esc(e.part)} · pauza ${e.rest} s</div>
    <div class="setrow">
      ${STEPS.map((s) => `<button class="stepchip ${e.step === s ? "on" : ""}" onclick="setStep('${e.id}',${s})">${fmtW(s)}</button>`).join("")}
    </div>
    <div class="setrow">
      <button class="stepchip" onclick="setRest('${e.id}',-15)">−15 s</button>
      <button class="stepchip" onclick="setRest('${e.id}',15)">+15 s</button>
    </div>
  </div>`).join("");
  return `<div class="screen">
    <div class="topbar"><button class="back" onclick="dashView='list';render()">${I.chevronL()}</button></div>
    <h1 class="brand">Kroky vah</h1>
    <div class="sub">o kolik kg skáčou tlačítka ± u každého cviku</div>
    ${rows}
    <div class="btn-row"><button class="btn btn-ghost" onclick="resetOverrides()">Vrátit původní hodnoty</button></div>
  </div>`;
}
function setStep(id, v) { overrides[id] = { ...(overrides[id] || {}), step: v }; DB.set("overrides", overrides); applyOverrides(); render(); }
function setRest(id, d) {
  const ex = allEx().find((e) => e.id === id);
  const v = Math.max(30, (ex.rest || 120) + d);
  overrides[id] = { ...(overrides[id] || {}), rest: v, restPrep: Math.max(30, Math.round(v * 0.7 / 15) * 15) };
  DB.set("overrides", overrides); applyOverrides(); render();
}
function resetOverrides() {
  if (!confirm("Vrátit všechny kroky vah a pauzy na původní?")) return;
  overrides = {}; DB.set("overrides", overrides);
  plan = JSON.parse(JSON.stringify(DEFAULT_PLAN)); DB.set("plan", plan); render();
}

// ---------- graf ----------
function drawChart(id, pts) {
  const c = $("#" + id); if (!c || !pts.length) return;
  const x = c.getContext("2d"), W = c.width, H = c.height, pad = 30;
  x.clearRect(0, 0, W, H);
  const vals = pts.map((p) => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 5; max += 5; }
  const X = (i) => pad + (i / Math.max(1, pts.length - 1)) * (W - pad * 2);
  const Y = (v) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  x.strokeStyle = "rgba(255,255,255,.08)"; x.lineWidth = 1;
  x.font = "600 10px Manrope, sans-serif"; x.fillStyle = "#5b6373";
  for (let g = 0; g <= 2; g++) {
    const v = min + ((max - min) * g) / 2, yy = Y(v);
    x.beginPath(); x.moveTo(pad, yy); x.lineTo(W - pad, yy); x.stroke();
    x.fillText(fmtW(Math.round(v * 10) / 10) + " kg", 2, yy + 3);
  }
  const grad = x.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#8b7cff"); grad.addColorStop(1, "#4c8dff");
  // jemná plocha pod křivkou
  const fill = x.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, "rgba(76,141,255,.22)"); fill.addColorStop(1, "rgba(76,141,255,0)");
  x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(X(i), Y(p.v)) : x.moveTo(X(i), Y(p.v))));
  x.lineTo(X(pts.length - 1), H - pad); x.lineTo(X(0), H - pad); x.closePath();
  x.fillStyle = fill; x.fill();
  x.strokeStyle = grad; x.lineWidth = 2.5; x.lineJoin = "round"; x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(X(i), Y(p.v)) : x.moveTo(X(i), Y(p.v))));
  x.stroke();
  // zvýrazněný poslední bod
  pts.forEach((p, i) => {
    const lastOne = i === pts.length - 1;
    x.beginPath(); x.arc(X(i), Y(p.v), lastOne ? 4.5 : 3, 0, 7);
    x.fillStyle = lastOne ? "#4c8dff" : "rgba(255,255,255,.35)"; x.fill();
    if (lastOne) { x.strokeStyle = "#000"; x.lineWidth = 2; x.stroke(); }
  });
}

// ---------- export / import ----------
function exportData() {
  $("#ioArea").innerHTML = `<div class="spacer"></div><textarea class="io" onclick="this.select()">${esc(JSON.stringify({ plan, history, overrides }))}</textarea><div class="muted center">Zkopíruj a ulož jako zálohu</div>`;
}
function importPrompt() {
  $("#ioArea").innerHTML = `<div class="spacer"></div><textarea class="io" id="importBox" placeholder="Vlož JSON zálohy"></textarea>
    <button class="btn btn-ghost" style="margin-top:8px" onclick="doImport()">Naimportovat</button>`;
}
function doImport() {
  try {
    const d = JSON.parse($("#importBox").value);
    if (d.plan) { plan = d.plan; DB.set("plan", plan); } else if (d.workouts) { plan = d; DB.set("plan", plan); }
    if (d.history) { history = d.history; DB.set("history", history); }
    if (d.overrides) { overrides = d.overrides; DB.set("overrides", overrides); }
    applyOverrides(); alert("Import OK"); render();
  } catch (e) { alert("Nevalidní JSON: " + e.message); }
}

// ---------- init ----------
window.addEventListener("load", () => {
  const unlock = () => beep(1, 0.01, 0.001);
  document.addEventListener("touchstart", unlock, { once: true });
  document.addEventListener("click", unlock, { once: true });
  SpotifyUI.init();
  if (session) keepAwake(true);
  render();
});
