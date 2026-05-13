import { useState, useEffect, useRef } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Tv,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Lightbulb,
  Power,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Search,
  ArrowLeft,
  Home,
  Menu as MenuIcon,
  Loader2,
  Lock,
  Unlock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  sendFormulerCommand,
  launchFormulerApp,
  sendMarantz,
  sendSceneLights,
  marantzMvToDb,
  type SceneLightCommand,
  type MarantzStatus,
} from "@/lib/projector";
import { useLightsStatus } from "@/hooks/useLightsStatus";
import {
  fetchLights,
  fetchScenes,
  fetchSceneLights,
  updateScene,
  type Light,
  type Scene,
} from "@/lib/scenes";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import logoYoutube from "@/assets/logo-youtube.png";
import logoRedbull from "@/assets/logo-redbull.png";
import logoSpotify from "@/assets/logo-spotify.png";

interface Props {
  householdCode: string;
  marantzStatus: MarantzStatus | null;
  onUnlock: () => void;
  onMarantzRefresh: () => Promise<void>;
}

type AppKey = "mytvonline3" | "youtube" | "redbull" | "spotify";

const APP_PACKAGES: Record<AppKey, string[]> = {
  mytvonline3: ["tv.formuler.mol3.real", "com.formuler.mol3", "com.formuler.mytvonline3"],
  youtube: ["com.google.android.youtube.tv", "com.google.android.youtube"],
  redbull: ["com.nousguide.android.rbtv"],
  spotify: ["com.spotify.tv.android", "com.spotify.music"],
};

const APPS: { key: AppKey; label: string; logo?: string; icon?: React.ReactNode; bg: string }[] = [
  {
    key: "mytvonline3",
    label: "MyTVOnline3",
    icon: <Tv className="h-6 w-6" />,
    bg: "bg-orange-500/90 text-white",
  },
  { key: "youtube", label: "YouTube", logo: logoYoutube, bg: "bg-card" },
  { key: "redbull", label: "Red Bull TV", logo: logoRedbull, bg: "bg-card" },
  { key: "spotify", label: "Spotify", logo: logoSpotify, bg: "bg-card" },
];

