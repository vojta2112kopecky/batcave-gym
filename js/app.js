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
let dashGroup = "";

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
    order: w.exercises.map((_, i) => i),
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
// pořadí cviků se dá pro dnešek přeházet
const curExs = () => {
  const list = curW().exercises;
  return session.order && session.order.length === list.length ? session.order.map((i) => list[i]) : list;
};
const curEx = () => curExs()[session.exIndex];
// pauza: mezi pracovními sériemi delší, jinak kratší; vlastní nastavení má přednost
function restFor(ex, i) {
  const prev = i > 0 ? setSpec(ex, i - 1) : null, next = setSpec(ex, i);
  const workToWork = prev && prev.type === "work" && next.type === "work";
  const o = overrides[ex.id];
  if (o && o.rest != null) return workToWork ? o.rest : o.restPrep ?? o.rest;
  return workToWork ? plan.restWork || 105 : plan.restPrep || 90;
}

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
    // překonal jsi horní hranici rozsahu → nabídnout navýšení (pauza už mezitím běží)
    if (r > sp.to) {
      const last = session.setIndex >= exSets(ex).length - 1;
      startRest(last ? plan.restBetweenExercises || 120 : restFor(ex, session.setIndex + 1));
      session.phase = "record";
      session.record = { exId: ex.id, i, w, r, from: sp.from, to: sp.to, name: ex.name, last };
      DB.set("session", session); pushNow(); return render();
    }
    advanceAfterSet();
  });
}
function advanceAfterSet() {
  const ex = curEx();
  const last = session.setIndex >= exSets(ex).length - 1;
  // časovač naskočí hned po uložení série – běží i na RPE obrazovce
  startRest(last ? plan.restBetweenExercises || 120 : restFor(ex, session.setIndex + 1));
  session.phase = last ? "rpe" : "rest";
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
  afterRecord();
}
function keepTarget() {
  const rec = session.record;
  if (rec) { targets[tKey(rec.exId, rec.i)] = rec.w; DB.set("targets", targets); }
  afterRecord();
}
// pauza už běží, jen se přepne obrazovka
function afterRecord() {
  session.phase = session.record && session.record.last ? "rpe" : "rest";
  session.record = null;
  DB.set("session", session); pushNow(); render();
}
function startRest(sec) {
  session.phase = "rest"; session.restTotal = sec;
  session.restStart = Date.now();
  session.restEnd = Date.now() + sec * 1000;
  session.paused = false; session.pausedAt = null; session._beeped = {};
}
function adjustRest(d) { session.restEnd += d * 1000; session.restTotal = Math.max(1, session.restTotal + d); DB.set("session", session); }
// countdown se dá pauznout; čas od začátku pauzy běží dál
// pauza nesmí překreslit obrazovku – mění se jen pár prvků na místě
function togglePause() {
  if (session.paused) {
    session.restEnd += Date.now() - session.pausedAt;
    session.paused = false; session.pausedAt = null;
  } else {
    session.paused = true; session.pausedAt = Date.now();
  }
  DB.set("session", session);
  const btn = $("#pauseBtn"), chip = $("#elapsedChip"), t = $("#restTimer"), lbl = $("#restLabel");
  if (btn) { btn.classList.toggle("on", session.paused); btn.innerHTML = session.paused ? I.play() : I.pause(); }
  if (chip) chip.classList.toggle("show", session.paused);
  if (t) t.classList.toggle("paused", session.paused);
  if (lbl) lbl.textContent = session.paused ? "Pauza" : "Rest";
}
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
  if (session.exIndex >= curExs().length - 1) return finishWorkout();
  session.exIndex++; session.setIndex = 0; session._afterRpe = true;
  // pauza už běží od chvíle, co jsi uložil poslední sérii – nerestartuje se
  session.phase = "rest";
  DB.set("session", session); pushNow(); render();
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

