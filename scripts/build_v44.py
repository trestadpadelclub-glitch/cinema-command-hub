#!/usr/bin/env python3
"""Build Formuler_alfa_status_v44.py from v43 by patching in Broadlink IR support."""
from pathlib import Path

SRC = Path("public/downloads/Formuler_alfa_status_v43.py")
DST = Path("public/downloads/Formuler_alfa_status_v44.py")

text = SRC.read_text(encoding="utf-8")

# 1) Header — replace top docstring line so it reports v44
text = text.replace(
    'Formuler_alfa_status_v43.py  (Sony VPL-HW65ES, SDCP / PJ Talk)',
    'Formuler_alfa_status_v44.py  (Sony VPL-HW65ES, SDCP / PJ Talk + Broadlink IR)',
    1,
)
text = text.replace(
    'v43 NYTT — Endast MyTVOnline3',
    ('v44 NYTT — Broadlink IR-stöd för Panasonic Blu-ray (DP-UB154) och övriga\n'
     '  IR-styrda enheter:\n'
     '  - Nya endpoints:\n'
     '      GET  /api/ir/codes              -> {"ok":true,"keys":["bluray_play",...]}\n'
     '      GET  /api/ir/status             -> {"ok":true,"host":..,"reachable":bool}\n'
     '      POST /api/ir/discover           -> försök hitta Broadlink-enheten (mDNS/UDP)\n'
     '      POST /api/ir/learn   {key,timeout?}\n'
     '                                       -> sätter enheten i lärläge i timeout s,\n'
     '                                          fångar IR-tryck och sparar koden under key.\n'
     '      POST /api/ir/send    {key}       -> skickar sparad IR-kod\n'
     '      POST /api/ir/forget  {key}       -> tar bort sparad kod\n'
     '  - Kräver: pip install broadlink\n'
     '  - Nya env: BROADLINK_HOST (ex 192.168.86.23), BROADLINK_MAC (34:8e:89:2d:ba:9c),\n'
     '             BROADLINK_DEVTYPE (hex, default 0x649b = RM4 mini), BROADLINK_PORT (80).\n'
     '  - Koderna lagras som base64 i en JSON-fil bredvid scriptet (ir_codes.json) så\n'
     '    de överlever omstart. Filsökväg via IR_CODES_FILE (default: ir_codes.json).\n'
     '\n'
     'v43 NYTT — Endast MyTVOnline3'),
    1,
)

# 2) Insert Broadlink config into SETTINGS dict, just before the closing brace
needle_close = '    "lights_status_devices": [\n'
inj = (
    '    # --- Broadlink IR (RM/RM4 mini) för Panasonic Blu-ray m.m. ---\n'
    '    "broadlink_host": os.environ.get("BROADLINK_HOST", "192.168.86.23"),\n'
    '    "broadlink_mac": os.environ.get("BROADLINK_MAC", "34:8e:89:2d:ba:9c"),\n'
    '    "broadlink_port": int(os.environ.get("BROADLINK_PORT", "80")),\n'
    '    # 0x649b = RM4 mini. Andra vanliga: 0x5f36 (RM mini 3), 0x6539 (RM4 Pro).\n'
    '    "broadlink_devtype": int(os.environ.get("BROADLINK_DEVTYPE", "0x649b"), 16),\n'
    '    "broadlink_codes_file": os.environ.get("IR_CODES_FILE", "ir_codes.json"),\n'
    '    "broadlink_learn_timeout": float(os.environ.get("BROADLINK_LEARN_TIMEOUT", "20.0")),\n'
)
assert needle_close in text, "Could not locate lights_status_devices in SETTINGS"
text = text.replace(needle_close, inj + needle_close, 1)

# 3) Insert Broadlink helper module just before the Handler class definition.
#    We anchor on the `class Handler(` declaration.
anchor = 'class Handler(BaseHTTPRequestHandler):'
assert anchor in text, "Could not find Handler class"

