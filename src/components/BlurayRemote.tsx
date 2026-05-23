import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Power,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Disc,
  Menu,
  Loader2,
  Info,
  Lightbulb,
  Disc3 as Eject,
  GraduationCap,
  Trash2,
  CheckCircle2,
  RefreshCcw,
  WifiOff,
  Wifi,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ArrowLeft,
  Home,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  sendMarantz,
  sendIr,
  learnIr,
  forgetIr,
  getIrCodes,
  getIrStatus,
  sendSceneLights,
  type SceneLightCommand,
  type IrStatus,
} from "@/lib/projector";
import {
  fetchInputs,
  fetchScenes,
  fetchLights,
  type MarantzInput,
  type Scene,
  type Light,
} from "@/lib/scenes";
import { useLightsStatus } from "@/hooks/useLightsStatus";
import { toast } from "sonner";

interface Props {
  householdCode: string;
}

const LS_INPUT_KEY = (h: string) => `bluray_input_code_${h}`;
const LS_PLAY_SCENE = (h: string) => `bluray_play_scene_${h}`;
const LS_PAUSE_SCENE = (h: string) => `bluray_pause_scene_${h}`;
const LS_STOP_SCENE = (h: string) => `bluray_stop_scene_${h}`;
const LS_BRIGHTNESS = (h: string) => `bluray_lights_brightness_${h}`;

const TRIGGER_ENDPOINT = "/api/public/trigger";

// Knapp-definition. `irKey` är den nyckel vi sparar IR-koden under i bryggan.
interface IrButtonDef {
  irKey: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "transport" | "nav" | "menu" | "power";
}

const IR_BUTTONS: IrButtonDef[] = [
  { irKey: "bluray_power", label: "Power", icon: Power, group: "power" },
  { irKey: "bluray_eject", label: "Eject", icon: Eject, group: "power" },
  { irKey: "bluray_play", label: "Play", icon: Play, group: "transport" },
  { irKey: "bluray_pause", label: "Pause", icon: Pause, group: "transport" },
  { irKey: "bluray_stop", label: "Stop", icon: Square, group: "transport" },
  { irKey: "bluray_prev", label: "Prev / ⏮", icon: SkipBack, group: "transport" },
  { irKey: "bluray_next", label: "Next / ⏭", icon: SkipForward, group: "transport" },
  { irKey: "bluray_up", label: "Upp", icon: ChevronUp, group: "nav" },
  { irKey: "bluray_down", label: "Ner", icon: ChevronDown, group: "nav" },
  { irKey: "bluray_left", label: "Vänster", icon: ChevronLeft, group: "nav" },
  { irKey: "bluray_right", label: "Höger", icon: ChevronRight, group: "nav" },
  { irKey: "bluray_ok", label: "OK", icon: Circle, group: "nav" },
  { irKey: "bluray_back", label: "Tillbaka", icon: ArrowLeft, group: "menu" },
  { irKey: "bluray_home", label: "Home", icon: Home, group: "menu" },
  { irKey: "bluray_top_menu", label: "Top Menu", icon: Menu, group: "menu" },
  { irKey: "bluray_popup", label: "Pop-up", icon: Menu, group: "menu" },
];

async function fireTrigger(householdCode: string, key: string) {
  const res = await fetch(TRIGGER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ household_code: householdCode, trigger_key: key }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
}

