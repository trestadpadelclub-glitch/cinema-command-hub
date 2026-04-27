import { useEffect, useState } from "react";
import { Loader2, Film, Tv, Play, Power, Sparkles, Music } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  sendFormulerCommand,
  sendMarantz,
  sendLights,
  type CommandResult,
} from "@/lib/projector";
import { fetchScenes, fetchLights, fetchSceneLights, type Scene } from "@/lib/scenes";
import { sendScene, type SceneLightCommand } from "@/lib/projector";
import { toast } from "sonner";

/**
 * Custom Remote — macro-knappar som triggar flera kommandon i sekvens.
 * Strukturen är förberedd för att senare ladda makron från databasen
 * (tabell t.ex. `custom_macros`) per household. Just nu är listan statisk.
 */

type MacroStep =
  | { type: "formuler"; keycode: string; delay_ms?: number }
  | { type: "marantz"; value: string; delay_ms?: number }
  | { type: "lights"; value: "on" | "off" | "toggle"; delay_ms?: number }
  | { type: "scene"; sceneNumber: number; delay_ms?: number }
  | { type: "wait"; delay_ms: number };

interface Macro {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // tailwind classes
  steps: MacroStep[];
}

const STATIC_MACROS: Macro[] = [
  {
    id: "movie-mode",
    label: "Movie Mode",
    description: "Scen 1 + släck ljus",
    icon: Film,
    accent: "from-amber-500/30 to-rose-500/20",
    steps: [
      { type: "scene", sceneNumber: 1 },
      { type: "lights", value: "off", delay_ms: 800 },
    ],
  },
  {
    id: "watch-tv",
    label: "Watch TV",
    description: "Formuler Home + Marantz CBL/SAT",
    icon: Tv,
    accent: "from-sky-500/30 to-indigo-500/20",
    steps: [
      { type: "formuler", keycode: "KEYCODE_HOME" },
      { type: "marantz", value: "SICBL/SAT", delay_ms: 400 },
    ],
  },
  {
    id: "start-netflix",
    label: "Start Netflix",
    description: "Chromecast input + scen 2",
    icon: Play,
    accent: "from-red-500/30 to-rose-600/20",
    steps: [
      { type: "marantz", value: "SIMPLAY" },
      { type: "scene", sceneNumber: 2, delay_ms: 500 },
    ],
  },
  {
    id: "music-mode",
    label: "Music Mode",
    description: "Marantz NET + stereo",
    icon: Music,
    accent: "from-emerald-500/30 to-teal-500/20",
    steps: [
      { type: "marantz", value: "SINET" },
      { type: "marantz", value: "MSSTEREO", delay_ms: 300 },
    ],
  },
  {
    id: "wow-scene",
    label: "Demo / Wow",
    description: "Scen 3 demo",
    icon: Sparkles,
    accent: "from-fuchsia-500/30 to-purple-600/20",
    steps: [{ type: "scene", sceneNumber: 3 }],
  },
  {
    id: "all-off",
    label: "All Off",
    description: "Stäng av allt",
    icon: Power,
    accent: "from-zinc-500/30 to-zinc-700/20",
    steps: [
      { type: "marantz", value: "PWSTANDBY" },
      { type: "lights", value: "off", delay_ms: 200 },
    ],
  },
];

interface Props {
  householdCode: string;
}

export function CustomRemote({ householdCode }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchScenes(householdCode).then(setScenes).catch(() => {});
  }, [householdCode]);

  const runScene = async (sceneNumber: number): Promise<CommandResult[]> => {
    const s = scenes.find((x) => x.scene_number === sceneNumber);
    if (!s) {
      toast.error(`Scen ${sceneNumber} hittades inte`);
      return [];
    }
    const [allLights, sceneRows] = await Promise.all([
      fetchLights(householdCode),
      fetchSceneLights(s.id),
    ]);
    const lightById = new Map(allLights.map((l) => [l.id, l]));
    const sceneLights: SceneLightCommand[] = sceneRows
      .filter((r) => r.in_scene)
      .map((r) => {
        const l = lightById.get(r.light_id);
        if (!l) return null;
        const treatAsOff = r.on_state && r.brightness === 0;
        const cmd: SceneLightCommand = {
          device_id: l.tuya_device_id,
          name: l.name,
          type: l.light_type,
          on: treatAsOff ? false : r.on_state,
          delay_ms: r.delay_ms ?? 0,
          fade_ms: r.fade_ms ?? 0,
        };
        if (!treatAsOff) {
          if (r.brightness !== null) cmd.brightness = r.brightness;
          if (r.kelvin !== null) cmd.kelvin = r.kelvin;
          if (r.color_hex !== null) cmd.color = r.color_hex;
        }
        return cmd;
      })
      .filter((x): x is SceneLightCommand => x !== null);

    return sendScene({
      scenePayload: s.scene_payload ?? String(s.scene_number),
      projectorSettings: s.projector_settings,
      marantzPower: s.marantz_power ?? undefined,
      marantzInput: s.marantz_input ?? undefined,
      marantzVolume: s.marantz_volume ?? undefined,
      lightsOn: s.lights_on,
      sceneLights,
      projectorDelayMs: s.projector_delay_ms,
      marantzDelayMs: s.marantz_delay_ms,
      lightsDelayMs: s.lights_delay_ms,
    });
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const runMacro = async (m: Macro) => {
    setBusy(m.id);
    try {
      for (const step of m.steps) {
        if (step.delay_ms && step.delay_ms > 0) await sleep(step.delay_ms);
        if (step.type === "wait") continue;
        if (step.type === "formuler") {
          await sendFormulerCommand(step.keycode);
        } else if (step.type === "marantz") {
          await sendMarantz(step.value);
        } else if (step.type === "lights") {
          await sendLights(step.value);
        } else if (step.type === "scene") {
          await runScene(step.sceneNumber);
        }
      }
      toast.success(`${m.label} kört`);
    } catch (e) {
      toast.error(`${m.label} misslyckades`, { description: String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {STATIC_MACROS.map((m) => {
          const Icon = m.icon;
          const isBusy = busy === m.id;
          return (
            <Card
              key={m.id}
              className={`relative overflow-hidden bg-gradient-to-br ${m.accent} border-border/60`}
            >
              <Button
                variant="ghost"
                onClick={() => runMacro(m)}
                disabled={busy !== null}
                className="w-full h-32 flex-col gap-2 hover:bg-background/20"
              >
                {isBusy ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : (
                  <Icon className="h-7 w-7" />
                )}
                <div className="text-sm font-semibold">{m.label}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.description}
                </div>
              </Button>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Statiska makron just nu — kan kopplas till en databastabell senare för
        anpassningsbara knappar per household.
      </p>
    </div>
  );
}
