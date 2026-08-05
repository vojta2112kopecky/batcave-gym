// ============================================================
// BATCAVE GYM – core
// Vanilla JS, bez závislostí. Mobile-first, 1 klik = posun dál.
// ============================================================
"use strict";

const DB = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); if (typeof Sync !== "undefined") Sync.queue(); },
};

let plan = DB.get("plan", null);
if (!plan || (plan.version || 0) < DEFAULT_PLAN.version) { plan = JSON.parse(JSON.stringify(DEFAULT_PLAN)); DB.set("plan", plan); }
let overrides = DB.get("overrides", {});   // exId -> {step, rest, restPrep}
let targets = DB.get("targets", {});       // "exId:setIndex" -> kg (navýšeno po překonání rekordu)
let history = DB.get("history", []);
let session = DB.get("session", null);
let tab = "workout";
let dashEx = null;
let dashView = "list";

function applyOverrides() {
  for (const w of plan.workouts) for (const e of w.exercises) {
    const o = overrides[e.id]; if (!o) continue;
    for (const k of ["step", "rest", "restPrep"]) if (o[k] != null) e[k] = o[k];
  }
}
applyOverrides();

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const round2 = (n) => Math.round(n * 100) / 100;
const fmtW = (w) => (w % 1 === 0 ? String(w) : String(round2(w)).replace(".", ","));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
const fmtDate = (s) => `${+s.slice(8)}. ${+s.slice(5, 7)}.`;
const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const wo = (id) => plan.workouts.find((w) => w.id === id);
const allEx = () => { const seen = new Set(), o = []; for (const w of plan.workouts) for (const e of w.exercises) if (!seen.has(e.id)) { seen.add(e.id); o.push(e); } return o; };

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

// ============================================================
// PROGRESSIVE OVERLOAD
// Cílový rozsah opakování je z plánu Trenér Petr (4–6, 8–10, 10–15, 15–25).
// Když ho překonáš, appka nabídne navýšení a nová váha se uloží jako cíl
// pro tenhle set – natrvalo a do cloudu.
// ============================================================
const tKey = (exId, i) => `${exId}:${i}`;

// váha, kterou má plán ukazovat: navýšený cíl → co jsem dal minule → z plánu
function planFor(ex, i) {
  const sp = setSpec(ex, i);
  const t = targets[tKey(ex.id, i)];
  const ls = lastSet(ex.id, i);
  const w = t != null ? t : ls ? ls.w : sp.kg ?? 0;
  let state = "";
  if (t != null && ls && t > ls.w) state = "up";        // čeká na tebe navýšení
  else if (ls && ls.r < sp.from) state = "down";        // minule pod cílem
  return { w, from: sp.from, to: sp.to, type: sp.type, state, raised: t != null };
}

// o kolik jde přidat – čtyři hodnoty nejblíž kroku daného cviku
function incOptions(ex) {
  const base = [...new Set([ex.step, round2(ex.step * 2), 1, 2, 2.5, 5, 10])].filter((v) => v >= 0.5);
  return base.sort((a, b) => Math.abs(a - ex.step) - Math.abs(b - ex.step)).slice(0, 4).sort((a, b) => a - b);
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
    exIndex: 0, setIndex: 0, phase: "ready", workStart: Date.now(),
    restEnd: null, restTotal: 0, _beeped: {}, pendingW: null, pendingR: null, entries: {}, extra: {},
  };
  DB.set("session", session); keepAwake(true); tab = "workout"; render();
}
function letsGo() {
  session.phase = "work"; session.startedAt = Date.now(); session.workStart = Date.now();
  DB.set("session", session); beep(660, .08, .06); setTimeout(() => beep(990, .12, .07), 90);
  render();
}
const curW = () => wo(session.workoutId);
const curEx = () => curW().exercises[session.exIndex];
const restFor = (ex, i) => (setSpec(ex, i).type === "prep" ? ex.restPrep || 90 : ex.rest || 120);