// ---------- pořadí cviků na dnešek ----------
function openOrder() { session.order = session.order || curW().exercises.map((_, i) => i); session.orderOpen = true; DB.set("session", session); render(); }
function closeOrder() { session.orderOpen = false; session._draft = null; DB.set("session", session); render(); }
function saveOrder() {
  if (session._draft) {
    // hotové cviky zůstávají vpředu, mění se jen ty, co mě ještě čekají
    session.order = session.order.slice(0, session.exIndex).concat(session._draft);
    session._draft = null;
  }
  session.orderOpen = false; DB.set("session", session); pushNow(); render();
}
function viewOrder() {
  const list = curW().exercises;
  const rest = session.order.slice(session.exIndex);
  return `<div class="modal-wrap" onclick="closeOrder()">
    <div class="modal order-modal" onclick="event.stopPropagation()">
      <div class="m-title">Změň pořadí cviků</div>
      <div class="m-sub">Přetáhni za úchyt. Klepnutím na cvik na něj rovnou skočíš.</div>
      <div class="order-list" id="orderList">
        ${rest.map((oi, k) => {
          const done = session.entries[list[oi].id]?.sets.length || 0;
          return `<div class="order-item ${k === 0 ? "cur" : ""}" data-oi="${oi}" onclick="jumpTo(${oi})">
            <i class="grip" onclick="event.stopPropagation()">${I.grip()}</i>
            <span>${esc(list[oi].name)}</span>
            ${done ? `<b class="odone">${done}×</b>` : ""}</div>`;
        }).join("")}
      </div>
      <div class="m-row">
        <button class="btn btn-2" onclick="closeOrder()">Zpět</button>
        <button class="btn btn-primary" onclick="saveOrder()">Potvrdit</button>
      </div>
    </div>
  </div>`;
}
// skok na konkrétní cvik – odcvičené série si drží
function jumpTo(oi) {
  if (session._draft) {
    session.order = session.order.slice(0, session.exIndex).concat(session._draft);
    session._draft = null;
  }
  const idx = session.order.indexOf(oi);
  if (idx < 0) return;
  const ex = curW().exercises[oi];
  session.exIndex = idx;
  session.setIndex = session.entries[ex.id]?.sets.length || 0;
  session.phase = "work"; session.workStart = Date.now();
  session.orderOpen = false; session._afterRpe = false;
  DB.set("session", session); pushNow(); render();
}
// přetahování prstem i myší
function initOrderDrag() {
  const list = $("#orderList");
  if (!list) return;
  let drag = null;
  const items = () => [...list.querySelectorAll(".order-item")];
  const commit = () => { session._draft = items().map((el) => +el.dataset.oi); };
  list.querySelectorAll(".grip").forEach((h) => {
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const el = h.closest(".order-item");
      drag = { el, y: e.clientY, h: el.offsetHeight };
      el.classList.add("dragging");
      h.setPointerCapture(e.pointerId);
    });
    h.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      drag.el.style.transform = `translateY(${dy}px)`;
      const others = items().filter((x) => x !== drag.el);
      for (const o of others) {
        const r = o.getBoundingClientRect(), c = r.top + r.height / 2;
        const dr = drag.el.getBoundingClientRect(), dc = dr.top + dr.height / 2;
        if ((dc < c && o.compareDocumentPosition(drag.el) & Node.DOCUMENT_POSITION_FOLLOWING) ||
            (dc > c && o.compareDocumentPosition(drag.el) & Node.DOCUMENT_POSITION_PRECEDING)) {
          continue;
        }
        if (dc < c && dr.top < c && o.compareDocumentPosition(drag.el) & 2) { list.insertBefore(drag.el, o); drag.y = e.clientY; drag.el.style.transform = ""; break; }
        if (dc > c && dr.bottom > c && o.compareDocumentPosition(drag.el) & 4) { list.insertBefore(drag.el, o.nextSibling); drag.y = e.clientY; drag.el.style.transform = ""; break; }
      }
    });
    const end = () => { if (!drag) return; drag.el.style.transform = ""; drag.el.classList.remove("dragging"); drag = null; commit(); };
    h.addEventListener("pointerup", end);
    h.addEventListener("pointercancel", end);
  });
}

// ✕ → potvrzení přímo v appce
function askAbort() { session.ask = true; DB.set("session", session); render(); }
function closeAsk() { session.ask = false; DB.set("session", session); render(); }
function viewAsk() {
  const done = Object.values(session.entries || {}).reduce((a, e) => a + e.sets.length, 0);
  return `<div class="modal-wrap" onclick="closeAsk()">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="m-title">Opravdu chceš ukončit trénink?</div>
      <div class="m-sub">${done ? `${done} ${plural(done, "série se uloží", "série se uloží", "sérií se uloží")}.` : "Zatím tu nic odcvičeného není."}</div>
      <div class="m-row">
        <button class="btn btn-2" onclick="closeAsk()">Ne</button>
        <button class="btn btn-primary" onclick="endWorkoutEarly()">Ano, ukončit</button>
      </div>
      <button class="btn btn-3 danger" onclick="discardWorkout()">${I.close()}Smazat trénink bez uložení</button>
    </div>
  </div>`;
}
// ukončí trénink, ale co je odcvičené, uloží
function endWorkoutEarly() {
  const has = Object.values(session.entries || {}).some((e) => e.sets.length);
  if (has) {
    history.push({
      date: session.date, workoutId: session.workoutId, workoutName: session.workoutName,
      durationMin: Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)),
      exercises: Object.values(session.entries).filter((e) => e.sets.length),
    });
    DB.set("history", history);
  }
  session = null; DB.set("session", null); keepAwake(false); pushNow(); render();
}
function discardWorkout() {
  session = null; DB.set("session", null); keepAwake(false); pushNow(); render();
}
function endExercise() {
  const ex = curEx();
  if (session.entries[ex.id]?.sets.length) {
    startRest(plan.restBetweenExercises || 120);
    session.phase = "rpe"; DB.set("session", session); return render();
  }
  if (session.exIndex >= curExs().length - 1) return finishWorkout();
  session.exIndex++; session.setIndex = 0; session.phase = "work"; session.workStart = Date.now();
  DB.set("session", session); render();
}

