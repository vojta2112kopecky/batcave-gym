#!/usr/bin/env python3
"""
Batcave Gym – lokální server.
Servíruje appku a zároveň ovládá Spotify desktop app přes AppleScript.
Žádné Spotify API, žádný client ID, žádné přihlašování – ovládá se to,
co ti hraje na Macu.

Spuštění:  python3 ~/trenink_app/server.py     →  http://127.0.0.1:8917
"""
import json
import os
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", 8917))
# default jen localhost; pro přístup z telefonu na stejné wifi:
#   HOST=0.0.0.0 python3 ~/trenink_app/server.py
HOST = os.environ.get("HOST", "127.0.0.1")


def osa(script):
    """Spustí AppleScript a vrátí (ok, výstup)."""
    try:
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=5)
        if r.returncode != 0:
            return False, (r.stderr or "").strip()
        return True, r.stdout.strip()
    except Exception as e:  # Spotify neběží / timeout
        return False, str(e)


def spotify_running():
    ok, out = osa('tell application "System Events" to return (name of processes) contains "Spotify"')
    return ok and out == "true"


def now_playing():
    if not spotify_running():
        return {"ok": False, "reason": "Spotify neběží"}
    ok, out = osa(
        'tell application "Spotify" to return (name of current track) & "\\n" '
        '& (artist of current track) & "\\n" & (player state as text)'
    )
    if not ok:
        return {"ok": False, "reason": out}
    parts = out.split("\n")
    while len(parts) < 3:
        parts.append("")
    return {"ok": True, "track": parts[0], "artist": parts[1], "playing": parts[2] == "playing"}


COMMANDS = {
    "next": 'tell application "Spotify" to next track',
    "prev": 'tell application "Spotify" to previous track',
    "toggle": 'tell application "Spotify" to playpause',
    "play": 'tell application "Spotify" to play',
    "pause": 'tell application "Spotify" to pause',
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _json(self, payload, code=200):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/spotify/"):
            cmd = self.path.split("/api/spotify/", 1)[1].split("?")[0]
            if cmd == "now":
                return self._json(now_playing())
            if cmd in COMMANDS:
                if not spotify_running():
                    return self._json({"ok": False, "reason": "Spotify neběží"})
                if cmd == "prev":
                    # Spotify: když už hraje >3 s, první prev jen skočí na začátek
                    ok, pos = osa('tell application "Spotify" to return player position')
                    osa(COMMANDS["prev"])
                    try:
                        if ok and float(pos) > 3:
                            osa(COMMANDS["prev"])
                    except ValueError:
                        pass
                else:
                    osa(COMMANDS[cmd])
                return self._json(now_playing())
            return self._json({"ok": False, "reason": "neznámý příkaz"}, 404)
        return super().do_GET()

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *a):
        pass  # ticho


if __name__ == "__main__":
    print(f"Batcave Gym → http://127.0.0.1:{PORT}")
    if HOST != "127.0.0.1":
        print(f"           → z telefonu na stejné wifi: http://<IP Macu>:{PORT}")
    print("Spotify:", "běží" if spotify_running() else "neběží (pusť si ho)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