// uloží do cloudu hned, ne až po prodlevě (po každém setu)
function pushNow() { if (typeof Sync !== "undefined" && Sync.enabled()) Sync.push(); }

// zelené bliknutí, pak akce
function flashOk(el, fn) {
  if (!el || el.dataset.busy) return fn && fn();
  el.dataset.busy = "1";
  el.classList.add("ok");
  beep(880, .06, .05);
  setTimeout(fn, 240);
}
function finishSet(el) {
  flashOk(el, () => {
    const ex = curEx(), p = planFor(ex, session.setIndex);
    session.phase = "log";
    session.pendingW = session.pendingW ?? p.w;
    session.pendingR = session.pendingR ?? p.from;
    DB.set("session", session); render();
  });
}
function confirmSet(el) {
  flashOk(el, () => {
    const ex = curEx(), i = session.setIndex, sp = setSpec(ex, i);
    const w = session.pendingW, r = session.pendingR;
    const e = (session.entries[ex.id] = session.entries[ex.id] || { id: ex.id, name: ex.name, sets: [], rpe: null });
    e.sets.push({ w, r, t: sp.type });
    session.pendingW = null; session.pendingR = null;
    // překonal jsi horní hranici rozsahu → nabídnout navýšení
    if (r > sp.to) {
      session.phase = "record";
      session.record = { exId: ex.id, i, w, r, from: sp.from, to: sp.to, name: ex.name };
      DB.set("session", session); pushNow(); return render();
    }
    advanceAfterSet();
  });
}
function advanceAfterSet() {
  const ex = curEx();
  if (session.setIndex >= exSets(ex).length - 1) session.phase = "rpe";
  else startRest(restFor(ex, session.setIndex + 1));
  session.record = null;
  DB.set("session", session); pushNow(); render();
}
// navýšení se uloží jako cíl pro tenhle set – natrvalo a do cloudu
function raiseTarget(inc) {
  const rec = session.record;
  if (rec) {
    targets[tKey(rec.exId, rec.i)] = round2(rec.w + inc);
    DB.set("targets", targets);
  }
  advanceAfterSet();
}
function keepTarget() {
  const rec = session.record;
  if (rec) { targets[tKey(rec.exId, rec.i)] = rec.w; DB.set("targets", targets); }
  advanceAfterSet();
}
function startRest(sec) { session.phase = "rest"; session.restTotal = sec; session.restEnd = Date.now() + sec * 1000; session._beeped = {}; }
function adjustRest(d) { session.restEnd += d * 1000; session.restTotal = Math.max(1, session.restTotal + d); DB.set("session", session); }
function endRest() {
  if (session._afterRpe) session._afterRpe = false;
  else session.setIndex++;
  session.phase = "work"; session.workStart = Date.now();
  DB.set("session", session); render();
}
function undoSet() {
  const ex = curEx(), e = session.entries[ex.id];
  if (!e || !e.sets.length) return;
  const s = e.sets.pop();
  session.setIndex = e.sets.length;
  session.phase = "work"; session.workStart = Date.now();
  session.pendingW = s.w; session.pendingR = s.r;
  DB.set("session", session); render();
}
function addSet() {
  const ex = curEx();
  session.extra[ex.id] = (session.extra[ex.id] || 0) + 1;
  if (session.phase === "rpe") startRest(restFor(ex, session.setIndex + 1));
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
  DB.set("session", session); keepAwake(false);
  if (typeof Sync !== "undefined" && Sync.enabled()) Sync.push();
  render();
}
function closeSummary() { session = null; DB.set("session", null); render(); }
function abortWorkout() {
  if (!confirm("Zrušit rozdělaný trénink? Nic se neuloží.")) return;
  session = null; DB.set("session", null); keepAwake(false); render();
}
function endExercise() {
  const ex = curEx();
  if (session.entries[ex.id]?.sets.length) { session.phase = "rpe"; DB.set("session", session); return render(); }
  const w = curW();
  if (session.exIndex >= w.exercises.length - 1) return finishWorkout();
  session.exIndex++; session.setIndex = 0; session.phase = "work"; session.workStart = Date.now();
  DB.set("session", session); render();
}