BROADLINK_MODULE = '''
# ---------------------------------------------------------------------------
# BROADLINK IR (v44) — fjärrlärning + send för Panasonic Blu-ray m.fl.
# ---------------------------------------------------------------------------
# Använder `broadlink`-paketet (pip install broadlink). Inte alla användare
# har det installerat — vi importerar lazy och returnerar tydliga fel om det
# saknas, så att övriga endpoints fortfarande fungerar.

_broadlink_device = None
_broadlink_lock = threading.Lock()
_ir_codes_cache: Dict[str, str] = {}
_ir_codes_loaded = False


def _ir_codes_path() -> str:
    p = SETTINGS["broadlink_codes_file"]
    if not os.path.isabs(p):
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), p)
    return p


def _ir_codes_load() -> Dict[str, str]:
    global _ir_codes_cache, _ir_codes_loaded
    if _ir_codes_loaded:
        return _ir_codes_cache
    path = _ir_codes_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                _ir_codes_cache = {str(k): str(v) for k, v in data.items()}
    except Exception as e:
        _log(f"IR codes load fail ({path}): {e}")
        _ir_codes_cache = {}
    _ir_codes_loaded = True
    return _ir_codes_cache


def _ir_codes_save() -> None:
    path = _ir_codes_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(_ir_codes_cache, f, indent=2, sort_keys=True)
    except Exception as e:
        _log(f"IR codes save fail ({path}): {e}")


def _broadlink_get_device(force_new: bool = False):
    """Hämta (eller skapa) en autentiserad broadlink-enhet."""
    global _broadlink_device
    with _broadlink_lock:
        if _broadlink_device is not None and not force_new:
            return _broadlink_device
        try:
            import broadlink  # type: ignore
        except ImportError as e:
            raise RuntimeError("broadlink-modulen saknas — kör: pip install broadlink") from e

        host = SETTINGS["broadlink_host"]
        mac = SETTINGS["broadlink_mac"]
        port = SETTINGS["broadlink_port"]
        devtype = SETTINGS["broadlink_devtype"]
        if not host or not mac:
            raise RuntimeError("BROADLINK_HOST/BROADLINK_MAC är inte konfigurerade")

        # broadlink.gendevice tar (devtype, (host, port), mac_bytes)
        mac_bytes = bytes(int(b, 16) for b in mac.split(":"))
        dev = broadlink.gendevice(devtype, (host, port), mac_bytes)
        dev.auth()
        _broadlink_device = dev
        _log(f"BROADLINK auth ok  host={host}:{port} mac={mac} type=0x{devtype:04x}")
        return _broadlink_device


def _broadlink_discover() -> Dict[str, Any]:
    """Försök hitta Broadlink-enheter på LAN. Returnerar lista."""
    try:
        import broadlink  # type: ignore
    except ImportError:
        return {"ok": False, "error": "broadlink-modulen saknas — kör: pip install broadlink", "devices": []}
    try:
        found = broadlink.discover(timeout=5)
        out = []
        for d in found:
            out.append({
                "host": d.host[0] if isinstance(d.host, tuple) else str(d.host),
                "port": d.host[1] if isinstance(d.host, tuple) else None,
                "mac": ":".join(f"{b:02x}" for b in d.mac),
                "devtype": f"0x{d.devtype:04x}",
                "model": getattr(d, "model", None) or getattr(d, "manufacturer", None) or "Broadlink",
            })
        return {"ok": True, "devices": out}
    except Exception as e:
        return {"ok": False, "error": str(e), "devices": []}


def ir_learn(key: str, timeout: float) -> Dict[str, Any]:
    """Sätt enheten i lärläge i `timeout` sekunder. Returnerar packet eller fel."""
    key = (key or "").strip()
    if not key:
        return {"ok": False, "error": "key saknas"}
    try:
        dev = _broadlink_get_device()
        # Försök engagera lärläge
        if hasattr(dev, "enter_learning"):
            dev.enter_learning()
        else:
            return {"ok": False, "error": "enheten stöder inte IR-lärning"}
        deadline = time.time() + max(2.0, timeout)
        packet = None
        last_err: Optional[str] = None
        while time.time() < deadline:
            time.sleep(1.0)
            try:
                pkt = dev.check_data()
            except Exception as e:
                last_err = str(e)
                # Vanlig vid "ingen knapp tryckt ännu" — fortsätt polla.
                continue
            if pkt:
                packet = pkt
                break
        if not packet:
            return {"ok": False, "error": last_err or "ingen IR-signal mottagen inom timeout"}
        b64 = base64.b64encode(packet).decode("ascii")
        _ir_codes_load()
        _ir_codes_cache[key] = b64
        _ir_codes_save()
        _log(f"IR learn ok key={key!r} len={len(packet)}")
        return {"ok": True, "key": key, "bytes": len(packet)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def ir_send(key: str) -> Dict[str, Any]:
    key = (key or "").strip()
    if not key:
        return {"ok": False, "error": "key saknas"}
    codes = _ir_codes_load()
    b64 = codes.get(key)
    if not b64:
        return {"ok": False, "error": f"ingen sparad kod för {key!r}"}
    try:
        packet = base64.b64decode(b64)
        dev = _broadlink_get_device()
        dev.send_data(packet)
        _log(f"IR send ok key={key!r}")
        return {"ok": True, "key": key}
    except Exception as e:
        # Försök auth:a om en gång vid t.ex. socket-fel
        try:
            dev = _broadlink_get_device(force_new=True)
            dev.send_data(base64.b64decode(b64))
            _log(f"IR send ok (retry) key={key!r}")
            return {"ok": True, "key": key, "retried": True}
        except Exception as e2:
            return {"ok": False, "error": f"{e} / retry: {e2}"}


def ir_forget(key: str) -> Dict[str, Any]:
    key = (key or "").strip()
    codes = _ir_codes_load()
    if key not in codes:
        return {"ok": False, "error": f"ingen sparad kod för {key!r}"}
    del codes[key]
    _ir_codes_save()
    return {"ok": True, "key": key}


def ir_status() -> Dict[str, Any]:
    host = SETTINGS["broadlink_host"]
    mac = SETTINGS["broadlink_mac"]
    reachable = False
    err: Optional[str] = None
    try:
        _broadlink_get_device()
        reachable = True
    except Exception as e:
        err = str(e)
    codes = _ir_codes_load()
    return {
        "ok": True,
        "host": host,
        "mac": mac,
        "port": SETTINGS["broadlink_port"],
        "devtype": f"0x{SETTINGS['broadlink_devtype']:04x}",
        "reachable": reachable,
        "error": err,
        "codes_file": _ir_codes_path(),
        "keys": sorted(codes.keys()),
    }


'''

