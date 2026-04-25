import { useEffect, useState } from "react";
import { Lightbulb, Play, Pencil, Loader2, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SceneEditorDialog } from "@/components/SceneEditorDialog";
import { SceneTriggersDialog } from "@/components/SceneTriggersDialog";
import { fetchTriggers, type SceneTrigger } from "@/lib/triggers";
import { toast } from "sonner";
import { sendScene, type SceneLightCommand } from "@/lib/projector";
import {
  fetchScenes,
  fetchLights,
  fetchSceneLights,
  updateScene,
  type Scene,
} from "@/lib/scenes";

interface Props {
  householdCode: string;
  /** Scen-id som matchar nuvarande projektor-status, eller null. */
  activeSceneId?: string | null;
}

export function SceneGrid({ householdCode, activeSceneId }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Scene | null>(null);
  const [tuningTriggers, setTuningTriggers] = useState<Scene | null>(null);
  const [triggers, setTriggers] = useState<SceneTrigger[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchScenes(householdCode), fetchTriggers(householdCode)])
      .then(([s, t]) => {
        if (!cancelled) {
          setScenes(s);
          setTriggers(t);
        }
      })
      .catch((e) => toast.error("Kunde inte ladda scener", { description: String(e) }));
    return () => {
      cancelled = true;
    };
  }, [householdCode]);

  const refresh = async () => {
    const [s, t] = await Promise.all([fetchScenes(householdCode), fetchTriggers(householdCode)]);
    setScenes(s);
    setTriggers(t);
  };

  const runScene = async (s: Scene) => {
    setBusy(s.id);
    // Hämta per-lampa-inställningar för denna scen
    let sceneLights: SceneLightCommand[] | undefined;
    try {
      const [allLights, sceneRows] = await Promise.all([
        fetchLights(householdCode),
        fetchSceneLights(s.id),
      ]);
      const lightById = new Map(allLights.map((l) => [l.id, l]));
      sceneLights = sceneRows
        .filter((r) => r.in_scene)
        .map((r) => {
          const l = lightById.get(r.light_id);
          if (!l) return null;
          // Tolka brightness=0 som "släck" istället för "tänd på 0%"
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
            if ((l.light_type === "cct" || l.light_type === "rgbcct") && r.kelvin !== null)
              cmd.kelvin = r.kelvin;
            if ((l.light_type === "rgb" || l.light_type === "rgbcct") && r.color_hex)
              cmd.color = r.color_hex;
          }
          return cmd;
        })
        .filter((c): c is SceneLightCommand => c !== null);
      if (sceneLights.length === 0) sceneLights = undefined;
    } catch (e) {
      console.warn("Kunde inte hämta scene-lights", e);
    }

    const results = await sendScene({
      scenePayload: s.scene_payload || String(s.scene_number),
      projectorSettings: s.projector_settings,
      marantzPower: s.marantz_power,
      marantzInput: s.marantz_input,
      marantzVolume: s.marantz_volume,
      lightsOn: s.lights_on,
      sceneLights,
      projectorDelayMs: s.projector_delay_ms,
      marantzDelayMs: s.marantz_delay_ms,
      lightsDelayMs: s.lights_delay_ms,
    });
    setBusy(null);
    const failed = results.find((r) => !r.ok);
    if (failed) {
      toast.error(`Scen "${s.name}" delvis misslyckad`, {
        description: failed.error || `Status ${failed.status}`,
      });
    } else {
      toast.success(`Scen "${s.name}" aktiverad`, {
        description: `${results.length} kommandon skickade`,
      });
    }
  };

  const toggleEnabled = async (s: Scene, val: boolean) => {
    await updateScene(s.id, { enabled: val });
    setScenes((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: val } : x)));
  };

  return (
    <>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {scenes.map((s) => {
          const active = activeSceneId === s.id;
          const busyNow = busy === s.id;
          return (
            <Card
              key={s.id}
              className={`group relative p-3 transition-all ${
                active
                  ? "border-primary shadow-[var(--cinema-glow)]"
                  : s.enabled
                    ? "hover:border-primary/60"
                    : "opacity-50"
              }`}
            >
              <div className="flex items-start justify-between gap-1 mb-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Scene {s.scene_number}
                </div>
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(v) => toggleEnabled(s, v)}
                  className="scale-75 -my-1"
                  aria-label="Aktivera scen"
                />
              </div>
              <h3 className="text-sm font-semibold truncate mb-2" title={s.name}>
                {s.name}
              </h3>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-3 min-h-[14px]">
                {s.lights_on === true && <Lightbulb className="h-3 w-3 text-amber-400" />}
                {s.marantz_input && <span className="truncate">{s.marantz_input}</span>}
                {triggers.some((t) => t.scene_id === s.id && t.enabled) && (
                  <Badge
                    variant="secondary"
                    className="ml-auto h-4 px-1 text-[9px] gap-0.5"
                    title="Den här scenen har automatiska triggers"
                  >
                    <Zap className="h-2.5 w-2.5 text-amber-400" />
                    {triggers.filter((t) => t.scene_id === s.id && t.enabled).length}
                  </Badge>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  disabled={!s.enabled || busyNow}
                  onClick={() => runScene(s)}
                >
                  {busyNow ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1" />
                      Kör
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setEditing(s)}
                  title="Redigera scen (bild · ljud · ljus · timing)"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setTuningTriggers(s)}
                  title="Automatiska triggers för denna scen"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Unified scene editor (Bild · Ljud · Ljus · Timing) */}
      {editing && (
        <SceneEditorDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          householdCode={householdCode}
          scene={editing}
          onSaved={refresh}
        />
      )}

      {/* Triggers dialog */}
      {tuningTriggers && (
        <SceneTriggersDialog
          open={!!tuningTriggers}
          onOpenChange={(o) => {
            if (!o) {
              setTuningTriggers(null);
              refresh();
            }
          }}
          householdCode={householdCode}
          scene={tuningTriggers}
        />
      )}
    </>
  );
}
