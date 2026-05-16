import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  ArrowLeft,
  Menu as MenuIcon,
  Power,
  Loader2,
  Tv,
  Settings2,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  FastForward,
  Rewind,
  Lightbulb,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Search,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  sendFormulerCommand,
  launchFormulerApp,
  listFormulerApps,
  type FormulerInstalledApp,
  sendMarantz,
  sendScene,
  marantzMvToDb,
  getStatus,
  parseStatus,
  getLightsStatus,
  getBridgeUrl,
  type MarantzStatus,
  type SceneLightCommand,
} from "@/lib/projector";
import {
  fetchScenes,
  fetchLights,
  fetchSceneLights,
  updateScene,
  type Scene,
  type Light,
} from "@/lib/scenes";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import logoYoutube from "@/assets/logo-youtube.png";
import logoRedbull from "@/assets/logo-redbull.png";
import logoSpotify from "@/assets/logo-spotify.png";

interface Props {
  householdCode: string;
  marantzStatus: MarantzStatus | null;
  marantzReachable: boolean | null;
  onMarantzRefresh: () => Promise<void>;
}

const KEYCODES = {
  up: "KEYCODE_DPAD_UP",
  down: "KEYCODE_DPAD_DOWN",
  left: "KEYCODE_DPAD_LEFT",
  right: "KEYCODE_DPAD_RIGHT",
  ok: "KEYCODE_DPAD_CENTER",
  back: "KEYCODE_BACK",
  home: "KEYCODE_HOME",
  menu: "KEYCODE_MENU",
  power: "KEYCODE_POWER",
} as const;

type KeyName = keyof typeof KEYCODES;

// Standardpaket — kan justeras av användaren via popover om det skiljer sig
// på just deras Formuler. Används för `adb shell monkey -p <pkg>`.
const DEFAULT_APPS = {
  mytvonline3: "tv.formuler.mol3.real",
  youtube: "com.google.android.youtube.tv",
  redbull: "com.nousguide.android.rbtv",
  spotify: "com.spotify.tv.android",
} as const;

// Kandidatpaket att prova om standardvalet inte finns på boxen.
const APP_CANDIDATES: Record<AppKey, string[]> = {
  mytvonline3: [
    "tv.formuler.mol3.real",
    "com.formuler.mol3",
    "com.formuler.mytvonline3",
    "com.formuler.mytvonline2",
    "com.formuler.mytvonline",
    "com.mytvonline3",
  ],
  youtube: [
    "com.google.android.youtube.tv",
    "com.google.android.youtube",
  ],
  redbull: ["com.nousguide.android.rbtv"],
  spotify: ["com.spotify.tv.android", "com.spotify.music"],
};

type AppKey = keyof typeof DEFAULT_APPS;

// Vilka transport-knappar som är meningsfulla per app.
type Transport = "play_pause" | "stop" | "next" | "prev" | "ff" | "rew";

const APP_TRANSPORTS: Record<AppKey, Transport[]> = {
  spotify: ["prev", "rew", "play_pause", "stop", "ff", "next"],
  youtube: ["prev", "rew", "play_pause", "ff", "next"],
  mytvonline3: ["rew", "play_pause", "stop", "ff"],
  redbull: ["play_pause"],
};

const TRANSPORT_KEYCODES: Record<Transport, string> = {
  play_pause: "KEYCODE_MEDIA_PLAY_PAUSE",
  stop: "KEYCODE_MEDIA_STOP",
  next: "KEYCODE_MEDIA_NEXT",
  prev: "KEYCODE_MEDIA_PREVIOUS",
  ff: "KEYCODE_MEDIA_FAST_FORWARD",
  rew: "KEYCODE_MEDIA_REWIND",
};

// App-specifika genvägar — visas bara när motsvarande app är aktiv.
// För MyTVOnline3 mappas TV Guide / VOD / TV-serier till de färgade
// fjärrknapparna (RED/GREEN/YELLOW/BLUE) som appen lyssnar på.
// App-genvägar med fallback-keycodes. Vi provar dem i ordning tills en lyckas
// (svaret kommer ändå alltid med ok=true från `input keyevent`, så vi kan inte
// veta om appen reagerade — därför sänder vi den FÖRSTA som accepteras av
// bryggan och låter användaren välja en annan variant via long-press om den
// första inte gör något i appen).
type AppShortcut = {
  id: string;
  label: string;
  keycodes: string[]; // primär först, sedan fallbacks
  /** Om satt: efter att keycoden skickats, öppna tangentbord för textinmatning. */
  opensKeyboard?: boolean;
  /** Hur knappen emuleras på fjärrkontrollen.
   * - "single" (default): ett tryck
   * - "double": två snabba tryck (~150ms mellan) — motsvarar dubbelklick på GTV-BT1
   * - "long": långt tryck (~500ms) — emuleras genom upprepade keyevents
   * - "sequence": skickar `sequence` i ordning med en kort fördröjning
   */
  mode?: "single" | "double" | "long" | "sequence";
  /** Sekvens av keycodes som skickas i ordning (används när mode === "sequence"). */
  sequence?: string[];
  /** Fördröjning mellan steg i en sekvens (ms). Default 250ms. */
  sequenceDelayMs?: number;
};
const APP_SHORTCUTS: Record<AppKey, AppShortcut[]> = {
  mytvonline3: [
    {
      id: "guide",
      label: "TV Guide",
      // MyTVOnline3: Menu → Center (OK)
      keycodes: ["KEYCODE_MENU"],
      mode: "sequence",
      sequence: ["KEYCODE_MENU", "KEYCODE_DPAD_CENTER"],
    },
    { id: "back", label: "Backa", keycodes: ["KEYCODE_BACK"] },
    {
      id: "vod",
      label: "VOD",
      // MyTVOnline3: Menu → Down → Center
      keycodes: ["KEYCODE_MENU"],
      mode: "sequence",
      sequence: ["KEYCODE_MENU", "KEYCODE_DPAD_DOWN", "KEYCODE_DPAD_CENTER"],
    },
    {
      id: "series",
      label: "TV Serier",
      // MyTVOnline3: Menu → Down → Down → Center
      keycodes: ["KEYCODE_MENU"],
      mode: "sequence",
      sequence: ["KEYCODE_MENU", "KEYCODE_DPAD_DOWN", "KEYCODE_DPAD_DOWN", "KEYCODE_DPAD_CENTER"],
    },
    {
      id: "search",
      label: "Sök",
      keycodes: ["KEYCODE_PROG_GREEN"],
      opensKeyboard: true,
    },
    {
      id: "menu",
      label: "Menu",
      keycodes: ["KEYCODE_MENU"],
    },
  ],
  youtube: [],
  redbull: [],
  spotify: [],
};