// ---------- globální hodiny ----------
setInterval(() => {
  // boxerský timer
  if (box && (box.phase === "work" || box.phase === "rest")) {
    const left = Math.max(0, (box.endAt - (box.paused ? box.pausedAt : Date.now())) / 1000);
    const el = $("#boxTimer"), bar = $("#boxBar");
    if (el) el.textContent = fmtTime(Math.ceil(left));
    if (bar) bar.style.transform = `scaleX(${left / (box.phase === "work" ? box.work : box.rest)})`;
    if (!box.paused) {
      box._b = box._b || {};
      if (left <= 10 && !box._b.ten) { box._b.ten = 1; beep(880, 0.1, 0.05); }
      if (left <= 0) boxNext();
    }
  }
  if (!session) return;
  if (session.phase === "work") {
    const el = $("#workTimer");
    if (el) el.textContent = fmtTime((Date.now() - session.workStart) / 1000);
  } else if (session.phase === "rest" || session.phase === "rpe" || session.phase === "record") {
    const now = Date.now();
    const ref = session.paused ? session.pausedAt : now;      // pauza countdown zmrazí
    const left = Math.max(0, (session.restEnd - ref) / 1000);
    const el = $("#restTimer"), bar = $("#restBar"), mini = $("#navRest");
    if (el) { el.textContent = fmtTime(Math.ceil(left)); el.classList.toggle("ending", left <= 10 && left > 0 && !session.paused); }
    if (bar) bar.style.transform = `scaleX(${left / session.restTotal})`;
    if (mini) mini.textContent = fmtTime(Math.ceil(left));
    // skutečně uběhlý čas pauzy – běží pořád, i když je countdown zastavený
    const elapsed = $("#restElapsed");
    if (elapsed && session.restStart) elapsed.textContent = fmtTime((now - session.restStart) / 1000);
    if (session.paused) return;
    // pípne jen dvakrát: v 10 sekundách a na konci – i když jsem na RPE
    if (left <= 10 && !session._beeped.ten) { session._beeped.ten = 1; beep(880, 0.14, 0.07); }
    if (left <= 0 && !session._beeped.end) { session._beeped.end = 1; gong(); }
    if (left <= 0 && session.phase === "rest") endRest();
  }
}, 200);

// ---------- render ----------
function render() {
  let html;
  if (box) html = viewBox();
  else if (tab === "dash") html = dashView === "settings" ? viewSettings() : dashEx ? viewExDetail(dashEx) : viewDash();
  else if (!session) html = viewHome();
  else if (session.phase === "ready") html = viewReady();
  else if (session.phase === "work") html = viewWork();
  else if (session.phase === "log") html = viewLog();
  else if (session.phase === "rest") html = viewRest();
  else if (session.phase === "record") html = viewRecord();
  else if (session.phase === "rpe") html = viewRpe();
  else html = viewSummary();
  // během tréninku a boxu spodní navigace mizí, dole jsou akční tlačítka
  const inWorkout = !!box || (session && tab === "workout" && session.phase !== "summary");
  $("#app").className = inWorkout ? "in-workout" : "";
  $("#app").innerHTML = html + (inWorkout ? "" : viewNav())
    + (session && session.ask ? viewAsk() : "")
    + (session && session.orderOpen ? viewOrder() : "")
    + (weekOpen ? viewWeekEdit() : "") + (planOpen ? viewPlan4() : "");
  if (session && session.orderOpen) initOrderDrag();
  if (tab === "dash" && dashEx && dashView !== "settings") drawExCharts(dashEx);
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

  return `<div class="screen">
    <div class="logo-row">${I.bat("bat-mark")}<h1 class="brand">Batcave <em>Gym</em></h1></div>
    <h2>${I.calendar()}Tento týden
      <button class="h2-act" onclick="openWeek()">upravit</button>
      <button class="h2-act" onclick="openPlan()">4 týdny</button>
    </h2>
    <div class="week">${cal}</div>
    <div class="spacer"></div>
    ${hero}
    ${SpotifyUI.bar()}
    ${last7()}
  </div>`;
}

// ---------- statistiky za 7 dní ----------
function last7() {
  const days = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base); d.setDate(base.getDate() - i);
    const key = iso(d);
    const hs = history.filter((h) => h.date === key);
    const ton = hs.reduce((a, h) => a + h.exercises.reduce((b, e) => b + e.sets.reduce((c, s) => c + s.w * s.r, 0), 0), 0);
    const sets = hs.reduce((a, h) => a + h.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
    days.push({ key, dow: DOW[(d.getDay() + 6) % 7], ton, sets, n: hs.length });
  }
  const max = Math.max(1, ...days.map((d) => d.ton));
  const totT = days.reduce((a, d) => a + d.ton, 0);
  const totS = days.reduce((a, d) => a + d.sets, 0);
  const n = days.filter((d) => d.n).length;
  const rpes = history.filter((h) => days.some((d) => d.key === h.date)).flatMap((h) => h.exercises.map((e) => e.rpe)).filter((x) => x != null);
  const avgRpe = rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1).replace(".", ",") : "–";
  const bars = days.map((d, i) => `<div class="b7">
      <i style="height:${d.ton ? Math.max(8, (d.ton / max) * 100) : 3}%;--i:${i}" class="${d.ton ? "on" : ""}"></i>
      <span>${d.dow}</span></div>`).join("");
  return `<h2>${I.chart()}Posledních 7 dní</h2>
    <div class="s7">
      <div class="s7-nums">
        <div><b>${n}</b><span>${plural(n, "trénink", "tréninky", "tréninků")}</span></div>
        <div><b>${totS}</b><span>sérií</span></div>
        <div><b>${Math.round(totT / 1000).toLocaleString("cs-CZ")}t</b><span>objem</span></div>
        <div><b>${avgRpe}</b><span>RPE</span></div>
      </div>
      <div class="s7-bars">${bars}</div>
    </div>`;
}

