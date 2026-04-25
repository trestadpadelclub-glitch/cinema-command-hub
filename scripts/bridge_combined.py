"""
Kombinerad bridge: Formuler + Chromecast -> /api/public/trigger

Pollar:
  - Formuler-boxen via dess HTTP-API (samma logik som v13)
  - Chromecasten via pychromecast (mDNS-discovery)

Skickar triggers till Lovable-appen:
  - formuler_on / formuler_off
  - chromecast_on / chromecast_off
  - movie_playing / movie_paused / movie_stopped   (gemensam för båda källorna,
    senast aktiv källa "äger" play-state)

Beroenden:
    pip install requests pychromecast

Körning (Windows cmd):
    set FORMULER_HOST=192.168.86.39
    set HOUSEHOLD_CODE=salong-7327
    set LOCAL_BRIDGE=http://127.0.0.1:5000
    set CHROMECAST_NAME=Vardagsrum            (valfritt, annars första hittade)
    set APP_URL=https://projector-pal-97.lovable.app
    python bridge_combined.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import threading
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

import requests

try:
    import pychromecast
    from pychromecast.controllers.media import MediaStatusListener
    from pychromecast.controllers.receiver import CastStatusListener
except ImportError:
    print("Saknar pychromecast. Installera med:  pip install pychromecast")
    sys.exit(1)


# ---------------- Config ----------------

DEFAULT_APP_URL = "https://projector-pal-97.lovable.app"

@dataclass
class Config:
    formuler_host: str
    household_code: str
    local_bridge: str
    app_url: str
    chromecast_name: Optional[str]
    poll_interval: float = 2.0


def load_config() -> Config:
    formuler = os.environ.get("FORMULER_HOST", "").strip()
    household = os.environ.get("HOUSEHOLD_CODE", "").strip()
    local = os.environ.get("LOCAL_BRIDGE", "http://127.0.0.1:5000").strip()
    app = os.environ.get("APP_URL", DEFAULT_APP_URL).strip().rstrip("/")
    cc_name = os.environ.get("CHROMECAST_NAME", "").strip() or None

    if not formuler:
        print("Missing FORMULER_HOST. Example: set FORMULER_HOST=192.168.86.39")
        sys.exit(1)
    if not household:
        print("Missing HOUSEHOLD_CODE. Example: set HOUSEHOLD_CODE=salong-7327")
        sys.exit(1)

    return Config(formuler, household, local, app, cc_name)


# ---------------- Logging ----------------

def log(prefix: str, msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {prefix} {msg}", flush=True)


# ---------------- HTTP helpers ----------------

def http_headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36",
        "Origin": "https://projector-pal-97.lovable.app",
        "Referer": "https://projector-pal-97.lovable.app/",
    }


def fire_trigger(cfg: Config, trigger_key: str) -> None:
    """POSTa en trigger till appen och kör returnerade kommandon mot lokal bridge."""
    url = f"{cfg.app_url}/api/public/trigger"
    payload = {"household_code": cfg.household_code, "trigger_key": trigger_key}
    try:
        r = requests.post(url, json=payload, headers=http_headers(), timeout=15)
    except Exception as e:
        log("TRIGGER", f"-> {trigger_key} FAIL: {e}")
        return

    body_preview = (r.text or "")[:200]
    log("TRIGGER", f"-> {trigger_key} HTTP {r.status_code} {body_preview}")
    if r.status_code != 200:
        return

    try:
        data = r.json()
    except Exception:
        return
    if not data.get("matched"):
        return

    commands = data.get("commands") or []
    for cmd in commands:
        endpoint = cmd.get("endpoint")
        body = cmd.get("body") or {}
        if not endpoint:
            continue
        full = f"{cfg.local_bridge.rstrip('/')}{endpoint}"
        try:
            cr = requests.post(full, json=body, timeout=20)
            log("CMD", f"{endpoint} {json.dumps(body, ensure_ascii=False)} -> {cr.status_code}")
        except Exception as e:
            log("CMD", f"{endpoint} FAIL: {e}")


# ---------------- Formuler poll ----------------

def formuler_url(host: str) -> str:
    return f"http://{host}/cgi-bin/luci/api/v2/playback/status"


def fetch_formuler_state(host: str) -> Optional[dict[str, Any]]:
    try:
        r = requests.get(formuler_url(host), timeout=4)
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def formuler_loop(cfg: Config) -> None:
    last_box: Optional[bool] = None        # on/off enligt om boxen svarar
    last_play: Optional[str] = None        # 'playing' | 'paused' | 'stopped'
    log("FORMULER", "loop startad")
    while True:
        state = fetch_formuler_state(cfg.formuler_host)
        is_on = state is not None
        if last_box is None:
            log("FORMULER", f"baseline: box={'on' if is_on else 'off'}")
        elif is_on != last_box:
            fire_trigger(cfg, "formuler_on" if is_on else "formuler_off")
        last_box = is_on

        if is_on and state:
            play_raw = str(state.get("play_state", "")).lower()
            if "play" in play_raw:
                play = "playing"
            elif "paus" in play_raw:
                play = "paused"
            else:
                play = "stopped"
            if play != last_play:
                if last_play is not None:
                    fire_trigger(cfg, f"movie_{play}")
                last_play = play
        else:
            if last_play not in (None, "stopped"):
                fire_trigger(cfg, "movie_stopped")
                last_play = "stopped"

        time.sleep(cfg.poll_interval)


# ---------------- Chromecast ----------------

class CCListener(CastStatusListener, MediaStatusListener):
    """Lyssnar på cast/media-status och översätter till triggers."""

    def __init__(self, cfg: Config, name: str) -> None:
        self.cfg = cfg
        self.name = name
        self.last_active: Optional[bool] = None     # app aktiv (ej idle)
        self.last_play: Optional[str] = None        # playing/paused/stopped

    # --- Cast (app) status ---
    def new_cast_status(self, status) -> None:
        # status.app_id == None eller backdrop -> idle
        app_id = getattr(status, "app_id", None)
        display = getattr(status, "display_name", "") or ""
        idle = (app_id is None) or (display.lower() == "backdrop")
        active = not idle

        if self.last_active is None:
            log("CC", f"baseline: app={'active' if active else 'idle'} ({display or 'none'})")
        elif active != self.last_active:
            log("CC", f"app changed -> {'active' if active else 'idle'} ({display or 'none'})")
            fire_trigger(self.cfg, "chromecast_on" if active else "chromecast_off")
        self.last_active = active

        if not active and self.last_play not in (None, "stopped"):
            fire_trigger(self.cfg, "movie_stopped")
            self.last_play = "stopped"

    # --- Media status ---
    def new_media_status(self, status) -> None:
        ps = (getattr(status, "player_state", "") or "").upper()
        if ps == "PLAYING":
            play = "playing"
        elif ps == "PAUSED":
            play = "paused"
        elif ps in ("IDLE", "BUFFERING", "UNKNOWN", ""):
            play = "stopped" if ps == "IDLE" else self.last_play or "stopped"
        else:
            play = "stopped"

        if play != self.last_play:
            if self.last_play is not None:
                fire_trigger(self.cfg, f"movie_{play}")
            else:
                log("CC", f"baseline play={play}")
            self.last_play = play

    def load_media_failed(self, queue_item_id: int, error_code: int) -> None:
        log("CC", f"load_media_failed item={queue_item_id} err={error_code}")


def chromecast_loop(cfg: Config) -> None:
    log("CC", "letar efter Chromecast på nätverket...")
    while True:
        try:
            chromecasts, browser = pychromecast.get_chromecasts(timeout=15)
            if cfg.chromecast_name:
                cast = next((c for c in chromecasts if c.name == cfg.chromecast_name), None)
                if not cast:
                    names = ", ".join(c.name for c in chromecasts) or "(inga)"
                    log("CC", f"hittade ej '{cfg.chromecast_name}'. Sedda: {names}. Försöker igen om 30s.")
                    pychromecast.discovery.stop_discovery(browser)
                    time.sleep(30)
                    continue
            else:
                cast = chromecasts[0] if chromecasts else None
                if not cast:
                    log("CC", "ingen Chromecast hittad, försöker igen om 30s")
                    pychromecast.discovery.stop_discovery(browser)
                    time.sleep(30)
                    continue

            log("CC", f"ansluter till '{cast.name}' ({cast.cast_info.host})")
            cast.wait()
            listener = CCListener(cfg, cast.name)
            cast.register_status_listener(listener)
            cast.media_controller.register_status_listener(listener)
            log("CC", "ansluten, lyssnar på events")

            # Kör tills tråden dör
            while True:
                time.sleep(5)
                if not cast.socket_client.is_alive():
                    log("CC", "anslutning förlorad, återansluter...")
                    break
        except Exception as e:
            log("CC", f"fel: {e}, försöker igen om 15s")
            time.sleep(15)


# ---------------- Main ----------------

def main() -> None:
    cfg = load_config()
    log("BRIDGE", "Kombinerad bridge startar")
    log("BRIDGE", f"App:        {cfg.app_url}")
    log("BRIDGE", f"Household:  {cfg.household_code}")
    log("BRIDGE", f"Formuler:   {cfg.formuler_host}")
    log("BRIDGE", f"Chromecast: {cfg.chromecast_name or '(första hittade)'}")
    log("BRIDGE", f"Local:      {cfg.local_bridge}")

    t1 = threading.Thread(target=formuler_loop, args=(cfg,), daemon=True)
    t2 = threading.Thread(target=chromecast_loop, args=(cfg,), daemon=True)
    t1.start()
    t2.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log("BRIDGE", "avslutar")


if __name__ == "__main__":
    main()
