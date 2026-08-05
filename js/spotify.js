// ============================================================
// SPOTIFY – dva režimy, lišta je vidět vždycky:
//  1) BRIDGE  – na Macu přes server.py → AppleScript (nic se nenastavuje)
//  2) WEB API – všude jinde (GitHub Pages, mobil), přes PKCE
//     Potřebuje Client ID z developer.spotify.com a Premium účet.
//     Redirect URI = přesně adresa, na které appka běží.
// Sbalené = jen logo. Rozbalené = playbar. Stav se pamatuje.
// ============================================================
"use strict";

const SPOTIFY_LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname) ||
  /^192\.168\.|^10\./.test(location.hostname);

// ---------- Web API (PKCE) ----------
// Client ID je veřejný údaj, PKCE ho schovávat nemusí.
// Client Secret tady NENÍ a být nesmí – repo je veřejné a PKCE ho nepoužívá.
const SPOTIFY_CLIENT_ID = "429ae1ef523a4960a4f457b979e483fb";

const SpotifyWeb = {
  SCOPES: "user-read-playback-state user-modify-playback-state user-read-currently-playing",
  token: null,
  get clientId() { return localStorage.getItem("sp_client_id") || SPOTIFY_CLIENT_ID; },
  set clientId(v) { localStorage.setItem("sp_client_id", v); },
  get refreshToken() { return localStorage.getItem("sp_refresh") || ""; },
  set refreshToken(v) { v ? localStorage.setItem("sp_refresh", v) : localStorage.removeItem("sp_refresh"); },
  redirect() { return location.origin + location.pathname; },
  connected() { return !!this.refreshToken; },

  async init() {
    // ať prohlížeč úložiště nevyhodí a propojení vydrží
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
    const p = new URLSearchParams(location.search);
    if (p.get("code")) {
      await this.exchange(p.get("code"));
      // POZOR: `history` je v téhle appce pole tréninků, proto window.history
      window.history.replaceState({}, "", this.redirect());
    }
    if (this.connected()) await this.refresh();
  },

  async login() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const verifier = [...crypto.getRandomValues(new Uint8Array(64))].map((b) => chars[b % chars.length]).join("");
    localStorage.setItem("sp_verifier", verifier);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    location.href = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
      client_id: this.clientId, response_type: "code", redirect_uri: this.redirect(),
      scope: this.SCOPES, code_challenge_method: "S256", code_challenge: challenge,
    });
  },

  // Spotify při PKCE refresh token rotuje – nový se musí hned uložit,
  // jinak se propojení příště rozpadne.
  store(r) {
    if (!r || !r.access_token) return false;
    this.token = r.access_token;
    if (r.refresh_token) this.refreshToken = r.refresh_token;
    const ttl = (r.expires_in || 3600) * 1000;
    localStorage.setItem("sp_expires", String(Date.now() + ttl));
    clearTimeout(this._renew);
    this._renew = setTimeout(() => this.refresh(), Math.max(30000, ttl - 300000)); // 5 min před vypršením
    return true;
  },

  async exchange(code) {
    try {
      const r = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId, grant_type: "authorization_code", code,
          redirect_uri: this.redirect(), code_verifier: localStorage.getItem("sp_verifier") || "",
        }),
      }).then((x) => x.json());
      this.store(r);
    } catch {}
  },

  async refresh() {
    if (!this.refreshToken) return false;
    try {
      const r = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.clientId, grant_type: "refresh_token", refresh_token: this.refreshToken }),
      }).then((x) => x.json());
      if (this.store(r)) return true;
      // token odvolaný nebo neplatný → ať appka ví, že se má přihlásit znovu
      if (r && (r.error === "invalid_grant" || r.error === "invalid_request")) this.disconnect();
      return false;
    } catch { return false; }  // bez signálu token nezahazuj
  },

  async api(method, path, retry = true) {
    if (!this.token && !(await this.refresh())) return null;
    let r;
    try {
      r = await fetch("https://api.spotify.com/v1" + path, { method, headers: { Authorization: "Bearer " + this.token } });
    } catch { return null; }
    if (r.status === 401 && retry) {
      if (await this.refresh()) return this.api(method, path, false);
      return null;
    }
    if (r.status === 204 || r.status === 202) return {};
    try { return await r.json(); } catch { return {}; }
  },

  async now() {
    if (!this.connected()) return { ok: false, reason: "Spotify nepřipojeno" };
    const s = await this.api("GET", "/me/player");
    if (!s || !s.item) return { ok: false, reason: "nic nehraje" };
    return { ok: true, track: s.item.name, artist: s.item.artists.map((a) => a.name).join(", "), playing: !!s.is_playing };
  },
  async cmd(c) {
    if (c === "next") await this.api("POST", "/me/player/next");
    else if (c === "prev") await this.api("POST", "/me/player/previous");
    else if (c === "toggle") {
      const s = await this.api("GET", "/me/player");
      await this.api("PUT", s && s.is_playing ? "/me/player/pause" : "/me/player/play");
    }
    return this.now();
  },
  disconnect() {
    this.refreshToken = null; this.token = null;
    localStorage.removeItem("sp_expires");
    clearTimeout(this._renew);
  },
};

