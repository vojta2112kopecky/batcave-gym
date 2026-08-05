// ============================================================
// SPOTIFY – ovládá Spotify desktop app na Macu (server.py → AppleScript).
// Sbalené = jen logo. Rozbalené = celý playbar. Stav se pamatuje.
// Na webové verzi (GitHub Pages) most neexistuje, lišta se nezobrazí.
// ============================================================
"use strict";

const SPOTIFY_LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname) ||
  /^192\.168\.|^10\./.test(location.hostname);

const SpotifyUI = {
  state: { ok: false, track: "", artist: "", playing: false, reason: "" },
  open: localStorage.getItem("sp_open") === "1",

  async init() { if (SPOTIFY_LOCAL) await this.poll(); },

  toggleOpen() {
    this.open = !this.open;
    localStorage.setItem("sp_open", this.open ? "1" : "0");
    document.querySelectorAll(".spotify").forEach((el) => el.classList.toggle("open", this.open));
    if (this.open) this.poll();
  },

  async call(cmd) {
    try {
      const r = await fetch("/api/spotify/" + cmd, { cache: "no-store" });
      this.state = await r.json();
    } catch { this.state = { ok: false, reason: "server offline" }; }
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

  bar() {
    if (!SPOTIFY_LOCAL) return "";
    return `<div class="spotify ${this.open ? "open" : ""} ${this.state.playing ? "live" : ""}">
      <button class="sp-logo" onclick="SpotifyUI.toggleOpen()" aria-label="Spotify">
        ${I.spotify()}<i class="sp-chev">${I.chevronU()}</i>
      </button>
      <div class="sp-panel">
        <div class="sp-track" data-sp-track>${this.label()}</div>
        <div class="sp-ctrl">
          <button onclick="spCmd('prev')" aria-label="Předchozí">${I.prev()}</button>
          <button class="main" data-sp-play onclick="spCmd('toggle')" aria-label="Přehrát">${this.state.playing ? I.pause() : I.play()}</button>
          <button onclick="spCmd('next')" aria-label="Další">${I.next()}</button>
        </div>
      </div>
    </div>`;
  },
};

async function spCmd(cmd) { await SpotifyUI.call(cmd); }