export function BlurayRemote({ householdCode }: Props) {
  const [inputs, setInputs] = useState<MarantzInput[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [lights, setLights] = useState<Light[]>([]);
  const [bdInputCode, setBdInputCode] = useState<string>("");
  const [playSceneId, setPlaySceneId] = useState<string>("");
  const [pauseSceneId, setPauseSceneId] = useState<string>("");
  const [stopSceneId, setStopSceneId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  // IR-state
  const [irStatus, setIrStatus] = useState<IrStatus | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTargetKey, setLearnTargetKey] = useState<string | null>(null);
  const [learning, setLearning] = useState(false);

  // Lights-state
  const lightDeviceIds = useMemo(
    () => lights.map((l) => l.tuya_device_id).filter(Boolean),
    [lights],
  );
  const { lights: lightStatus } = useLightsStatus({
    enabled: true,
    intervalSeconds: 7,
    deviceIds: lightDeviceIds,
  });
  const [brightness, setBrightness] = useState<number>(70);
  const brightDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------- Initial load --------
  useEffect(() => {
    Promise.all([
      fetchInputs(householdCode),
      fetchScenes(householdCode),
      fetchLights(householdCode),
    ])
      .then(([i, s, l]) => {
        setInputs(i);
        setScenes(s);
        setLights(l);
        const savedInput = localStorage.getItem(LS_INPUT_KEY(householdCode));
        if (savedInput) setBdInputCode(savedInput);
        else {
          const guess = i.find((x) => /bd|blu|disc/i.test(x.label) || /BD/i.test(x.marantz_code));
          if (guess) setBdInputCode(guess.marantz_code);
        }
        setPlaySceneId(localStorage.getItem(LS_PLAY_SCENE(householdCode)) ?? "");
        setPauseSceneId(localStorage.getItem(LS_PAUSE_SCENE(householdCode)) ?? "");
        setStopSceneId(localStorage.getItem(LS_STOP_SCENE(householdCode)) ?? "");
        const savedBright = Number(localStorage.getItem(LS_BRIGHTNESS(householdCode)) ?? "70");
        if (Number.isFinite(savedBright) && savedBright > 0) setBrightness(savedBright);
      })
      .catch((e) => toast.error("Kunde inte ladda data", { description: String(e) }));
  }, [householdCode]);

  // Refresh IR-status + sparade nycklar
  const refreshIr = useCallback(async () => {
    const [st, codes] = await Promise.all([getIrStatus(), getIrCodes()]);
    setIrStatus(st);
    setSavedKeys(new Set(codes.keys));
  }, []);

  useEffect(() => {
    void refreshIr();
  }, [refreshIr]);

  // -------- Handlers --------
  const saveInput = (code: string) => {
    setBdInputCode(code);
    localStorage.setItem(LS_INPUT_KEY(householdCode), code);
  };

  const handleSendIr = async (key: string, label: string) => {
    if (!savedKeys.has(key)) {
      toast.error(`Ingen IR-kod sparad för "${label}"`, {
        description: "Tryck på 'Lär in' och rikta originalfjärrkontrollen mot Broadlink-dosan.",
      });
      return;
    }
    setBusy(key);
    try {
      const res = await sendIr(key);
      if (!res.ok) {
        toast.error(`${label} misslyckades`, { description: res.error || `Status ${res.status}` });
      } else {
        toast.success(label, { description: "IR skickad" });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleLearn = async (key: string) => {
    setLearning(true);
    try {
      // Pre-flight: om bryggan inte ens svarar på /status, ge tydligt fel
      // direkt istället för att vänta 25 s i lärläge.
      const st = await getIrStatus();
      const httpsPage =
        typeof window !== "undefined" && window.location.protocol === "https:";
      if (!st.ok) {
        toast.error("Når inte Broadlink-bryggan", {
          description:
            (st.error || "okänt nätverksfel") +
            (httpsPage
              ? " — appen körs på HTTPS men bryggan är HTTP (Mixed Content blockeras). Öppna appen via http://<datorns-IP>:5173 på samma WiFi."
              : " — kontrollera att v44-bryggan kör och att Bridge URL i Settings stämmer."),
        });
        return;
      }
      if (st.reachable === false) {
        toast.error("Broadlink-dosan svarar inte", {
          description: st.error || `Bryggan kör, men kan inte auth:a mot ${st.host ?? "Broadlink"}.`,
        });
        return;
      }
      const res = await learnIr(key, 25);
      if (!res.ok) {
        toast.error("Lärning misslyckades", { description: res.error ?? "okänt fel" });
        return;
      }
      toast.success(`Inlärd: ${key}`, { description: `${res.bytes ?? "?"} byte sparade` });
      await refreshIr();
      setLearnTargetKey(null);
    } finally {
      setLearning(false);
    }
  };

  const handleForget = async (key: string) => {
    const res = await forgetIr(key);
    if (!res.ok) {
      toast.error("Kunde inte ta bort", { description: res.error ?? "okänt fel" });
      return;
    }
    toast.success(`Glömde ${key}`);
    await refreshIr();
  };

  const handlePowerOnAvr = async () => {
    if (!bdInputCode) {
      toast.error("Välj BD-ingång på Marantz först");
      return;
    }
    setBusy("avr_power");
    try {
      let res = await sendMarantz("PWON");
      if (!res.ok) {
        toast.error("Marantz PWON misslyckades", { description: res.error || `Status ${res.status}` });
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
      res = await sendMarantz(`SI${bdInputCode}`);
      if (!res.ok) {
        toast.error("Input-byte misslyckades", { description: res.error || `Status ${res.status}` });
        return;
      }
      toast.success("Marantz på + BD-ingång vald");
    } finally {
      setBusy(null);
    }
  };

  const triggerScene = async (key: string, sceneId: string, label: string) => {
    if (!sceneId) {
      toast.error(`Välj en scen för "${label}" först`);
      return;
    }
    setBusy(key);
    try {
      await fireTrigger(householdCode, key);
      const scene = scenes.find((s) => s.id === sceneId);
      toast.success(`${label} → ${scene?.name ?? "scen"}`, { description: `trigger: ${key}` });
    } catch (e) {
      toast.error("Trigger misslyckades", { description: String(e) });
    } finally {
      setBusy(null);
    }
  };

  // -------- Lights helpers --------
  const buildLightsPayload = (on: boolean, level?: number): SceneLightCommand[] => {
    return lights.map((l) => {
      const cmd: SceneLightCommand = {
        device_id: l.tuya_device_id,
        type: (l.light_type as SceneLightCommand["type"]) ?? "dimmer",
        on,
      };
      if (on && typeof level === "number") {
        cmd.brightness = Math.max(1, Math.min(100, Math.round(level)));
      }
      return cmd;
    });
  };

  const handleLightsOn = async () => {
    if (lights.length === 0) {
      toast.error("Inga lampor konfigurerade för detta hushåll");
      return;
    }
    setBusy("lights_on");
    try {
      const res = await sendSceneLights(buildLightsPayload(true, brightness));
      if (!res.ok) {
        toast.error("Tänd lampor misslyckades", { description: res.error || `Status ${res.status}` });
      } else {
        toast.success(`Tände ${lights.length} lampa(or)`, { description: `${brightness}%` });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleLightsOff = async () => {
    if (lights.length === 0) {
      toast.error("Inga lampor konfigurerade för detta hushåll");
      return;
    }
    setBusy("lights_off");
    try {
      const res = await sendSceneLights(buildLightsPayload(false));
      if (!res.ok) {
        toast.error("Släck lampor misslyckades", { description: res.error || `Status ${res.status}` });
      } else {
        toast.success(`Släckte ${lights.length} lampa(or)`);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleBrightnessChange = (value: number) => {
    setBrightness(value);
    localStorage.setItem(LS_BRIGHTNESS(householdCode), String(value));
    if (brightDebounce.current) clearTimeout(brightDebounce.current);
    brightDebounce.current = setTimeout(() => {
      // Skicka bara ny brightness till lampor som redan är på.
      const lightsOn = lights.filter((l) => {
        const st = lightStatus.find((s) => s.device_id === l.tuya_device_id);
        return st?.on === true;
      });
      if (lightsOn.length === 0) return;
      const payload: SceneLightCommand[] = lightsOn.map((l) => ({
        device_id: l.tuya_device_id,
        type: (l.light_type as SceneLightCommand["type"]) ?? "dimmer",
        on: true,
        brightness: value,
      }));
      void sendSceneLights(payload);
    }, 250);
  };

  // -------- Render --------
  const irReachable = irStatus?.reachable === true;
  const irHostLabel = irStatus?.host ?? "?";

  const renderIrButton = (def: IrButtonDef) => {
    const Icon = def.icon;
    const hasCode = savedKeys.has(def.irKey);
    return (
      <Button
        key={def.irKey}
        variant={hasCode ? "secondary" : "ghost"}
        size="lg"
        className="h-14 flex-col gap-0.5"
        onClick={() => handleSendIr(def.irKey, def.label)}
        disabled={busy !== null || !hasCode || !irReachable}
        title={hasCode ? `Skicka IR: ${def.irKey}` : `Lär in först (${def.irKey})`}
      >
        {busy === def.irKey ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
        <span className="text-[10px] leading-none">{def.label}</span>
      </Button>
    );
  };

  const buttonsByGroup = (group: IrButtonDef["group"]) =>
    IR_BUTTONS.filter((b) => b.group === group);

  return (
    <div className="space-y-4">
      {/* IR-status */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {irReachable ? (
              <Wifi className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500 flex-shrink-0" />
            )}
            <div className="text-xs min-w-0">
              <div className="font-medium truncate">
                Broadlink IR · {irHostLabel}
              </div>
              <div className="text-muted-foreground truncate">
                {irReachable
                  ? `${savedKeys.size} sparade kod(er) · Panasonic DP-UB154`
                  : irStatus?.error ?? "Inte ansluten — kör bryggan v44"}
              </div>
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button size="sm" variant="ghost" onClick={() => void refreshIr()} title="Uppdatera status">
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLearnOpen(true)}>
              <GraduationCap className="h-4 w-4 mr-1" />
              Lär in
            </Button>
          </div>
        </div>
        {!irReachable && (
          <div className="mt-2 flex gap-2 text-[11px] text-muted-foreground bg-amber-500/5 border border-amber-500/30 rounded p-2">
            <Info className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              Kontrollera att du kör <code>Formuler_alfa_status_v44.py</code> och att{" "}
              <code>pip install broadlink</code> är gjort. Broadlink-dosan på{" "}
              <code>192.168.86.23</code> ska vara online och på samma WiFi.
            </div>
          </div>
        )}
      </Card>

      {/* Power / Eject */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Power className="h-4 w-4" /> Power
        </div>
        <div className="grid grid-cols-2 gap-2">
          {buttonsByGroup("power").map(renderIrButton)}
        </div>
      </Card>

      {/* Transport */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Disc className="h-4 w-4" /> Spelar-kontroller
        </div>
        <div className="grid grid-cols-5 gap-2">
          {buttonsByGroup("transport").map(renderIrButton)}
        </div>
      </Card>

      {/* Navigation */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Menu className="h-4 w-4" /> Navigation
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div />
          {renderIrButton(IR_BUTTONS.find((b) => b.irKey === "bluray_up")!)}
          <div />
          {renderIrButton(IR_BUTTONS.find((b) => b.irKey === "bluray_left")!)}
          {renderIrButton(IR_BUTTONS.find((b) => b.irKey === "bluray_ok")!)}
          {renderIrButton(IR_BUTTONS.find((b) => b.irKey === "bluray_right")!)}
          <div />
          {renderIrButton(IR_BUTTONS.find((b) => b.irKey === "bluray_down")!)}
          <div />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {buttonsByGroup("menu").map(renderIrButton)}
        </div>
      </Card>

      {/* Marantz BD-input */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Label className="text-xs">Marantz BD-ingång + power</Label>
            <Select value={bdInputCode} onValueChange={saveInput}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue placeholder="Välj ingång…" />
              </SelectTrigger>
              <SelectContent>
                {inputs.map((i) => (
                  <SelectItem key={i.id} value={i.marantz_code}>
                    {i.label} ({i.marantz_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            onClick={handlePowerOnAvr}
            disabled={busy !== null || !bdInputCode}
            className="h-9 mt-5"
            variant="outline"
          >
            {busy === "avr_power" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4 mr-1" />
            )}
            AVR på + BD
          </Button>
        </div>
      </Card>

      {/* Lampor */}
      <Card className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            Lampor
            {lights.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {lights.length}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleLightsOff}
              disabled={busy !== null || lights.length === 0}
            >
              {busy === "lights_off" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Släck"}
            </Button>
            <Button
              size="sm"
              onClick={handleLightsOn}
              disabled={busy !== null || lights.length === 0}
            >
              {busy === "lights_on" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tänd"}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Intensitet</span>
            <span>{brightness}%</span>
          </div>
          <Slider
            value={[brightness]}
            min={1}
            max={100}
            step={1}
            onValueChange={(v) => handleBrightnessChange(v[0] ?? 70)}
          />
          <p className="text-[10px] text-muted-foreground">
            Ändringar skickas till lampor som redan är på. Tryck "Tänd" för att applicera på alla.
          </p>
        </div>
      </Card>

      {/* Scen-triggers */}
      <Card className="p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          Ljus-scener via trigger
        </div>
        <SceneTriggerRow
          label="Spela film"
          triggerKey="bluray_play"
          sceneId={playSceneId}
          scenes={scenes}
          busy={busy === "bluray_play_scene"}
          disabled={busy !== null}
          onSceneChange={(id) => {
            setPlaySceneId(id);
            localStorage.setItem(LS_PLAY_SCENE(householdCode), id);
          }}
          onFire={() => triggerScene("bluray_play_scene", playSceneId, "Spela film")}
        />
        <SceneTriggerRow
          label="Paus"
          triggerKey="bluray_pause"
          sceneId={pauseSceneId}
          scenes={scenes}
          busy={busy === "bluray_pause_scene"}
          disabled={busy !== null}
          onSceneChange={(id) => {
            setPauseSceneId(id);
            localStorage.setItem(LS_PAUSE_SCENE(householdCode), id);
          }}
          onFire={() => triggerScene("bluray_pause_scene", pauseSceneId, "Paus")}
        />
        <SceneTriggerRow
          label="Stopp"
          triggerKey="bluray_stop"
          sceneId={stopSceneId}
          scenes={scenes}
          busy={busy === "bluray_stop_scene"}
          disabled={busy !== null}
          onSceneChange={(id) => {
            setStopSceneId(id);
            localStorage.setItem(LS_STOP_SCENE(householdCode), id);
          }}
          onFire={() => triggerScene("bluray_stop_scene", stopSceneId, "Stopp")}
        />
      </Card>

      {/* Learn-dialog */}
      <Dialog open={learnOpen} onOpenChange={setLearnOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lär in IR-koder</DialogTitle>
            <DialogDescription>
              Välj knapp nedan, tryck "Starta inlärning", och tryck sedan motsvarande knapp på din
              Panasonic-fjärr riktad mot Broadlink-dosan. Den lyssnar i ca 25 sekunder.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-y-auto space-y-1 pr-1">
            {IR_BUTTONS.map((b) => {
              const has = savedKeys.has(b.irKey);
              const isTarget = learnTargetKey === b.irKey;
              return (
                <div
                  key={b.irKey}
                  className={`flex items-center gap-2 rounded border p-2 text-sm ${
                    isTarget ? "border-primary bg-primary/5" : "border-border/50"
                  }`}
                >
                  <b.icon className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{b.label}</div>
                    <code className="text-[10px] text-muted-foreground">{b.irKey}</code>
                  </div>
                  {has && (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  )}
                  <Button
                    size="sm"
                    variant={isTarget && learning ? "default" : "outline"}
                    disabled={learning}
                    onClick={() => {
                      setLearnTargetKey(b.irKey);
                      void handleLearn(b.irKey);
                    }}
                  >
                    {isTarget && learning ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Lyssnar…
                      </>
                    ) : has ? (
                      "Lär om"
                    ) : (
                      "Lär in"
                    )}
                  </Button>
                  {has && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={learning}
                      onClick={() => void handleForget(b.irKey)}
                      title="Ta bort sparad kod"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <p className="text-[11px] text-muted-foreground flex-1">
              Tips: håll fjärren ca 1–3 m från Broadlink-dosan och tryck en kort puls.
            </p>
            <Button variant="outline" onClick={() => setLearnOpen(false)} disabled={learning}>
              Stäng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SceneTriggerRow({
  label,
  triggerKey,
  sceneId,
  scenes,
  busy,
  disabled,
  onSceneChange,
  onFire,
}: {
  label: string;
  triggerKey: string;
  sceneId: string;
  scenes: Scene[];
  busy: boolean;
  disabled: boolean;
  onSceneChange: (id: string) => void;
  onFire: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
      <div>
        <Label className="text-xs">
          {label} <code className="ml-1 text-[10px] text-muted-foreground">{triggerKey}</code>
        </Label>
        <Select value={sceneId} onValueChange={onSceneChange}>
          <SelectTrigger className="mt-1 h-9">
            <SelectValue placeholder="Välj scen…" />
          </SelectTrigger>
          <SelectContent>
            {scenes.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.scene_number}. {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={onFire} disabled={disabled || !sceneId} className="h-9">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kör"}
      </Button>
    </div>
  );
}