// po probuzení telefonu / návratu do appky si rovnou obnov token
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !SpotifyWeb.connected()) return;
  const exp = +(localStorage.getItem("sp_expires") || 0);
  if (Date.now() > exp - 60000) SpotifyWeb.refresh().then(() => SpotifyUI.poll());
});

// ---------- lišta ----------
const SpotifyUI = {
  mode: SPOTIFY_LOCAL ? "bridge" : "web",
  state: { ok: false, track: "", artist: "", playing: false, reason: "Spotify nepřipojeno" },
  open: localStorage.getItem("sp_open") === "1",

  async init() {
    if (this.mode === "web") await SpotifyWeb.init();
    await this.poll();
  },

  connected() { return this.mode === "bridge" || SpotifyWeb.connected(); },

  toggleOpen() {
    this.open = !this.open;
    localStorage.setItem("sp_open", this.open ? "1" : "0");
    document.querySelectorAll(".spotify").forEach((el) => el.classList.toggle("open", this.open));
    if (this.open) this.poll();
  },

  async call(cmd) {
    try {
      if (this.mode === "bridge") {
        const r = await fetch("/api/spotify/" + cmd, { cache: "no-store" });
        this.state = await r.json();
      } else {
        this.state = cmd === "now" ? await SpotifyWeb.now() : await SpotifyWeb.cmd(cmd);
      }
    } catch { this.state = { ok: false, reason: "nedostupné" }; }
    this.paint();
  },

  async poll() {
    await this.call("now");
    clearTimeout(this._t);
    if (this.open) this._t = setTimeout(() => this.poll(), 8000);
  },

  paint() {
    document.querySelectorAll("[data-sp-track]").forEach((el) => (el.innerHTML = this.label()));
    document.querySelectorAll("[data-sp-play]").forEach((el) => (el.innerHTML = this.state.playing ? I.pause() : I.play()));
    document.querySelectorAll(".spotify").forEach((el) => el.classList.toggle("live", !!this.state.playing));
  },

  label() {
    if (!this.state.ok) return esc(this.state.reason || "Spotify nedostupné");
    return `<b>${esc(this.state.track)}</b><span>${esc(this.state.artist)}</span>`;
  },

  panel() {
    if (this.mode === "web" && !SpotifyWeb.connected()) {
      return `<button class="sp-connect" onclick="SpotifyWeb.login()">Propojit Spotify</button>`;
    }
    return `<button onclick="spCmd('prev')" aria-label="Předchozí">${I.prev()}</button>
      <button class="main" data-sp-play onclick="spCmd('toggle')" aria-label="Přehrát">${this.state.playing ? I.pause() : I.play()}</button>
      <button onclick="spCmd('next')" aria-label="Další">${I.next()}</button>
      <span class="sp-track" data-sp-track>${this.label()}</span>`;
  },

  // sbalené = jen kolečko s logem uprostřed, rozbaluje se do strany
  bar() {
    return `<div class="spotify ${this.open ? "open" : ""} ${this.state.playing ? "live" : ""}">
      <div class="sp-pill">
        <button class="sp-logo" onclick="SpotifyUI.toggleOpen()" aria-label="Spotify">${I.spotify()}</button>
        <div class="sp-panel"><div class="sp-inner">${this.panel()}</div></div>
      </div>
    </div>`;
  },
};

async function spCmd(cmd) { await SpotifyUI.call(cmd); }