// ---------- globální hodiny ----------
setInterval(() => {
  if (!session) return;
  if (session.phase === "work") {
    const el = $("#workTimer");
    if (el) el.textContent = fmtTime((Date.now() - session.workStart) / 1000);
  } else if (session.phase === "rest") {
    const left = Math.max(0, (session.restEnd - Date.now()) / 1000);
    const el = $("#restTimer"), bar = $("#restBar"), mini = $("#navRest");
    if (el) { el.textContent = fmtTime(Math.ceil(left)); el.classList.toggle("ending", left <= 10 && left > 0); }
    if (bar) bar.style.transform = `scaleX(${left / session.restTotal})`;
    if (mini) mini.textContent = fmtTime(Math.ceil(left));
    // pípne jen dvakrát: v 10 sekundách a na konci
    if (left <= 10 && !session._beeped.ten) { session._beeped.ten = 1; beep(880, 0.14, 0.07); }
    if (left <= 0) { gong(); endRest(); }
  }
}, 200);

// ---------- render ----------
function render() {
  let html;
  if (tab === "dash") html = dashView === "settings" ? viewSettings() : dashEx ? viewExDetail(dashEx) : viewDash();
  else if (!session) html = viewHome();
  else if (session.phase === "ready") html = viewReady();
  else if (session.phase === "work") html = viewWork();
  else if (session.phase === "log") html = viewLog();
  else if (session.phase === "rest") html = viewRest();
  else if (session.phase === "record") html = viewRecord();
  else if (session.phase === "rpe") html = viewRpe();
  else html = viewSummary();
  $("#app").innerHTML = html + (session && session.phase === "ready" ? "" : viewNav());
  if (tab === "dash" && dashEx && dashView !== "settings") drawChart("chartW", exHistory(dashEx).map((e) => ({ v: topW(e.sets) })));
  if (typeof paintSync === "function") paintSync();
}
function viewNav() {
  const resting = session && session.phase === "rest" && tab !== "workout";
  return `<nav>
    <button class="${tab === "workout" ? "active" : ""}" onclick="switchTab('workout')">${I.dumbbell()}${resting ? `<b id="navRest">--:--</b>` : "Trénink"}${session && !resting ? '<i class="live"></i>' : ""}</button>
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
    const key = iso(d), ov = plan.overrides || {};
    return { date: d, key, dow: DOW[i], num: d.getDate(),
      workoutId: key in ov ? ov[key] : plan.schedule[i + 1] || null,
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

// ---------- LET'S GET IT ----------
function viewReady() {
  const w = curW();
  // cviky se seskupí po partiích tak, jak jdou v plánu za sebou
  const groups = [];
  for (const e of w.exercises) {
    const g = groups[groups.length - 1];
    if (g && g.part === e.part) g.items.push(e);
    else groups.push({ part: e.part, items: [e] });
  }
  const tree = groups.map((g, gi) => `<div class="branch" style="--i:${gi}">
      <div class="node-part"><i class="pin"></i>${esc(g.part)}</div>
      <ul class="twigs">${g.items.map((e) => `<li><i class="j"></i>
        <span class="nm">${esc(e.name)}</span><span class="n">${e.sets.length}×</span></li>`).join("")}</ul>
    </div>`).join("");

  return `<div class="ready">
    <button class="back" onclick="abortWorkout()">${I.close()}</button>
    <div class="ready-in">
      <div class="ready-title">${esc(w.name)}</div>
      <div class="tree">${tree}</div>
      <button class="btn btn-primary btn-huge" onclick="letsGo()">${I.bolt()}Let's get it</button>
    </div>
  </div>`;
}

// ---------- trénink ----------
function head(ex) {
  const sets = exSets(ex), sp = setSpec(ex, session.setIndex);
  const cells = sets.map((s, i) => `<i class="${i < session.setIndex ? "done" : i === session.setIndex ? "cur" : ""} ${s.type === "prep" ? "prep" : ""}"></i>`).join("");
  return `<div class="topbar">
    <button class="back" onclick="abortWorkout()">${I.close()}</button>
    ${Sync.enabled() ? `<span class="save-pip"><i id="syncDot" class="sync-dot ${Sync.status}"></i><span id="syncState" class="sync-state ${Sync.status}">${Sync.label()}</span></span>` : ""}
  </div>
  <div class="ex-head">
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="setdots">${cells}</div>
    <div class="ex-set">${sp.type === "prep" ? "Přípravný" : "Pracovní"}${sp.bonus ? " +" : ""}</div>
  </div>`;
}
// stabilní „náhodné" opakování, když z minula žádné číslo není
function seededReps(exId, i, from, to) {
  const s = exId + ":" + i;
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return from + (Math.abs(h) % (to - from + 1));
}
// vlevo minule, vpravo plán s cílovým rozsahem opakování
function statsBlock(ex, i) {
  const ls = lastSet(ex.id, i), sp = setSpec(ex, i), p = planFor(ex, i);
  const prevR = ls ? ls.r : seededReps(ex.id, i, sp.from, sp.to);
  const prevW = ls ? ls.w : sp.kg ?? p.w;
  return `<div class="stats">
    <div class="stat ${ls ? "" : "ghost"}">
      <div class="k">Minule</div>
      <div class="v">${prevR} op.</div>
      <div class="v">${fmtW(prevW)} kg</div>
    </div>
    <div class="stat ${p.state}">
      <div class="k">Plán</div>
      <div class="v">${p.from}–${p.to} op.</div>
      <div class="v">${fmtW(p.w)} kg</div>
    </div>
  </div>`;
}
function viewRecord() {
  const r = session.record, ex = curEx();
  const opts = incOptions(ex).map((v) => `<button class="rec-opt" onclick="raiseTarget(${v})">
      <b>+${fmtW(v)} kg</b><span>${fmtW(round2(r.w + v))} kg</span></button>`).join("");
  return `<div class="screen record-screen">
    <div class="rec-ico">${I.trophy()}</div>
    <div class="rec-title">Gratuluju!</div>
    <div class="rec-sub">Beatnul jsi rekord, je čas navýšit</div>
    <div class="rec-box">
      <div class="rec-ex">${esc(r.name)}</div>
      <div class="rec-nums"><b>${r.r} opakování</b> při cíli ${r.from}–${r.to} · ${fmtW(r.w)} kg</div>
    </div>
    <div class="rec-k">O kolik příště přidáme?</div>
    <div class="rec-grid">${opts}</div>
    <button class="btn btn-3" onclick="keepTarget()">Nechat ${fmtW(r.w)} kg</button>
  </div>`;
}
function viewWork() {
  const ex = curEx(), i = session.setIndex;
  const logged = session.entries[ex.id]?.sets.length || 0;
  return `<div class="screen">
    ${head(ex)}
    ${statsBlock(ex, i)}
    <div class="timer-wrap">
      <div class="timer work" id="workTimer">0:00</div>
      <div class="timer-label">${I.clock()}Work time</div>
    </div>
    <button class="btn btn-primary" onclick="finishSet(this)">${I.check()}Set hotový</button>
    <div class="btn-row">
      ${logged ? `<button class="btn btn-3" onclick="undoSet()">${I.undo()}Vrátit set</button>` : ""}
      <button class="btn btn-3" onclick="addSet()">${I.plus()}Set navíc</button>
      <button class="btn btn-3" onclick="endExercise()">${I.skip()}Konec cviku</button>
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
    <button class="btn btn-primary" onclick="confirmSet(this)">${I.check()}Uložit set</button>
  </div>`;
}
function bumpW(d) { session.pendingW = Math.max(0, round2(session.pendingW + d * curEx().step)); $("#wVal").innerHTML = `${fmtW(session.pendingW)}<small> kg</small>`; DB.set("session", session); }
function bumpR(d) { session.pendingR = Math.max(0, session.pendingR + d); $("#rVal").textContent = session.pendingR; DB.set("session", session); }

function viewRest() {
  const ex = curEx(), nextIdx = session._afterRpe ? 0 : session.setIndex + 1;
  const p = planFor(ex, nextIdx);
  return `<div class="screen rest-screen">
    <div class="timer-wrap">
      <div class="timer rest" id="restTimer">--:--</div>
      <div class="timer-label">${I.clock()}Rest</div>
      <div class="rest-bar"><i id="restBar"></i></div>
    </div>
    <button class="btn btn-primary" onclick="endRest()">${I.bolt()}Jdu na set</button>
    <div class="next-wrap">
      <div class="next-k">Další</div>
      <div class="next-box">
        <div class="next-name">${esc(ex.name)}</div>
        <div class="next-nums"><b>${fmtW(p.w)} kg</b><span>·</span><b>${p.from}–${p.to} op.</b></div>
      </div>
    </div>
  </div>`;
}
function viewRpe() {
  const ex = curEx(), sets = session.entries[ex.id].sets.map((s) => `${s.r}×${fmtW(s.w)}`).join(" · ");
  return `<div class="screen">
    <div class="ex-head" style="margin-top:24px">
      <div class="ex-name">${esc(ex.name)}</div>
      <div class="ex-set" style="margin-top:8px">Hotovo · ${sets}</div>
      <div class="ex-target">Jak náročné to bylo? RPE 1–10</div>
    </div>
    <div class="rpe-grid">${[1,2,3,4,5,6,7,8,9,10].map((v) => `<button class="rpe-btn" onclick="saveRpe(${v})">${v}</button>`).join("")}</div>
    <div class="center muted">1 = pohoda · 10 = absolutní selhání</div>
    <div class="btn-row"><button class="btn btn-3" onclick="addSet()">${I.plus()}Ještě jeden set</button></div>
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
    for (let i = 0; i < ex.sets.length; i++) {
      const p = planFor(ex, i), ls = lastSet(ex.id, i);
      if (!ls) continue;
      if (p.state === "up") {
        out.push({ ex, p, prio: 0, why: `set ${i + 1}: navýšeno na ${fmtW(p.w)} kg – příště to vyjeď` });
        break;
      }
      if (p.state === "down") {
        out.push({ ex, p, prio: 1, why: `set ${i + 1}: minule ${ls.r} op. při cíli ${p.from}–${p.to} – drž ${fmtW(p.w)} kg` });
        break;
      }
    }
  }
  return out.sort((a, b) => a.prio - b.prio);
}
function weekStats() {
  const keys = weekDays().map((d) => d.key);
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
    const p = planFor(e, e.sets.length - 1);
    return `<div class="card" onclick="openEx('${e.id}')">
      <div class="body">
        <div class="title">${esc(e.name)}</div>
        <div class="meta">${h.length
          ? `${h.length}× · PR <span class="pr">${fmtW(prWeight(e.id))} kg</span> · naposledy ${last.sets.map((s) => s.r + "×" + fmtW(s.w)).join(", ")}`
          : `${esc(e.part)} · start ${fmtW(p.w)} kg`}</div>
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
        <div class="dot ${r.p.state}"></div>
        <div class="body">
          <div class="title" style="font-size:14px">${esc(r.ex.name)}</div>
          <div class="meta">${esc(r.why)}</div>
        </div><div class="go">${I.chevronR()}</div></div>`).join("")
      : `<div class="muted">Odcvič pár tréninků a začnu ti radit, kdy přidat a kdy podržet váhu.</div>`}
    <h2>${I.dumbbell()}Cviky</h2>
    ${cards}
    <h2>${I.gear()}Nastavení</h2>
    <div class="card" onclick="dashView='settings';render()">
      <div class="body"><div class="title">Nastavení a data</div>
      <div class="meta">cloud sync <span id="syncState" class="sync-state ${Sync.status}">${Sync.label()}</span> · kroky vah · záloha</div></div>
      <div class="go">${I.chevronR()}</div></div>
  </div>`;
}
function openEx(id) { dashEx = id; render(); }
function viewExDetail(id) {
  const ex = allEx().find((e) => e.id === id);
  const h = exHistory(id);
  const p = ex ? planFor(ex, ex.sets.length - 1) : null;
  const rows = [...h].reverse().map((e) => `<tr><td>${fmtDate(e.date)}</td>
    <td>${e.sets.map((s) => `${s.r}×${fmtW(s.w)}`).join(" · ")}</td><td>${e.rpe ?? "–"}</td></tr>`).join("");
  return `<div class="screen">
    <div class="topbar"><button class="back" onclick="dashEx=null;render()">${I.chevronL()}</button></div>
    <div class="ex-head">
      <div class="ex-name">${esc(ex ? ex.name : id)}</div>
      <div class="ex-target">PR <span class="pr">${fmtW(prWeight(id))} kg</span> · ${h.length} ${plural(h.length, "záznam", "záznamy", "záznamů")}</div>
    </div>
    ${p ? `<div class="stats one"><div class="stat ${p.state}">
      <div class="k">Příště</div><div class="v">${p.from}–${p.to} op.</div><div class="v">${fmtW(p.w)} kg</div></div></div>` : ""}
    <h2>${I.chart()}Progres váhy (top set)</h2>
    <canvas class="chart" id="chartW" width="440" height="170"></canvas>
    <h2>${I.history()}Historie</h2>
    <table class="log"><tr><th>Datum</th><th>Sety</th><th>RPE</th></tr>
      ${rows || `<tr><td colspan="3" class="muted">Zatím nic – jdi cvičit</td></tr>`}</table>
  </div>`;
}

// ---------- nastavení ----------
const STEPS = [0.5, 1, 1.25, 2, 2.5, 5, 10];
function viewSettings() {
  const rows = allEx().map((e) => `<div class="panel">
    <div class="title">${esc(e.name)}</div>
    <div class="meta">${esc(e.part)} · pauza ${e.rest} s</div>
    <div class="setrow">${STEPS.map((s) => `<button class="stepchip ${e.step === s ? "on" : ""}" onclick="setStep('${e.id}',${s})">${fmtW(s)}</button>`).join("")}</div>
    <div class="setrow pair">
      <button class="stepchip" onclick="setRest('${e.id}',-15)">−15 s pauza</button>
      <button class="stepchip" onclick="setRest('${e.id}',15)">+15 s pauza</button>
    </div>
  </div>`).join("");

  const sync = Sync.enabled()
    ? `<div class="panel">
        <div class="title"><span id="syncDot" class="sync-dot ${Sync.status}"></span>Cloud sync zapnutý</div>
        <div class="meta">poslední: <span id="syncState" class="sync-state ${Sync.status}">${Sync.label()}</span></div>
        <div class="meta code" onclick="copySync()">${esc(Sync.id)}</div>
        <div class="meta">Tenhle kód zadej na mobilu a máš tam stejná data.</div>
        <div class="btn-row">
          <button class="btn btn-2" onclick="Sync.pull()">${I.cloud()}Stáhnout</button>
          <button class="btn btn-2" onclick="Sync.push()">${I.arrowUp()}Nahrát</button>
        </div>
        <div class="btn-row"><button class="btn btn-3" onclick="Sync.disconnect()">Odpojit</button></div>
      </div>`
    : `<div class="panel">
        <div class="title">Cloud sync</div>
        <div class="meta">Zapni a dostaneš kód. Zadáš ho na dalším zařízení a historie se drží pohromadě.</div>
        <div class="btn-row"><button class="btn btn-primary" style="font-size:14px;padding:14px" onclick="syncStart()">${I.cloud()}Zapnout sync</button></div>
        <div class="btn-row"><button class="btn btn-3" onclick="syncJoin()">Mám kód z jiného zařízení</button></div>
      </div>`;

  return `<div class="screen">
    <div class="topbar"><button class="back" onclick="dashView='list';render()">${I.chevronL()}</button></div>
    <h1 class="brand">Nastavení</h1>
    <div class="sub">sync, kroky vah, záloha</div>
    <h2>${I.cloud()}Cloud sync</h2>
    ${sync}
    <h2>${I.gear()}Kroky vah</h2>
    <div class="muted" style="margin-bottom:10px">O kolik kg skáčou tlačítka ± u každého cviku.</div>
    ${rows}
    <h2>${I.history()}Záloha</h2>
    <div class="btn-row">
      <button class="btn btn-2" onclick="exportData()">Export JSON</button>
      <button class="btn btn-2" onclick="importPrompt()">Import</button>
    </div>
    <div id="ioArea"></div>
    <div class="btn-row"><button class="btn btn-3" onclick="resetOverrides()">Vrátit kroky vah na původní</button></div>
  </div>`;
}
async function syncStart() { const id = await Sync.create(); if (id) { alert("Sync zapnutý.\n\nKód:\n" + id + "\n\nZadej ho na mobilu."); render(); } else alert("Nepovedlo se: " + Sync.msg); }
async function syncJoin() {
  const id = prompt("Vlož sync kód z druhého zařízení:");
  if (!id) return;
  const ok = await Sync.connect(id);
  alert(ok ? "Napojeno, data stažena." : "Nepovedlo se: " + Sync.msg);
  render();
}
function copySync() { navigator.clipboard?.writeText(Sync.id); alert("Kód zkopírován."); }
function setStep(id, v) { overrides[id] = { ...(overrides[id] || {}), step: v }; DB.set("overrides", overrides); applyOverrides(); render(); }
function setRest(id, d) {
  const ex = allEx().find((e) => e.id === id);
  const v = Math.max(30, (ex.rest || 120) + d);
  overrides[id] = { ...(overrides[id] || {}), rest: v, restPrep: Math.max(30, Math.round(v * 0.7 / 5) * 5) };
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
  const fill = x.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, "rgba(76,141,255,.22)"); fill.addColorStop(1, "rgba(76,141,255,0)");
  x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(X(i), Y(p.v)) : x.moveTo(X(i), Y(p.v))));
  x.lineTo(X(pts.length - 1), H - pad); x.lineTo(X(0), H - pad); x.closePath();
  x.fillStyle = fill; x.fill();
  const grad = x.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#8b7cff"); grad.addColorStop(1, "#4c8dff");
  x.strokeStyle = grad; x.lineWidth = 2.5; x.lineJoin = "round"; x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(X(i), Y(p.v)) : x.moveTo(X(i), Y(p.v))));
  x.stroke();
  pts.forEach((p, i) => {
    const isLast = i === pts.length - 1;
    x.beginPath(); x.arc(X(i), Y(p.v), isLast ? 4.5 : 3, 0, 7);
    x.fillStyle = isLast ? "#4c8dff" : "rgba(255,255,255,.35)"; x.fill();
    if (isLast) { x.strokeStyle = "#000"; x.lineWidth = 2; x.stroke(); }
  });
}

// ---------- export / import ----------
function exportData() {
  $("#ioArea").innerHTML = `<div class="spacer"></div><textarea class="io" onclick="this.select()">${esc(JSON.stringify({ plan, history, overrides }))}</textarea><div class="muted center">Zkopíruj a ulož jako zálohu</div>`;
}
function importPrompt() {
  $("#ioArea").innerHTML = `<div class="spacer"></div><textarea class="io" id="importBox" placeholder="Vlož JSON zálohy"></textarea>
    <button class="btn btn-2" style="margin-top:8px" onclick="doImport()">Naimportovat</button>`;
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
  if (Sync.enabled()) {
    Sync.pull(true).then(() => {
      // minule se nestihlo uložit (výpadek signálu) → dorovnej to teď
      if (localStorage.getItem("sync_dirty") === "1") Sync.push(true);
    });
  }
});
