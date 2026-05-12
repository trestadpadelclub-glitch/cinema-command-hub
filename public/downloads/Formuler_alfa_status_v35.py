#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Formuler_alfa_status_v35.py  (Sony VPL-HW65ES, ADCP)
=====================================================

v35 NYTT (jämfört med v34):
  - Återinför LOKAL EXEKVERING: _execute_scene_payload() körs direkt
    när molnet svarar på en trigger (Formuler / Chromecast / Marantz),
    så projektor/Marantz/lampor styrs lokalt utan extra rundtur via
    /api/* från appen. Lägre latens + funkar headless.
  - Inga ADCP-ändringar: hårdvarurisker hos HW65ES kvarstår
      * Power On via ADCP är opålitlig — port 53595 stängs i standby.
        Vid återkommande fel: lägg PJ Talk (pysdcp/SDCP 53484) som
        hybrid för power+status och låt ADCP enbart avfyra inställningar
        när projektorn är på och varm.
      * Tung batch-GET (status) på 53595 kan ge socket.timeout —
        håll polling glesa eller flytta till PJ Talk.

v35: STÖD FÖR SONY VPL-HW65ES (ersätter XW5000ES-mappningarna).
v35: Samma ADCP text-protokoll på TCP 53595 och samma /api/projector + /status
v35: endpoints — endast Sony-lagret är ombytt enligt Sonys "Protocol Manual
v35: (SUPPORTED COMMAND LIST)" 1st Edition Rev.1, kolumn HW65ES (col 9).
v34:
v34: HW65ES stödjer (○):
v34:   - power, input (hdmi1/hdmi2), blank (on/off)
v34:   - picture_mode: cinema_film1, cinema_film2, reference, tv, photo,
v34:     brt_cinema, brt_tv, user, game  (INTE user1/2/3, INTE cinema_digital)
v34:   - contrast, brightness, color, sharpness  (numeric 0..100)
v34:   - color_temp: custom1..5, d93, d75, d65, d55  (INTE dci)
v34:   - coltemp_gain_r/g/b, coltemp_bias_r/g/b
v34:   - lamp_control: low / high  (ersätter laser_output från XW5000ES)
v34:   - motionflow: off, true_cinema, smooth_low, smooth_high
v34:     (HW65ES saknar impulse + combination)
v34:
v34: HW65ES stödjer INTE (svarar err_cmd/err_option) — dessa returnerar nu
v34: "skipped" utan att gå mot projektorn:
v34:   - light_output_val (laser_output)  → ersatt av lamp_control
v34:   - light_output_dyn (dynamic_control)
v34:   - contrast_enh     (hdr_enhancer)
v34:   - gamma_correction (saknas som direkt ADCP-item på HW65ES)
v34:   - real_cre / real_cre_reso (Reality Creation)
v34:
v34: Allt annat (Marantz, Formuler, Lights, Chromecast, triggers) är OFÖRÄNDRAT
v34: från v33.

v33: NYHETER mot v32 (additivt — alla v32-endpoints fungerar oförändrat):
v33:   * GET  /api/lights/status         -> aktuell status för varje konfigurerad
v33:                                        Tuya-lampa (cache:ad, polling 3s).
v33:   * GET  /api/chromecast/status     -> {connected, app, media_state, title,
v33:                                        artist, album_art, volume, muted,
v33:                                        position, duration}.
v33:   * POST /api/chromecast/play|pause|stop|next|previous
v33:   * POST /api/chromecast/volume     body {"level": 0..100}
v33:   * POST /api/chromecast/mute       body {"muted": true|false}
v33:   * POST /api/chromecast/quit_app
v33: v33: Nytt beroende: pychromecast (för media-styrning + monitor som redan
v33: v33: fanns i v32). Tuya status använder befintlig tinytuya.Cloud.
v33: v33: Bryggan publicerar fortfarande samma triggers (chromecast_*, movie_*,
v33: v33: marantz_*, formuler_*) — UI-Blu-ray-fliken triggar bluray_play /
v33: v33: bluray_pause / bluray_stop indirekt via Chromecast/Marantz.

v20: Stöd för exakt Android-komponent (paket/aktivitet) från Hitta appar.
v20: `launch_app` kan nu ta t.ex. com.pkg/.MainActivity och provar även
v20: dynamiskt hittade launcher-aktiviteter innan sista paket-fallback.

v18: Robustare formuler_launch_app — `monkey` med fallback till `am start`,
v18: och full stdout/stderr-loggning. Versionsbump så det syns att rätt fil körs.
v18:

v9: Rättar grundfelet för numeric ADCP-kommandon. Laser Output, Brightness,
Contrast, Sharpness och Reality Creation Resolution skickas nu UTAN citationstecken
(light_output_val 750, brightness 50, contrast 90, sharpness 0, real_cre_reso 20).
Motionflow aktiveras igen som select-kommandot motionflow "smooth_low" osv. GET för
dessa läggs tillbaka. HDR Enhancer GET är fortsatt normaliserad mid -> middle.
Om brightness/contrast/color/sharpness svarar err_option på 0..100-värde provar
bridgen även signed fallback (-50..+50) och loggar detta.

v7: Anpassad efter faktisk XW5000ES/Marantz-test. Rättar ADCP-namn/värden
för laser, HDR Enhancer och Dynamic Control, skippar direkta bildsliders/Reality
Creation som XW5000ES svarar err_option/err_cmd på, lägger till remote_key
(key "menu"/"up"/"down"/"left"/"right"/"enter") och serialiserar ADCP
sessioner så statuspolling inte krockar med kommandon under warm-up. Marantz
Dirac slot använder nu PSDIRAC 1/2/3 i stället för PSDIRAC SLOT 1/2/3.

v6: Hanterar `err_inactive` korrekt. När projektorn precis fått power "on"
är den i startup/warm-up i ~20-30 s och vägrar SET-kommandon med err_inactive.
Bridgen pollar nu power_status och retry:ar SET-kommandot när projektorn är
redo. Dessutom kortare batch-GET-timeout så status inte fastnar i 14+ s.

v5: Korrigerade ADCP-mappningar för Sony VPL-XW5000ES enligt observerade
err_cmd / err_option-svar i loggen samt Sony BPJ Protocol Manual.

Viktigaste rättningar mot v4:
  * laser_dimming        -> light_output  (err_cmd löst)
  * dynamic_control      -> dynamic_control_setting + andra giltiga värden
  * hdr (HDR Enhancer)   -> contrast_enhancer (err_option löst — "hdr" finns
                            men är HDR-typ-väljare, inte enhancer)
  * gamma_correction     -> skickas som "2.4" (UTAN g_-prefix)
  * brightness/contrast/color/sharpness -> signed offset 0=±0; XW5000ES
                            tar -50..+50; appens 0..100 mappas till -50..+50.
  * reality_creation     -> rc_mode  (on/off)
  * rc_resolution        -> reality_creation_db
  * motion_flow          -> XW5000ES SAKNAR Motionflow → returnerar "skipped"
                            istället för att skicka och få err_cmd
  * picture_mode         -> validerar att värdet finns på XW5000ES,
                            mappar bort "bright_tv" som inte stöds (→ tv).

Bridge mellan Lovable-appen, Sony VPL-XW5000ES (ADCP) och Marantz/Denon AVR
(Telnet IP-kontroll på TCP 23).

Nyheter i v4 jämfört med v3:
* Riktig Marantz/Denon-implementation över Telnet (port 23) — tidigare var
  /api/marantz bara en stub som loggade och returnerade "sent" utan att
  faktiskt skicka något till receivern. Det är därför PWSTANDBY m.fl. inte
  stängde av förstärkaren.
* Ny endpoint GET /api/marantz/status returnerar {power, volume, mute, input}.

Endpoints:
    POST /api/projector              body: {"action": "<action>", "value": "<value>"}
    GET  /api/projector/status       -> {"power": "on"|"off", ...}
    POST /api/marantz                body: {"action": "marantz", "value": "PWSTANDBY"}
    GET  /api/marantz/status         -> {"power", "volume", "mute", "input"}
    POST /api/lights                 (proxy — koppla in din Tuya-handler)

Konfiguration (env-variabler):
    PROJECTOR_HOST   = projektorns IP   (default 192.168.86.114)
    PROJECTOR_PORT   = ADCP-port        (default 53595)
    PROJECTOR_PASS   = ADCP-lösenord    (default "Projector")
    MARANTZ_HOST     = receiverns IP    (default tom = stub-läge)
    MARANTZ_PORT     = Telnet-port      (default 23)
    BRIDGE_PORT      = HTTP-port        (default 5000)

Kör:
    MARANTZ_HOST=192.168.86.50 python3 Formuler_alfa_status_v4.py
"""

from __future__ import annotations

import hashlib
import re
import subprocess
import urllib.request
import json
import os
import socket
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, Optional, Tuple


# ---------------------------------------------------------------------------
# KONFIGURATION
# ---------------------------------------------------------------------------

SETTINGS = {
    "host":   os.environ.get("PROJECTOR_HOST", "192.168.86.114"),
    "port":   int(os.environ.get("PROJECTOR_PORT", "53595")),
    "passwd": os.environ.get("PROJECTOR_PASS", "kirderF1"),
    "bridge_port": int(os.environ.get("BRIDGE_PORT", "5000")),
    "timeout": 3.0,
    "status_timeout": 1.2,
    # --- Marantz / Denon receiver (Telnet/IP control) ---
    # Marantz AVR lyssnar på TCP port 23 med ASCII-kommandon avslutade med \r.
    # Sätt MARANTZ_HOST till receiverns IP. Lämna tomt för att stub:a.
    "marantz_host": os.environ.get("MARANTZ_HOST", "192.168.86.38"),
    "marantz_port": int(os.environ.get("MARANTZ_PORT", "23")),
    "marantz_timeout": 3.0,
    # --- Tuya Cloud (Smart Life / Mi-Light gateway via tinytuya.Cloud) ---
    # Hämta från iot.tuya.com -> Cloud -> Project (samma värden som Gemini-scriptet).
    "tuya_region": os.environ.get("TUYA_REGION", "eu"),
    "tuya_api_key": os.environ.get("TUYA_API_KEY", "nrg4m8hjxahye9xhv83q"),
    "tuya_api_secret": os.environ.get("TUYA_API_SECRET", "89ac0c5b7bdc4bf6be9dff025d7b710f"),
    # Valfritt: ett "anchor"-device-id som tinytuya kräver för att hitta tokens.
    "tuya_anchor_device": os.environ.get("TUYA_ANCHOR_DEVICE", "bf7d066731f88e90c78gqc"),
    # --- Formuler Z11 (Android TV box via ADB) ---
    # Boxen måste vara i developer mode med "ADB debugging over network" på.
    # Första gången krävs `adb connect 192.168.86.39:5555` + bekräfta fingerprint
    # på TV:n. Därefter kan denna bridge polla tillstånd självständigt.
    "formuler_host": os.environ.get("FORMULER_HOST", "192.168.86.39"),
    "formuler_port": int(os.environ.get("FORMULER_PORT", "5555")),
    "formuler_poll": float(os.environ.get("FORMULER_POLL_SEC", "2.0")),
    # Liten debounce för paus/stop så spol/seek inte triggar onödiga scenbyten.
    "formuler_pause_debounce": float(os.environ.get("FORMULER_PAUSE_DEBOUNCE", "2.5")),
    # Om MediaSession är trasig: räkna stopp först när ljudet varit borta en stund.
    "formuler_stale_stop_sec": float(os.environ.get("FORMULER_STALE_STOP_SEC", "20.0")),
    # Vart triggers postas. household_code är samma kod du använder i UI:t.
    "trigger_url": os.environ.get(
        "TRIGGER_URL",
        "https://projector-pal-97.lovable.app/api/public/trigger",
    ),
    "household_code": os.environ.get("HOUSEHOLD_CODE", ""),
    "adb_bin": os.environ.get("ADB_BIN", "adb"),
    # --- Chromecast (Google Cast via pychromecast) ---
    # Lämna CHROMECAST_NAME tomt för att ta första hittade enheten.
    # Sätt CHROMECAST_NAME=källaren för att låsa till en specifik enhet.
    "chromecast_name": os.environ.get("CHROMECAST_NAME", "").strip() or None,
    "chromecast_discovery_timeout": float(os.environ.get("CHROMECAST_DISCOVERY_TIMEOUT", "15")),
    "chromecast_retry_sec": float(os.environ.get("CHROMECAST_RETRY_SEC", "30")),
    # --- Marantz polling for trigger posting ---
    "marantz_poll": float(os.environ.get("MARANTZ_POLL_SEC", "5.0")),
    # --- Lights status polling (Tuya Cloud) ---
    # Bryggan pollar Tuya Cloud var X sekund och cache:ar status så att
    # GET /api/lights/status svarar snabbt utan att slå mot molnet varje gång.
    # 0 = stäng av polling helt (lights_status returnerar då tom lista).
    "lights_status_poll": float(os.environ.get("LIGHTS_STATUS_POLL_SEC", "5.0")),
    # Vilka device_ids som ska pollas. Tom = ingen polling. Sätts från
    # Lovable-appen vid första /api/lights/status-anropet (cache:as).
    "lights_status_devices": [
        s.strip() for s in os.environ.get("LIGHTS_STATUS_DEVICES", "").split(",") if s.strip()
    ],
}


# ---------------------------------------------------------------------------
# TUYA CLOUD (lampor)
# ---------------------------------------------------------------------------
# Använder tinytuya.Cloud — pip install tinytuya
# Kommandon vi skickar (DPS-koder för Smart Life / Mi-Light RGBCCT):
#   switch_led      bool        on/off
#   bright_value    int 10..1000
#   temp_value      int 0..1000  (kelvin: 2700..6500 mappas till 0..1000)
#   colour_data_v2  {"h":0..360,"s":0..1000,"v":0..1000}  RGB
#   work_mode       "white" | "colour" | "scene" | "music"

_tuya_cloud = None
_tuya_lock = threading.Lock()


def _get_tuya_cloud():
    """Lazy-init tinytuya.Cloud. Returnerar None om biblioteket saknas."""
    global _tuya_cloud
    if _tuya_cloud is not None:
        return _tuya_cloud
    try:
        import tinytuya  # type: ignore
    except ImportError:
        _log("TUYA: tinytuya saknas — kör 'pip install tinytuya'")
        return None
    try:
        with _tuya_lock:
            if _tuya_cloud is None:
                _tuya_cloud = tinytuya.Cloud(
                    apiRegion=SETTINGS["tuya_region"],
                    apiKey=SETTINGS["tuya_api_key"],
                    apiSecret=SETTINGS["tuya_api_secret"],
                    apiDeviceID=SETTINGS["tuya_anchor_device"],
                )
        return _tuya_cloud
    except Exception as e:
        _log(f"TUYA init fail: {e}")
        return None


def _kelvin_to_temp_value(kelvin: int) -> int:
    """Mappa 2700..6500 K till tinytuya temp_value 0..1000."""
    k = max(2700, min(6500, int(kelvin)))
    return int(round((k - 2700) / (6500 - 2700) * 1000))


# Gamma-korrektion för upplevd ljusstyrka.
# Tuya-lampor har en linjär PWM-skala (10..1000) men ögat uppfattar ljus
# logaritmiskt — 200/1000 (=20% linjärt) ser ut som ~50% upplevt.
# Genom att kvadrera procenttalet (γ≈2.2) blir 20% på sliden ~4% PWM,
# vilket motsvarar 20% upplevt ljus. Standardvärde i CIE/sRGB är 2.2.
TUYA_BRIGHTNESS_GAMMA = float(os.environ.get("TUYA_BRIGHTNESS_GAMMA", "2.2"))
TUYA_BRIGHTNESS_MIN = 10   # tinytuya min för bright_value_v2
TUYA_BRIGHTNESS_MAX = 1000


def _percent_to_tuya_brightness(pct: float) -> int:
    """0..100 % -> 10..1000 med gamma-kurva för upplevd ljusstyrka."""
    p = max(0.0, min(100.0, float(pct))) / 100.0
    if p <= 0:
        return TUYA_BRIGHTNESS_MIN
    # gamma: visuellt 20% -> linjärt 0.20**2.2 ≈ 0.029 -> ~29/1000
    linear = p ** TUYA_BRIGHTNESS_GAMMA
    raw = int(round(linear * TUYA_BRIGHTNESS_MAX))
    return max(TUYA_BRIGHTNESS_MIN, min(TUYA_BRIGHTNESS_MAX, raw))


def _hex_to_hsv(hex_color: str) -> Dict[str, int]:
    """'#rrggbb' -> {'h':0..360,'s':0..1000,'v':0..1000} för colour_data_v2."""
    s = hex_color.lstrip("#")
    if len(s) != 6:
        return {"h": 0, "s": 0, "v": 1000}
    r, g, b = int(s[0:2], 16) / 255.0, int(s[2:4], 16) / 255.0, int(s[4:6], 16) / 255.0
    mx, mn = max(r, g, b), min(r, g, b)
    df = mx - mn
    if df == 0:
        h = 0.0
    elif mx == r:
        h = (60 * ((g - b) / df) + 360) % 360
    elif mx == g:
        h = (60 * ((b - r) / df) + 120) % 360
    else:
        h = (60 * ((r - g) / df) + 240) % 360
    sv = 0 if mx == 0 else df / mx
    return {"h": int(round(h)), "s": int(round(sv * 1000)), "v": int(round(mx * 1000))}


def _build_light_commands(light: Dict[str, Any]) -> list:
    """Bygg DPS-kommandon utifrån ett scene-light-objekt från appen.

    Förväntad struktur (matchar src/lib/projector.ts SceneLightCommand):
        {device_id, name?, type?, on, brightness?, kelvin?, color?}

    Ordning är viktig: vi sätter work_mode FÖRST så efterföljande
    bright_value/temp_value/colour_data_v2 hamnar i rätt läge. Annars
    kan en lampa som står i "colour" ignorera bright_value.
    """
    cmds: list = []
    is_on = bool(light.get("on", True))
    cmds.append({"code": "switch_led", "value": is_on})
    if not is_on:
        return cmds

    ltype = str(light.get("type", "")).lower()
    color = light.get("color")
    kelvin = light.get("kelvin")

    # Brightness 0..100 -> 10..1000 (Tuya kräver minst 10)
    bv: Optional[int] = None
    if light.get("brightness") is not None:
        try:
            pct = max(0.0, min(100.0, float(light["brightness"])))
            bv = _percent_to_tuya_brightness(pct)
        except (TypeError, ValueError):
            bv = None

    use_colour = bool(color) and ltype in ("rgb", "rgbcct")

    # 1) Sätt work_mode FÖRST
    if use_colour:
        cmds.append({"code": "work_mode", "value": "colour"})
    elif ltype in ("cct", "rgbcct"):
        cmds.append({"code": "work_mode", "value": "white"})

    # 2) Färg eller färgtemp
    if use_colour:
        hsv = _hex_to_hsv(str(color))
        # Låt brightness styra HSV "v" — annars dimmar inte färglampor.
        if bv is not None:
            hsv["v"] = bv
        cmds.append({"code": "colour_data_v2", "value": hsv})
    elif kelvin is not None and ltype in ("cct", "rgbcct"):
        cmds.append({"code": "temp_value", "value": _kelvin_to_temp_value(int(kelvin))})

    # 3) Brightness — skicka BÅDE bright_value och bright_value_v2.
    #    Lampor svarar på en av dem; den andra ignoreras tyst.
    if bv is not None and not use_colour:
        cmds.append({"code": "bright_value", "value": bv})
        cmds.append({"code": "bright_value_v2", "value": bv})

    return cmds


def tuya_apply_lights(lights: list) -> Dict[str, Any]:
    """Skicka kommandon till en lista av Tuya-lampor. Returnerar per-device-resultat."""
    cloud = _get_tuya_cloud()
    if cloud is None:
        return {"ok": False, "error": "tuya_cloud_unavailable", "results": []}

    results = []
    for light in lights:
        device_id = light.get("device_id") or light.get("deviceId")
        name = light.get("name") or device_id
        if not device_id:
            results.append({"name": name, "ok": False, "error": "missing_device_id"})
            continue
        cmds = _build_light_commands(light)
        _log(f"TUYA -> {name} ({device_id}): {cmds}")
        try:
            with _tuya_lock:
                reply = cloud.sendcommand(device_id, {"commands": cmds})
            ok = bool(reply and reply.get("success", True) is not False)
            # Logga ALLTID svaret så vi kan se om DPS-koder ignoreras tyst.
            _log(f"TUYA <- {name}: ok={ok} reply={reply}")
            results.append({"name": name, "device_id": device_id, "ok": ok, "reply": reply})
        except Exception as e:
            _log(f"TUYA fail {name}: {e}")
            results.append({"name": name, "device_id": device_id, "ok": False, "error": str(e)})
    overall = all(r.get("ok") for r in results) if results else True
    return {"ok": overall, "results": results}


# ---------------------------------------------------------------------------
# TUYA STATUS — läsning av aktuellt tillstånd per lampa (cache:as)
# ---------------------------------------------------------------------------
# tinytuya.Cloud.getstatus(device_id) returnerar {"result": [ {"code": "switch_led", "value": True}, ... ]}
# Vi normaliserar detta till ett UI-vänligt objekt.

_lights_status_cache: Dict[str, Dict[str, Any]] = {}
_lights_status_lock = threading.Lock()


def _temp_value_to_kelvin(tv: int) -> int:
    """Mappa tinytuya 0..1000 -> 2700..6500 K (omvänt mot _kelvin_to_temp_value)."""
    n = max(0, min(1000, int(tv)))
    return int(round(2700 + (n / 1000.0) * (6500 - 2700)))


def _tuya_brightness_to_percent(raw: int) -> int:
    """10..1000 -> 0..100% med invers gamma."""
    n = max(TUYA_BRIGHTNESS_MIN, min(TUYA_BRIGHTNESS_MAX, int(raw)))
    linear = n / TUYA_BRIGHTNESS_MAX
    if linear <= 0:
        return 0
    pct = (linear ** (1.0 / TUYA_BRIGHTNESS_GAMMA)) * 100.0
    return max(0, min(100, int(round(pct))))


def _hsv_to_hex(h: int, s: int, v: int) -> str:
    """colour_data_v2 {h:0..360, s:0..1000, v:0..1000} -> '#rrggbb'."""
    sf = max(0, min(1000, int(s))) / 1000.0
    vf = max(0, min(1000, int(v))) / 1000.0
    hf = max(0, min(360, int(h))) / 60.0
    c = vf * sf
    x = c * (1 - abs((hf % 2) - 1))
    m = vf - c
    if 0 <= hf < 1:   r, g, b = c, x, 0
    elif 1 <= hf < 2: r, g, b = x, c, 0
    elif 2 <= hf < 3: r, g, b = 0, c, x
    elif 3 <= hf < 4: r, g, b = 0, x, c
    elif 4 <= hf < 5: r, g, b = x, 0, c
    else:             r, g, b = c, 0, x
    rr = int(round((r + m) * 255))
    gg = int(round((g + m) * 255))
    bb = int(round((b + m) * 255))
    return f"#{rr:02x}{gg:02x}{bb:02x}"


def tuya_read_status(device_id: str) -> Dict[str, Any]:
    """Hämta aktuell status för en Tuya-lampa. Returnerar normaliserat objekt."""
    cloud = _get_tuya_cloud()
    if cloud is None:
        return {"online": False, "error": "tuya_cloud_unavailable"}
    try:
        with _tuya_lock:
            raw = cloud.getstatus(device_id)
    except Exception as e:
        return {"online": False, "error": str(e)}

    if not raw or not isinstance(raw, dict):
        return {"online": False, "error": "empty_reply"}
    if raw.get("success") is False:
        return {"online": False, "error": str(raw.get("msg") or raw)}

    items = raw.get("result") or []
    if not isinstance(items, list):
        return {"online": False, "error": "bad_format"}

    out: Dict[str, Any] = {"online": True, "last_seen": int(time.time())}
    for item in items:
        if not isinstance(item, dict):
            continue
        code = item.get("code")
        val = item.get("value")
        if code == "switch_led":
            out["on"] = bool(val)
        elif code in ("bright_value", "bright_value_v2") and isinstance(val, (int, float)):
            out["brightness"] = _tuya_brightness_to_percent(int(val))
        elif code in ("temp_value", "temp_value_v2") and isinstance(val, (int, float)):
            out["kelvin"] = _temp_value_to_kelvin(int(val))
        elif code == "work_mode" and isinstance(val, str):
            out["work_mode"] = val
        elif code == "colour_data_v2" and isinstance(val, dict):
            try:
                out["color_hex"] = _hsv_to_hex(int(val.get("h", 0)), int(val.get("s", 0)), int(val.get("v", 0)))
            except (TypeError, ValueError):
                pass
    return out


def lights_status_get_all() -> Dict[str, Dict[str, Any]]:
    """Returnera cache:ad status för alla pollade lampor."""
    with _lights_status_lock:
        return dict(_lights_status_cache)


def lights_status_set_devices(device_ids: list) -> None:
    """Uppdatera vilka device_ids som ska pollas. Anropas från GET /api/lights/status."""
    clean = [d for d in (str(x).strip() for x in device_ids) if d]
    SETTINGS["lights_status_devices"] = clean
    with _lights_status_lock:
        for k in list(_lights_status_cache.keys()):
            if k not in clean:
                _lights_status_cache.pop(k, None)


class TuyaStatusPoller(threading.Thread):
    """Bakgrundstråd som pollar Tuya Cloud för varje konfigurerad lampa."""

    def __init__(self) -> None:
        super().__init__(daemon=True, name="TuyaStatusPoller")
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        interval = SETTINGS["lights_status_poll"]
        if interval <= 0:
            _log("TUYA STATUS poller disabled (LIGHTS_STATUS_POLL_SEC=0)")
            return
        _log(f"TUYA STATUS poller start interval={interval}s")
        while not self._stop.is_set():
            devices = list(SETTINGS["lights_status_devices"])
            if not devices:
                self._stop.wait(min(interval, 5.0))
                continue
            for device_id in devices:
                if self._stop.is_set():
                    break
                status = tuya_read_status(device_id)
                with _lights_status_lock:
                    prev = _lights_status_cache.get(device_id, {})
                    merged = {**prev, **status, "device_id": device_id}
                    _lights_status_cache[device_id] = merged
            self._stop.wait(interval)
        _log("TUYA STATUS poller stopped")


# ---------------------------------------------------------------------------
# ACTION → ADCP-kommando
# ---------------------------------------------------------------------------
#
# Lovable-appen skickar `action` enligt SETTINGS_ACTIONS i src/lib/projector.ts.
# Här mappar vi varje action till rätt ADCP-kommandonamn + värdetransformation.
#
# Format för varje post:
#   "action_från_appen": (adcp_command, value_mapper_eller_None)
#
# value_mapper är en funktion som tar appens råvärde (str|int) och returnerar
# strängen som skickas till projektorn. None = skicka råvärdet som-är.

def _lamp_to_adcp(v: Any) -> str:
    """HW65ES lamp_control: only 'low' eller 'high'."""
    s = str(v).lower().strip()
    return "high" if s in ("high", "1", "on", "true") else "low"

def _ui_0_100(v: Any) -> str:
    """UI/projektor-menu 0..100 -> ADCP numeric value, utan citationstecken."""
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        n = 50
    return str(max(0, min(100, n)))


def _slider_signed(v: Any) -> str:
    """Fallback: appens 0..100 -> signerad -50..+50 om modellen kräver det."""
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        n = 50
    n = max(0, min(100, n)) - 50
    return str(n)

def _power_to_adcp(v: Any) -> str:
    s = str(v).lower().strip()
    return "on" if s in ("on", "1", "true") else "off"

# Picture-modes som finns på VPL-HW65ES enligt Sony Protocol Manual
# (SUPPORTED COMMAND LIST) Rev.1, col 9. Inga user1/2/3, inga cinema_digital.
_HW65ES_PIC_MODES = {
    "cinema_film1", "cinema_film2", "reference", "tv",
    "photo", "game", "brt_cinema", "brt_tv", "user",
}

def _picmode_to_adcp(v: Any) -> str:
    """Normalisera och fall-back till närmaste mode som faktiskt finns på HW65ES."""
    s = str(v).lower().strip()
    s = {
        "cinema_film_1": "cinema_film1",
        "cinema_film_2": "cinema_film2",
        "bright_cinema": "brt_cinema",
        "bright_tv":     "brt_tv",
        # XW5000ES-only modes som UI fortfarande kan skicka -> mappa till HW65ES-motsvarighet
        "user1":         "user",
        "user2":         "user",
        "user3":         "user",
        "imax_enhanced": "user",
        "cinema_digital":"cinema_film1",
    }.get(s, s)
    if s not in _HW65ES_PIC_MODES:
        _log(f"varning: picture_mode {s!r} stöds ej på HW65ES, faller tillbaka till 'cinema_film1'")
        s = "cinema_film1"
    return s

def _motion_to_adcp(v: Any) -> str:
    """HW65ES motionflow: off, true_cinema, smooth_low, smooth_high
    (HW65ES saknar impulse + combination — mappa till smooth_high)."""
    s = str(v).lower().strip().replace("-", "_").replace(" ", "_")
    valid = {"off", "smooth_high", "smooth_low", "true_cinema"}
    if s in valid:
        return s
    if s in ("impulse", "combination"):
        _log(f"varning: motionflow {s!r} stöds ej på HW65ES → smooth_high")
        return "smooth_high"
    return "off"

def _color_temp_to_adcp(v: Any) -> str:
    s = str(v).lower().strip()
    valid = {"d93","d75","d65","d55","custom1","custom2","custom3","custom4","custom5"}
    return s if s in valid else "d65"

def _input_to_adcp(v: Any) -> str:
    s = str(v).lower().strip()
    return "hdmi1" if s in ("hdmi1", "1", "input1") else "hdmi2"

def _onoff(v: Any) -> str:
    s = str(v).lower().strip()
    return "on" if s in ("on", "1", "true") else "off"


# ADCP-kommandonamn enligt Sony Protocol Manual (SUPPORTED COMMAND LIST)
# kolumn HW65ES. Ej-stödda actions har None som adcp_command och returneras
# som "skipped" istället för att gå mot projektorn.
ACTION_MAP: Dict[str, Tuple[Optional[str], Any, str]] = {
    # power/select-kommandon använder citerade värden: command "value"
    "power":               ("power",                  _power_to_adcp,    "select"),
    "pic_mode":            ("picture_mode",           _picmode_to_adcp,   "select"),
    "motionflow":          ("motionflow",             _motion_to_adcp,    "select"),
    "color_temp":          ("color_temp",             _color_temp_to_adcp,"select"),
    "input":               ("input",                  _input_to_adcp,     "select"),
    "blank":               ("blank",                  _onoff,             "select"),
    "lamp_control":        ("lamp_control",           _lamp_to_adcp,      "select"),

    # numeric-kommandon utan citationstecken: command 50
    "brightness":          ("brightness",             _ui_0_100,          "numeric"),
    "contrast":            ("contrast",               _ui_0_100,          "numeric"),
    "color":               ("color",                  _ui_0_100,          "numeric"),
    "sharpness":           ("sharpness",              _ui_0_100,          "numeric"),

    # Ej stödda på HW65ES — returnera "skipped" så UI inte ser fel.
    "laser_output":        (None, None, "skip"),  # ersatt av lamp_control
    "dynamic_control":     (None, None, "skip"),
    "hdr_enhancer":        (None, None, "skip"),
    "gamma_correction":    (None, None, "skip"),
    "real_cre":            (None, None, "skip"),
    "reality_creation":    (None, None, "skip"),
    "reality_creation_val":(None, None, "skip"),
}

# GET-kommandon för status-endpoint (endast HW65ES-stödda items)
STATUS_QUERIES = [
    ("power",            "power_status"),
    ("picture_mode",     "picture_mode"),
    ("input",            "input"),
    ("lamp_control",     "lamp_control"),
    ("brightness",       "brightness"),
    ("contrast",         "contrast"),
    ("color",            "color"),
    ("sharpness",        "sharpness"),
    ("motionflow",       "motionflow"),
    ("color_temp",       "color_temp"),
    ("blank",            "blank"),
]



# ---------------------------------------------------------------------------
# ADCP TCP-klient
# ---------------------------------------------------------------------------

def _log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


class AdcpError(Exception):
    pass


ADCP_LOCK = threading.Lock()
LAST_POWER_ON_TS = 0.0


def _adcp_session(cmds: list[str], timeout: Optional[float] = None) -> list[str]:
    """
    Öppna en ADCP-session, autentisera och skicka en lista kommandon i sekvens.
    Returnerar listan med rader projektorn svarade med (en per kommando).
    """
    tmo = float(timeout if timeout is not None else SETTINGS["timeout"])
    with ADCP_LOCK:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(tmo)
        try:
            sock.connect((SETTINGS["host"], SETTINGS["port"]))

            # läs nonce
            nonce_buf = b""
            deadline = time.time() + tmo
            while b"\r\n" not in nonce_buf and time.time() < deadline:
                chunk = sock.recv(64)
                if not chunk:
                    break
                nonce_buf += chunk
            nonce = nonce_buf.split(b"\r\n", 1)[0].decode("ascii", errors="ignore").strip()

            if nonce and nonce.upper() not in ("NOKEY",):
                digest = hashlib.sha256((nonce + SETTINGS["passwd"]).encode("ascii")).hexdigest()
                sock.sendall((digest + "\r\n").encode("ascii"))
                auth_resp = b""
                deadline = time.time() + tmo
                while b"\r\n" not in auth_resp and time.time() < deadline:
                    chunk = sock.recv(64)
                    if not chunk:
                        break
                    auth_resp += chunk
                auth_line = auth_resp.split(b"\r\n", 1)[0].decode("ascii", "ignore").strip()
                if auth_line and auth_line.lower().startswith("err"):
                    raise AdcpError(f"auth failed: {auth_line}")

            results: list[str] = []
            for cmd in cmds:
                sock.sendall((cmd + "\r\n").encode("ascii"))
                resp = b""
                deadline = time.time() + tmo
                while b"\r\n" not in resp and time.time() < deadline:
                    chunk = sock.recv(256)
                    if not chunk:
                        break
                    resp += chunk
                line = resp.split(b"\r\n", 1)[0].decode("ascii", "ignore").strip()
                results.append(line)
                # Under warm-up kan projektorn sluta svara. Avbryt batchen direkt
                # så inte statuspolling timeoutar en gång per GET-kommando.
                if not line:
                    break
            return results
        finally:
            try:
                sock.close()
            except OSError:
                pass


def _format_adcp_set(adcp_command: str, value: str, mode: str) -> str:
    if mode == "numeric":
        return f"{adcp_command} {value}"
    if mode == "raw":
        return f"{adcp_command} {value}".strip()
    return f'{adcp_command} "{value}"'


def adcp_set(adcp_command: str, value: str, mode: str = "select", _retry_inactive: bool = True) -> str:
    """SET-kommando. Select-värden citeras, numeric-värden skickas rått."""
    global LAST_POWER_ON_TS

    candidates: list[Tuple[str, str, str]] = [(mode, str(value), "primary")]
    if mode == "numeric" and adcp_command in ("brightness", "contrast", "color", "sharpness"):
        try:
            n = int(round(float(value)))
            if 0 <= n <= 100:
                signed = str(n - 50)
                if signed != str(value):
                    candidates.append(("numeric", signed, "signed-fallback"))
        except (TypeError, ValueError):
            pass

    last_line = ""
    for fmt, candidate_value, label in candidates:
        cmd = _format_adcp_set(adcp_command, candidate_value, fmt)
        suffix = "" if label == "primary" else f" ({label})"
        _log(f"ADCP TX{suffix}: {cmd}")
        out = _adcp_session([cmd])
        line = out[0] if out else ""
        _log(f"ADCP RX{suffix}: {line!r}")
        last_line = line

        if adcp_command == "power" and candidate_value == "on" and line.lower() == "ok":
            LAST_POWER_ON_TS = time.time()

        # Only try fallback for value/option errors. Other errors mean retrying with
        # another scale is unlikely to help and can hide the real problem.
        if line.lower() not in ("err_option", "err_val"):
            break

    if last_line.lower() == "err_inactive" and _retry_inactive and adcp_command != "power":
        _log(f"ADCP {adcp_command} fick err_inactive — väntar på att projektorn ska bli aktiv...")
        if _wait_until_active(timeout=45.0):
            _log(f"ADCP {adcp_command} retry efter warm-up")
            return adcp_set(adcp_command, value, mode=mode, _retry_inactive=False)
        _log(f"ADCP {adcp_command} timeout — projektorn blev aldrig aktiv")
    return last_line

def _wait_until_active(timeout: float = 30.0, poll_interval: float = 1.5) -> bool:
    """Polla `power_status ?` tills projektorn returnerar 'on' eller timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            reply = _adcp_session(["power_status ?"], timeout=SETTINGS["status_timeout"])
            v = _parse_value(reply[0]) if reply else None
            if v and v.lower() == "on":
                return True
            _log(f"  warm-up status: {v!r}")
        except (socket.error, AdcpError) as e:
            _log(f"  warm-up poll fail: {e}")
        time.sleep(poll_interval)
    return False


def adcp_get(adcp_command: str) -> str:
    """GET-kommando. Format: '<command> ?'."""
    cmd = f"{adcp_command} ?"
    out = _adcp_session([cmd])
    return out[0] if out else ""


def adcp_get_many(commands: list[Tuple[str, str]]) -> Dict[str, str]:
    """Skicka flera GET i samma session — mycket snabbare än en session per värde."""
    cmds = [f"{adcp} ?" for _, adcp in commands]
    try:
        replies = _adcp_session(cmds, timeout=SETTINGS["status_timeout"])
    except (socket.error, AdcpError) as e:
        _log(f"ADCP batch GET fail: {e}")
        return {}
    out: Dict[str, str] = {}
    for (key, _), reply in zip(commands, replies):
        out[key] = reply
    return out


def _parse_value(reply: str) -> Optional[str]:
    """ADCP-svar: '"value"' eller 'ok' eller 'err_xxx'."""
    if not reply:
        return None
    r = reply.strip()
    if r.lower().startswith("err"):
        return None
    if r.lower() == "ok":
        return "ok"
    return r.strip('"')


REMOTE_KEY_MAP = {
    "menu": 'key "menu"',
    "up": 'key "up"',
    "down": 'key "down"',
    "left": 'key "left"',
    "right": 'key "right"',
    "enter": 'key "enter"',
}


def adcp_key(key: str) -> str:
    cmd = REMOTE_KEY_MAP.get(str(key).lower().strip())
    if not cmd:
        _log(f"REMOTE {key!r} -> SKIPPED (saknas/okänd knapp på XW5000ES)")
        return "skipped"
    _log(f"ADCP TX: {cmd}")
    out = _adcp_session([cmd])
    line = out[0] if out else ""
    _log(f"ADCP RX: {line!r}")
    return line


# ---------------------------------------------------------------------------
# Status-byggare för GET /api/projector/status
# ---------------------------------------------------------------------------

def build_status() -> Dict[str, Any]:
    # Direkt efter power on: fråga bara power_status. Full batch kan time outa
    # under Sonys warm-up och blockera UI-status i onödan.
    if LAST_POWER_ON_TS and (time.time() - LAST_POWER_ON_TS) < 45.0:
        try:
            reply = _adcp_session(["power_status ?"], timeout=SETTINGS["status_timeout"])
            p = _parse_value(reply[0]) if reply else None
            if p and p.lower() == "on":
                return {"power": "on"}
            return {"power": "on", "warming_up": True, "power_status": p or "startup"}
        except (socket.error, AdcpError) as e:
            _log(f"ADCP warm-up status fail: {e}")
            return {"power": "on", "warming_up": True}

    raw = adcp_get_many(STATUS_QUERIES)
    out: Dict[str, Any] = {}

    # power kräver normalisering: ADCP returnerar "standby"/"startup"/"on"/"cooling"
    p = _parse_value(raw.get("power", ""))
    if p is not None:
        pl = p.lower()
        if pl in ("on", "startup"):
            out["power"] = "on"
        elif pl in ("off", "standby", "cooling"):
            out["power"] = "off"
        else:
            out["power"] = pl

    # generella string-värden (HW65ES-stödda items)
    for ui_key in ("picture_mode", "input", "color_temp", "blank", "lamp_control"):
        v = _parse_value(raw.get(ui_key, ""))
        if v is not None and v != "ok":
            out[ui_key] = v

    for key in ("brightness", "contrast", "color", "sharpness"):
        sv = _parse_value(raw.get(key, ""))
        if sv is not None and sv.lstrip("-").isdigit():
            out[key] = int(sv)

    mf = _parse_value(raw.get("motionflow", ""))
    if mf is not None and mf != "ok":
        out["motionflow"] = mf

    return out


# ---------------------------------------------------------------------------
# HTTP-server
# ---------------------------------------------------------------------------

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning",
}


# ---------------------------------------------------------------------------
# MARANTZ / DENON Telnet-klient (TCP port 23)
# ---------------------------------------------------------------------------
#
# Marantz Cinema- och SR-serien (samt Denon AVR) använder ett ASCII-baserat
# IP-kontrollprotokoll på TCP-port 23. Varje kommando avslutas med "\r" (CR).
# Receivern svarar typiskt inom ~150 ms med ett eller flera CR-terminerade
# ekon, t.ex. "PWON\r" eller "MV45\r".
#
# Lovable-appen skickar färdiga kommandosträngar (PWON, PWSTANDBY, MVUP,
# MVDOWN, MUON, MUOFF, SI<KOD>, MS<KOD>, MSSMART<n>, PSDIRAC <n>,
# SPPR <n>) i fältet `value`. Vi behöver alltså bara skicka strängen rakt
# av — ingen ytterligare mappning krävs.
#
# För Power OFF behövs PWSTANDBY (inte PWOFF — som inte finns på Marantz).

class MarantzError(Exception):
    pass


def marantz_send(command: str, expect_reply: bool = True) -> str:
    """Skicka ett rått Marantz/Denon-kommando och returnera receiverns svar.

    Returnerar en sträng (kan vara tom om expect_reply=False eller timeout
    efter att kommandot tagits emot — vilket är normalt för t.ex. PWON).
    """
    host = SETTINGS["marantz_host"]
    port = SETTINGS["marantz_port"]
    if not host:
        raise MarantzError("MARANTZ_HOST inte konfigurerad")

    cmd = command.strip()
    if not cmd:
        raise MarantzError("tomt kommando")

    payload = (cmd + "\r").encode("ascii", errors="ignore")
    timeout = SETTINGS["marantz_timeout"]

    sock = socket.create_connection((host, port), timeout=timeout)
    try:
        sock.sendall(payload)
        if not expect_reply:
            return ""
        # Läs allt som kommer in inom kort fönster.
        sock.settimeout(0.6)
        buf = b""
        deadline = time.time() + 0.8
        while time.time() < deadline:
            try:
                chunk = sock.recv(1024)
                if not chunk:
                    break
                buf += chunk
                # Marantz svarar oftast snabbt; om vi har minst en CR kan vi
                # vänta lite till för ev. flera fält och sedan returnera.
                if b"\r" in buf:
                    deadline = min(deadline, time.time() + 0.15)
            except socket.timeout:
                break
    finally:
        try:
            sock.close()
        except Exception:
            pass

    return buf.decode("ascii", errors="ignore").strip()


def marantz_status() -> Dict[str, Any]:
    """Fråga receivern om Power, Volume, Mute, Input."""
    out: Dict[str, Any] = {}
    if not SETTINGS["marantz_host"]:
        return {"power": "unknown", "stub": True}

    try:
        # PW? -> "PWON" / "PWSTANDBY"
        pw = marantz_send("PW?")
        if "PWON" in pw:
            out["power"] = "on"
        elif "PWSTANDBY" in pw:
            out["power"] = "off"
        else:
            out["power"] = "unknown"

        # MV? -> "MV45\rMVMAX 86" (volym i halvsteg, 45 = -35 dB ungefär)
        mv = marantz_send("MV?")
        for line in mv.splitlines():
            line = line.strip()
            if line.startswith("MV") and not line.startswith("MVMAX"):
                num = line[2:].strip()
                if num.isdigit():
                    # Marantz: "MV45" = 45, "MV455" = 45.5
                    if len(num) == 3:
                        out["volume"] = int(num) / 10.0
                    else:
                        out["volume"] = int(num)
                break

        # MU? -> "MUON" / "MUOFF"
        mu = marantz_send("MU?")
        if "MUON" in mu:
            out["mute"] = True
        elif "MUOFF" in mu:
            out["mute"] = False

        # SI? -> "SICBL/SAT" etc.
        si = marantz_send("SI?")
        for line in si.splitlines():
            line = line.strip()
            if line.startswith("SI") and len(line) > 2:
                out["input"] = line[2:].strip()
                break

        # MS? -> sound mode + ev. MSSMART<n> + MSQUICK<n>
        # Receivern svarar t.ex. "MSDOLBY DIGITAL\rMSSMART2\r"
        try:
            ms = marantz_send("MS?")
            for line in ms.splitlines():
                line = line.strip()
                if line.startswith("MSSMART") and len(line) > 7:
                    n = line[7:].strip()
                    if n.isdigit():
                        out["smart_select"] = int(n)
                elif line.startswith("MSQUICK") and len(line) > 7:
                    n = line[7:].strip()
                    if n.isdigit():
                        out["smart_select"] = int(n)
                elif line.startswith("MS") and len(line) > 2 and "sound_mode" not in out:
                    out["sound_mode"] = line[2:].strip()
        except (socket.error, MarantzError):
            pass

        # PSDIRAC ? -> "PSDIRAC 1" / "PSDIRAC OFF"
        try:
            ps = marantz_send("PSDIRAC ?")
            for line in ps.splitlines():
                line = line.strip().upper()
                if line.startswith("PSDIRAC"):
                    val = line[len("PSDIRAC"):].strip()
                    if val:
                        out["dirac"] = val  # "1" / "2" / "3" / "OFF"
                        break
        except (socket.error, MarantzError):
            pass

        # SPPR ? -> "SPPR 1" / "SPPR 2"
        try:
            sp = marantz_send("SPPR ?")
            for line in sp.splitlines():
                line = line.strip().upper()
                if line.startswith("SPPR"):
                    val = line[len("SPPR"):].strip()
                    if val.isdigit():
                        out["speaker_preset"] = int(val)
                        break
        except (socket.error, MarantzError):
            pass
    except (socket.error, MarantzError) as e:
        out.setdefault("power", "unknown")
        out["error"] = str(e)

    return out


# ---------------------------------------------------------------------------
# FORMULER Z11 (Android TV box via ADB)
# ---------------------------------------------------------------------------
# Vi använder lokala `adb`-binären för att tala med boxen över TCP/IP. Det är
# samma teknik som python-androidtv (Home Assistant) använder. Tre signaler
# läses i en enda `adb shell` per poll för att minimera nätverksoverhead:
#
#   1. dumpsys power            -> mWakefulness=Awake/Asleep/Dozing
#   2. dumpsys window           -> mCurrentFocus  (vilken app är i fokus)
#   3. dumpsys media_session    -> state=PlaybackState {state=N ...}
#   4. dumpsys audio            -> fallback om MediaSession alltid visar state=0
#
# PlaybackState-konstanter (frameworks/base/media/.../PlaybackState.java):
#   0=NONE  1=STOPPED  2=PAUSED  3=PLAYING  4=FAST_FORWARDING  5=REWINDING
#   6=BUFFERING  7=ERROR  8=CONNECTING  9=SKIPPING_TO_PREVIOUS
#   10=SKIPPING_TO_NEXT  11=SKIPPING_TO_QUEUE_ITEM
#
# State-machine som postar triggers till backend:
#   * box "off" -> "on"        => formuler_on
#   * box "on"  -> "off"       => formuler_off  (+ movie_stopped om film pågick)
#   * playback NONE/STOPPED -> PLAYING/BUFFERING/FF/REW => movie_playing
#   * PLAYING -> PAUSED  (efter debounce)                => movie_paused
#   * PLAYING/PAUSED -> NONE/STOPPED                     => movie_stopped
# ---------------------------------------------------------------------------

# (re, subprocess, urllib.request importeras högst upp i filen)

_PB_PLAYING = {3, 4, 5, 6, 9, 10, 11}   # spelar / spolar / buffrar / hoppar
_PB_PAUSED = {2, 8}                      # pausad / connecting (ofta paus i UI)
_PB_STOPPED = {0, 1, 7}                  # ingen / stoppad / fel

# Regex för att plocka första state= ur PlaybackState-raden:
#   state=PlaybackState {state=3, position=12345, ...}
_RE_PB_STATE = re.compile(r"PlaybackState\s*\{[^}]*?state=(\d+)")
_RE_WAKE = re.compile(r"mWakefulness=(\w+)")
_RE_FOCUS = re.compile(r"mCurrentFocus=.*?\s([a-zA-Z0-9_.]+)/")
_RE_FOCUS_COMPONENT = re.compile(r"(?:mCurrentFocus|mFocusedApp).*?\s([A-Za-z0-9_.$]+/[A-Za-z0-9_.$]+)")

# Appar som räknas som "film" — audio-aktivitet i dessa triggar movie_*-scener
# så lampor släcks/tänds automatiskt. Lägg till fler paket vid behov.
_FORMULER_PLAYER_PACKAGES = {
    # MyTVOnline3 (Formuler IPTV)
    "tv.formuler.mol3.real",
    "com.formuler.mytvonline3",
    # YouTube
    "com.google.android.youtube.tv",
    "com.google.android.youtube",
    "com.liskovsoft.smarttubetv.beta",
    "com.liskovsoft.smarttubetv",
    # Red Bull TV
    "com.nousguide.android.rbtv",
    # VLC
    "org.videolan.vlc",
    # Netflix / Prime / Disney+
    "com.netflix.ninja",
    "com.netflix.mediaclient",
    "com.amazon.amazonvideo.livingroom",
    "com.amazon.firetv.youtube",
    "com.disney.disneyplus",
    # Kodi
    "org.xbmc.kodi",
    # Plex / Jellyfin / Emby
    "com.plexapp.android",
    "org.jellyfin.androidtv",
    "tv.emby.embyatv",
    # HBO Max / SkyShowtime / Viaplay / SVT / TV4
    "com.hbo.hbonow",
    "com.wbd.stream",
    "com.skyshowtime.skyshowtime",
    "com.viaplay.android",
    "se.svtplay.mobil",
    "se.tv4.tv4playtab",
}



# ---------------------------------------------------------------------------
# FORMULER ad-hoc keyevent (för POST /api/formuler från Lovable-appen)
# ---------------------------------------------------------------------------
# Återanvänder samma adb-binär och target som FormulerMonitor. Vi delar inte
# instansen direkt (den lever i en egen tråd) utan kör en kort engångs-adb
# subprocess. `adb connect` är idempotent så det är säkert att kalla varje gång.

_FORMULER_KEY_LOCK = threading.Lock()

def formuler_keyevent(keycode: str, timeout: float = 4.0) -> Dict[str, Any]:
    """Skicka `adb shell input keyevent <KEYCODE>` till Formuler-boxen.

    keycode kan vara t.ex. "KEYCODE_DPAD_UP", "KEYCODE_HOME", "KEYCODE_BACK"
    eller numeriskt ("3" = HOME). Returnerar dict med ok/rc/stdout/stderr.
    """
    adb = SETTINGS["adb_bin"]
    host = SETTINGS["formuler_host"]
    port = SETTINGS["formuler_port"]
    target = f"{host}:{port}"
    if not host:
        return {"ok": False, "error": "formuler_host_missing"}

    key = (keycode or "").strip()
    if not key:
        return {"ok": False, "error": "missing_keycode"}

    def _run(args, t=timeout):
        try:
            p = subprocess.run([adb, *args], capture_output=True, text=True, timeout=t)
            return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
        except FileNotFoundError:
            return 127, "", f"adb binary not found ({adb})"
        except subprocess.TimeoutExpired:
            return 124, "", f"adb timeout after {t}s"
        except Exception as e:
            return 1, "", str(e)

    with _FORMULER_KEY_LOCK:
        # Säkerställ anslutning (idempotent)
        rc, out, err = _run(["connect", target], t=5.0)
        line = (out + " " + err).lower()
        if rc != 0 or not ("connected to" in line or "already" in line):
            return {"ok": False, "error": f"adb_connect_failed: {(out + err)[:160]}"}

        rc, out, err = _run(["-s", target, "shell", "input", "keyevent", key], t=timeout)
        if rc != 0:
            return {"ok": False, "rc": rc, "stdout": out, "stderr": err, "keycode": key}
        return {"ok": True, "rc": rc, "stdout": out, "stderr": err, "keycode": key}


def formuler_list_apps(timeout: float = 8.0) -> Dict[str, Any]:
    """Lista alla launchable appar på Formuler-boxen.

    Använder två strategier och slår ihop resultatet:
      1) `cmd package query-activities` med LEANBACK_LAUNCHER (TV-appar).
      2) `cmd package query-activities` med vanlig LAUNCHER (fallback för
         appar som saknar leanback-banner).
    Hämtar även människovänliga labels via `cmd package list packages -f`
    + `aapt`-fri parsing — om labels inte går att läsa returneras paketnamnet.
    """
    adb = SETTINGS["adb_bin"]
    host = SETTINGS["formuler_host"]
    port = SETTINGS["formuler_port"]
    target = f"{host}:{port}"
    if not host:
        return {"ok": False, "error": "formuler_host_missing"}

    def _run(args, t=timeout):
        try:
            p = subprocess.run([adb, *args], capture_output=True, text=True, timeout=t)
            return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
        except FileNotFoundError:
            return 127, "", f"adb binary not found ({adb})"
        except subprocess.TimeoutExpired:
            return 124, "", f"adb timeout after {t}s"
        except Exception as e:
            return 1, "", str(e)

    # Säkerställ ADB-anslutning
    _run(["connect", target], t=4.0)

    apps: Dict[str, Dict[str, str]] = {}

    def _add_app(pkg: str, act: str, source: str) -> None:
        pkg = (pkg or "").strip()
        act = (act or "").strip()
        if not pkg or not act:
            return
        component = f"{pkg}/{act}"
        if component not in apps:
            apps[component] = {
                "package": pkg,
                "activity": act,
                "component": component,
                "source": source,
            }

    def _parse_query(out: str, source: str) -> None:
        """Parsa output från `cmd package query-activities`.
        Format: rader som `packageName=...` och `name=...` (aktivitet)."""
        current_pkg = None
        current_act = None
        for line in out.splitlines():
            s = line.strip()
            comp = re.search(r"([A-Za-z0-9_.$]+(?:\.[A-Za-z0-9_.$]+)+)/(\.?[A-Za-z0-9_.$]+)", s)
            if comp:
                _add_app(comp.group(1), comp.group(2), source)
                continue
            if s.startswith("packageName=") or s.startswith("packageName:"):
                current_pkg = re.split(r"[:=]", s, maxsplit=1)[1].strip()
            elif (s.startswith("name=") or s.startswith("name:")) and current_pkg:
                current_act = re.split(r"[:=]", s, maxsplit=1)[1].strip()
                _add_app(current_pkg, current_act, source)
                current_pkg = None
                current_act = None

    # 1) LEANBACK_LAUNCHER (TV-appar — primärt på Formuler)
    rc, out, err = _run([
        "-s", target, "shell", "cmd", "package", "query-activities",
        "-a", "android.intent.action.MAIN",
        "-c", "android.intent.category.LEANBACK_LAUNCHER",
    ])
    if rc == 0:
        _parse_query(out, "leanback")

    # 2) Vanlig LAUNCHER (fallback)
    rc, out, err = _run([
        "-s", target, "shell", "cmd", "package", "query-activities",
        "-a", "android.intent.action.MAIN",
        "-c", "android.intent.category.LAUNCHER",
    ])
    if rc == 0:
        _parse_query(out, "launcher")

    # Sortera & returnera
    items = sorted(apps.values(), key=lambda x: x["package"])
    _log(f"FORMULER list_apps -> {len(items)} appar")
    return {"ok": True, "apps": items, "count": len(items)}


def formuler_launch_app(package: str, timeout: float = 6.0) -> Dict[str, Any]:
    """Starta en Android-app på Formuler-boxen.

    Strategi:
      1) `adb shell monkey -p <pkg> -c LAUNCHER 1` — fungerar för de flesta appar.
      2) Om monkey rapporterar "No activities found" eller liknande, fallback
         till `adb shell am start -n <pkg>/<aktivitet>` med en lista kända
         launcher-aktiviteter per paket.
      3) Sista fallback: `am start -a android.intent.action.MAIN -c LAUNCHER -p <pkg>`.

    Returnerar alltid full stdout/stderr i svaret så vi kan diagnostisera
    från Lovable-toast eller bridge-loggen.
    """
    adb = SETTINGS["adb_bin"]
    host = SETTINGS["formuler_host"]
    port = SETTINGS["formuler_port"]
    target = f"{host}:{port}"
    if not host:
        return {"ok": False, "error": "formuler_host_missing"}

    launch_target = (package or "").strip()
    if not launch_target:
        return {"ok": False, "error": "missing_package"}
    explicit_component = launch_target if "/" in launch_target else None
    pkg = launch_target.split("/", 1)[0].strip() if explicit_component else launch_target

    # Kända launcher-aktiviteter per paket — utöka vid behov.
    KNOWN_ACTIVITIES = {
        "com.formuler.mytvonline3": [
            "com.formuler.mytvonline3.MainActivity",
            "com.formuler.mytvonline3.activities.SplashActivity",
        ],
        "com.google.android.youtube.tv": [
            "com.google.android.apps.youtube.tv.activity.ShellActivity",
        ],
        "com.google.android.youtube.tvkids": [
            "com.google.android.apps.youtube.kids.tv.activity.MainActivity",
        ],
        "com.nousguide.android.rbtv": [
            "com.nousguide.android.rbtv.MainActivity",
            "com.nousguide.android.rbtv.applib.activities.MainActivity",
        ],
        "com.spotify.tv.android": [
            "com.spotify.tv.android.SpotifyTVActivity",
        ],
    }

    def _run(args, t=timeout):
        try:
            p = subprocess.run([adb, *args], capture_output=True, text=True, timeout=t)
            return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
        except FileNotFoundError:
            return 127, "", f"adb binary not found ({adb})"
        except subprocess.TimeoutExpired:
            return 124, "", f"adb timeout after {t}s"
        except Exception as e:
            return 1, "", str(e)

    def _is_failure(rc: int, out: str, err: str) -> Optional[str]:
        """Returnera felorsak (string) om utdatan tyder på misslyckande, annars None."""
        combined = (out + " " + err).lower()
        markers = (
            "no activities found",
            "monkey aborted",
            "does not have a main activity",
            "error type",
            "error: activity",
            "error: not found",
            "unable to resolve intent",
            "permission denial",
            "java.lang.",
        )
        for m in markers:
            if m in combined:
                return m
        if rc != 0:
            return f"rc={rc}"
        return None

    with _FORMULER_KEY_LOCK:
        rc, out, err = _run(["connect", target], t=5.0)
        line = (out + " " + err).lower()
        if rc != 0 or not ("connected to" in line or "already" in line):
            return {"ok": False, "error": f"adb_connect_failed: {(out + err)[:160]}"}

        attempts = []

        def _try_component(component: str, method: str) -> Optional[Dict[str, Any]]:
            rc, out, err = _run([
                "-s", target, "shell", "am", "start",
                "-n", component,
            ], t=timeout)
            fail = _is_failure(rc, out, err)
            attempts.append({
                "method": method, "component": component,
                "rc": rc, "stdout": out, "stderr": err, "fail": fail,
            })
            _log(f"FORMULER am start -n {component} rc={rc} out={out!r} err={err!r}")
            if fail is None:
                return {"ok": True, "method": method, "package": pkg,
                        "component": component, "attempts": attempts}
            return None

        if explicit_component:
            result = _try_component(explicit_component, "am_start_component")
            if result:
                return result

        # 1) monkey
        rc, out, err = _run([
            "-s", target, "shell", "monkey",
            "-p", pkg,
            "-c", "android.intent.category.LAUNCHER",
            "1",
        ], t=timeout)
        fail = _is_failure(rc, out, err)
        attempts.append({"method": "monkey", "rc": rc, "stdout": out, "stderr": err, "fail": fail})
        _log(f"FORMULER monkey {pkg} rc={rc} out={out!r} err={err!r}")
        if fail is None:
            return {"ok": True, "method": "monkey", "package": pkg, "attempts": attempts}

        # 2) am start -n med kända aktivitetsnamn
        for activity in KNOWN_ACTIVITIES.get(pkg, []):
            result = _try_component(f"{pkg}/{activity}", "am_start_known")
            if result:
                return result

        # 2b) Hämta faktisk launcher-aktivitet dynamiskt och starta komponenten.
        listed = formuler_list_apps(timeout=timeout)
        for app in listed.get("apps", []):
            if app.get("package") != pkg or not app.get("component"):
                continue
            result = _try_component(str(app["component"]), "am_start_discovered")
            if result:
                return result

        # 3) Generisk MAIN/LAUNCHER-intent mot paketet
        rc, out, err = _run([
            "-s", target, "shell", "am", "start",
            "-a", "android.intent.action.MAIN",
            "-c", "android.intent.category.LAUNCHER",
            "-p", pkg,
        ], t=timeout)
        fail = _is_failure(rc, out, err)
        attempts.append({"method": "am_start_intent", "rc": rc, "stdout": out, "stderr": err, "fail": fail})
        _log(f"FORMULER am start -p {pkg} rc={rc} out={out!r} err={err!r}")
        if fail is None:
            return {"ok": True, "method": "am_start_intent", "package": pkg, "attempts": attempts}

        return {
            "ok": False,
            "package": pkg,
            "error": f"all_methods_failed (last: {fail})",
            "attempts": attempts,
        }


# ---------------------------------------------------------------------------
# GLOBAL LOKAL EXEKVERING (headless-stöd, från bridge64.py)
# ---------------------------------------------------------------------------
def _execute_scene_payload(payload: Optional[Dict[str, Any]]) -> None:
    """Kör scendatan lokalt direkt när molnet svarar på en trigger.

    Detta gör att Formuler-/Chromecast-/Marantz-monitorerna kan styra
    projektor, Marantz och Tuya-lampor utan att behöva en öppen browser
    mot appen — appens UI/scenlogik synkar fortfarande via /api/public/trigger.
    """
    if not payload or not payload.get("matched"):
        return

    filters = payload.get("filters", {}) or {}
    scene = payload.get("scene", {}) or {}
    trigger_key = payload.get("trigger_key", "unknown")

    _log(f"*** AUTOMATION TRIGGERED: '{scene.get('name', 'Unknown')}' (via {trigger_key}) ***")

    # 1) Projektor — endast power körs lokalt på HW65ES (övriga ADCP-set
    #    är opålitliga i standby; resterande inställningar låts appen sköta
    #    via /api/projector när projektorn är på och varm).
    if filters.get("run_projector", True):
        proj_settings = dict(scene.get("projector_settings") or {})
        if "power" in proj_settings:
            val = proj_settings.pop("power")
            try:
                adcp_set("power", val, mode="select")
            except Exception as e:
                _log(f"Projector power fail: {e}")
            time.sleep(0.5)

    # 2) Marantz
    if filters.get("run_marantz", True):
        m_input = scene.get("marantz_input")
        if m_input:
            try:
                marantz_send(f"SI{m_input}")
            except Exception as e:
                _log(f"Marantz input fail: {e}")
        m_vol = scene.get("marantz_volume")
        if m_vol is not None:
            try:
                marantz_send(f"MV{m_vol}")
            except Exception as e:
                _log(f"Marantz vol fail: {e}")

    # 3) Lampor (Tuya)
    if filters.get("run_lights", True):
        scene_lights = payload.get("scene_lights", []) or []
        if scene_lights:
            try:
                tuya_apply_lights(scene_lights)
            except Exception as e:
                _log(f"Lights fail: {e}")


_formuler_monitor: Optional["FormulerMonitor"] = None


class FormulerMonitor(threading.Thread):
    """Bakgrundstråd som pollar Formuler Z11 via ADB och postar triggers."""

    def __init__(self) -> None:
        super().__init__(daemon=True, name="FormulerMonitor")
        self.host = SETTINGS["formuler_host"]
        self.port = SETTINGS["formuler_port"]
        self.target = f"{self.host}:{self.port}"
        self.poll_sec = SETTINGS["formuler_poll"]
        self.pause_debounce = SETTINGS["formuler_pause_debounce"]
        self.stale_stop_sec = SETTINGS["formuler_stale_stop_sec"]
        self.adb = SETTINGS["adb_bin"]
        self._stop = threading.Event()
        # State som hålls mellan pollar:
        self._box_on: Optional[bool] = None      # None = okänt vid start
        self._play_state: str = "stopped"        # "playing" | "paused" | "stopped"
        self._pending_pause_since: Optional[float] = None
        self._last_focus: Optional[str] = None
        self._connected = False
        # Diagnostik: senaste råa playback-int + heartbeat-tidpunkt
        self._last_pb_int: Optional[int] = None
        self._last_heartbeat: float = 0.0
        self._last_shell_fail_log: float = 0.0
        self._last_audio_active: Optional[bool] = None
        self._last_audio_change: float = 0.0

    # -- ADB ----------------------------------------------------------------

    def _run_adb(self, args: list[str], timeout: float = 4.0) -> Tuple[int, str, str]:
        try:
            p = subprocess.run(
                [self.adb, *args],
                capture_output=True, text=True, timeout=timeout,
            )
            return p.returncode, p.stdout or "", p.stderr or ""
        except FileNotFoundError:
            return 127, "", f"adb binary not found ({self.adb})"
        except subprocess.TimeoutExpired:
            return 124, "", f"adb timeout after {timeout}s"
        except Exception as e:
            return 1, "", str(e)

    def _ensure_connected(self) -> bool:
        # `adb connect` är idempotent — om redan connected svarar den med
        # "already connected to ...". Vi anropar bara när vi tror vi tappat.
        if self._connected:
            return True
        rc, out, err = self._run_adb(["connect", self.target], timeout=5.0)
        line = (out + err).strip().lower()
        ok = rc == 0 and ("connected to" in line or "already" in line)
        if ok:
            if not self._connected:
                _log(f"FORMULER connected {self.target}")
            self._connected = True
        else:
            self._connected = False
            _log(f"FORMULER connect FAIL: {line[:160]}")
        return ok

    def _shell(self, cmd: str, timeout: float = 4.0) -> Optional[str]:
        rc, out, err = self._run_adb(
            ["-s", self.target, "shell", cmd], timeout=timeout
        )
        if rc != 0:
            # vanligaste orsaken: tappad TCP-anslutning. Markera för reconnect.
            self._connected = False
            # Diagnostik: logga felet (rate-limited så vi inte spammar)
            now = time.time()
            if (now - self._last_shell_fail_log) > 10.0:
                snippet = (err or out or "").strip().replace("\n", " ")[:160]
                _log(f"FORMULER shell FAIL rc={rc} err={snippet!r}")
                self._last_shell_fail_log = now
            return None
        return out

    # -- State extraction --------------------------------------------------

    def _read_state(self) -> Optional[Dict[str, Any]]:
        # Slå ihop tre dumpsys i ETT shell-anrop för att minimera overhead.
        # `grep` på boxen är toybox/busybox men funkar för enkla mönster.
        cmd = (
            "echo --POWER--; dumpsys power | grep -E 'mWakefulness=|mWakefulnessChanging' ; "
            "echo --FOCUS--; dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' ; "
            "echo --MEDIA--; dumpsys media_session | grep -E 'PlaybackState |state=PlaybackState' ; "
            "echo --AUDIO--; dumpsys audio | grep -E 'AudioPlaybackConfiguration|isMusicActive'"
        )
        out = self._shell(cmd, timeout=4.0)
        if out is None:
            return None
        sections = {"POWER": "", "FOCUS": "", "MEDIA": "", "AUDIO": ""}
        current = None
        for line in out.splitlines():
            s = line.strip()
            if s == "--POWER--": current = "POWER"; continue
            if s == "--FOCUS--": current = "FOCUS"; continue
            if s == "--MEDIA--": current = "MEDIA"; continue
            if s == "--AUDIO--": current = "AUDIO"; continue
            if current:
                sections[current] += line + "\n"

        # Box on/off
        wake_m = _RE_WAKE.search(sections["POWER"])
        wake = wake_m.group(1) if wake_m else "Unknown"
        box_on = wake.lower() == "awake"

        # Aktiv app
        focus_m = _RE_FOCUS.search(sections["FOCUS"])
        focus = focus_m.group(1) if focus_m else None
        focus_component_m = _RE_FOCUS_COMPONENT.search(sections["FOCUS"])
        focus_component = focus_component_m.group(1) if focus_component_m else None

        # Playback — kan finnas flera media sessions, ta den senaste rapporterade.
        # I praktiken ger MOL3/VLC en aktiv session i taget.
        pb_states = [int(m) for m in _RE_PB_STATE.findall(sections["MEDIA"])]
        pb_int = pb_states[-1] if pb_states else 0

        if pb_int in _PB_PLAYING:
            play = "playing"
        elif pb_int in _PB_PAUSED:
            play = "paused"
        else:
            play = "stopped"

        audio_text = sections["AUDIO"]
        audio_lower = audio_text.lower()

        # Signal 1: klassisk isMusicActive-flagga
        music_active = (
            "ismusicactive()=true" in audio_lower
            or "ismusicactive=true" in audio_lower
            or "ismusicactive: true" in audio_lower
            or "ismusicactive: 1" in audio_lower
        )

        # Signal 2: AudioPlaybackConfiguration med state:started/playing.
        # Formuler/MOL3/VLC rapporterar uppspelning så här. Vi ignorerar
        # systemljud (SoundPool, USAGE_ASSISTANCE_*, USAGE_NOTIFICATION).
        # OBS: vi splittar både på radbrytning OCH på ' | ' eftersom
        # adb-output ibland kommer på en enda rad.
        playback_active = False
        candidate_lines: list[str] = []
        for raw_line in audio_text.splitlines():
            for piece in raw_line.split(" | "):
                piece = piece.strip()
                if piece:
                    candidate_lines.append(piece)
        for line in candidate_lines:
            low = line.lower()
            # Måste vara en AudioPlaybackConfiguration-rad
            if "audioplaybackconfiguration" not in low:
                continue
            # Måste vara aktivt tillstånd (started/playing)
            if not any(s in low for s in ("state:started", "state:playing", "state=started", "state=playing")):
                continue
            # Filtrera bort inaktiva states som råkar nämnas på samma rad
            if "state:idle" in low or "state:paused" in low or "state:stopped" in low:
                # Endast filtrera om started/playing INTE finns separat
                if not any(s in low for s in ("state:started", "state:playing")):
                    continue
            # Filtrera systemljud baserat på typ
            if "soundpool" in low:
                continue
            # Filtrera systemljud baserat på usage
            if any(u in low for u in (
                "usage_assistance", "usage_notification", "usage_alarm",
                "usage_voice_communication", "usage_unknown",
            )):
                continue
            # KRÄV att det är mediauppspelning (film/musik/spel)
            if not any(u in low for u in ("usage_media", "usage_game", "usage_movie")):
                continue
            playback_active = True
            break

        audio_active = music_active or playback_active
        audio_hint = "active" if audio_active else "inactive"

        # Fallback: vissa Formuler-firmware/appkombinationer rapporterar alltid
        # MediaSession state=0 även när video faktiskt spelas. Då använder vi
        # ljudaktivitet + aktiv spelapp som signal för playing/paused.
        if pb_int == 0 and focus in _FORMULER_PLAYER_PACKAGES:
            if audio_active:
                play = "playing"
            elif self._play_state == "playing":
                play = "paused"

        return {
            "box_on": box_on,
            "wake": wake,
            "focus": focus,
            "focus_component": focus_component,
            "pb_int": pb_int,
            "audio": audio_hint,
            "audio_raw": " | ".join(line.strip() for line in audio_text.splitlines() if line.strip())[:1500],
            "audio_full": audio_text,
            "play": play,
        }

    # -- Trigger posting ---------------------------------------------------

    def _post_trigger(self, trigger_key: str) -> None:
        url = SETTINGS["trigger_url"]
        hh = SETTINGS["household_code"]
        if not hh:
            _log(f"FORMULER trigger {trigger_key} (skipped — sätt HOUSEHOLD_CODE för att posta)")
            return
        body = json.dumps({"household_code": hh, "trigger_key": trigger_key}).encode("utf-8")
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={
                "Content-Type": "application/json",
                # Cloudflare blockerar default "Python-urllib/x.y" med 403.
                "User-Agent": "FormulerBridge/13 (+https://projector-pal-97.lovable.app)",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=4.0) as r:
                resp = r.read(8192).decode("utf-8", "replace")
                _log(f"FORMULER -> {trigger_key} HTTP {r.status} {resp[:140]}")
                try:
                    _execute_scene_payload(json.loads(resp))
                except Exception as e:
                    _log(f"FORMULER scene exec fail: {e}")
        except Exception as e:
            _log(f"FORMULER -> {trigger_key} POST FAIL: {e}")

    # -- Main loop ---------------------------------------------------------

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        _log(f"FORMULER monitor start  target={self.target}  poll={self.poll_sec}s")
        while not self._stop.is_set():
            try:
                if not self._ensure_connected():
                    time.sleep(min(5.0, self.poll_sec * 2))
                    continue
                state = self._read_state()
                if state is None:
                    time.sleep(self.poll_sec)
                    continue
                self._handle(state)
            except Exception as e:
                _log(f"FORMULER loop error: {e}")
            self._stop.wait(self.poll_sec)
        _log("FORMULER monitor stopped")

    def _handle(self, st: Dict[str, Any]) -> None:
        now = time.time()
        box_on = st["box_on"]
        play = st["play"]
        focus = st["focus"]
        pb_int = st.get("pb_int", 0)
        audio = st.get("audio", "-")
        audio_raw = st.get("audio_raw", "")
        audio_active = audio == "active"

        if audio_active != self._last_audio_active:
            _log(f"FORMULER audio {self._last_audio_active} -> {audio_active} raw={audio_raw or '-'}")
            self._last_audio_active = audio_active
            self._last_audio_change = now

        if (
            pb_int == 0
            and focus in _FORMULER_PLAYER_PACKAGES
            and play == "paused"
            and self._play_state in ("playing", "paused")
            and self._last_audio_change > 0
            and (now - self._last_audio_change) >= self.stale_stop_sec
        ):
            play = "stopped"

        # Diagnostik: logga rå PlaybackState så fort den ändras (även om vår
        # tolkning playing/paused/stopped är samma som innan).
        if pb_int != self._last_pb_int:
            _log(
                f"FORMULER playback raw pb_int={pb_int} -> play={play} "
                f"(prev_int={self._last_pb_int} prev_play={self._play_state})"
            )
            self._last_pb_int = pb_int

        # Heartbeat var 30:e sekund så det syns att monitorn lever och vad den ser.
        if (now - self._last_heartbeat) >= 30.0:
            _log(
                f"FORMULER heartbeat box={'on' if box_on else 'off'} "
                f"play={play} pb_int={pb_int} audio={audio} state={self._play_state} "
                f"focus={focus or '-'} audio_raw={audio_raw or '-'}"
            )
            self._last_heartbeat = now

        # --- Box på/av ----------------------------------------------------
        if self._box_on is None:
            # Första pollen efter start: bara registrera, inga triggers.
            self._box_on = box_on
            self._play_state = play if box_on else "stopped"
            self._last_focus = focus
            _log(f"FORMULER baseline: box={'on' if box_on else 'off'} play={play} focus={focus}")
            return

        if box_on != self._box_on:
            if box_on:
                self._post_trigger("formuler_on")
            else:
                # Om film pågick när boxen släcktes räknar vi det som stopp.
                if self._play_state in ("playing", "paused"):
                    self._post_trigger("movie_stopped")
                    self._play_state = "stopped"
                self._post_trigger("formuler_off")
            self._box_on = box_on

        # När boxen är av kollar vi inte playback.
        if not box_on:
            self._pending_pause_since = None
            return

        # --- Playback -----------------------------------------------------
        prev = self._play_state

        # GATE: movie_*-triggers skickas BARA när MOL3 (MyTVOnline) är i fokus.
        # När man tittar på YouTube/Red Bull/VLC etc. ska ljus/ljud skötas manuellt.
        is_movie_app = focus in _FORMULER_PLAYER_PACKAGES

        if not is_movie_app:
            # Om vi tidigare spelade film i MOL3 och användaren bytte app,
            # avsluta filmen så scenen återställs.
            if prev in ("playing", "paused"):
                _log(f"FORMULER focus left MOL3 ({focus}) — skickar movie_stopped")
                self._post_trigger("movie_stopped")
                self._play_state = "stopped"
            self._pending_pause_since = None
            if focus and focus != self._last_focus:
                _log(f"FORMULER focus: {self._last_focus} -> {focus} (ej film-app, ignorerar playback)")
                self._last_focus = focus
            return

        # Debounce paus så spol/seek inte triggar onödigt:
        if play == "paused" and prev == "playing":
            if self._pending_pause_since is None:
                self._pending_pause_since = now
                return  # vänta nästa poll
            if (now - self._pending_pause_since) < self.pause_debounce:
                return
            # debounce passerad — bekräfta paus
            self._post_trigger("movie_paused")
            self._play_state = "paused"
            self._pending_pause_since = None
            return

        # Annars nollställ pending pause om state ändrats tillbaka:
        if play != "paused":
            self._pending_pause_since = None

        if play == prev:
            return

        if play == "playing":
            self._post_trigger("movie_playing")
        elif play == "stopped":
            # Bara intressant om vi tidigare spelade/pausade
            if prev in ("playing", "paused"):
                self._post_trigger("movie_stopped")
        elif play == "paused":
            # Direkt paused (utan att ha varit playing) — sällsynt, posta ändå
            self._post_trigger("movie_paused")

        self._play_state = play

        if focus and focus != self._last_focus:
            _log(f"FORMULER focus: {self._last_focus} -> {focus}")
            self._last_focus = focus


# ---------------------------------------------------------------------------
# CHROMECAST MONITOR
# ---------------------------------------------------------------------------
# Lyssnar på Chromecast-enheten via pychromecast och postar samma triggers
# som FormulerMonitor:
#   - chromecast_on  / chromecast_off   (när en cast-app blir aktiv/idle)
#   - movie_playing / movie_paused / movie_stopped
#
# Pychromecast använder mDNS för upptäckt och en persistent TCP-anslutning
# till enheten. Vi kör allt i en bakgrundstråd och återansluter automatiskt
# om socketen tappas.
#
# Beroenden:
#   pip install pychromecast


_chromecast_monitor: Optional["ChromecastMonitor"] = None


class ChromecastMonitor(threading.Thread):
    """Bakgrundstråd som lyssnar på en Chromecast och postar triggers."""

    def __init__(self) -> None:
        super().__init__(daemon=True, name="ChromecastMonitor")
        self.name_filter = SETTINGS["chromecast_name"]
        self.discovery_timeout = SETTINGS["chromecast_discovery_timeout"]
        self.retry_sec = SETTINGS["chromecast_retry_sec"]
        self._stop = threading.Event()
        # State som hålls mellan events:
        self._app_active: Optional[bool] = None      # None = okänt vid start
        self._play_state: Optional[str] = None       # "playing" | "paused" | "stopped"
        # v33: spara aktivt cast-objekt + senaste status så HTTP-handlers
        # kan styra det och GET /api/chromecast/status kan svara snabbt.
        self._cast: Any = None
        self._last_cast_status: Any = None
        self._last_media_status: Any = None
        self._cast_lock = threading.Lock()

    def stop(self) -> None:
        self._stop.set()

    # -- Public control surface (anropas från HTTP-handlers) --------------

    def get_cast(self) -> Any:
        with self._cast_lock:
            return self._cast

    def snapshot(self) -> Dict[str, Any]:
        """Returnera en JSON-vänlig ögonblicksbild för GET /api/chromecast/status."""
        cast = self.get_cast()
        if cast is None:
            return {"connected": False}
        try:
            cs = self._last_cast_status
            ms = self._last_media_status
            mc = cast.media_controller
            mc_status = getattr(mc, "status", None)
            # mc.status uppdateras kontinuerligt av pychromecast — bind till det
            # OM vi inte fått ett färskare event.
            if mc_status is not None and ms is None:
                ms = mc_status

            display = (getattr(cs, "display_name", "") or "") if cs else ""
            app_id = getattr(cs, "app_id", None) if cs else None
            volume_level = getattr(cs, "volume_level", 0.0) if cs else 0.0
            volume_muted = bool(getattr(cs, "volume_muted", False)) if cs else False

            player_state = (getattr(ms, "player_state", "") or "") if ms else ""
            title = (getattr(ms, "title", "") or "") if ms else ""
            artist = (getattr(ms, "artist", "") or "") if ms else ""
            album = (getattr(ms, "album_name", "") or "") if ms else ""
            duration = getattr(ms, "duration", None) if ms else None
            position = getattr(ms, "current_time", None) if ms else None
            images = getattr(ms, "images", []) if ms else []
            image_url = ""
            if images:
                try:
                    image_url = getattr(images[0], "url", "") or ""
                except Exception:
                    image_url = ""

            return {
                "connected": True,
                "device_name": getattr(cast, "name", "") or "",
                "app_name": display,
                "app_id": app_id,
                "media_state": player_state,
                "title": title,
                "artist": artist,
                "album": album,
                "image_url": image_url,
                "volume": int(round(float(volume_level) * 100)),
                "muted": volume_muted,
                "position": float(position) if isinstance(position, (int, float)) else None,
                "duration": float(duration) if isinstance(duration, (int, float)) else None,
            }
        except Exception as e:
            return {"connected": True, "error": str(e)}

    def control(self, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Skicka ett kommando till casten. Returnerar {ok, error?}."""
        cast = self.get_cast()
        if cast is None:
            return {"ok": False, "error": "no_chromecast_connected"}
        try:
            mc = cast.media_controller
            a = (action or "").lower().strip()
            if a == "play":
                mc.play()
            elif a == "pause":
                mc.pause()
            elif a == "stop":
                mc.stop()
            elif a == "next":
                mc.queue_next()
            elif a == "previous":
                mc.queue_prev()
            elif a == "quit_app":
                cast.quit_app()
            elif a == "volume":
                level = float(payload.get("level", 0))
                level = max(0.0, min(100.0, level)) / 100.0
                cast.set_volume(level)
            elif a == "mute":
                cast.set_volume_muted(bool(payload.get("muted", False)))
            else:
                return {"ok": False, "error": f"unknown_action:{a}"}
            return {"ok": True, "action": a}
        except Exception as e:
            return {"ok": False, "error": str(e)}



    # -- Trigger posting (samma kontrakt som FormulerMonitor) --------------

    def _post_trigger(self, trigger_key: str) -> None:
        url = SETTINGS["trigger_url"]
        hh = SETTINGS["household_code"]
        if not hh:
            _log(f"CC trigger {trigger_key} (skipped — sätt HOUSEHOLD_CODE för att posta)")
            return
        body = json.dumps({"household_code": hh, "trigger_key": trigger_key}).encode("utf-8")
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={
                "Content-Type": "application/json",
                "User-Agent": "FormulerBridge/14 (+https://projector-pal-97.lovable.app)",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=4.0) as r:
                resp = r.read(8192).decode("utf-8", "replace")
                _log(f"CC -> {trigger_key} HTTP {r.status} {resp[:140]}")
                try:
                    _execute_scene_payload(json.loads(resp))
                except Exception as e:
                    _log(f"CC scene exec fail: {e}")
        except Exception as e:
            _log(f"CC -> {trigger_key} POST FAIL: {e}")

    # -- Event handlers ----------------------------------------------------

    def _on_cast_status(self, status: Any) -> None:
        """Anropas när cast-appen byts (Netflix, YouTube, backdrop = idle)."""
        try:
            self._last_cast_status = status
            app_id = getattr(status, "app_id", None)
            display = getattr(status, "display_name", "") or ""
            idle = (app_id is None) or (display.lower() == "backdrop")
            active = not idle

            if self._app_active is None:
                _log(f"CC baseline: app={'active' if active else 'idle'} ({display or 'none'})")
            elif active != self._app_active:
                _log(f"CC app changed -> {'active' if active else 'idle'} ({display or 'none'})")
                self._post_trigger("chromecast_on" if active else "chromecast_off")
            self._app_active = active

            # Om appen blev idle och vi tidigare spelade -> skicka movie_stopped
            if not active and self._play_state not in (None, "stopped"):
                self._post_trigger("movie_stopped")
                self._play_state = "stopped"
        except Exception as e:
            _log(f"CC cast status error: {e}")

    def _on_media_status(self, status: Any) -> None:
        """Anropas när media-state ändras (play/pause/stop/buffering)."""
        try:
            self._last_media_status = status
            ps = (getattr(status, "player_state", "") or "").upper()
            if ps == "PLAYING":
                play = "playing"
            elif ps == "PAUSED":
                play = "paused"
            elif ps == "IDLE":
                play = "stopped"
            else:
                # BUFFERING/UNKNOWN/"": behåll föregående state, fall tillbaka på stopped.
                play = self._play_state or "stopped"

            if play == self._play_state:
                return

            if self._play_state is None:
                _log(f"CC baseline play={play}")
            else:
                self._post_trigger(f"movie_{play}")
            self._play_state = play
        except Exception as e:
            _log(f"CC media status error: {e}")

    # -- Main loop ---------------------------------------------------------

    def run(self) -> None:
        try:
            import pychromecast  # type: ignore
        except ImportError:
            _log("CC: pychromecast saknas — kör 'pip install pychromecast' för Chromecast-stöd")
            return

        target = self.name_filter or "(första hittade)"
        _log(f"CC monitor start  target={target}  hh={SETTINGS['household_code'] or '(SAKNAS!)'}")

        while not self._stop.is_set():
            browser = None
            cast = None
            try:
                _log("CC letar efter Chromecast på nätverket...")
                chromecasts, browser = pychromecast.get_chromecasts(
                    timeout=self.discovery_timeout
                )
                if self.name_filter:
                    cast = next(
                        (c for c in chromecasts if c.name == self.name_filter), None
                    )
                    if not cast:
                        names = ", ".join(c.name for c in chromecasts) or "(inga)"
                        _log(
                            f"CC hittade ej '{self.name_filter}'. Sedda: {names}. "
                            f"Försöker igen om {int(self.retry_sec)}s."
                        )
                        try:
                            pychromecast.discovery.stop_discovery(browser)
                        except Exception:
                            pass
                        self._stop.wait(self.retry_sec)
                        continue
                else:
                    cast = chromecasts[0] if chromecasts else None
                    if not cast:
                        _log(f"CC ingen Chromecast hittad, försöker igen om {int(self.retry_sec)}s")
                        try:
                            pychromecast.discovery.stop_discovery(browser)
                        except Exception:
                            pass
                        self._stop.wait(self.retry_sec)
                        continue

                host = getattr(getattr(cast, "cast_info", None), "host", "?")
                _log(f"CC ansluter till '{cast.name}' ({host})")
                cast.wait()
                with self._cast_lock:
                    self._cast = cast

                # Registrera lyssnare via lättviktiga adapter-objekt så vi slipper
                # importera pychromecasts protokoll-klasser (vissa versioner
                # exporterar dem inte stabilt).
                outer = self

                class _CastAdapter:
                    def new_cast_status(self, status: Any) -> None:
                        outer._on_cast_status(status)

                class _MediaAdapter:
                    def new_media_status(self, status: Any) -> None:
                        outer._on_media_status(status)

                    def load_media_failed(self, queue_item_id: int, error_code: int) -> None:
                        _log(f"CC load_media_failed item={queue_item_id} err={error_code}")

                cast.register_status_listener(_CastAdapter())
                cast.media_controller.register_status_listener(_MediaAdapter())
                _log("CC ansluten, lyssnar på events")

                # Kör tills socketen dör eller vi blir ombedda att stoppa
                while not self._stop.is_set():
                    if self._stop.wait(5.0):
                        break
                    try:
                        alive = cast.socket_client.is_alive()
                    except Exception:
                        alive = False
                    if not alive:
                        _log("CC anslutning förlorad, återansluter...")
                        break
            except Exception as e:
                _log(f"CC fel: {e}, försöker igen om 15s")
                self._stop.wait(15)
            finally:
                if browser is not None:
                    try:
                        import pychromecast  # type: ignore
                        pychromecast.discovery.stop_discovery(browser)
                    except Exception:
                        pass
                # Reset baseline så vi inte missar att rapportera state efter reconnect
                self._app_active = None
                self._play_state = None
                with self._cast_lock:
                    self._cast = None
                self._last_cast_status = None
                self._last_media_status = None

        _log("CC monitor stopped")



class Handler(BaseHTTPRequestHandler):
    # tystare logg — vi printar själva
    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _send_json(self, code: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.rstrip("/")
        if path == "/api/projector/status":
            try:
                status = build_status()
                self._send_json(200, status)
            except (socket.error, AdcpError) as e:
                _log(f"status error: {e}")
                self._send_json(200, {"power": "unknown", "error": str(e)})
            return
        if path == "/api/marantz/status":
            try:
                self._send_json(200, marantz_status())
            except Exception as e:
                _log(f"marantz status error: {e}")
                self._send_json(200, {"power": "unknown", "error": str(e)})
            return
        if path == "/api/formuler/list_apps":
            try:
                self._send_json(200, formuler_list_apps())
            except Exception as e:
                _log(f"formuler list_apps error: {e}")
                self._send_json(200, {"ok": False, "error": str(e), "apps": []})
            return
        if path == "/debug/formuler-audio":
            try:
                mon = _formuler_monitor
                if mon is None:
                    self._send_json(200, {"error": "monitor not running"})
                    return
                out = mon._shell("dumpsys audio", timeout=6.0)
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write((out or "").encode("utf-8", "replace"))
            except Exception as e:
                self._send_json(200, {"error": str(e)})
            return
        # v33: Lights status — query-param ?devices=id1,id2 uppdaterar pollen
        if path == "/api/lights/status":
            try:
                # Tillåt query-param "devices=id1,id2" så UI:t kan instruera
                # bryggan vilka device_ids som ska pollas.
                qs = ""
                if "?" in self.path:
                    qs = self.path.split("?", 1)[1]
                if qs:
                    for kv in qs.split("&"):
                        if "=" not in kv:
                            continue
                        k, v = kv.split("=", 1)
                        if k.strip().lower() == "devices" and v.strip():
                            ids = [d for d in v.split(",") if d.strip()]
                            lights_status_set_devices(ids)
                            break
                cache = lights_status_get_all()
                self._send_json(200, {"ok": True, "lights": list(cache.values())})
            except Exception as e:
                _log(f"lights status error: {e}")
                self._send_json(200, {"ok": False, "error": str(e), "lights": []})
            return
        # v33: Chromecast status (cache:ad i ChromecastMonitor)
        if path == "/api/chromecast/status":
            try:
                mon = _chromecast_monitor
                if mon is None:
                    self._send_json(200, {"connected": False, "error": "monitor_not_running"})
                    return
                self._send_json(200, mon.snapshot())
            except Exception as e:
                _log(f"chromecast status error: {e}")
                self._send_json(200, {"connected": False, "error": str(e)})
            return
        self._send_json(404, {"error": "not_found", "path": self.path})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid_json"})
            return

        path = self.path.rstrip("/")
        if path == "/api/projector":
            self._handle_projector(body)
        elif path == "/api/lights":
            self._handle_lights(body)
        elif path == "/api/marantz":
            self._handle_marantz(body)
        elif path == "/api/formuler":
            self._handle_formuler(body)
        elif path.startswith("/api/chromecast/"):
            # v33: /api/chromecast/play | pause | stop | next | previous
            #      /api/chromecast/volume   body {level: 0-100}
            #      /api/chromecast/mute     body {muted: true/false}
            #      /api/chromecast/quit_app
            self._handle_chromecast(path[len("/api/chromecast/"):], body)
        else:
            self._send_json(404, {"error": "not_found", "path": self.path})

    def _handle_chromecast(self, action: str, body: Dict[str, Any]) -> None:
        """v33: styra Chromecast via pychromecast."""
        mon = _chromecast_monitor
        if mon is None:
            self._send_json(503, {"ok": False, "error": "monitor_not_running"})
            return
        result = mon.control(action, body or {})
        code = 200 if result.get("ok") else 502
        _log(f"CC control {action!r} -> {result}")
        self._send_json(code, result)

    def _handle_lights(self, body: Dict[str, Any]) -> None:
        """Tuya Cloud-proxy. Stödjer två format från appen:

        1) Scene-format (SceneGrid.runScene):
              {"action": "scene_lights", "value": {"lights": [ {device_id,...}, ... ]}}
        2) Single-light från LightsManager:
              {"action": "light", "value": {device_id, on, brightness?, kelvin?, color?, type?}}
           eller direkt en lights-array på top-level:
              {"lights": [...]}
        """
        action = str(body.get("action", "")).strip().lower()
        value = body.get("value")

        lights: list = []
        if isinstance(value, dict) and isinstance(value.get("lights"), list):
            lights = value["lights"]
        elif isinstance(body.get("lights"), list):
            lights = body["lights"]
        elif isinstance(value, dict) and value.get("device_id"):
            lights = [value]
        elif isinstance(value, list):
            lights = value

        if not lights:
            _log(f"LIGHTS: tomt payload (action={action!r}) — body={body}")
            self._send_json(400, {"status": "error", "error": "no_lights_in_payload"})
            return

        _log(f"LIGHTS action={action!r} count={len(lights)}")
        result = tuya_apply_lights(lights)
        code = 200 if result.get("ok") else 502
        self._send_json(code, {"status": "sent" if result.get("ok") else "error", **result})

    def _handle_marantz(self, body: Dict[str, Any]) -> None:
        """Skicka Marantz/Denon Telnet-kommando.

        Lovable-appen postar {"action": "marantz", "value": "<KOMMANDO>"} där
        KOMMANDO redan är formaterat (t.ex. "PWON", "PWSTANDBY", "MVUP",
        "MUOFF", "SICBL/SAT", "MSMOVIE", "MSSMART2", "PSDIRAC SLOT 1",
        "SPPR 1"). Vi normaliserar bara gamla Dirac-formatet och skickar sedan kommandot.
        """
        value = body.get("value")
        if not isinstance(value, str) or not value.strip():
            self._send_json(400, {"error": "missing_value"})
            return

        if not SETTINGS["marantz_host"]:
            _log(f"MARANTZ (stub — MARANTZ_HOST saknas): {value!r}")
            self._send_json(200, {"status": "sent", "stub": True, "command": value})
            return

        cmd = value.strip()
        # Korrekt Dirac Live-filterkommando enligt Denon/Marantz IP API:
        # PSDIRAC 1/2/3 eller PSDIRAC OFF. Äldre UI/script skickade
        # PSDIRAC SLOT 1/2/3 vilket accepteras dåligt/tyst på din receiver.
        upper = cmd.upper()
        if upper.startswith("PSDIRAC SLOT "):
            cmd = "PSDIRAC " + upper.rsplit(" ", 1)[-1]
        _log(f"MARANTZ -> {cmd!r}")
        try:
            reply = marantz_send(cmd)
        except (socket.error, MarantzError) as e:
            _log(f"MARANTZ fail: {e}")
            self._send_json(502, {"status": "error", "error": str(e), "command": cmd})
            return

        _log(f"MARANTZ <- {reply!r}")
        self._send_json(200, {"status": "sent", "command": cmd, "reply": reply})

    def _handle_formuler(self, body: Dict[str, Any]) -> None:
        """Skicka ADB keyevent eller starta app på Formuler Z11.

        Lovable-appen postar:
            {"action": "keyevent",    "value": "KEYCODE_DPAD_UP"}
            {"action": "remote_key",  "value": "KEYCODE_HOME"}
            {"action": "launch_app",  "value": "com.spotify.tv.android"}
        """
        action = str(body.get("action", "")).strip().lower()
        value = body.get("value")

        if action == "launch_app":
            if not isinstance(value, str) or not value.strip():
                self._send_json(400, {"error": "missing_value"})
                return
            pkg = value.strip()
            _log(f"FORMULER launch_app -> {pkg}")
            result = formuler_launch_app(pkg)
            if result.get("ok"):
                self._send_json(200, {"status": "sent", "package": pkg, **result})
            else:
                _log(f"FORMULER launch_app FAIL: {result}")
                self._send_json(502, {"status": "error", "package": pkg, **result})
            return

        if action not in ("keyevent", "remote_key", "key", ""):
            self._send_json(400, {"error": "unknown_action", "action": action})
            return
        if not isinstance(value, str) or not value.strip():
            self._send_json(400, {"error": "missing_value"})
            return

        key = value.strip()
        # Tillåt både "KEYCODE_HOME" och kort "HOME"
        if key.isalpha() and not key.upper().startswith("KEYCODE_"):
            key = "KEYCODE_" + key.upper()

        _log(f"FORMULER keyevent -> {key}")
        result = formuler_keyevent(key)
        if result.get("ok"):
            self._send_json(200, {"status": "sent", "command": key, **result})
        else:
            _log(f"FORMULER keyevent FAIL: {result}")
            self._send_json(502, {"status": "error", "command": key, **result})




    def _handle_projector(self, body: Dict[str, Any]) -> None:
        action = str(body.get("action", "")).strip()
        value = body.get("value")
        if not action:
            self._send_json(400, {"error": "missing_action"})
            return

        # "scene" är en logisk action från appen — bridgen behöver inte göra
        # något själv (appen följer upp med konkreta projector/marantz/lights-
        # kommandon). Returnera 200 så UI inte får felmeddelande.
        if action == "scene":
            _log(f"SCENE marker {value!r} (no-op)")
            self._send_json(200, {"status": "sent", "action": "scene", "value": value})
            return

        if action == "remote_key":
            reply = adcp_key(str(value))
            if reply == "skipped":
                self._send_json(200, {"status": "skipped", "action": action, "reason": "unsupported_key"})
                return
            ok = reply.lower() == "ok"
            self._send_json(200 if ok else 502, {"status": "sent" if ok else "error", "action": action, "reply": reply})
            return

        if action not in ACTION_MAP:
            _log(f"okänd action: {action}")
            self._send_json(400, {"error": "unknown_action", "action": action})
            return

        adcp_cmd, mapper, adcp_mode = ACTION_MAP[action]

        # Saknas på HW65ES (t.ex. laser_output, hdr_enhancer, gamma_correction,
        # reality_creation, dynamic_control) — returnera "skipped" istället
        # för att skicka och få err_cmd/err_option från projektorn.
        if adcp_cmd is None:
            reasons = {
                "laser_output":     "hw65es_is_lamp_based_use_lamp_control",
                "dynamic_control":  "light_output_dyn_not_on_hw65es",
                "hdr_enhancer":     "contrast_enh_not_on_hw65es",
                "gamma_correction": "gamma_correction_not_an_adcp_item_on_hw65es",
                "real_cre":         "reality_creation_not_on_hw65es",
                "reality_creation": "reality_creation_not_on_hw65es",
                "reality_creation_val": "reality_creation_not_on_hw65es",
            }
            reason = reasons.get(action, "not_supported_on_hw65es")
            _log(f"ACTION {action} = {value!r} -> SKIPPED ({reason})")
            self._send_json(200, {
                "status": "skipped",
                "action": action,
                "reason": reason,
            })
            return

        adcp_value = mapper(value) if mapper else str(value)

        preview = _format_adcp_set(adcp_cmd, adcp_value, adcp_mode)
        _log(f"ACTION {action} = {value!r} -> ADCP {preview}")
        try:
            reply = adcp_set(adcp_cmd, adcp_value, mode=adcp_mode)
        except (socket.error, AdcpError) as e:
            _log(f"ADCP fail: {e}")
            self._send_json(502, {"status": "error", "error": str(e)})
            return

        ok = reply.lower() == "ok"
        self._send_json(
            200 if ok else 502,
            {
                "status": "sent" if ok else "error",
                "action": action,
                "adcp_command": adcp_cmd,
                "adcp_value": adcp_value,
                "adcp_mode": adcp_mode,
                "reply": reply,
            },
        )


class ThreadingHTTPServer(HTTPServer):
    """Hantera flera samtidiga requests så långsamma ADCP-anrop inte blockerar UI."""
    def process_request(self, request: Any, client_address: Any) -> None:
        t = threading.Thread(target=self._inner, args=(request, client_address), daemon=True)
        t.start()

    def _inner(self, request: Any, client_address: Any) -> None:
        try:
            self.finish_request(request, client_address)
        finally:
            self.shutdown_request(request)



# ---------------------------------------------------------------------------
# MARANTZ MONITOR — pollar receivern och postar marantz_on / marantz_off
# ---------------------------------------------------------------------------
class MarantzMonitor(threading.Thread):
    """Pollar Marantz PW? med jämna mellanrum och postar triggers vid förändring."""

    def __init__(self) -> None:
        super().__init__(daemon=True, name="MarantzMonitor")
        self.poll_sec = SETTINGS["marantz_poll"]
        self._stop = threading.Event()
        self._power: Optional[str] = None  # "on" / "off"

    def stop(self) -> None:
        self._stop.set()

    def _post_trigger(self, trigger_key: str) -> None:
        url = SETTINGS["trigger_url"]
        hh = SETTINGS["household_code"]
        if not hh:
            _log(f"MARANTZ trigger {trigger_key} (skipped — sätt HOUSEHOLD_CODE för att posta)")
            return
        body = json.dumps({"household_code": hh, "trigger_key": trigger_key}).encode("utf-8")
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={
                "Content-Type": "application/json",
                "User-Agent": "FormulerBridge/15 (+https://projector-pal-97.lovable.app)",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=4.0) as r:
                resp = r.read(2048).decode("utf-8", "replace")
                _log(f"MARANTZ -> {trigger_key} HTTP {r.status} {resp[:140]}")
        except Exception as e:
            _log(f"MARANTZ -> {trigger_key} POST FAIL: {e}")

    def run(self) -> None:
        _log(f"MARANTZ monitor start  target={SETTINGS['marantz_host']}:{SETTINGS['marantz_port']}  poll={self.poll_sec}s")
        while not self._stop.is_set():
            try:
                pw = marantz_send("PW?")
                if "PWON" in pw:
                    cur = "on"
                elif "PWSTANDBY" in pw:
                    cur = "off"
                else:
                    cur = None  # okänt — hoppa över
                if cur is not None:
                    if self._power is None:
                        _log(f"MARANTZ baseline: power={cur}")
                        self._power = cur
                    elif cur != self._power:
                        _log(f"MARANTZ power changed -> {cur}")
                        self._post_trigger("marantz_on" if cur == "on" else "marantz_off")
                        self._power = cur
            except Exception as e:
                _log(f"MARANTZ poll error: {e}")
            self._stop.wait(self.poll_sec)
        _log("MARANTZ monitor stopped")


def main() -> None:
    addr = ("0.0.0.0", SETTINGS["bridge_port"])
    httpd = ThreadingHTTPServer(addr, Handler)
    _log(f"bridge ready  http://{addr[0]}:{addr[1]} (v21 + Formuler app list UI/debug)")
    _log(f"projector     {SETTINGS['host']}:{SETTINGS['port']} (ADCP)")
    if SETTINGS["marantz_host"]:
        _log(f"marantz       {SETTINGS['marantz_host']}:{SETTINGS['marantz_port']} (Telnet)")
    else:
        _log("marantz       (stub — sätt MARANTZ_HOST=<ip> för riktig kontroll)")
    if SETTINGS["tuya_api_key"]:
        _log(f"tuya cloud    region={SETTINGS['tuya_region']} (anchor {SETTINGS['tuya_anchor_device'][:8]}…)")
    else:
        _log("tuya cloud    (saknar TUYA_API_KEY)")
    if SETTINGS["formuler_host"]:
        _log(
            f"formuler      {SETTINGS['formuler_host']}:{SETTINGS['formuler_port']} (ADB) "
            f"-> {SETTINGS['trigger_url']} hh={SETTINGS['household_code'] or '(SAKNAS!)'}"
        )
        global _formuler_monitor
        _formuler_monitor = FormulerMonitor()
        _formuler_monitor.start()
    else:
        _log("formuler      (avstängd — sätt FORMULER_HOST=<ip>)")
    cc_target = SETTINGS["chromecast_name"] or "(första hittade)"
    _log(f"chromecast    {cc_target} -> {SETTINGS['trigger_url']}")
    global _chromecast_monitor
    _chromecast_monitor = ChromecastMonitor()
    _chromecast_monitor.start()
    # v33: Tuya status-poller (för GET /api/lights/status)
    if SETTINGS["lights_status_poll"] > 0 and SETTINGS["tuya_api_key"]:
        _log(f"tuya status   poll={SETTINGS['lights_status_poll']}s (devices: dynamiskt från UI)")
        TuyaStatusPoller().start()
    if SETTINGS["marantz_host"]:
        MarantzMonitor().start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        _log("bye")


if __name__ == "__main__":
    main()