const PKG_STORAGE_KEY = "formuler_app_packages";
const ACTIVE_APP_KEY = "formuler_active_app";
const FAV_LIGHTS_PCT_KEY = "favorite_remote_lights_pct";
const LS_ON_KEY = (h: string) => `lights_remote_on_scene_${h}`;
const LS_OFF_KEY = (h: string) => `lights_remote_off_scene_${h}`;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function loadPackages(): Record<AppKey, string> {
  if (typeof window === "undefined") return {} as Record<AppKey, string>;
  try {
    const raw = localStorage.getItem(PKG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : ({} as Record<AppKey, string>);
  } catch {
    return {} as Record<AppKey, string>;
  }
}

export function FavoriteRemote({
  householdCode,
  marantzStatus,
  onUnlock,
  onMarantzRefresh,
}: Props) {
  const [activeApp, setActiveApp] = useState<AppKey | null>(() => {
    if (typeof window === "undefined") return null;
    return (localStorage.getItem(ACTIVE_APP_KEY) as AppKey | null) ?? "mytvonline3";
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [lightsPct, setLightsPct] = useState<number>(() => {
    if (typeof window === "undefined") return 50;
    const v = localStorage.getItem(FAV_LIGHTS_PCT_KEY);
    return v ? parseInt(v, 10) : 50;
  });
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [lights, setLights] = useState<Light[]>([]);
  const [volDraft, setVolDraft] = useState<number>(() => marantzStatus?.volume ?? 40);
  const lightsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingVol = useRef(false);

  const { lights: lightStatus } = useLightsStatus({ enabled: true, intervalSeconds: 8 });

  useEffect(() => {
    let alive = true;
    Promise.all([fetchScenes(householdCode), fetchLights(householdCode)])
      .then(([s, l]) => {
        if (!alive) return;
        setScenes(s);
        setLights(l);
      })
      .catch((e) => toast.error("Kunde inte ladda ljus/filmscener", { description: String(e) }));
    return () => {
      alive = false;
    };
  }, [householdCode]);

  useEffect(() => {
    if (!draggingVol.current && typeof marantzStatus?.volume === "number") {
      setVolDraft(marantzStatus.volume);
    }
  }, [marantzStatus?.volume]);

  // Double-tap to unlock
  const lastTapRef = useRef<number>(0);
  const handleHeaderTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      onUnlock();
      toast.success("Kiosk-läge upplåst");
    }
    lastTapRef.current = now;
  };

  const send = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const sendKey = (id: string, keycode: string) => send(id, () => sendFormulerCommand(keycode));

  const launchApp = async (key: AppKey) => {
    const stored = loadPackages();
    const candidates = Array.from(
      new Set([stored[key], ...APP_PACKAGES[key]].filter(Boolean) as string[]),
    );
    setActiveApp(key);
    localStorage.setItem(ACTIVE_APP_KEY, key);
    setBusy(`app-${key}`);
    try {
      for (const pkg of candidates) {
        const res = await launchFormulerApp(pkg);
        if (res.ok) {
          toast.success(`${APPS.find((a) => a.key === key)?.label} startad`);
          return;
        }
      }
      toast.error(`Kunde inte starta appen`);
    } finally {
      setBusy(null);
    }
  };

  const lightsOn = lightStatus.some((l) => l.on);
  const movieScenes = scenes.filter((s) => s.scene_number === 4 || s.scene_number === 5);
  const movieAutoOn = movieScenes.length === 2 && movieScenes.every((s) => s.enabled);

  const buildLightsPayload = async (
    state: "on" | "off",
    pct?: number,
  ): Promise<SceneLightCommand[]> => {
    const sceneId = localStorage.getItem(
      state === "on" ? LS_ON_KEY(householdCode) : LS_OFF_KEY(householdCode),
    );
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) throw new Error(`Välj en ${state.toUpperCase()}-scen i Lights Remote först`);
    const sceneLights = await fetchSceneLights(scene.id);
    const payload: SceneLightCommand[] = [];
    for (const sl of sceneLights) {
      if (!sl.in_scene) continue;
      const light = lights.find((l) => l.id === sl.light_id);
      if (!light) continue;
      const baseBrightness = sl.brightness ?? 0;
      const treatAsOff = sl.on_state && baseBrightness === 0;
      const on = state === "on" ? !treatAsOff && sl.on_state : treatAsOff ? false : sl.on_state;
      const cmd: SceneLightCommand = {
        device_id: light.tuya_device_id,
        name: light.name,
        type: light.light_type,
        on,
        delay_ms: state === "on" ? 0 : (sl.delay_ms ?? 0),
        fade_ms: sl.fade_ms ?? 0,
      };
      if (on) {
        cmd.brightness = state === "on" ? clamp(pct ?? lightsPct, 10, 90) : baseBrightness || 100;
        if ((light.light_type === "cct" || light.light_type === "rgbcct") && sl.kelvin !== null)
          cmd.kelvin = sl.kelvin;
        if ((light.light_type === "rgb" || light.light_type === "rgbcct") && sl.color_hex)
          cmd.color = sl.color_hex;
      }
      payload.push(cmd);
    }
    if (payload.length === 0) throw new Error(`Scenen "${scene.name}" har inga lampor`);
    return payload;
  };

  const handleLights = async (state: "on" | "off") => {
    await send(`lights-${state}`, async () => {
      const res = await sendSceneLights(await buildLightsPayload(state));
      if (!res.ok)
        toast.error(`Ljus ${state.toUpperCase()} misslyckades`, {
          description: res.error || `Status ${res.status}`,
        });
    }).catch((e) => toast.error(`Ljus ${state.toUpperCase()} fel`, { description: String(e) }));
  };

  const handleLightsBrightness = (pct: number) => {
    const next = clamp(pct, 10, 90);
    setLightsPct(next);
    localStorage.setItem(FAV_LIGHTS_PCT_KEY, String(next));
    if (lightsDebounceRef.current) clearTimeout(lightsDebounceRef.current);
    lightsDebounceRef.current = setTimeout(async () => {
      try {
        const res = await sendSceneLights(await buildLightsPayload("on", next));
        if (!res.ok)
          toast.error("Ljusintensitet misslyckades", {
            description: res.error || `Status ${res.status}`,
          });
      } catch {
        /* visas vid ON/OFF, inte under dragning */
      }
    }, 180);
  };

  const toggleMovieAuto = async (next: boolean) => {
    if (movieScenes.length !== 2) {
      toast.error("Hittar inte scen 4 och 5");
      return;
    }
    await send("autofilm", async () => {
      await Promise.all(movieScenes.map((s) => updateScene(s.id, { enabled: next })));
      setScenes((prev) =>
        prev.map((s) =>
          s.scene_number === 4 || s.scene_number === 5 ? { ...s, enabled: next } : s,
        ),
      );
      toast.success(next ? "AutoFilm på" : "AutoFilm av");
    });
  };

  const pushVolume = (mv: number) => {
    const v = clamp(mv, 0, 98);
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => {
      sendMarantz(`MV${String(v).padStart(2, "0")}`).then((r) => {
        if (!r.ok)
          toast.error("Marantz volym misslyckades", {
            description: r.error || `Status ${r.status}`,
          });
      });
    }, 120);
  };

  // Marantz volume
  const volDb = marantzMvToDb(volDraft);
  const muted = marantzStatus?.mute === true;

  return (
    <div className="fixed inset-0 z-50 bg-[image:var(--gradient-screen)] text-foreground overflow-hidden flex flex-col">
      {/* Header — double-tap to unlock */}
      <div
        onClick={handleHeaderTap}
        onTouchEnd={(e) => {
          e.preventDefault();
          handleHeaderTap();
        }}
        className="flex items-center justify-between px-4 py-3 border-b border-border/40 select-none cursor-pointer flex-shrink-0"
      >
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Kiosk · dubbeltryck för att låsa upp
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onMarantzRefresh();
          }}
          className="h-7 px-2 text-[11px]"
        >
          Konfig
        </Button>
      </div>

      <div className="flex-1 overflow-hidden p-3 flex flex-col gap-3 min-h-0">
        {/* SNABBVAL */}
        <Card className="p-3 bg-card/60 flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Snabbval
          </div>
          <div className="grid grid-cols-4 gap-2">
            {APPS.map((app) => {
              const isActive = activeApp === app.key;
              const isBusy = busy === `app-${app.key}`;
              return (
                <button
                  key={app.key}
                  onClick={() => launchApp(app.key)}
                  disabled={busy !== null}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg ring-2 ring-primary"
                      : "bg-card border border-border/50 hover:bg-card/80"
                  }`}
                >
                  {isBusy ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : app.logo ? (
                    <img src={app.logo} alt={app.label} className="h-7 w-7 object-contain" />
                  ) : (
                    app.icon
                  )}
                  <span className="text-[9px] font-medium leading-tight">{app.label}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* MAIN GRID — Lights | Navigation | Marantz */}
        <Card className="p-3 bg-card/60 flex-1 min-h-0 overflow-hidden">
          <div className="grid grid-cols-[64px_1fr_64px] gap-3 h-full">
            {/* LJUS column */}
            <div className="flex flex-col items-center gap-2 min-h-0">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Ljus</div>
              <Button
                size="icon"
                variant={lightsOn ? "default" : "outline"}
                onClick={() => handleLights("on")}
                disabled={busy !== null}
                className="h-9 w-9"
              >
                <Lightbulb className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={() => handleLights("off")}
                disabled={busy !== null}
                className="h-9 w-9"
              >
                <Power className="h-4 w-4" />
              </Button>
              <div className="text-[10px] text-muted-foreground">{lightsPct}%</div>
              <div className="flex-1 flex items-center justify-center w-full min-h-0 py-1">
                <Slider
                  orientation="vertical"
                  min={10}
                  max={90}
                  step={5}
                  value={[lightsPct]}
                  onValueChange={(v) => handleLightsBrightness(v[0])}
                  className="h-full"
                />
              </div>
              <div className="text-[9px] text-muted-foreground">10–90%</div>
              <div className="flex flex-col items-center gap-1 border-t border-border/50 pt-2 w-full">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground text-center leading-tight">
                  Auto
                  <br />
                  film
                </div>
                <Switch
                  checked={movieAutoOn}
                  onCheckedChange={toggleMovieAuto}
                  disabled={busy !== null || movieScenes.length !== 2}
                  aria-label="AutoFilm av/på"
                />
              </div>
            </div>

            {/* NAVIGATION column */}
            <div className="flex flex-col items-center justify-between min-h-0 py-1">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Navigation
              </div>

              {/* D-pad */}
              <div className="grid grid-cols-3 gap-1.5 my-2">
                <div />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => sendKey("up", "KEYCODE_DPAD_UP")}
                  disabled={busy !== null}
                  className="h-12 w-12 rounded-full"
                >
                  <ChevronUp className="h-5 w-5" />
                </Button>
                <div />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => sendKey("left", "KEYCODE_DPAD_LEFT")}
                  disabled={busy !== null}
                  className="h-12 w-12 rounded-full"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  onClick={() => sendKey("ok", "KEYCODE_DPAD_CENTER")}
                  disabled={busy !== null}
                  className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[0_0_24px_oklch(0.72_0.18_60/0.5)]"
                >
                  OK
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => sendKey("right", "KEYCODE_DPAD_RIGHT")}
                  disabled={busy !== null}
                  className="h-12 w-12 rounded-full"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
                <div />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => sendKey("down", "KEYCODE_DPAD_DOWN")}
                  disabled={busy !== null}
                  className="h-12 w-12 rounded-full"
                >
                  <ChevronDown className="h-5 w-5" />
                </Button>
                <div />
              </div>

              {/* Media transport */}
              <div className="flex items-center justify-center gap-2 w-full">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => sendKey("rew", "KEYCODE_MEDIA_REWIND")}
                  disabled={busy !== null}
                  className="h-9 w-9"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => sendKey("play", "KEYCODE_MEDIA_PLAY_PAUSE")}
                  disabled={busy !== null}
                  className="h-9 w-9"
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => sendKey("stop", "KEYCODE_MEDIA_STOP")}
                  disabled={busy !== null}
                  className="h-9 w-9"
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => sendKey("ff", "KEYCODE_MEDIA_FAST_FORWARD")}
                  disabled={busy !== null}
                  className="h-9 w-9"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>

              {/* App-shortcuts */}
              <div className="grid grid-cols-3 gap-1.5 mt-2 w-full">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    send("guide", async () => {
                      await sendFormulerCommand("KEYCODE_MENU");
                      await new Promise((r) => setTimeout(r, 200));
                      await sendFormulerCommand("KEYCODE_DPAD_CENTER");
                    })
                  }
                  disabled={busy !== null}
                  className="h-8 text-[10px]"
                >
                  TV Guide
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendKey("back2", "KEYCODE_BACK")}
                  disabled={busy !== null}
                  className="h-8 text-[10px]"
                >
                  Backa
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    send("vod", async () => {
                      await sendFormulerCommand("KEYCODE_MENU");
                      await new Promise((r) => setTimeout(r, 200));
                      await sendFormulerCommand("KEYCODE_DPAD_DOWN");
                      await new Promise((r) => setTimeout(r, 200));
                      await sendFormulerCommand("KEYCODE_DPAD_CENTER");
                    })
                  }
                  disabled={busy !== null}
                  className="h-8 text-[10px]"
                >
                  VOD
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    send("series", async () => {
                      await sendFormulerCommand("KEYCODE_MENU");
                      await new Promise((r) => setTimeout(r, 200));
                      await sendFormulerCommand("KEYCODE_DPAD_DOWN");
                      await new Promise((r) => setTimeout(r, 200));
                      await sendFormulerCommand("KEYCODE_DPAD_DOWN");
                      await new Promise((r) => setTimeout(r, 200));
                      await sendFormulerCommand("KEYCODE_DPAD_CENTER");
                    })
                  }
                  disabled={busy !== null}
                  className="h-8 text-[10px]"
                >
                  TV Serier
                </Button>
                <Button
                  size="sm"
                  onClick={() => sendKey("search", "KEYCODE_PROG_GREEN")}
                  disabled={busy !== null}
                  className="h-8 text-[10px] bg-primary text-primary-foreground"
                >
                  <Search className="h-3 w-3 mr-1" /> Sök
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendKey("menu2", "KEYCODE_MENU")}
                  disabled={busy !== null}
                  className="h-8 text-[10px]"
                >
                  Menu
                </Button>
              </div>
            </div>

            {/* MARANTZ VOLUME column */}
            <div className="flex flex-col items-center gap-2 min-h-0">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Volym</div>
              <Button
                size="icon"
                variant={muted ? "destructive" : "outline"}
                onClick={() =>
                  send("mute", async () => {
                    await sendMarantz(muted ? "MUOFF" : "MUON");
                    setTimeout(() => onMarantzRefresh(), 250);
                  })
                }
                disabled={busy !== null}
                className="h-9 w-9"
                title="Mute"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  const next = clamp(volDraft + 1, 0, 98);
                  setVolDraft(next);
                  pushVolume(next);
                }}
                disabled={busy !== null}
                className="h-9 w-9"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <div className="text-[10px] font-mono font-bold text-center tabular-nums">
                MV{String(volDraft).padStart(2, "0")}
                <div className="text-[8px] text-muted-foreground font-normal">
                  {volDb > 0 ? "+" : ""}
                  {volDb.toFixed(1)} dB
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center w-full min-h-0 py-1">
                <Slider
                  orientation="vertical"
                  min={0}
                  max={98}
                  step={1}
                  value={[volDraft]}
                  onValueChange={(v) => {
                    const next = v[0] ?? volDraft;
                    draggingVol.current = true;
                    setVolDraft(next);
                    pushVolume(next);
                  }}
                  onValueCommit={(v) => {
                    const next = v[0] ?? volDraft;
                    draggingVol.current = false;
                    setVolDraft(next);
                    pushVolume(next);
                    setTimeout(() => onMarantzRefresh(), 400);
                  }}
                  className="h-full"
                  aria-label="Marantz volym"
                />
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  const next = clamp(volDraft - 1, 0, 98);
                  setVolDraft(next);
                  pushVolume(next);
                }}
                disabled={busy !== null}
                className="h-9 w-9"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* FUNKTIONER */}
        <Card className="p-3 bg-card/60 flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Funktioner
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={() => sendKey("back", "KEYCODE_BACK")}
              disabled={busy !== null}
              className="h-12 flex-col gap-0.5"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-[10px]">Back</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => sendKey("home", "KEYCODE_HOME")}
              disabled={busy !== null}
              className="h-12 flex-col gap-0.5"
            >
              <Home className="h-4 w-4" />
              <span className="text-[10px]">Home</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => sendKey("menu", "KEYCODE_MENU")}
              disabled={busy !== null}
              className="h-12 flex-col gap-0.5"
            >
              <MenuIcon className="h-4 w-4" />
              <span className="text-[10px]">Menu</span>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