// ---------- plán na 4 týdny + úprava týdne ----------
let weekOpen = false, planOpen = false;
function openWeek() { weekOpen = true; render(); }
function closeWeek() { weekOpen = false; render(); }
function openPlan() { planOpen = true; render(); }
function closePlan() { planOpen = false; render(); }

function dayPlan(d) {
  const key = iso(d), ov = plan.overrides || {};
  return key in ov ? ov[key] : plan.schedule[((d.getDay() + 6) % 7) + 1] || null;
}
function setDay(key, wid) {
  plan.overrides = plan.overrides || {};
  plan.overrides[key] = wid || null;
  DB.set("plan", plan); render();
}
function viewWeekEdit() {
  const rows = weekDays().map((d) => `<div class="dayrow ${d.isToday ? "today" : ""}">
      <span class="dl">${d.dow} ${d.num}.</span>
      <div class="dpick">
        ${plan.workouts.map((w) => `<button class="${d.workoutId === w.id ? "on" : ""}" onclick="setDay('${d.key}','${w.id}')">${w.id}</button>`).join("")}
        <button class="rest ${!d.workoutId ? "on" : ""}" onclick="setDay('${d.key}','')">–</button>
      </div>
    </div>`).join("");
  return `<div class="modal-wrap" onclick="closeWeek()">
    <div class="modal wide" onclick="event.stopPropagation()">
      <div class="m-title">Tento týden</div>
      <div class="m-sub">Klepni na písmeno tréninku nebo na – pro volno.</div>
      <div class="daylist">${rows}</div>
      <div class="m-row"><button class="btn btn-primary" onclick="closeWeek()">Hotovo</button></div>
    </div>
  </div>`;
}
function viewPlan4() {
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const mon = new Date(base); mon.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const weeks = [];
  for (let w = 0; w < 4; w++) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + w * 7 + i);
      return { d, key: iso(d), wid: dayPlan(d), isToday: iso(d) === today(), done: history.some((h) => h.date === iso(d)) };
    });
    weeks.push({ from: days[0].d, days });
  }
  return `<div class="modal-wrap" onclick="closePlan()">
    <div class="modal wide" onclick="event.stopPropagation()">
      <div class="m-title">Plán na 4 týdny</div>
      <div class="p4">
        ${weeks.map((wk) => `<div class="p4w">
          <div class="p4h">${wk.from.getDate()}. ${wk.from.getMonth() + 1}.</div>
          <div class="p4d">${wk.days.map((x) => `<i class="${x.wid ? "has" : ""} ${x.isToday ? "today" : ""} ${x.done ? "done" : ""}">${x.wid || "–"}</i>`).join("")}</div>
        </div>`).join("")}
      </div>
      <div class="m-sub">${DOW.join(" · ")}</div>
      <div class="m-row"><button class="btn btn-primary" onclick="closePlan()">Zavřít</button></div>
    </div>
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
    <button class="back" onclick="discardWorkout()" aria-label="Zpět">${I.close()}</button>
    <div class="ready-in">
      <div class="ready-title">${esc(w.name)}</div>
      <div class="tree">${tree}</div>
      <button class="btn btn-primary btn-huge" onclick="letsGo()">${I.bolt()}Let's get it</button>
    </div>
  </div>`;
}

