import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendMarantz } from "@/lib/projector";
import { fetchInputs, fetchScenes, type MarantzInput, type Scene } from "@/lib/scenes";
import { toast } from "sonner";

interface Props {
  householdCode: string;
}

const LS_INPUT_KEY = (h: string) => `bluray_input_code_${h}`;
const LS_PLAY_SCENE = (h: string) => `bluray_play_scene_${h}`;
const LS_PAUSE_SCENE = (h: string) => `bluray_pause_scene_${h}`;
const LS_STOP_SCENE = (h: string) => `bluray_stop_scene_${h}`;

const TRIGGER_ENDPOINT = "/api/public/trigger";

async function fireTrigger(householdCode: string, key: string) {
  try {
    const res = await fetch(TRIGGER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household_code: householdCode, trigger_key: key }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export function BlurayRemote({ householdCode }: Props) {
  const [inputs, setInputs] = useState<MarantzInput[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [bdInputCode, setBdInputCode] = useState<string>("");
  const [playSceneId, setPlaySceneId] = useState<string>("");
  const [pauseSceneId, setPauseSceneId] = useState<string>("");
  const [stopSceneId, setStopSceneId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchInputs(householdCode), fetchScenes(householdCode)])
      .then(([i, s]) => {
        setInputs(i);
        setScenes(s);
        const savedInput = localStorage.getItem(LS_INPUT_KEY(householdCode));
        if (savedInput) setBdInputCode(savedInput);
        else {
          const guess = i.find((x) => /bd|blu|disc/i.test(x.label) || /BD/i.test(x.marantz_code));
          if (guess) setBdInputCode(guess.marantz_code);
        }
        setPlaySceneId(localStorage.getItem(LS_PLAY_SCENE(householdCode)) ?? "");
        setPauseSceneId(localStorage.getItem(LS_PAUSE_SCENE(householdCode)) ?? "");
        setStopSceneId(localStorage.getItem(LS_STOP_SCENE(householdCode)) ?? "");
      })
      .catch((e) => toast.error("Kunde inte ladda data", { description: String(e) }));
  }, [householdCode]);

  const saveInput = (code: string) => {
    setBdInputCode(code);
    localStorage.setItem(LS_INPUT_KEY(householdCode), code);
  };

  const handlePowerOn = async () => {
    if (!bdInputCode) {
      toast.error("Välj BD-ingång på Marantz först");
      return;
    }
    setBusy("power");
    try {
      // Power on Marantz, then switch input → "One Touch Play" via CEC kan väcka Panasonicen
      let res = await sendMarantz("PWON");
      if (!res.ok) {
        toast.error("Marantz PWON misslyckades", { description: res.error || `Status ${res.status}` });
        return;
      }
      // Litet andrum innan input-skifte
      await new Promise((r) => setTimeout(r, 500));
      res = await sendMarantz(`SI${bdInputCode}`);
      if (!res.ok) {
        toast.error("Input-byte misslyckades", { description: res.error || `Status ${res.status}` });
        return;
      }
      toast.success("Marantz på + BD-ingång vald", {
        description: "CEC kan väcka spelaren via 'One Touch Play'",
      });
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
      toast.success(`${label} → ${scene?.name ?? "scen"}`, {
        description: `trigger: ${key}`,
      });
    } catch (e) {
      toast.error("Trigger misslyckades", { description: String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 border-amber-500/30 bg-amber-500/5">
        <div className="flex gap-2 text-xs">
          <Info className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-300">
              Direkt fjärrstyrning av Panasonic DP-UB154 kräver IR-dosa (kommande Broadlink-stöd).
            </p>
            <p className="text-muted-foreground">
              Just nu styr vi via Marantz CEC: Power-knappen väcker Marantz + byter till BD-ingången, vilket
              ofta triggar "One Touch Play" på spelaren via HDMI-CEC. Play/Pause-knappar nedan är inaktiva
              tills IR-dosan installeras — koppla scenerna till respektive trigger för ljus-effekter.
            </p>
          </div>
        </div>
      </Card>

      {/* Power + Input */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <Label className="text-xs">Marantz BD-ingång</Label>
            <Select value={bdInputCode} onValueChange={saveInput}>
              <SelectTrigger className="mt-1">
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
            size="lg"
            onClick={handlePowerOn}
            disabled={busy !== null || !bdInputCode}
            className="h-16 w-16 flex-shrink-0"
          >
            {busy === "power" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Power className="h-6 w-6" />}
          </Button>
        </div>
      </Card>

      {/* Scen-triggers */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-medium">Ljus-scener via trigger</h3>
        </div>
        <SceneTriggerRow
          label="Spela film"
          triggerKey="bluray_play"
          sceneId={playSceneId}
          scenes={scenes}
          busy={busy === "bluray_play"}
          disabled={busy !== null}
          onSceneChange={(id) => {
            setPlaySceneId(id);
            localStorage.setItem(LS_PLAY_SCENE(householdCode), id);
          }}
          onFire={() => triggerScene("bluray_play", playSceneId, "Spela film")}
        />
        <SceneTriggerRow
          label="Paus"
          triggerKey="bluray_pause"
          sceneId={pauseSceneId}
          scenes={scenes}
          busy={busy === "bluray_pause"}
          disabled={busy !== null}
          onSceneChange={(id) => {
            setPauseSceneId(id);
            localStorage.setItem(LS_PAUSE_SCENE(householdCode), id);
          }}
          onFire={() => triggerScene("bluray_pause", pauseSceneId, "Paus")}
        />
        <SceneTriggerRow
          label="Stopp"
          triggerKey="bluray_stop"
          sceneId={stopSceneId}
          scenes={scenes}
          busy={busy === "bluray_stop"}
          disabled={busy !== null}
          onSceneChange={(id) => {
            setStopSceneId(id);
            localStorage.setItem(LS_STOP_SCENE(householdCode), id);
          }}
          onFire={() => triggerScene("bluray_stop", stopSceneId, "Stopp")}
        />
      </Card>

      {/* IR-disabled controls (UI redo för v34) */}
      <Card className="p-4 space-y-3 opacity-60">
        <div className="flex items-center gap-2">
          <Disc className="h-4 w-4" />
          <h3 className="text-sm font-medium">Spelar-kontroller (kräver IR-dosa)</h3>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <Button variant="secondary" size="lg" className="h-14" disabled title="Kräver IR-dosa">
            <SkipBack className="h-5 w-5" />
          </Button>
          <Button size="lg" className="h-14" disabled title="Kräver IR-dosa">
            <Play className="h-5 w-5" />
          </Button>
          <Button variant="secondary" size="lg" className="h-14" disabled title="Kräver IR-dosa">
            <Pause className="h-5 w-5" />
          </Button>
          <Button variant="secondary" size="lg" className="h-14" disabled title="Kräver IR-dosa">
            <Square className="h-5 w-5" />
          </Button>
          <Button variant="secondary" size="lg" className="h-14" disabled title="Kräver IR-dosa">
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" size="sm" disabled title="Kräver IR-dosa">
            <Menu className="h-4 w-4 mr-1" /> Top Menu
          </Button>
          <Button variant="ghost" size="sm" disabled title="Kräver IR-dosa">
            <Menu className="h-4 w-4 mr-1" /> Pop-up Menu
          </Button>
        </div>
      </Card>
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
          <SelectTrigger className="mt-1">
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
