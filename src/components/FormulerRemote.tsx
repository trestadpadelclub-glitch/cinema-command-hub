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
  sendFormulerCommand,
  launchFormulerApp,
  sendMarantz,
  sendScene,
  marantzMvToDb,
  type MarantzStatus,
  type SceneLightCommand,
} from "@/lib/projector";
import {
  fetchScenes,
  fetchLights,
  fetchSceneLights,
  type Scene,
  type Light,
} from "@/lib/scenes";
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
  mytvonline3: "com.formuler.mol3",
  youtube: "com.google.android.youtube.tv",
  redbull: "com.nousguide.android.rbtv",
  spotify: "com.spotify.tv.android",
} as const;

// Kandidatpaket att prova om standardvalet inte finns på boxen.
const APP_CANDIDATES: Record<AppKey, string[]> = {
  mytvonline3: [
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

function loadPackages(): Record<AppKey, string> {
  if (typeof window === "undefined") return { ...DEFAULT_APPS };
  try {
    const raw = localStorage.getItem(PKG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_APPS, ...parsed };
  } catch {
    return { ...DEFAULT_APPS };
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function FormulerRemote({ marantzStatus, marantzReachable, onMarantzRefresh }: Props) {
  const [busy, setBusy] = useState<KeyName | null>(null);
  const [appBusy, setAppBusy] = useState<AppKey | null>(null);
  const [transportBusy, setTransportBusy] = useState<Transport | null>(null);
  const [packages, setPackages] = useState<Record<AppKey, string>>(() => loadPackages());
  const [marantzInput, setMarantzInput] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(MARANTZ_INPUT_KEY) ?? "";
  });
  const [activeApp, setActiveApp] = useState<AppKey | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(ACTIVE_APP_KEY) as AppKey | null;
    return v && v in DEFAULT_APPS ? v : null;
  });

  // Lights local UI-state — vi har ingen feedback från lampor här,
  // så detta är optimistisk view.
  const [lightsBrightness, setLightsBrightness] = useState<number>(50);
  const [lightsBusy, setLightsBusy] = useState<"on" | "off" | null>(null);

  // Marantz volym-slider — lokal "draft" som synkas mot status när
  // användaren inte aktivt drar.
  const [volDraft, setVolDraft] = useState<number>(40);
  const draggingVol = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem(PKG_STORAGE_KEY, JSON.stringify(packages));
  }, [packages]);

  useEffect(() => {
    localStorage.setItem(MARANTZ_INPUT_KEY, marantzInput);
  }, [marantzInput]);

  useEffect(() => {
    if (activeApp) localStorage.setItem(ACTIVE_APP_KEY, activeApp);
  }, [activeApp]);

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

  const launchApp = async (key: AppKey, label: string) => {
    const pkg = packages[key];
    if (!pkg) {
      toast.error(`Inget paketnamn för ${label}`);
      return;
    }
    setAppBusy(key);
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
      // 2) Starta vald app på Formuler
      const res = await launchFormulerApp(pkg);
      if (!res.ok) {
        toast.error(`Kunde inte starta ${label}`, {
          description: res.error || `Status ${res.status}`,
        });
      } else {
        setActiveApp(key);
        toast.success(`${label} startad`);
      }
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

  const handleLights = async (state: "on" | "off") => {
    setLightsBusy(state);
    const res = await sendLights(state);
    setLightsBusy(null);
    if (!res.ok) {
      toast.error(`Ljus ${state.toUpperCase()} misslyckades`, {
        description: res.error || `Status ${res.status}`,
      });
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
      className={`h-14 w-14 rounded-full p-0 ${extra}`}
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
    <div className="space-y-4">
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
            <PopoverContent className="w-80 space-y-3">
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
                <Label className="text-xs">Android-paket per app</Label>
                {APPS.map((a) => (
                  <div key={a.key} className="flex items-center gap-2">
                    <span className="text-xs w-24 text-muted-foreground">{a.label}</span>
                    <Input
                      value={packages[a.key]}
                      onChange={(e) =>
                        setPackages((p) => ({ ...p, [a.key]: e.target.value.trim() }))
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Justera om en app inte startar — paketnamn kan variera mellan Formuler-modeller.
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
      <Card className="p-4">
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-stretch">
          {/* VÄNSTER: ljus */}
          <div className="flex flex-col items-center gap-2 min-w-[64px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Ljus
            </Label>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9"
                onClick={() => handleLights("on")}
                disabled={lightsBusy !== null}
                title="Ljus på"
                aria-label="Ljus på"
              >
                {lightsBusy === "on" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                )}
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9"
                onClick={() => handleLights("off")}
                disabled={lightsBusy !== null}
                title="Ljus av"
                aria-label="Ljus av"
              >
                {lightsBusy === "off" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1.5 pt-1 min-h-[180px]">
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                {lightsBrightness}%
              </span>
              <Slider
                orientation="vertical"
                min={10}
                max={90}
                step={5}
                value={[lightsBrightness]}
                onValueChange={(v) => setLightsBrightness(v[0] ?? 50)}
                className="h-44"
                aria-label="Ljusintensitet"
              />
              <span className="text-[9px] text-muted-foreground">10–90%</span>
            </div>
          </div>

          {/* MITT: D-Pad + transport */}
          <div className="flex flex-col items-center justify-center gap-3">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Navigation
            </Label>
            <div className="grid grid-cols-3 grid-rows-3 gap-1.5 items-center justify-items-center">
              <div />
              {dpadBtn("up", "Upp", <ChevronUp className="h-6 w-6" />)}
              <div />
              {dpadBtn("left", "Vänster", <ChevronLeft className="h-6 w-6" />)}
              <Button
                className="h-16 w-16 rounded-full text-base font-semibold shadow-[var(--cinema-glow)]"
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
              <div className="flex items-center gap-1 pt-1 border-t border-border/50 w-full justify-center">
                <span className="text-[10px] text-muted-foreground mr-1">
                  {APPS.find((a) => a.key === activeApp)?.label}:
                </span>
                {transports.map((t) =>
                  transportBtn(t, transportLabel[t], transportIcon[t]),
                )}
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
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  const next = clamp(volDraft + 1, 0, 98);
                  setVolDraft(next);
                  pushVolume(next);
                }}
                aria-label="Vol +"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1.5 min-h-[180px]">
              <span className="text-xs font-mono tabular-nums">
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
                className="h-44"
                aria-label="Marantz volym"
              />
              <span
                className={`text-[10px] font-mono tabular-nums ${
                  volDb >= 0 ? "text-amber-400" : "text-muted-foreground"
                }`}
                title="dB relativt referens (MV80 = 0 dB)"
              >
                {volDb > 0 ? "+" : ""}
                {volDb.toFixed(1)} dB
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                const next = clamp(volDraft - 1, 0, 98);
                setVolDraft(next);
                pushVolume(next);
              }}
              aria-label="Vol -"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
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
    </div>
  );
}