// ---------- trénink ----------
// průchod celým tréninkem: jeden díl na cvik, hotové zaškrtnuté, ten aktuální doutná
function wProgress() {
  return `<div class="wprog">${curExs().map((e, i) => {
    const cls = i < session.exIndex ? "done" : i === session.exIndex ? "cur" : "";
    return `<i class="${cls}">${i < session.exIndex ? I.check() : ""}</i>`;
  }).join("")}</div>`;
}
// spodní dok: nahoře drobná tlačítka, pak Spotify, dole hlavní akce – nikdy se nehýbe
function dock(main, extra) {
  return `<div class="dock">
    ${extra ? `<div class="dock-extra">${extra}</div>` : ""}
    ${SpotifyUI.bar(true)}
    ${main}
  </div>`;
}
function head(ex) {
  const sets = exSets(ex), sp = setSpec(ex, session.setIndex);
  const cells = sets.map((s, i) => `<i class="${i < session.setIndex ? "done" : i === session.setIndex ? "cur" : ""} ${s.type === "prep" ? "prep" : ""}"></i>`).join("");
  return `<div class="topbar">
    <button class="back" onclick="askAbort()" aria-label="Ukončit trénink">${I.close()}</button>
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
  return `<div class="screen wk record-screen">
    <div class="rec-ico">${I.trophy()}</div>
    <div class="rec-title">Gratuluju!</div>
    <div class="rec-sub">Beatnul jsi rekord, je čas navýšit</div>
    <div class="rec-box">
      <div class="rec-ex">${esc(r.name)}</div>
      <div class="rec-nums"><b>${r.r} opakování</b> při cíli ${r.from}–${r.to} · ${fmtW(r.w)} kg</div>
    </div>
    <div class="rec-k">O kolik příště přidáme?</div>
    <div class="rec-grid">${opts}</div>
  </div>
  ${dock("", `<button class="btn btn-3" onclick="keepTarget()">Nechat ${fmtW(r.w)} kg</button>`)}`;
}
function viewWork() {
  const ex = curEx(), i = session.setIndex;
  const logged = session.entries[ex.id]?.sets.length || 0;
  return `<div class="screen wk">
    ${head(ex)}
    ${statsBlock(ex, i)}
    <div class="timer-wrap">
      <div class="timer work" id="workTimer">0:00</div>
      <div class="timer-label">${I.clock()}Work time</div>
    </div>
  </div>
  ${dock(
    `<button class="btn btn-primary" onclick="finishSet(this)">${I.check()}Set hotový</button>`,
    `${logged ? `<button class="btn btn-3" onclick="undoSet()">${I.undo()}Vrátit set</button>` : ""}
     ${i >= exSets(ex).length - 1 ? `<button class="btn btn-3" onclick="addSet()">${I.plus()}Set navíc</button>` : ""}
     <button class="btn btn-3" onclick="endExercise()">${I.skip()}Konec cviku</button>`
  )}`;
}
function viewLog() {
  const ex = curEx();
  return `<div class="screen wk">
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
  </div>
  ${dock(`<button class="btn btn-primary" onclick="confirmSet(this)">${I.check()}Uložit set</button>`)}`;
}
function bumpW(d) { session.pendingW = Math.max(0, round2(session.pendingW + d * curEx().step)); $("#wVal").innerHTML = `${fmtW(session.pendingW)}<small> kg</small>`; DB.set("session", session); }
function bumpR(d) { session.pendingR = Math.max(0, session.pendingR + d); $("#rVal").textContent = session.pendingR; DB.set("session", session); }

function viewRest() {
  const ex = curEx(), nextIdx = session._afterRpe ? 0 : session.setIndex + 1;
  const p = planFor(ex, nextIdx);
  // políčka cviků jen o velké pauze mezi cviky
  const between = !!session._afterRpe;
  return `<div class="screen wk rest-screen">
    <div class="topbar"><button class="back" onclick="askAbort()" aria-label="Ukončit trénink">${I.close()}</button></div>
    ${between ? wProgress() : ""}
    <div class="timer-wrap">
      <div class="timer rest ${session.paused ? "paused" : ""}" id="restTimer">--:--</div>
      <div class="timer-label">${I.clock()}<span id="restLabel">${session.paused ? "Pauza" : "Rest"}</span></div>
      <div class="rest-bar"><i id="restBar"></i></div>
    </div>
    <div class="rest-ctrl">
      <button class="pause-btn ${session.paused ? "on" : ""}" id="pauseBtn" onclick="togglePause()" aria-label="Pauza">
        ${session.paused ? I.play() : I.pause()}
      </button>
      <div class="elapsed ${session.paused ? "show" : ""}" id="elapsedChip">
        <span>odpočívám</span><b id="restElapsed">0:00</b>
      </div>
    </div>
    <div class="next-wrap">
      <div class="next-k">Další</div>
      <div class="next-box">
        <div class="next-name">${esc(ex.name)}</div>
        <div class="next-nums"><b>${fmtW(p.w)} kg</b><span>·</span><b>${p.from}–${p.to} op.</b></div>
      </div>
    </div>
  </div>
  ${dock(`<button class="btn btn-primary" onclick="endRest()">${I.bolt()}Jdu na set</button>`)}`;
}
function viewRpe() {
  return `<div class="screen wk">
    <div class="topbar"><button class="back" onclick="askAbort()" aria-label="Ukončit trénink">${I.close()}</button></div>
    <div class="rpe-q">Jak náročné to bylo?</div>
    <div class="rpe-grid">${[1,2,3,4,5,6,8,9,10].map((v) => `<button class="rpe-btn" onclick="saveRpe(${v})">${v}</button>`).join("")}</div>
  </div>
  ${dock("", `<button class="btn btn-3" onclick="addSet()">${I.plus()}Ještě jeden set</button>`)}`;
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
    <div class="btn-row"><button class="btn btn-2" onclick="openBox()">${I.glove()}Chci ještě box</button></div>
  </div>`;
}

// ============================================================
// BOXING TIMER – kolo zeleně, pauza červeně, gong na začátku i konci
// ============================================================
let box = DB.get("box", null);
const boxCfg = () => DB.get("boxCfg", { rounds: 3, work: 120, rest: 60 });

