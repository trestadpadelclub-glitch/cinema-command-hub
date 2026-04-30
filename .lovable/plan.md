
# Plan: Lights-feedback, Chromecast, Blu-ray & Python v33

## Sammanfattning av v32-kompatibilitet

**v33 ersätter v32 helt.** v32 kommer fortsatt fungera för befintliga UI-anrop (Sony, Marantz, Formuler, Lights write), men nya funktioner (Lights-status, Chromecast, CEC) kräver v33. Du behöver alltså byta `.bat`-filen att starta `Formuler_alfa_status_v33.py` istället. Ingen migration av data, samma env-variabler.

---

## 1. Lights-flik — utökat UI med status & per-lampa-info

### Nya endpoints i Python v33
- `GET /api/lights/status` → returnerar lista `[{device_id, name, type, online, on, brightness, kelvin, color_hex, last_seen}]` baserat på cache som pollas var 3:e sekund via `tinytuya` Cloud API.
- Bryggan håller en in-memory `lights_state_cache` som uppdateras av en bakgrundstråd.

### UI-ändringar (`src/components/LightsRemote.tsx`)
- Behåll ON/OFF + intensitetsreglage överst.
- Lägg till en **"Aktuell status"-sektion** under reglaget: ett kort per lampa i hushållet med:
  - Namn + typ-ikon (dimmer / cct / rgb / rgbcct)
  - Online-indikator (grön/grå punkt)
  - On/Off-badge
  - Brightness-stapel + procent
  - Kelvin (för cct/rgbcct) som färgad cirkel + värde
  - RGB-färg (för rgb/rgbcct) som färgad swatch + hex
  - "Senast uppdaterad" tid (relativ, t.ex. "2s sedan")
- Polling via ny hook `useLightsStatus` (samma mönster som `useMarantzStatus`, default 5s).
- Klick på en lampa → liten popover med snabbkommandon (toggle on/off, slider för bara den lampan). Använder befintlig `/api/lights/...`-endpoint.

### Ny fil
- `src/hooks/useLightsStatus.ts` — pollar `/api/lights/status` via `getLightsStatus()` i `src/lib/projector.ts`.

---

## 2. Chromecast-flik

### Nya endpoints i Python v33 (via `pychromecast`)
- `GET /api/chromecast/status` → `{connected, device_name, app_name, media_state, title, artist, album_art, volume, muted, position, duration}`
- `POST /api/chromecast/play`, `/pause`, `/stop`, `/next`, `/previous`
- `POST /api/chromecast/volume` `{level: 0-100}` + `/mute` `{muted: bool}`
- `POST /api/chromecast/quit_app` (stänger nuvarande cast-app)
- Bakgrundstråd lyssnar på media-events och triggar `chromecast_playing` / `chromecast_paused` / `chromecast_stopped` mot `/api/public/trigger` (samma flow som Formuler-triggers).

### UI: ny `src/components/ChromecastRemote.tsx`
- Status-kort överst: ansluten enhet, app som körs (Netflix/YouTube/Plex…), pågående titel + miniatyr.
- Stora knappar: ⏮ ⏯ ⏭ + Stop + Quit App.
- Volym-slider + mute.
- Progress-bar med tid (read-only).
- Polling 2s via ny hook `useChromecastStatus`.

### Trigger-koppling
Befintliga trigger-systemet (`scene_triggers`-tabellen + `/api/public/trigger`) hanterar redan godtyckliga `trigger_key`-strängar. Ingen DB-ändring krävs — bara dokumentera de nya nycklarna `chromecast_playing`, `chromecast_paused`, `chromecast_stopped` i `SceneTriggersDialog` (lägg till i predefinierad lista så de syns i dropdown).

---

## 3. Blu-ray-flik (Panasonic DP-UB154 via Marantz CEC)

### Bakgrund / risk
Marantz Cinema 50 stödjer **HDMI Control (CEC)** som "Anynet+/Bravia Sync"-passthrough. Telnet-API:t har **inga officiella CEC-kommandon för anslutna källor**. Vi kan dock:
1. Byta till BD-ingången (`SIBD` via Telnet) — detta får ofta CEC att väcka spelaren via "One Touch Play" från andra hållet, **men det går inte garanterat att skicka Play/Pause till Panasonicen via Marantz**.
2. Vissa Marantz-modeller exponerar `MNZSTBY?` och liknande, men inga öppna CEC-kommandon.

