// ============================================================
// SPOTIFY – ovládá Spotify desktop app na Macu přes lokální server
// (server.py → AppleScript). Žádné API, žádný client ID, žádný login.
// Když server nebo Spotify neběží, lišta se prostě nezobrazí a appka jede dál.
// Pro iPhone build se místo tohohle použije Spotify Web API.
// ============================================================
"use strict";

// AppleScript most běží jen na Macu. Na webové verzi (GitHub Pages) lišta odpadá.
const SPOTIFY_LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname) ||
  /^192\.168\.|^10\./.test(location.hostname);

const SpotifyUI = {
  state: { ok: false, track: "", artist: "", playing: false, reason: "" },
  _pending: false,

  async init() { if (SPOTIFY_LOCAL) await this.poll(); },

  async call(cmd) {
    try {
      const r = await fetch("/api/spotify/" + cmd, { cache: "no-store" });
      this.state = await r.json();
    } catch {
      this.state = { ok: false, reason: "server offline" };
    }
    this.paint();
  },

  async poll() {
    await this.call("now");
    clearTimeout(this._t);
    this._t = setTimeout(() => this.poll(), 8000);
  },

  paint() {
    const el = document.getElementById("spTrack");
    if (el) el.innerHTML = this.label();
    const pb = document.getElementById("spPlay");
    if (pb) pb.innerHTML = this.state.playing ? I.pause() : I.play();
  },

  label() {
    if (!this.state.ok) return esc(this.state.reason || "Spotify nedostupné");
    return `<b style="color:var(--text)">${esc(this.state.track)}</b> · ${esc(this.state.artist)}`;
  },

  bar() {
    if (!SPOTIFY_LOCAL) return "";
    return `<div class="spotify">
      <div class="track" id="spTrack">${this.label()}</div>
      <button onclick="spCmd('prev')">${I.prev()}</button>
      <button id="spPlay" onclick="spCmd('toggle')">${this.state.playing ? I.pause() : I.play()}</button>
      <button onclick="spCmd('next')">${I.next()}</button>
    </div>`;
  },
};

async function spCmd(cmd) { await SpotifyUI.call(cmd); }