text = text.replace(anchor, BROADLINK_MODULE + anchor, 1)

# 4) Make sure `base64` is imported at top alongside json/os. Add after the
#    existing `import os` / `import json` block.
if "\nimport base64\n" not in text:
    text = text.replace("import json\n", "import json\nimport base64\n", 1)

# 5) Register /api/ir/* routes inside do_GET and do_POST. Inject before the
#    final "self._send_json(404, ..." line in each handler.
get_anchor = '        self._send_json(404, {"error": "not_found", "path": self.path})\n\n    def do_POST'
get_inject = '''        if path == "/api/ir/codes":
            try:
                codes = _ir_codes_load()
                self._send_json(200, {"ok": True, "keys": sorted(codes.keys())})
            except Exception as e:
                self._send_json(200, {"ok": False, "error": str(e), "keys": []})
            return
        if path == "/api/ir/status":
            try:
                self._send_json(200, ir_status())
            except Exception as e:
                self._send_json(200, {"ok": False, "error": str(e)})
            return
'''
assert get_anchor in text, "Could not find do_GET tail anchor"
text = text.replace(get_anchor, get_inject + get_anchor, 1)

# do_POST: insert before the final `else:` branch returning 404
post_anchor = '        elif path.startswith("/api/chromecast/"):'
post_inject = ('        elif path.startswith("/api/ir/"):\n'
               '            self._handle_ir(path[len("/api/ir/"):], body)\n'
               '            return\n')
text = text.replace(post_anchor, post_inject + post_anchor, 1)

# 6) Add _handle_ir method on Handler — insert just before _handle_chromecast
handler_anchor = '    def _handle_chromecast(self, action: str, body: Dict[str, Any]) -> None:'
handler_inject = '''    def _handle_ir(self, action: str, body: Dict[str, Any]) -> None:
        """v44: Broadlink IR — learn/send/forget/discover."""
        action = (action or "").strip().lower().rstrip("/")
        if action == "learn":
            key = str(body.get("key", "")).strip()
            timeout = float(body.get("timeout") or SETTINGS["broadlink_learn_timeout"])
            res = ir_learn(key, timeout)
            self._send_json(200 if res.get("ok") else 502, res)
            return
        if action == "send":
            key = str(body.get("key", "")).strip()
            res = ir_send(key)
            self._send_json(200 if res.get("ok") else 502, res)
            return
        if action == "forget":
            key = str(body.get("key", "")).strip()
            res = ir_forget(key)
            self._send_json(200 if res.get("ok") else 404, res)
            return
        if action == "discover":
            res = _broadlink_discover()
            self._send_json(200, res)
            return
        self._send_json(404, {"ok": False, "error": f"unknown IR action: {action!r}"})

'''
text = text.replace(handler_anchor, handler_inject + handler_anchor, 1)

# 7) main(): log the broadlink config line
main_anchor = '    cc_target = SETTINGS["chromecast_name"]'
main_inject = ('    if SETTINGS["broadlink_host"]:\n'
               '        _log(f"broadlink     {SETTINGS[\'broadlink_host\']}:{SETTINGS[\'broadlink_port\']} '
               'mac={SETTINGS[\'broadlink_mac\']} type=0x{SETTINGS[\'broadlink_devtype\']:04x}")\n'
               '    else:\n'
               '        _log("broadlink     (avstängd — sätt BROADLINK_HOST)")\n')
text = text.replace(main_anchor, main_inject + main_anchor, 1)

# 8) Update the ready-banner version string
text = text.replace(
    'bridge ready  http://{addr[0]}:{addr[1]} (v21 + Formuler app list UI/debug)',
    'bridge ready  http://{addr[0]}:{addr[1]} (v44 + Broadlink IR)',
    1,
)

DST.write_text(text, encoding="utf-8")
print(f"Wrote {DST} ({len(text)} chars)")