**Realistisk lösning utan extra hårdvara:** Bluray-fliken blir primärt en **scen-trigger** + **input-väljare**. Faktisk Play/Pause-styrning av spelaren funkar troligen inte utan Broadlink-IR. Vi bygger UI:t förberett för IR senare.

### Vad som byggs nu
- Ny `src/components/BlurayRemote.tsx`:
  - **Power-knapp** → byter Marantz till BD-ingång + skickar Marantz `PWON` (kan väcka Panasonic via CEC).
  - **"Tänd film-ljus"-knapp** → triggar vald scen (`bluray_play`).
  - **"Pausa-ljus"-knapp** → triggar vald scen (`bluray_pause`).
  - **"Stopp/släck"-knapp** → triggar vald scen (`bluray_stop`).
  - Scen-väljare per knapp (sparas i localStorage, samma mönster som `LightsRemote`).
  - Info-banner: *"Direkt fjärrstyrning av Blu-ray kräver Broadlink IR-dosa (kommande)."*
  - Knappar för Play/Pause/Stop/Chapter ±/Menu **finns med men disabled** med tooltip *"Kräver IR-dosa"* — så UI:t är klart när du köper Broadlink.

### Trigger-nycklar
Lägg till `bluray_play`, `bluray_pause`, `bluray_stop` i `SceneTriggersDialog` predefinierad lista.

### Ingen Python-ändring för Blu-ray nu
CEC-passthrough hanteras via befintliga Marantz-endpoints (`/api/marantz/input` med kod `BD`). Förberedelse för Broadlink-IR i v34.

---

## 4. RemoteHub — uppdaterad tab-bar

`src/components/RemoteHub.tsx` får 6 flikar istället för 4:
`Sony | Marantz | Formuler | Lights | Cast | Blu-ray`

På 768px-viewport (din iPad-storlek) blir det smalt — jag använder 2 rader (3 kolumner × 2) eller scrollbar tab-bar för att hålla läsbarheten.

---

## 5. Python v33 — sammanfattning av ändringar mot v32

**Nya beroenden:** `pychromecast` (lägg till i `pip install`-instruktion i `SettingsDialog.tsx`).

**Nya endpoints:**
- `GET  /api/lights/status`
- `GET  /api/chromecast/status`
- `POST /api/chromecast/{play|pause|stop|next|previous|volume|mute|quit_app}`

**Nya bakgrundstrådar:**
- `lights_status_poller` (Tuya Cloud, 3s interval)
- `chromecast_listener` (event-driven via pychromecast)

**Bevarat oförändrat:** Sony ADCP, Marantz Telnet, Formuler ADB+HTTP, alla befintliga `/api/projector`, `/api/marantz/*`, `/api/lights/*` (write), `/api/formuler/*`. v32-UI fortsätter fungera mot v33-bryggan.

**Env-variabler:** `CHROMECAST_NAME=källaren` används för att hitta rätt cast (redan i din `.bat`).

---

## Filer som skapas/ändras

**Nya:**
- `public/downloads/Formuler_alfa_status_v33.py`
- `src/components/ChromecastRemote.tsx`
- `src/components/BlurayRemote.tsx`
- `src/hooks/useLightsStatus.ts`
- `src/hooks/useChromecastStatus.ts`

**Ändras:**
- `src/lib/projector.ts` — nya helpers `getLightsStatus`, `getChromecastStatus`, `chromecastCommand`
- `src/components/LightsRemote.tsx` — status-sektion + per-lampa-popover
- `src/components/RemoteHub.tsx` — 2 nya flikar
- `src/components/SettingsDialog.tsx` — uppdatera nedladdningslänk till v33 + nämn `pychromecast`
- `src/components/SceneTriggersDialog.tsx` — lägg till nya predefinierade trigger-nycklar

**Inga DB-migrationer behövs** — befintliga `scene_triggers`-tabellen är redan generisk.

---

## Leverans i två steg

För att hålla svaren hanterbara levererar jag i ordning:
1. **Python v33** + `lib/projector.ts` helpers + `LightsRemote` status-utökning + `RemoteHub` tabs + `SettingsDialog` uppdatering.
2. **ChromecastRemote** + **BlurayRemote** + hooks + `SceneTriggersDialog` trigger-nycklar.

Jag verifierar bygget efter varje steg.