const APPS: { key: AppKey; label: string; logo?: string; icon?: React.ReactNode }[] = [
  { key: "mytvonline3", label: "MyTVOnline3", icon: <Tv className="h-7 w-7" /> },
  { key: "youtube", label: "YouTube", logo: logoYoutube },
  { key: "redbull", label: "Red Bull TV", logo: logoRedbull },
  { key: "spotify", label: "Spotify", logo: logoSpotify },
];

const PKG_STORAGE_KEY = "formuler_app_packages";
const MARANTZ_INPUT_KEY = "formuler_marantz_input";
const ACTIVE_APP_KEY = "formuler_active_app";
// Återanvänd samma scen-val som LightsRemote använder
const LS_ON_KEY = (h: string) => `lights_remote_on_scene_${h}`;
const LS_OFF_KEY = (h: string) => `lights_remote_off_scene_${h}`;
const LEGACY_MOL3_PACKAGES = new Set(["com.formuler.mol3", "com.formuler.mytvonline3"]);

function loadPackages(): Record<AppKey, string> {
  if (typeof window === "undefined") return { ...DEFAULT_APPS };
  try {
    const raw = localStorage.getItem(PKG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPS };
    const parsed = JSON.parse(raw);
    if (LEGACY_MOL3_PACKAGES.has(parsed?.mytvonline3)) {
      parsed.mytvonline3 = DEFAULT_APPS.mytvonline3;
    }
    return { ...DEFAULT_APPS, ...parsed };
  } catch {
    return { ...DEFAULT_APPS };
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function FormulerRemote({ householdCode, marantzStatus, marantzReachable, onMarantzRefresh }: Props) {
  const [busy, setBusy] = useState<KeyName | null>(null);
  const [appBusy, setAppBusy] = useState<AppKey | null>(null);
  const [transportBusy, setTransportBusy] = useState<Transport | null>(null);
  const [packages, setPackages] = useState<Record<AppKey, string>>(() => loadPackages());
  const [installedApps, setInstalledApps] = useState<FormulerInstalledApp[] | null>(null);
  const [scanningApps, setScanningApps] = useState(false);
  const [appFilter, setAppFilter] = useState("");
  const [assignTarget, setAssignTarget] = useState<AppKey | null>(null);
  const [marantzInput, setMarantzInput] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(MARANTZ_INPUT_KEY) ?? "";
  });
  const [activeApp, setActiveApp] = useState<AppKey | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(ACTIVE_APP_KEY) as AppKey | null;
    return v && v in DEFAULT_APPS ? v : null;
  });

  // Lights — koppla mot scen-systemet (samma val som LightsRemote)
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [lights, setLights] = useState<Light[]>([]);
  const [onSceneId, setOnSceneId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(LS_ON_KEY(householdCode)) ?? "";
  });
  const [offSceneId, setOffSceneId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(LS_OFF_KEY(householdCode)) ?? "";
  });
  const [lightsBrightness, setLightsBrightness] = useState<number>(50);
  const [lightsBusy, setLightsBusy] = useState<"on" | "off" | null>(null);
  const [movieAutoBusy, setMovieAutoBusy] = useState(false);
  // Kiosk/lås-läge för telefonen — fixerar layouten på en skärm utan scroll.
  const [locked, setLocked] = useState(false);
  const lightDeviceIds = useMemo(
    () => lights.filter((l) => l.enabled).map((l) => l.tuya_device_id).filter(Boolean),
    [lights],
  );

  // Movie-auto är PÅ om båda scen 4 och 5 är enabled
  const movieScenes = useMemo(
    () => scenes.filter((s) => s.scene_number === 4 || s.scene_number === 5),
    [scenes],
  );
  const movieAutoOn =
    movieScenes.length === 2 && movieScenes.every((s) => s.enabled);

  const toggleMovieAuto = async (next: boolean) => {
    if (movieScenes.length !== 2) {
      toast.error("Hittar inte scen 4 och 5");
      return;
    }
    setMovieAutoBusy(true);
    try {
      await Promise.all(movieScenes.map((s) => updateScene(s.id, { enabled: next })));
      setScenes((prev) =>
        prev.map((s) =>
          s.scene_number === 4 || s.scene_number === 5 ? { ...s, enabled: next } : s,
        ),
      );
      toast.success(
        next ? "Auto-scener för film aktiverade" : "Auto-scener för film avstängda",
      );
    } catch (e) {
      toast.error("Kunde inte uppdatera scener", { description: String(e) });
    } finally {
      setMovieAutoBusy(false);
    }
  };

  // Marantz volym-slider — lokal "draft" som synkas mot status när
  // användaren inte aktivt drar.
  const [volDraft, setVolDraft] = useState<number>(40);
  // Index för vilken keycode-variant som senast skickades per shortcut-id.
  // Vi cyklar genom listan vid varje klick så användaren kan hitta rätt variant.
  const [shortcutVariant, setShortcutVariant] = useState<Record<string, number>>({});
  // Tangentbord för app-sökning
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sendingText, setSendingText] = useState(false);
  const draggingVol = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem(PKG_STORAGE_KEY, JSON.stringify(packages));
  }, [packages]);

  useEffect(() => {
    if (onSceneId) localStorage.setItem(LS_ON_KEY(householdCode), onSceneId);
  }, [onSceneId, householdCode]);
  useEffect(() => {
    if (offSceneId) localStorage.setItem(LS_OFF_KEY(householdCode), offSceneId);
  }, [offSceneId, householdCode]);

  // Ladda scener + lampor en gång
  useEffect(() => {
    let alive = true;
    Promise.all([fetchScenes(householdCode), fetchLights(householdCode)])
      .then(([s, l]) => {
        if (!alive) return;
        setScenes(s);
        setLights(l);
      })
      .catch(() => { /* tyst */ });
    return () => { alive = false; };
  }, [householdCode]);

  useEffect(() => {
    localStorage.setItem(MARANTZ_INPUT_KEY, marantzInput);
  }, [marantzInput]);

  useEffect(() => {
    if (activeApp) localStorage.setItem(ACTIVE_APP_KEY, activeApp);
  }, [activeApp]);

  // Status-LEDs i låst läge: projektor / marantz / formuler / lights
  const [projOn, setProjOn] = useState<boolean | null>(null);
  const [formulerOn, setFormulerOn] = useState<boolean | null>(null);
  const [lightsOn, setLightsOn] = useState<boolean | null>(null);
  const [picMode, setPicMode] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      // Projektor
      try {
        const r = await getStatus();
        if (!alive) return;
        if (r.ok) {
          const p = parseStatus(r.data);
          setProjOn(p.power === "on");
          setPicMode(p.pic_mode ?? null);
        } else {
          setProjOn(false);
        }
      } catch { if (alive) setProjOn(false); }
      // Formuler — list_apps kan ge ok:true/count:0 även vid tappad ADB.
      // Använd därför debug-dumpsys som faktisk shell-probe och fallbacka till applistan.
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const base = getBridgeUrl().replace(/\/api\/projector$/i, "").replace(/\/+$/, "");
        const res = await fetch(`${base}/debug/formuler-audio`, {
          headers: { accept: "application/json", "ngrok-skip-browser-warning": "true" },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const text = await res.text().catch(() => "");
        if (!alive) return;
        const hasDumpsys = res.ok && text.trim().length > 20 && !text.trim().startsWith("{");
        if (hasDumpsys) {
          setFormulerOn(true);
        } else {
          const fallback = await listFormulerApps();
          if (!alive) return;
          setFormulerOn(fallback.ok && fallback.apps.length > 0);
        }
      } catch { if (alive) setFormulerOn(false); }
      // Lights — fråga bara de aktiva lamporna för detta hushåll och lita på
      // switch_led/on-flaggan; brightness kan ligga kvar från senaste ON-läge.
      try {
        if (lightDeviceIds.length === 0) {
          setLightsOn(false);
          return;
        }
        const r = await getLightsStatus(lightDeviceIds);
        if (!alive) return;
        if (r.ok) {
          const now = Date.now();
          setLightsOn(
            r.lights.some((l) => {
              if (!lightDeviceIds.includes(l.device_id)) return false;
              if (l.online === false || l.on !== true) return false;
              if (typeof l.last_seen === "number") return now - l.last_seen * 1000 <= 120000;
              if (typeof l.last_seen === "string") {
                const ts = Number(l.last_seen) || Date.parse(l.last_seen);
                return Number.isFinite(ts) ? now - (ts < 10_000_000_000 ? ts * 1000 : ts) <= 120000 : true;
              }
              return true;
            }),
          );
        } else {
          setLightsOn(false);
        }
      } catch { if (alive) setLightsOn(false); }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [locked, lightDeviceIds]);

  const marantzOn = marantzReachable !== false && marantzStatus?.power === "on";

  // Synka volym-slider med pollad status, men bara när användaren inte drar.
  useEffect(() => {
    if (draggingVol.current) return;
    if (typeof marantzStatus?.volume === "number") {
      setVolDraft(marantzStatus.volume);
    }
  }, [marantzStatus?.volume]);

  const press = async (key: KeyName, label: string) => {
    setBusy(key);
    const res = await sendFormulerCommand(KEYCODES[key]);
    setBusy(null);
    if (!res.ok) {
      toast.error(`Formuler ${label} misslyckades`, {
        description: res.error || `Status ${res.status}`,
      });
    }
  };

  // Skicka en text till Formuler-boxen genom att skicka varje tecken som
  // ADB-keycode. Avslutas med ENTER för att utlösa sökning i appen.
  const charToKeycode = (ch: string): string | null => {
    if (ch === " ") return "KEYCODE_SPACE";
    if (ch >= "0" && ch <= "9") return `KEYCODE_${ch}`;
    const lower = ch.toLowerCase();
    if (lower >= "a" && lower <= "z") return `KEYCODE_${lower.toUpperCase()}`;
    return null;
  };
  const submitSearchText = async () => {
    const text = searchText.trim();
    if (!text) return;
    setSendingText(true);
    try {
      for (const ch of text) {
        const kc = charToKeycode(ch);
        if (!kc) continue;
        const r = await sendFormulerCommand(kc);
        if (!r.ok) {
          toast.error("Kunde inte skicka tecken", {
            description: `${ch}: ${r.error || `Status ${r.status}`}`,
          });
          setSendingText(false);
          return;
        }
        // Liten paus så appen hinner registrera varje tangent
        await new Promise((res) => setTimeout(res, 60));
      }
      const enter = await sendFormulerCommand("KEYCODE_ENTER");
      if (!enter.ok) {
        toast.error("Enter misslyckades", {
          description: enter.error || `Status ${enter.status}`,
        });
        return;
      }
      toast.success(`Sökte: "${text}"`);
      setKeyboardOpen(false);
    } finally {
      setSendingText(false);
    }
  };

  const launchApp = async (key: AppKey, label: string) => {
    const configured = packages[key];
    // Bygg lista: konfigurerat paket först, sedan alla kandidater (utan dubbletter)
    const candidates = Array.from(
      new Set([configured, ...(APP_CANDIDATES[key] ?? [])].filter(Boolean) as string[])
    );
    if (candidates.length === 0) {
      toast.error(`Inget paketnamn för ${label}`);
      return;
    }
    setAppBusy(key);
    setActiveApp(key);
    try {
      // 1) Byt Marantz-input till den ingång där Formuler är ansluten
      if (marantzInput.trim()) {
        const m = await sendMarantz(`SI${marantzInput.trim().toUpperCase()}`);
        if (!m.ok) {
          toast.error("Marantz input-byte misslyckades", {
            description: m.error || `Status ${m.status}`,
          });
        }
      }
      // 2) Starta vald app — prova kandidater i tur och ordning
      const tried: string[] = [];
      let lastErr = "";
      for (const pkg of candidates) {
        tried.push(pkg);
        const res = await launchFormulerApp(pkg);
        if (res.ok) {
          // Spara paketet som lyckades så nästa gång går direkt
          if (configured !== pkg) {
            const next = { ...packages, [key]: pkg };
            setPackages(next);
            try {
              localStorage.setItem(PKG_STORAGE_KEY, JSON.stringify(next));
            } catch {}
          }
          toast.success(`${label} startad`, { description: pkg });
          return;
        }
        lastErr = res.error || `Status ${res.status}`;
      }
      toast.error(`Kunde inte starta ${label}`, {
        description: `Provade: ${tried.join(", ")} — ${lastErr}`,
      });
    } finally {
      setAppBusy(null);
    }
  };

  const sendTransport = async (t: Transport) => {
    setTransportBusy(t);
    const res = await sendFormulerCommand(TRANSPORT_KEYCODES[t]);
    setTransportBusy(null);
    if (!res.ok) {
      toast.error(`Mediekommando misslyckades`, {
        description: res.error || `Status ${res.status}`,
      });
    }
  };

  const lightsById = useMemo(() => {
    const m = new Map<string, Light>();
    for (const l of lights) m.set(l.id, l);
    return m;
  }, [lights]);

  // Debounce-ref för ljus-slidern
  const lightsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Skicka brightness till alla lampor i ON-scenen, debouncat under dragning. */
  const scanInstalledApps = async () => {
    setScanningApps(true);
    try {
      const res = await listFormulerApps();
      if (!res.ok) {
        toast.error("Kunde inte hämta applistan", {
          description: res.error || "Bryggan måste vara v20+",
        });
        return;
      }
      setInstalledApps(res.apps);
      setAssignTarget(null);
      setAppFilter("");
      toast.success(`Hittade ${res.apps.length} appar — listan ligger längst ner i Konfig`);
    } finally {
      setScanningApps(false);
    }
  };

  const pushLightsBrightness = (pct: number) => {
    if (lightsDebounceRef.current) clearTimeout(lightsDebounceRef.current);
    lightsDebounceRef.current = setTimeout(async () => {
      const scene = scenes.find((s) => s.id === onSceneId);
      if (!scene) return;
      try {
        const sceneLights = await fetchSceneLights(scene.id);
        const payload: SceneLightCommand[] = [];
        for (const sl of sceneLights) {
          if (!sl.in_scene || !sl.on_state) continue;
          const light = lightsById.get(sl.light_id);
          if (!light) continue;
          payload.push({
            device_id: light.tuya_device_id,
            name: light.name,
            type: light.light_type,
            on: true,
            brightness: pct,
            ...((light.light_type === "cct" || light.light_type === "rgbcct") && sl.kelvin !== null
              ? { kelvin: sl.kelvin }
              : {}),
            ...((light.light_type === "rgb" || light.light_type === "rgbcct") && sl.color_hex
              ? { color: sl.color_hex }
              : {}),
            delay_ms: 0,
            fade_ms: sl.fade_ms ?? 0,
          });
        }
        if (payload.length === 0) return;
        await sendScene({
          scenePayload: scene.scene_payload ?? String(scene.scene_number),
          sceneLights: payload,
        });
      } catch {
        /* tyst under dragning */
      }
    }, 200);
  };

  const handleLights = async (state: "on" | "off") => {
    const sceneId = state === "on" ? onSceneId : offSceneId;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) {
      toast.error(`Välj en ${state.toUpperCase()}-scen i Konfig först`);
      return;
    }
    setLightsBusy(state);
    try {
      const sceneLights = await fetchSceneLights(scene.id);
      const payload: SceneLightCommand[] = [];
      for (const sl of sceneLights) {
        if (!sl.in_scene) continue;
        const light = lightsById.get(sl.light_id);
        if (!light) continue;
        const baseBrightness = sl.brightness ?? 0;
        const treatAsOff = sl.on_state && baseBrightness === 0;
        const cmd: SceneLightCommand = {
          device_id: light.tuya_device_id,
          name: light.name,
          type: light.light_type,
          on: treatAsOff ? false : sl.on_state,
          delay_ms: sl.delay_ms ?? 0,
          fade_ms: sl.fade_ms ?? 0,
        };
        if (!treatAsOff && sl.on_state) {
          // För ON: använd scenens brightness (kan justeras via separat slider senare)
          cmd.brightness = baseBrightness || 100;
          if ((light.light_type === "cct" || light.light_type === "rgbcct") && sl.kelvin !== null)
            cmd.kelvin = sl.kelvin;
          if ((light.light_type === "rgb" || light.light_type === "rgbcct") && sl.color_hex)
            cmd.color = sl.color_hex;
        }
        payload.push(cmd);
      }
      if (payload.length === 0) {
        toast.error(`Scenen "${scene.name}" har inga lampor`);
        return;
      }
      const results = await sendScene({
        scenePayload: scene.scene_payload ?? String(scene.scene_number),
        sceneLights: payload,
      });
      const failed = results.find((r) => !r.ok);
      if (failed) {
        toast.error(`Ljus ${state.toUpperCase()} misslyckades`, {
          description: failed.error || `Status ${failed.status}`,
        });
      } else {
        toast.success(`Ljus ${state.toUpperCase()}: ${scene.name}`);
      }
    } catch (e) {
      toast.error(`Ljus ${state.toUpperCase()} fel`, { description: String(e) });
    } finally {
      setLightsBusy(null);
    }
  };

  // Volym: skicka MV<nn> debouncat under draggning
  const pushVolume = (mv: number) => {
    const v = clamp(mv, 0, 98);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const padded = String(v).padStart(2, "0");
      sendMarantz(`MV${padded}`).then((r) => {
        if (!r.ok)
          toast.error("Marantz volym misslyckades", {
            description: r.error || `Status ${r.status}`,
          });
      });
    }, 120);
  };

  const handleVolChange = (vals: number[]) => {
    const v = vals[0] ?? volDraft;
    draggingVol.current = true;
    setVolDraft(v);
    pushVolume(v);
  };
  const handleVolCommit = (vals: number[]) => {
    const v = vals[0] ?? volDraft;
    draggingVol.current = false;
    setVolDraft(v);
    pushVolume(v);
    // Hämta tillbaka status snabbt så vi konvergerar
    setTimeout(() => {
      onMarantzRefresh();
    }, 400);
  };

  const handleMute = async () => {
    const next = !marantzStatus?.mute;
    const r = await sendMarantz(`MU${next ? "ON" : "OFF"}`);
    if (!r.ok) {
      toast.error("Mute misslyckades", { description: r.error || `Status ${r.status}` });
    } else {
      setTimeout(() => onMarantzRefresh(), 200);
    }
  };

  const transports = useMemo(
    () => (activeApp ? APP_TRANSPORTS[activeApp] : []),
    [activeApp],
  );

  const dpadBtn = (
    key: KeyName,
    label: string,
    icon: React.ReactNode,
    extra = "",
  ) => (
    <Button
      variant="secondary"
      className={`${locked ? "h-16 w-16" : "h-14 w-14"} rounded-full p-0 ${extra}`}
      onClick={() => press(key, label)}
      disabled={busy === key}
      aria-label={label}
    >
      {busy === key ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
    </Button>
  );

  const transportBtn = (t: Transport, label: string, icon: React.ReactNode) => (
    <Button
      key={t}
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => sendTransport(t)}
      disabled={transportBusy === t}
      aria-label={label}
      title={label}
    >
      {transportBusy === t ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        icon
      )}
    </Button>
  );

  const transportIcon: Record<Transport, React.ReactNode> = {
    play_pause: <Play className="h-4 w-4" />,
    stop: <Square className="h-4 w-4" />,
    next: <SkipForward className="h-4 w-4" />,
    prev: <SkipBack className="h-4 w-4" />,
    ff: <FastForward className="h-4 w-4" />,
    rew: <Rewind className="h-4 w-4" />,
  };
  const transportLabel: Record<Transport, string> = {
    play_pause: "Play/Paus",
    stop: "Stopp",
    next: "Nästa",
    prev: "Föregående",
    ff: "Spola fram",
    rew: "Spola bak",
  };

  const volDb = marantzMvToDb(volDraft);

  return (
    <div
      className={
        locked
          ? "fixed inset-0 z-40 bg-background overflow-hidden flex flex-col"
          : ""
      }
    >
      {locked && (
        <div className="shrink-0 w-full bg-primary/15 border-b border-primary/40">
          <div className="flex items-center justify-center gap-2 pt-1.5">
            {[
              { on: projOn, title: "Projektor" },
              { on: marantzOn, title: "Marantz" },
              { on: formulerOn, title: "Formuler" },
              { on: lightsOn, title: "Lights" },
            ].map((s, i) => (
              <span
                key={i}
                title={`${s.title}: ${s.on === null ? "okänt" : s.on ? "ON" : "OFF"}`}
                className={
                  "h-3 w-3 rounded-full border " +
                  (s.on === null
                    ? "bg-muted-foreground/30 border-muted-foreground/40"
                    : s.on
                      ? "bg-emerald-500 border-emerald-300 shadow-[0_0_6px_rgb(16_185_129/0.8)]"
                      : "bg-red-500 border-red-300 shadow-[0_0_6px_rgb(239_68_68/0.8)]")
                }
              />
            ))}
          </div>
          <button
            type="button"
            onDoubleClick={() => setLocked(false)}
            onClick={(e) => e.preventDefault()}
            className="w-full text-center text-[11px] font-semibold py-1 text-primary select-none touch-manipulation"
            title="Dubbelklicka för att låsa upp"
          >
            🔒 LÅST — dubbelklicka här för att låsa upp
          </button>
        </div>
      )}
      <div
        className={
          locked
            ? "flex-1 min-h-0 overflow-hidden p-1.5 flex flex-col gap-1.5 [&_.p-4]:p-2"
            : "space-y-4"
        }
      >

        {!locked && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setLocked(true)}
              title="Lås layout på skärmen (dubbelklicka rutan upptill för att låsa upp)"
            >
              🔒 Lås på skärmen
            </Button>
          </div>
        )}
      {/* Snabbval — appar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Snabbval
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2">
                <Settings2 className="h-3.5 w-3.5 mr-1" />
                <span className="text-xs">Konfig</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 space-y-3 max-h-[80vh] overflow-y-auto">
              <div>
                <Label className="text-xs">Marantz-input för Formuler</Label>
                <Input
                  value={marantzInput}
                  onChange={(e) => setMarantzInput(e.target.value.toUpperCase())}
                  placeholder="t.ex. MPLAY, GAME, CBL/SAT"
                  className="h-9 mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Lämna tomt om Marantz inte ska bytas. Skickas som <code>SI&lt;kod&gt;</code>.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Ljus-scener</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12 text-muted-foreground">ON</span>
                  <Select value={onSceneId} onValueChange={setOnSceneId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj ON-scen" /></SelectTrigger>
                    <SelectContent>
                      {scenes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12 text-muted-foreground">OFF</span>
                  <Select value={offSceneId} onValueChange={setOffSceneId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj OFF-scen" /></SelectTrigger>
                    <SelectContent>
                      {scenes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Android-startkommando per app</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={scanInstalledApps}
                    disabled={scanningApps}
                  >
                    {scanningApps ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3 mr-1" />
                    )}
                    Hitta appar
                  </Button>
                </div>
                {APPS.map((a) => {
                  const candidates = APP_CANDIDATES[a.key] ?? [];
                  return (
                    <div key={a.key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-24 text-muted-foreground">{a.label}</span>
                        <Input
                          value={packages[a.key]}
                          onChange={(e) =>
                            setPackages((p) => ({ ...p, [a.key]: e.target.value.trim() }))
                          }
                          className="h-8 text-xs font-mono"
                        />
                        {installedApps && installedApps.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5 text-[10px]"
                            onClick={() => {
                              setAssignTarget(a.key);
                              setAppFilter("");
                            }}
                            title="Välj från installerade appar"
                          >
                            …
                          </Button>
                        )}
                      </div>
                      {candidates.length > 1 && (
                        <div className="flex flex-wrap gap-1 pl-26 ml-24">
                          {candidates.map((c) => (
                            <Button
                              key={c}
                              variant={packages[a.key] === c ? "default" : "outline"}
                              size="sm"
                              className="h-6 px-1.5 text-[10px] font-mono"
                              onClick={() => setPackages((p) => ({ ...p, [a.key]: c }))}
                            >
                              {c.split(".").pop()}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {installedApps && (
                  <div className="border border-primary/50 rounded p-2 space-y-1.5 bg-primary/5 shadow-[0_0_0_1px_var(--primary)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium">
                          Applista: {installedApps.length} appar
                        {assignTarget && ` — tilldela till: ${APPS.find((a) => a.key === assignTarget)?.label}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1 text-[10px]"
                        onClick={() => {
                          setInstalledApps(null);
                          setAssignTarget(null);
                        }}
                      >
                        Dölj
                      </Button>
                    </div>
                    {!assignTarget && (
                      <p className="text-[10px] text-muted-foreground">
                        Listan visas här under sökfältet. Klicka på "…" bredvid MyTVOnline3 först om du vill välja startkommando.
                      </p>
                    )}
                    <Input
                      value={appFilter}
                      onChange={(e) => setAppFilter(e.target.value)}
                      placeholder="Filtrera (mytv, formuler, spotify...)"
                      className="h-7 text-[11px]"
                    />
                    <div className="max-h-64 overflow-y-auto space-y-0.5">
                      {(() => {
                        const filteredApps = installedApps.filter((app) =>
                          appFilter.trim() === "" ||
                           app.package.toLowerCase().includes(appFilter.toLowerCase()) ||
                           app.activity?.toLowerCase().includes(appFilter.toLowerCase()) ||
                           app.component?.toLowerCase().includes(appFilter.toLowerCase())
                        );
                        if (filteredApps.length === 0) {
                          return (
                            <p className="text-[10px] text-muted-foreground px-1.5 py-2">
                              Inga appar matchar filtret.
                            </p>
                          );
                        }
                        return filteredApps.slice(0, 100).map((app) => {
                          const launchValue = app.component ?? `${app.package}/${app.activity ?? ""}`;
                          return (
                            <button
                              key={launchValue}
                              className="w-full text-left text-[10px] font-mono px-1.5 py-1 rounded hover:bg-accent disabled:opacity-50"
                              disabled={!assignTarget}
                              onClick={() => {
                                if (!assignTarget) return;
                                setPackages((p) => ({ ...p, [assignTarget]: launchValue }));
                                setAssignTarget(null);
                                toast.success(`${assignTarget} → ${launchValue}`);
                              }}
                            >
                              {app.package}
                              {app.activity && (
                                <span className="block text-muted-foreground truncate">
                                  {app.activity}
                                </span>
                              )}
                              <span className="text-muted-foreground">({app.source})</span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Tryck "Hitta appar" för att lista alla installerade Android-appar på boxen. Listan visas direkt under — klicka på "…" bredvid en app-rad för att tilldela.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {APPS.map((a) => (
            <Button
              key={a.key}
              variant={activeApp === a.key ? "default" : "secondary"}
              className="h-20 flex-col gap-1.5 p-1"
              onClick={() => launchApp(a.key, a.label)}
              disabled={appBusy === a.key}
              aria-label={a.label}
            >
              {appBusy === a.key ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : a.logo ? (
                <img
                  src={a.logo}
                  alt={a.label}
                  width={36}
                  height={36}
                  loading="lazy"
                  className="h-9 w-9 object-contain"
                />
              ) : (
                a.icon
              )}
              <span className="text-[11px] leading-none">{a.label}</span>
            </Button>
          ))}
        </div>
        {!marantzInput.trim() && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Tips: Sätt Marantz-input via <span className="font-medium">Konfig</span> så
            växlar AVR:n automatiskt när du startar en app.
          </p>
        )}
      </Card>

      {/* Huvudpanel: lights · navigation/transport · marantz volume */}
      <Card className={locked ? "p-2 flex-1 min-h-0 flex flex-col" : "p-4"}>
        <div className={`grid grid-cols-[auto_1fr_auto] gap-4 items-stretch ${locked ? "h-full min-h-0" : ""}`}>
          {/* VÄNSTER: ljus */}
          <div className={`flex flex-col items-center gap-2 ${locked ? "min-w-[72px]" : "min-w-[64px]"}`}>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Ljus
            </Label>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="secondary"
                size="icon"
                className={locked ? "h-12 w-12" : "h-9 w-9"}
                onClick={() => handleLights("on")}
                disabled={lightsBusy !== null}
                title="Ljus på"
                aria-label="Ljus på"
              >
                {lightsBusy === "on" ? (
                  <Loader2 className={locked ? "h-6 w-6 animate-spin" : "h-4 w-4 animate-spin"} />
                ) : (
                  <Lightbulb className={locked ? "h-6 w-6 text-amber-400" : "h-4 w-4 text-amber-400"} />
                )}
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className={locked ? "h-12 w-12" : "h-9 w-9"}
                onClick={() => handleLights("off")}
                disabled={lightsBusy !== null}
                title="Ljus av"
                aria-label="Ljus av"
              >
                {lightsBusy === "off" ? (
                  <Loader2 className={locked ? "h-6 w-6 animate-spin" : "h-4 w-4 animate-spin"} />
                ) : (
                  <Power className={locked ? "h-6 w-6" : "h-4 w-4"} />
                )}
              </Button>
            </div>
            <div className={`flex flex-col items-center gap-1.5 pt-1 w-full ${locked ? "flex-1 min-h-0" : "flex-1 min-h-[180px]"}`}>
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                {lightsBrightness}%
              </span>
              <Slider
                orientation="vertical"
                min={10}
                max={90}
                step={5}
                value={[lightsBrightness]}
                onValueChange={(v) => {
                  const next = v[0] ?? 50;
                  setLightsBrightness(next);
                  pushLightsBrightness(next);
                }}
                className={locked ? "flex-1 min-h-0" : "h-44"}
                aria-label="Ljusintensitet"
              />
              <span className="text-[9px] text-muted-foreground">10–90%</span>
            </div>
            <div className="flex flex-col items-center gap-1 pt-2 border-t border-border w-full">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground text-center leading-tight">
                Auto<br />film
              </Label>
              <Switch
                checked={movieAutoOn}
                onCheckedChange={toggleMovieAuto}
                disabled={movieAutoBusy || movieScenes.length !== 2}
                aria-label="Aktivera automatiska film-scener (4 & 5)"
              />
              <span className="text-[9px] text-muted-foreground">
                {movieAutoOn ? "På" : "Av"}
              </span>
            </div>
          </div>

          {/* MITT: D-Pad + transport */}
          <div className="flex flex-col items-center justify-center gap-3 min-w-0">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Navigation
            </Label>
            <div className="grid grid-cols-3 grid-rows-3 gap-1.5 items-center justify-items-center">
              <div />
              {dpadBtn("up", "Upp", <ChevronUp className="h-6 w-6" />)}
              <div />
              {dpadBtn("left", "Vänster", <ChevronLeft className="h-6 w-6" />)}
              <Button
                className={`${locked ? "h-20 w-20 text-lg" : "h-16 w-16 text-base"} rounded-full font-semibold shadow-[var(--cinema-glow)]`}
                onClick={() => press("ok", "OK")}
                disabled={busy === "ok"}
                aria-label="OK"
              >
                {busy === "ok" ? <Loader2 className="h-5 w-5 animate-spin" /> : "OK"}
              </Button>
              {dpadBtn("right", "Höger", <ChevronRight className="h-6 w-6" />)}
              <div />
              {dpadBtn("down", "Ner", <ChevronDown className="h-6 w-6" />)}
              <div />
            </div>

            {/* Transport-rad — visas bara när en app är vald */}
            {activeApp && transports.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-border/50 w-full justify-center">
                <span className="text-[10px] text-muted-foreground mr-1">
                  {APPS.find((a) => a.key === activeApp)?.label}:
                </span>
                {transports.map((t) =>
                  transportBtn(t, transportLabel[t], transportIcon[t]),
                )}
              </div>
            )}

            {/* App-genvägar — t.ex. MyTVOnline3: TV Guide / Backa / VOD / TV Serier */}
            {activeApp && (APP_SHORTCUTS[activeApp]?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50 w-full justify-center">
                {APP_SHORTCUTS[activeApp].map((s) => {
                  const idx = shortcutVariant[s.id] ?? 0;
                  const current = s.keycodes[idx % s.keycodes.length];
                  const hasMultiple = s.keycodes.length > 1;
                  return (
                    <Button
                      key={s.id}
                      variant={s.opensKeyboard ? "default" : "secondary"}
                      size="sm"
                      className="h-8 px-2.5 text-[11px]"
                      onClick={async () => {
                        // Emulera dubbelklick / långt tryck för knappar som
                        // GTV-BT1-fjärren skickar via "dots"-knappen.
                        const mode = s.mode ?? "single";
                        let r;
                        if (mode === "double") {
                          r = await sendFormulerCommand(current);
                          await new Promise((res) => setTimeout(res, 150));
                          r = await sendFormulerCommand(current);
                        } else if (mode === "long") {
                          // Emulera ~500ms hold genom att skicka keyevent
                          // upprepade gånger (Android repeat-tröskel ~50ms).
                          r = await sendFormulerCommand(current);
                          for (let i = 0; i < 9; i++) {
                            await new Promise((res) => setTimeout(res, 55));
                            r = await sendFormulerCommand(current);
                          }
                        } else if (mode === "sequence") {
                          const seq = s.sequence ?? [current];
                          const delay = s.sequenceDelayMs ?? 250;
                          r = { ok: true } as Awaited<ReturnType<typeof sendFormulerCommand>>;
                          for (let i = 0; i < seq.length; i++) {
                            if (i > 0) await new Promise((res) => setTimeout(res, delay));
                            r = await sendFormulerCommand(seq[i]);
                            if (!r.ok) break;
                          }
                        } else {
                          r = await sendFormulerCommand(current);
                        }
                        if (!r.ok) {
                          toast.error(`${s.label} misslyckades`, {
                            description: r.error || `Status ${r.status}`,
                          });
                          return;
                        }
                        if (s.opensKeyboard) {
                          // Öppna tangentbord för textinmatning efter att
                          // sökskärmen aktiverats i appen.
                          setSearchText("");
                          setKeyboardOpen(true);
                          return;
                        }
                        if (hasMultiple) {
                          setShortcutVariant((prev) => ({
                            ...prev,
                            [s.id]: (idx + 1) % s.keycodes.length,
                          }));
                          toast.message(`${s.label}: ${current}`, {
                            description: `Reagerar inget? Tryck igen för nästa variant (${s.keycodes.length} totalt).`,
                          });
                        }
                      }}
                      title={`${s.label} – nästa: ${current}${hasMultiple ? ` (${idx + 1}/${s.keycodes.length})` : ""}`}
                    >
                      {s.opensKeyboard ? <Search className="h-3.5 w-3.5 mr-1" /> : null}
                      {s.label}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          {/* HÖGER: Marantz volym */}
          <div className="flex flex-col items-center gap-2 min-w-[72px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Volym
            </Label>
            <Button
              variant={marantzStatus?.mute ? "destructive" : "secondary"}
              size="icon"
              className="h-9 w-9"
              onClick={handleMute}
              title="Mute"
              aria-label="Mute"
            >
              {marantzStatus?.mute ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <div className={`flex flex-col items-center gap-1 w-full ${locked ? "flex-1 min-h-0" : "flex-1 min-h-[180px]"}`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  const next = clamp(volDraft + 1, 0, 98);
                  setVolDraft(next);
                  pushVolume(next);
                }}
                aria-label="Vol +"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs font-mono tabular-nums shrink-0">
                MV{String(volDraft).padStart(2, "0")}
              </span>
              <Slider
                orientation="vertical"
                min={0}
                max={98}
                step={1}
                value={[volDraft]}
                onValueChange={handleVolChange}
                onValueCommit={handleVolCommit}
                className="flex-1 min-h-0"
                aria-label="Marantz volym"
              />
              <span
                className={`text-[10px] font-mono tabular-nums shrink-0 ${
                  volDb >= 0 ? "text-amber-400" : "text-muted-foreground"
                }`}
                title="dB relativt referens (MV80 = 0 dB)"
              >
                {volDb > 0 ? "+" : ""}
                {volDb.toFixed(1)} dB
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  const next = clamp(volDraft - 1, 0, 98);
                  setVolDraft(next);
                  pushVolume(next);
                }}
                aria-label="Vol -"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="text-[9px] text-center text-muted-foreground leading-tight">
              {marantzReachable === false ? (
                <span className="text-destructive">offline</span>
              ) : marantzReachable === null ? (
                "—"
              ) : (
                <>
                  <span className="block">
                    {marantzStatus?.power === "on" ? "● ON" : "○ OFF"}
                  </span>
                  {marantzStatus?.input && (
                    <span className="block">{marantzStatus.input}</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Funktioner — back/home/menu/power */}
      <Card className="p-4">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-3 block">
          Funktioner
        </Label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            className="h-14 flex-col gap-1"
            onClick={() => press("back", "Back")}
            disabled={busy === "back"}
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-xs">Back</span>
          </Button>
          <Button
            variant="secondary"
            className="h-14 flex-col gap-1"
            onClick={() => press("home", "Home")}
            disabled={busy === "home"}
          >
            <Home className="h-5 w-5" />
            <span className="text-xs">Home</span>
          </Button>
          <Button
            variant="secondary"
            className="h-14 flex-col gap-1"
            onClick={() => press("menu", "Menu")}
            disabled={busy === "menu"}
          >
            <MenuIcon className="h-5 w-5" />
            <span className="text-xs">Menu</span>
          </Button>
        </div>
        <div className="mt-2">
          <Button
            variant="ghost"
            className="w-full h-11"
            onClick={() => press("power", "Power")}
            disabled={busy === "power"}
          >
            <Power className="h-4 w-4 mr-1.5" />
            Power
          </Button>
        </div>
      </Card>

      {/* Tangentbord för app-sökning (skickar tecken som ADB-keycodes) */}
      <Dialog open={keyboardOpen} onOpenChange={setKeyboardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-4 w-4" /> Sök i appen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitSearchText();
                }
              }}
              placeholder="Skriv sökord och tryck Enter…"
              className="h-10"
            />
            <div className="space-y-1.5">
              {[
                ["1","2","3","4","5","6","7","8","9","0"],
                ["q","w","e","r","t","y","u","i","o","p"],
                ["a","s","d","f","g","h","j","k","l"],
                ["z","x","c","v","b","n","m"],
              ].map((row, ri) => (
                <div key={ri} className="flex gap-1 justify-center">
                  {row.map((ch) => (
                    <Button
                      key={ch}
                      variant="secondary"
                      size="sm"
                      className="h-9 w-9 p-0 text-sm"
                      onClick={() => setSearchText((t) => t + ch)}
                    >
                      {ch}
                    </Button>
                  ))}
                </div>
              ))}
              <div className="flex gap-1 justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => setSearchText((t) => t + " ")}
                >
                  Mellanslag
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => setSearchText((t) => t.slice(0, -1))}
                >
                  ⌫
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => setSearchText("")}
                >
                  Rensa
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setKeyboardOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={() => void submitSearchText()} disabled={sendingText || !searchText}>
              {sendingText ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Sök
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
