# Batcave Gym

Osobní tréninková appka. Jen trénink, nic jiného – provede tě od prvního setu do konce.
Plán je stažený z app.trenerpetr.cz.

## Spuštění

```bash
python3 ~/trenink_app/server.py
```

→ http://127.0.0.1:8917

Server dělá dvě věci: servíruje appku a ovládá Spotify na Macu.

Přístup z telefonu na stejné wifi (zatím nepotřeba, mobilní appka přijde později):

```bash
HOST=0.0.0.0 python3 ~/trenink_app/server.py
```

Autostart po přihlášení do Macu (není zapnutý, zapneš sám):

```bash
cp ~/trenink_app/autostart.plist ~/Library/LaunchAgents/cz.batcave.gym.plist && launchctl load ~/Library/LaunchAgents/cz.batcave.gym.plist
```

## Jak to funguje

**Tab Trénink**
1. Kalendář týdne – dnešek žlutě, hotové dny odškrtnuté, klik na den = start tréninku
2. Během setu běží *work time*
3. „Set hotový" → zadáš váhu (předvyplněná doporučená) a opakování (předvyplněná predikce)
4. Pauza – default z plánu, beepy posledních 10 s, gong na konci, ±30 s
5. Po posledním setu cviku → RPE 1–10
6. Konec → souhrn: sety, objem v kg, nové PR

Navíc během tréninku: **vrátit set** (překlep), **set navíc**, **konec cviku** (uloží co máš a jde na RPE).
Pauza běží dál, i když přepneš na dashboard – dole v liště vidíš odpočet.

**Tab Dashboardy**
- Tento týden: tréninky, sety, objem, průměrné RPE
- Doporučení: kdy přidat kilo, kdy podržet váhu, kdy deloadovat (počítá se z historie a RPE)
- Každý cvik: graf progresu váhy, PR, historie všech setů
- Kroky vah: o kolik kg skáčou tlačítka ± u každého cviku + délka pauzy
- Export / import zálohy (JSON)

## Data

Všechno v `localStorage` prohlížeče. Zálohu si stáhneš přes Export v dashboardu.
Cloud sync je připravený v kódu (`Sync` v `js/app.js`), ale vypnutý – dořešíme
u mobilní appky, aby seděl multidevice.

## Plán

`js/plan.js` – Vlastní split, 4× týdně, rotace A → B → C → D.
Rozvrh dnů je v `plan.schedule` (1 = pondělí): Po=A, Út=B, Čt=C, Pá=D.
Sety mají typ `prep` (rozcvičovací) / `work` (pracovní) a vlastní rozsah opakování.

Nový plán z Trenér Petr se vytáhne z jejich appky (data má v `localStorage`,
klíč `sg_calc_saved_v8_training_add_remove::…`). Přihlásit se musíš sám.

## Spotify

Ovládá **Spotify desktop app na Macu** přes AppleScript – žádný client ID,
žádný developer účet, žádné přihlašování. Endpointy:
`/api/spotify/{now,next,prev,toggle,play,pause}`.

Když Spotify neběží, lišta to napíše a appka jede normálně dál.

Pro budoucí iPhone build se místo toho použije Spotify Web API (PKCE) – AppleScript
na telefonu není.

## Struktura

```
index.html      kostra + PWA meta
css/style.css   tmavě modrý theme
js/plan.js      tréninkový plán
js/icons.js     jednobarevné SVG ikonky
js/spotify.js   ovládání přehrávače
js/app.js       logika (session, timery, historie, dashboardy)
server.py       server + AppleScript most na Spotify
```
