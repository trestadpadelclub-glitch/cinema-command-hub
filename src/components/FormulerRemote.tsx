import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { sendFormulerCommand, launchFormulerApp, sendMarantz } from "@/lib/projector";
import { toast } from "sonner";
import logoYoutube from "@/assets/logo-youtube.png";
import logoRedbull from "@/assets/logo-redbull.png";
import logoSpotify from "@/assets/logo-spotify.png";

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
  iptv: "com.formuler.mytvonline3",
  youtube: "com.google.android.youtube.tv",
  redbull: "com.nousguide.android.rbtv",
  spotify: "com.spotify.tv.android",
} as const;

type AppKey = keyof typeof DEFAULT_APPS;

const APPS: { key: AppKey; label: string; logo?: string; icon?: React.ReactNode }[] = [
  { key: "iptv", label: "IPTV", icon: <Tv className="h-7 w-7" /> },
  { key: "youtube", label: "YouTube", logo: logoYoutube },
  { key: "redbull", label: "Red Bull TV", logo: logoRedbull },
  { key: "spotify", label: "Spotify", logo: logoSpotify },
];

const PKG_STORAGE_KEY = "formuler_app_packages";
const MARANTZ_INPUT_KEY = "formuler_marantz_input";

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

export function FormulerRemote() {
  const [busy, setBusy] = useState<KeyName | null>(null);
  const [appBusy, setAppBusy] = useState<AppKey | null>(null);
  const [packages, setPackages] = useState<Record<AppKey, string>>(() => loadPackages());
  const [marantzInput, setMarantzInput] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(MARANTZ_INPUT_KEY) ?? "";
  });

  useEffect(() => {
    localStorage.setItem(PKG_STORAGE_KEY, JSON.stringify(packages));
  }, [packages]);

  useEffect(() => {
    localStorage.setItem(MARANTZ_INPUT_KEY, marantzInput);
  }, [marantzInput]);

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
        toast.success(`${label} startad`);
      }
    } finally {
      setAppBusy(null);
    }
  };

  const dpadBtn = (
    key: KeyName,
    label: string,
    icon: React.ReactNode,
    extra = "",
  ) => (
    <Button
      variant="secondary"
      className={`h-16 w-16 rounded-full p-0 ${extra}`}
      onClick={() => press(key, label)}
      disabled={busy === key}
      aria-label={label}
    >
      {busy === key ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
    </Button>
  );

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
                    <span className="text-xs w-20 text-muted-foreground">{a.label}</span>
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
              variant="secondary"
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

      {/* D-Pad */}
      <Card className="p-6">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-4 block text-center">
          Navigation
        </Label>
        <div className="mx-auto w-fit grid grid-cols-3 grid-rows-3 gap-2 items-center justify-items-center">
          <div />
          {dpadBtn("up", "Upp", <ChevronUp className="h-7 w-7" />)}
          <div />
          {dpadBtn("left", "Vänster", <ChevronLeft className="h-7 w-7" />)}
          <Button
            className="h-20 w-20 rounded-full text-base font-semibold shadow-[var(--cinema-glow)]"
            onClick={() => press("ok", "OK")}
            disabled={busy === "ok"}
            aria-label="OK"
          >
            {busy === "ok" ? <Loader2 className="h-6 w-6 animate-spin" /> : "OK"}
          </Button>
          {dpadBtn("right", "Höger", <ChevronRight className="h-7 w-7" />)}
          <div />
          {dpadBtn("down", "Ner", <ChevronDown className="h-7 w-7" />)}
          <div />
        </div>
      </Card>

      {/* Utility */}
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
        <p className="text-xs text-muted-foreground mt-3">
          Skickar ADB-keyevents via bridge:{" "}
          <code className="text-primary/80">/api/formuler</code>
        </p>
      </Card>
    </div>
  );
}
