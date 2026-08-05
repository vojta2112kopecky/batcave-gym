// ============================================================
// CLOUD SYNC – jsonblob.com
// Free, bez účtu a bez klíče. Data leží pod náhodným UUID ("sync kód"),
// kdo ho zná, ten je vidí – proto se tam posílají JEN tréninková čísla,
// žádné jméno, mail ani nic osobního.
// localStorage zůstává hlavní zdroj, cloud je zrcadlo pro druhé zařízení.
// ============================================================
"use strict";

const Sync = {
  API: "https://jsonblob.com/api/jsonBlob",
  get id() { return localStorage.getItem("sync_id") || null; },
  set id(v) { v ? localStorage.setItem("sync_id", v) : localStorage.removeItem("sync_id"); },
  get last() { return localStorage.getItem("sync_last") || null; },
  status: "off", // off | ok | busy | err
  msg: "",
  enabled() { return !!this.id; },

  url() { return `${this.API}/${this.id}`; },

  // založí nový sync a nahraje, co mám teď
  async create() {
    this.status = "busy"; paintSync();
    try {
      const r = await fetch(this.API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(this.payload()),
      });
      const loc = r.headers.get("Location") || "";
      const id = loc.split("/").pop();
      if (!id) throw new Error("cloud nevrátil kód");
      this.id = id;
      this.done("ok", "sync zapnutý");
      return id;
    } catch (e) { this.done("err", e.message); return null; }
  },

  // připojí se k existujícímu kódu a stáhne data
  async connect(id) {
    id = (id || "").trim();
    if (!id) return false;
    this.status = "busy"; paintSync();
    try {
      const r = await fetch(`${this.API}/${id}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!r.ok) throw new Error("kód nenalezen");
      const data = await r.json();
      this.id = id;
      this.merge(data);
      this.done("ok", "napojeno a staženo");
      return true;
    } catch (e) { this.done("err", e.message); return false; }
  },

  payload() {
    return { v: 1, updated: new Date().toISOString(), history, overrides, planVersion: plan.version };
  },

  queue() {
    if (!this.enabled()) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.push(), 1500);
  },

  async push() {
    if (!this.enabled()) return;
    this.status = "busy"; paintSync();
    try {
      const r = await fetch(this.url(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(this.payload()),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      this.done("ok", "uloženo");
    } catch (e) { this.done("err", e.message); }
  },

  async pull(silent) {
    if (!this.enabled()) return;
    if (!silent) { this.status = "busy"; paintSync(); }
    try {
      const r = await fetch(this.url(), { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const changed = this.merge(await r.json());
      this.done("ok", changed ? "staženo z cloudu" : "aktuální");
      if (changed) render();
    } catch (e) { this.done("err", e.message); }
  },

  // sloučení: tréninky se klíčují datem + tréninkem, vyhrává ten s víc sety
  merge(data) {
    if (!data || !Array.isArray(data.history)) return false;
    const key = (h) => `${h.date}|${h.workoutId}`;
    const map = new Map();
    for (const h of history) map.set(key(h), h);
    let changed = false;
    for (const h of data.history) {
      const k = key(h), cur = map.get(k);
      const size = (x) => x.exercises.reduce((a, e) => a + e.sets.length, 0);
      if (!cur || size(h) > size(cur)) { map.set(k, h); changed = true; }
    }
    if (changed) {
      history = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
      localStorage.setItem("history", JSON.stringify(history));
    }
    if (data.overrides && JSON.stringify(data.overrides) !== JSON.stringify(overrides)) {
      overrides = data.overrides;
      localStorage.setItem("overrides", JSON.stringify(overrides));
      applyOverrides();
      changed = true;
    }
    return changed;
  },

  done(status, msg) {
    this.status = status; this.msg = msg;
    if (status === "ok") localStorage.setItem("sync_last", new Date().toISOString());
    paintSync();
  },

  disconnect() { this.id = null; localStorage.removeItem("sync_last"); this.status = "off"; render(); },

  label() {
    if (!this.enabled()) return "vypnuto";
    if (this.status === "busy") return "synchronizuju…";
    if (this.status === "err") return "chyba: " + this.msg;
    const l = this.last;
    if (!l) return "zapnuto";
    const d = new Date(l), mins = Math.round((Date.now() - d) / 60000);
    return mins < 1 ? "právě teď" : mins < 60 ? `před ${mins} min` : d.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  },
};

function paintSync() {
  const el = document.getElementById("syncState");
  if (el) { el.textContent = Sync.label(); el.className = "sync-state " + Sync.status; }
  const d = document.getElementById("syncDot");
  if (d) d.className = "sync-dot " + Sync.status;
}
