# ZADÁNÍ – Osobní tréninková appka (Batman edition)

Cíl: identická webová appka jako trénink v app.trenerpetr.cz, ale JEN workout-focused.
Provází tréninkem od začátku do konce. Staví se CO NEJRYCHLEJI – když něco nejde
(Spotify login, scraping plánu…), přeskočit, postavit dál a doladit potom.

## Pořadí stavby
1. Web (lokálně, vanilla HTML/CSS/JS, žádný build step) ← TEĎKA
2. Až bude web hotový a odladěný → build na iPhone (proto žádné závislosti, které by tomu bránily)

## Data plánu ✅ HOTOVO
- Zdroj: app.trenerpetr.cz (Supabase backend, plán uložen v localStorage klienta)
- Staženo 4. 8. 2026: Vlastní split, Pokročilý, 4× týdně, třítýdenní rotace
  - A: Prsa · Ramena · Triceps (6 cviků)
  - B: Záda · Biceps (6 cviků)
  - C: Nohy (4 cviky)
  - D: = A (6 cviků)
- Sety mají typ prep (rozcvičovací) / work (pracovní) + rozsah opakování (např. 8–10)
- ⚠️ Claude nesmí zadávat hesla → při dalším stažení se Vojta přihlásí sám
- Z plánu bereme JEN tréninky – žádné jídelníčky, zprávy, ostatní moduly

## Core flow tréninku (1 klik = posun dál)
1. Vyberu trénink → seznam cviků
2. Cvik → **work fáze**: běží stopky (work time), vidím:
   - „naposledy: X opakování @ Y kg" (last time shower)
   - predikci opakování dle historie (predictor)
   - doporučenou váhu (recommended) + 2 buttons ±krok
     - krok dle cviku: izolované (lateral raises…) ±1 kg, stroje/compound (smith press…) ±5 kg,
       jednoručky ±2 kg – Claude odhadl, Vojta opraví v plan.js
3. Set hotovo → zadám váhu (předvyplněná recommended) + opakování → 1 klik potvrdit
4. **Rest timer** default 2:00, soft beepy do sluchátek posledních 10 s + gong na konci,
   +30 s / přeskočit
5. Po posledním setu cviku → **RPE dotaz** (1–10, grid tlačítek)
6. Další cvik… až konec → souhrn tréninku
7. Šipka zpět existuje, ale mega malá (nepoužívá se)

## Historie + dashboardy (pravý tab dole)
- Každý set (váha × opakování), RPE, datum → localStorage
- Dashboard: seznam cviků → graf progresu váhy (top set), opakování, RPE, log všech setů
- Export / import JSON (záloha)

## Cloud sync (PŘIPRAVIT, neřešit teď)
- Sync adapter vrstva v kódu (push/pull), zatím vypnutá
- Multidevice vyřešíme až při buildu mobilní appky

## Spotify ✅ HOTOVO (bez API)
- Ovládá se Spotify **desktop app na Macu** přes AppleScript (`server.py` → osascript)
- Žádný client ID, žádný developer účet, žádné ToS, žádné Premium omezení
- Endpointy: `/api/spotify/{now,next,prev,toggle,play,pause}`
- prev řeší pozici v tracku (>3 s = 2× prev, jinak 1×)
- Když Spotify neběží, lišta to napíše a appka jede dál
- Pro iPhone build se místo toho použije Spotify Web API (PKCE) – tam AppleScript není

## Design + výkon
- Silně tmavě modrá (#05090f → #0b1425) + modrá #3d7dff + žlutá #f5c518 na akce
- Jednobarevné SVG ikonky (`js/icons.js`), žádné emoji
- Kalendář týdne na první stránce: Po–Ne, dnešek zvýrazněný, hotové dny odškrtnuté,
  klik na den = start tréninku; rozvrh v `plan.schedule` (Po=A, Út=B, Čt=C, Pá=D)
- Mobile-first (Vojta to i na počítači kouká v mobilním viewportu), velké touch targety
- Mega rychlé: vanilla JS, žádné frameworky, žádné CDN závislosti pro core
- Wake lock při tréninku (nezhasínat displej)

## Doplněno navíc (5. 8. 2026)
- **Vrátit set** – překlep ve váze/opakováních se opraví jedním klikem
- **Set navíc** – když si přidám set nad plán (i z RPE obrazovky)
- **Konec cviku** – uloží co je odcvičené a jde rovnou na RPE
- **Pauza běží i mimo obrazovku tréninku** (globální hodiny) – v dolní liště odpočet
- **Doporučení na dashboardu**: přidat kilo (dal jsi horní hranici při RPE ≤ 8) /
  podržet váhu (RPE ≥ 9 a pod rozsahem) / deload −10 % (3 tréninky stagnace)
- **Týdenní přehled**: tréninky, sety, objem v kg, průměrné RPE
- **Kroky vah v UI** – Vojta si opraví ±krok i délku pauzy bez sahání do kódu
  (ukládá se do `overrides` v localStorage, přežije to i novou verzi plánu)
- **PWA** – manifest + ikonka, jde přidat na plochu
- **Autostart** – `autostart.plist` připravený, ale NEnainstalovaný (zapne si sám)

## Otevřené otázky pro Vojtu
1. Kroky vah jsou pořád jen odhad – teď se dají doladit přímo v appce
   (Dashboardy → Kroky vah), ne v kódu
2. Rozvrh Po=A, Út=B, Čt=C, Pá=D je můj návrh (plán má rotaci, ne pevné dny)
3. Chce další typy doporučení? (např. návrh objemu na partii, upozornění na PR)