function openBox() {
  const c = boxCfg();
  box = { ...c, phase: "setup", round: 1, endAt: 0, paused: false, pausedAt: 0 };
  DB.set("box", box); render();
}
function closeBox() { box = null; DB.set("box", null); render(); }
function boxSet(k, d) {
  const lim = k === "rounds" ? [1, 20] : [10, 120];
  const step = k === "rounds" ? 1 : 10;
  box[k] = Math.min(lim[1], Math.max(lim[0], box[k] + d * step));
  DB.set("boxCfg", { rounds: box.rounds, work: box.work, rest: box.rest });
  DB.set("box", box); render();
}
function boxStart() {
  box.phase = "work"; box.round = 1; box.endAt = Date.now() + box.work * 1000;
  box._b = {}; DB.set("box", box); bell(); render();
}
function boxTogglePause() {
  if (box.paused) { box.endAt += Date.now() - box.pausedAt; box.paused = false; }
  else { box.paused = true; box.pausedAt = Date.now(); }
  DB.set("box", box);
  const b = $("#boxPause"); if (b) b.innerHTML = box.paused ? I.play() : I.pause();
  const s = $(".box-screen"); if (s) s.classList.toggle("paused", box.paused);
}
function boxNext() {
  if (box.phase === "work") {
    if (box.round >= box.rounds) { box.phase = "done"; DB.set("box", box); bell(); setTimeout(bell, 700); return render(); }
    box.phase = "rest"; box.endAt = Date.now() + box.rest * 1000;
  } else {
    box.round++; box.phase = "work"; box.endAt = Date.now() + box.work * 1000;
  }
  box._b = {}; DB.set("box", box); bell(); render();
}
// boxerský gong, ztlumený
function bell() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const t = actx.currentTime;
    [784, 1174, 1568].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = i === 0 ? "triangle" : "sine";
      o.frequency.setValueAtTime(f, t);
      const peak = 0.3 / (i + 1.4);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + 1.7);
    });
  } catch {}
}
function viewBox() {
  if (box.phase === "setup") {
    const row = (k, label, val) => `<div class="brow">
      <span>${label}</span>
      <div class="bctl">
        <button onclick="boxSet('${k}',-1)">${I.minus()}</button>
        <b>${val}</b>
        <button onclick="boxSet('${k}',1)">${I.plus()}</button>
      </div></div>`;
    return `<div class="screen box-setup">
      <div class="topbar"><button class="back" onclick="closeBox()">${I.close()}</button></div>
      <div class="summary-ico">${I.glove()}</div>
      <h1 class="brand">Box</h1>
      <div class="sub">nastav si kola</div>
      ${row("rounds", "Počet kol", box.rounds)}
      ${row("work", "Délka kola", fmtTime(box.work))}
      ${row("rest", "Pauza", fmtTime(box.rest))}
      <div class="spacer"></div>
      <button class="btn btn-primary" onclick="boxStart()">${I.bolt()}Start</button>
    </div>`;
  }
  if (box.phase === "done") {
    return `<div class="screen box-done">
      <div class="summary-ico" style="color:var(--ok)">${I.trophy()}</div>
      <h1 class="brand">Gratuluju!</h1>
      <div class="sub">${box.rounds} ${plural(box.rounds, "kolo", "kola", "kol")} · ${fmtTime(box.rounds * box.work)} v ringu</div>
      <div class="spacer"></div>
      <button class="btn btn-primary" onclick="closeBox()">${I.check()}Hotovo</button>
      <div class="btn-row"><button class="btn btn-3" onclick="openBox()">${I.glove()}Ještě jednou</button></div>
    </div>`;
  }
  const work = box.phase === "work";
  return `<div class="screen box-screen ${work ? "go" : "pause"} ${box.paused ? "paused" : ""}">
    <div class="topbar"><button class="back" onclick="closeBox()">${I.close()}</button></div>
    <div class="box-round">Kolo ${box.round} / ${box.rounds}</div>
    <div class="box-state">${work ? "Do toho" : "Pauza"}</div>
    <div class="box-timer" id="boxTimer">--:--</div>
    <div class="rest-bar"><i id="boxBar"></i></div>
    <div class="rest-ctrl">
      <button class="pause-btn" id="boxPause" onclick="boxTogglePause()">${box.paused ? I.play() : I.pause()}</button>
    </div>
    <button class="btn btn-2" onclick="boxNext()">${I.skip()}Přeskočit</button>
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
const GROUPS = {
  push: { name: "Push", parts: ["Prsa", "Ramena", "Triceps"] },
  pull: { name: "Pull", parts: ["Záda", "Biceps"] },
  legs: { name: "Legs", parts: ["Nohy"] },
};
const groupOf = (ex) => Object.keys(GROUPS).find((k) => GROUPS[k].parts.includes(ex.part)) || "push";
const exInGroup = (g) => allEx().filter((e) => groupOf(e) === g);

// roste síla partie, nebo stojí?
function exTrend(ex) {
  const h = exHistory(ex.id);
  if (h.length < 2) return h.length ? "flat" : "none";
  const last = topW(h[h.length - 1].sets), prev = topW(h[h.length - 2].sets);
  return last > prev ? "up" : last < prev ? "down" : "flat";
}
function groupTrend(g) {
  const exs = exInGroup(g), t = exs.map(exTrend);
  const up = t.filter((x) => x === "up").length;
  const active = t.filter((x) => x !== "none").length;
  if (!active) return { state: "none", label: "zatím nic" };
  if (up) return { state: "up", label: `${up} ${plural(up, "cvik roste", "cviky rostou", "cviků roste")}` };
  return { state: "flat", label: "drží se" };
}

function viewDash() {
  const ws = weekStats(), rc = recos();
  const cards = (dashGroup ? exInGroup(dashGroup) : allEx()).map((e) => {
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
  const groupTiles = Object.entries(GROUPS).map(([k, g]) => {
    const t = groupTrend(k);
    return `<button class="gtile ${dashGroup === k ? "on" : ""} t-${t.state}" onclick="setGroup('${dashGroup === k ? "" : k}')">
      <span class="tico">${t.state === "up" ? I.trendUp() : t.state === "flat" ? I.trendFlat() : I.dot()}</span>
      <b>${g.name}</b>
      <i>${t.label}</i></button>`;
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
    <h2>${I.layers()}Partie</h2>
    <div class="gtiles">${groupTiles}</div>
    <h2>${I.dumbbell()}${dashGroup ? GROUPS[dashGroup].name : "Všechny cviky"}</h2>
    ${cards}
    <h2>${I.gear()}Nastavení</h2>
    <div class="card" onclick="dashView='settings';render()">
      <div class="body"><div class="title">Nastavení a data</div>
      <div class="meta">cloud sync <span id="syncState" class="sync-state ${Sync.status}">${Sync.label()}</span> · kroky vah · záloha</div></div>
      <div class="go">${I.chevronR()}</div></div>
  </div>`;
}
function setGroup(g) { dashGroup = g; render(); }
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
    <h2>${I.chart()}Síla – váha top setu</h2>
    <canvas class="chart" id="chartW" width="440" height="150"></canvas>
    <h2>${I.dumbbell()}Opakování – top set</h2>
    <canvas class="chart" id="chartR" width="440" height="150"></canvas>
    <h2>${I.flame()}RPE</h2>
    <canvas class="chart" id="chartE" width="440" height="150"></canvas>
    <h2>${I.history()}Historie</h2>
    <table class="log"><tr><th>Datum</th><th>Sety</th><th>RPE</th></tr>
      ${rows || `<tr><td colspan="3" class="muted">Zatím nic – jdi cvičit</td></tr>`}</table>
  </div>`;
}
// tři grafy k jednomu cviku
function drawExCharts(id) {
  const h = exHistory(id);
  drawChart("chartW", h.map((e) => ({ v: topW(e.sets) })), "kg", ["#8b7cff", "#4c8dff"]);
  drawChart("chartR", h.map((e) => ({ v: Math.max(...workSets(e.sets).map((s) => s.r)) })), "op.", ["#4c8dff", "#30d158"]);
  const rp = h.filter((e) => e.rpe != null).map((e) => ({ v: e.rpe }));
  drawChart("chartE", rp, "RPE", ["#ff9f6a", "#ff5470"], 1, 10);
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
        <div class="meta code" onclick="copyLink()">${esc(Sync.link())}</div>
        <div class="meta">Otevři tenhle odkaz na jakémkoli dalším zařízení – napojí se samo, nic se nezadává.</div>
        <div class="btn-row">
          <button class="btn btn-primary" style="font-size:13px;padding:13px" onclick="copyLink()">${I.cloud()}Zkopírovat odkaz</button>
        </div>
        <div class="btn-row">
          <button class="btn btn-2" onclick="Sync.pull()">${I.cloud()}Stáhnout</button>
          <button class="btn btn-2" onclick="Sync.push(true)">${I.arrowUp()}Nahrát</button>
        </div>
        <div class="meta code" onclick="copySync()">kód: ${esc(Sync.id)}</div>
        <div class="btn-row"><button class="btn btn-3" onclick="Sync.disconnect()">Odpojit</button></div>
      </div>`
    : `<div class="panel">
        <div class="title">Cloud sync</div>
        <div class="meta">Zapni a dostaneš kód. Zadáš ho na dalším zařízení a historie se drží pohromadě.</div>
        <div class="btn-row"><button class="btn btn-primary" style="font-size:14px;padding:14px" onclick="syncStart()">${I.cloud()}Zapnout sync</button></div>
        <div class="btn-row"><button class="btn btn-3" onclick="syncJoin()">Mám kód z jiného zařízení</button></div>
      </div>`;

  const sp = SPOTIFY_LOCAL
    ? `<div class="panel"><div class="title">Spotify přes Mac</div>
        <div class="meta">Ovládá appku ve Spotify na tomhle počítači. Nic se nenastavuje.</div></div>`
    : SpotifyWeb.connected()
      ? `<div class="panel">
          <div class="title"><span class="sync-dot ok"></span>Spotify propojené</div>
          <div class="meta">Drží se to natrvalo – token se sám obnovuje na pozadí. Odpojí se, jen když ho zrušíš tady nebo ve svém Spotify účtu.</div>
          <div class="btn-row"><button class="btn btn-3" onclick="SpotifyWeb.disconnect();render()">Odpojit Spotify</button></div>
        </div>`
      : `<div class="panel"><div class="title">Spotify není propojené</div>
          <div class="meta">Propojíš ho jednou a zůstane to tak.</div>
          <div class="btn-row"><button class="btn btn-2" onclick="SpotifyWeb.login()">Propojit Spotify</button></div>
        </div>`;

  return `<div class="screen">
    <div class="topbar"><button class="back" onclick="dashView='list';render()">${I.chevronL()}</button></div>
    <h1 class="brand">Nastavení</h1>
    <div class="sub">sync, spotify, kroky vah, záloha</div>
    <h2>${I.cloud()}Cloud sync</h2>
    ${sync}
    <h2>${I.spotify()}Spotify</h2>
    ${sp}
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
    <div class="btn-row"><button class="btn btn-3 danger" onclick="resetToday()">${I.undo()}Vyresetovat dnešní trénink</button></div>
    <div class="muted center" style="font-size:11.5px;margin-top:6px">Smaže jen dnešek. Starší tréninky a cíle vah zůstanou.</div>
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
function copyLink() {
  const l = Sync.link();
  navigator.clipboard?.writeText(l);
  alert("Odkaz zkopírován:\n\n" + l + "\n\nOtevři ho na dalším zařízení – napojí se samo.");
}
function setStep(id, v) { overrides[id] = { ...(overrides[id] || {}), step: v }; DB.set("overrides", overrides); applyOverrides(); render(); }
function setRest(id, d) {
  const ex = allEx().find((e) => e.id === id);
  const v = Math.max(30, (ex.rest || 120) + d);
  overrides[id] = { ...(overrides[id] || {}), rest: v, restPrep: Math.max(30, Math.round(v * 0.7 / 5) * 5) };
  DB.set("overrides", overrides); applyOverrides(); render();
}
// smaže jen dnešek – rozdělaný i uložený trénink z dnešního dne
function resetToday() {
  const t = today();
  const n = history.filter((h) => h.date === t).length;
  if (!confirm(`Vyresetovat dnešní trénink?\n\n${n ? `Smaže se ${n} uložený trénink z dneška` : "Smaže se rozdělaný trénink"} a začneš na čisto.\nStarší tréninky a cíle vah zůstanou.`)) return;
  history = history.filter((h) => h.date !== t);
  DB.set("history", history);
  session = null; DB.set("session", null);
  keepAwake(false); pushNow();
  tab = "workout"; dashView = "list"; dashEx = null;
  render();
}
function resetOverrides() {
  if (!confirm("Vrátit všechny kroky vah a pauzy na původní?")) return;
  overrides = {}; DB.set("overrides", overrides);
  plan = JSON.parse(JSON.stringify(DEFAULT_PLAN)); DB.set("plan", plan); render();
}

// ---------- graf ----------
function drawChart(id, pts, unit = "kg", colors = ["#8b7cff", "#4c8dff"], fixMin, fixMax) {
  const c = $("#" + id); if (!c) return;
  const x = c.getContext("2d"), W = c.width, H = c.height, pad = 30;
  x.clearRect(0, 0, W, H);
  if (!pts.length) {
    x.font = "600 12px Manrope, sans-serif"; x.fillStyle = "#5b6373"; x.textAlign = "center";
    x.fillText("zatím žádná data", W / 2, H / 2); x.textAlign = "left";
    return;
  }
  const vals = pts.map((p) => p.v);
  let min = fixMin != null ? fixMin : Math.min(...vals), max = fixMax != null ? fixMax : Math.max(...vals);
  if (min === max) { min -= 5; max += 5; }
  const X = (i) => pad + (i / Math.max(1, pts.length - 1)) * (W - pad * 2);
  const Y = (v) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  x.strokeStyle = "rgba(255,255,255,.08)"; x.lineWidth = 1;
  x.font = "600 10px Manrope, sans-serif"; x.fillStyle = "#5b6373";
  for (let g = 0; g <= 2; g++) {
    const v = min + ((max - min) * g) / 2, yy = Y(v);
    x.beginPath(); x.moveTo(pad, yy); x.lineTo(W - pad, yy); x.stroke();
    x.fillText(fmtW(Math.round(v * 10) / 10) + " " + unit, 2, yy + 3);
  }
  const rgb = colors[1].replace("#", "").match(/../g).map((v) => parseInt(v, 16)).join(",");
  const fill = x.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, `rgba(${rgb},.22)`); fill.addColorStop(1, `rgba(${rgb},0)`);
  x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(X(i), Y(p.v)) : x.moveTo(X(i), Y(p.v))));
  x.lineTo(X(pts.length - 1), H - pad); x.lineTo(X(0), H - pad); x.closePath();
  x.fillStyle = fill; x.fill();
  const grad = x.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, colors[0]); grad.addColorStop(1, colors[1]);
  x.strokeStyle = grad; x.lineWidth = 2.5; x.lineJoin = "round"; x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(X(i), Y(p.v)) : x.moveTo(X(i), Y(p.v))));
  x.stroke();
  pts.forEach((p, i) => {
    const isLast = i === pts.length - 1;
    x.beginPath(); x.arc(X(i), Y(p.v), isLast ? 4.5 : 3, 0, 7);
    x.fillStyle = isLast ? colors[1] : "rgba(255,255,255,.35)"; x.fill();
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

// intro: netopýr se přiblíží, až se v něm otevře appka – jen na úvodní obrazovce
function playIntro() {
  const el = document.getElementById("intro");
  if (!el || session || box) return;
  el.innerHTML = `<div class="intro-bat">${I.bat()}</div>`;
  el.hidden = false;
  el.classList.add("run");
  setTimeout(() => { el.hidden = true; el.classList.remove("run"); el.innerHTML = ""; }, 1500);
}

// ---------- init ----------
window.addEventListener("load", () => {
  const unlock = () => beep(1, 0.01, 0.001);
  document.addEventListener("touchstart", unlock, { once: true });
  document.addEventListener("click", unlock, { once: true });
  SpotifyUI.init();
  if (session) keepAwake(true);
  render();
  playIntro();
  // sync kód v odkazu napojí zařízení sám; jinak dotáhni, co je v cloudu
  Sync.fromLink().then((joined) => {
    if (joined) return render();
    if (!Sync.enabled()) return;
    Sync.pull(true).then(() => {
      // minule se nestihlo uložit (výpadek signálu) → dorovnej to teď
      if (localStorage.getItem("sync_dirty") === "1") Sync.push(true);
    });
  });
});
// při návratu do appky si stáhni, co mezitím nahrálo druhé zařízení
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Sync.enabled() && !session) Sync.pull(true);
});
