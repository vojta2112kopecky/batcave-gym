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

  // odkaz, který kterékoli zařízení napojí sám od sebe
  link() { return location.origin + location.pathname + "#s=" + this.id; },

  // sync kód v adrese → napoj se automaticky, nic se nezadává ručně
  async fromLink() {
    const m = (location.hash || "").match(/[#&]s=([0-9a-f-]{20,})/i);
    if (!m) return false;
    const id = m[1];
    window.history.replaceState({}, "", location.origin + location.pathname);
    if (this.id === id) { await this.pull(true); return false; }
    return await this.connect(id);
  },

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
      await this.push(true);   // rovnou nahraj i to, co bylo jen tady
      return true;
    } catch (e) { this.done("err", e.message); return false; }
  },

  payload() {
    return {
      v: 2, updated: new Date().toISOString(), planVersion: plan.version,
      history, overrides, targets,
      session,                       // i rozdělaný trénink, ať se nic neztratí
    };
  },

  queue() {
    if (!this.enabled()) return;
    localStorage.setItem("sync_dirty", "1");
    clearTimeout(this._t);
    this._t = setTimeout(() => this.push(true), 3000);
  },

  _lastPush: 0,
  _fails: 0,

  async push(force) {
    if (!this.enabled()) return;
    // cloud má rate limit – když se pouští moc rychle po sobě, jen to zařaď
    if (!force && Date.now() - this._lastPush < 5000) { this.queue(); return; }
    clearTimeout(this._t);
    this._lastPush = Date.now();
    this.status = "busy"; paintSync();
    const body = this.payload();
    try {
      const r = await fetch(this.url(), {
        method: "PUT", keepalive: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      localStorage.setItem("sync_local_updated", body.updated);
      localStorage.setItem("sync_dirty", "0");
      this._fails = 0;
      this.done("ok", "uloženo");
    } catch (e) {
      localStorage.setItem("sync_dirty", "1");
      this._fails++;
      this.done("err", e.message);
      // signál v posilovně nebo rate limit → zkoušej dál, s narůstající pauzou
      clearTimeout(this._retry);
      this._retry = setTimeout(() => this.push(true), Math.min(60000, 8000 * this._fails));
    }
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

    // cíle vah a nastavení: novější zápis vyhrává
    const mine = localStorage.getItem("sync_local_updated") || "";
    const remoteNewer = (data.updated || "") > mine;
    if (remoteNewer && data.targets && JSON.stringify(data.targets) !== JSON.stringify(targets)) {
      targets = data.targets;
      localStorage.setItem("targets", JSON.stringify(targets));
      changed = true;
    }
    if (remoteNewer && data.overrides && JSON.stringify(data.overrides) !== JSON.stringify(overrides)) {
      overrides = data.overrides;
      localStorage.setItem("overrides", JSON.stringify(overrides));
      applyOverrides();
      changed = true;
    }

    // rozdělaný trénink převezmi jen když tady žádný neběží a je z dneška
    if (!session && data.session && data.session.date === today() && data.session.phase !== "summary") {
      session = data.session;
      localStorage.setItem("session", JSON.stringify(session));
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

// když appku zavřu nebo přepnu jinam, dorovnej to hned
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && Sync.enabled() && localStorage.getItem("sync_dirty") === "1") Sync.push(true);
});
window.addEventListener("pagehide", () => {
  if (Sync.enabled() && localStorage.getItem("sync_dirty") === "1") Sync.push(true);
});

function paintSync() {
  const el = document.getElementById("syncState");
  if (el) { el.textContent = Sync.label(); el.className = "sync-state " + Sync.status; }
  const d = document.getElementById("syncDot");
  if (d) d.className = "sync-dot " + Sync.status;
}
