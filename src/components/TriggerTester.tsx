import { useEffect, useState } from "react";
import { Zap, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TRIGGER_CATALOG, fetchTriggers, type SceneTrigger } from "@/lib/triggers";
import { fetchScenes, type Scene } from "@/lib/scenes";
import { sendScene, type SceneLightCommand } from "@/lib/projector";
import { fetchLights, fetchSceneLights } from "@/lib/scenes";

interface Props {
  householdCode: string;
}

/**
 * Manuell trigger-test-panel. Listar alla trigger-mappningar och låter dig
 * simulera triggern lokalt — perfekt innan Python-bryggan är inkopplad.
 */
export function TriggerTester({ householdCode }: Props) {
  const [triggers, setTriggers] = useState<SceneTrigger[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTriggers(householdCode), fetchScenes(householdCode)])
      .then(([t, s]) => {
        if (!cancelled) {
          setTriggers(t);
          setScenes(s);
        }
      })
      .catch((e) =>
        toast.error("Kunde inte ladda triggers", { description: String(e) }),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [householdCode]);

  const sceneById = new Map(scenes.map((s) => [s.id, s]));

  const fire = async (trigger: SceneTrigger) => {
    const scene = sceneById.get(trigger.scene_id);
    if (!scene) {
      toast.error("Scenen hittades inte");
      return;
    }
    setBusy(trigger.id);

    // Kör scenen identiskt med "Kör"-knappen i SceneGrid — ignorera
    // run_projector/run_marantz/run_lights-flaggor så att Testa beter sig
    // exakt som ett manuellt klick på Kör.
    let sceneLights: SceneLightCommand[] | undefined;
    try {
      const [allLights, sceneRows] = await Promise.all([
        fetchLights(householdCode),
        fetchSceneLights(scene.id),
      ]);
      const lightById = new Map(allLights.map((l) => [l.id, l]));
      sceneLights = sceneRows
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
      scenePayload: scene.scene_payload || String(scene.scene_number),
      projectorSettings: scene.projector_settings,
      marantzPower: scene.marantz_power,
      marantzInput: scene.marantz_input,
      marantzVolume: scene.marantz_volume,
      lightsOn: scene.lights_on,
      sceneLights,
    });
    setBusy(null);
    const failed = results.find((r) => !r.ok);
    if (failed) {
      toast.error(`Trigger körde delvis fel`, {
        description: failed.error || `Status ${failed.status}`,
      });
    } else {
      toast.success(`Trigger ${trigger.trigger_key} → ${scene.name}`, {
        description: `${results.length} kommandon skickade`,
      });
    }
  };

  const triggerByKey = new Map(triggers.map((t) => [t.trigger_key, t]));

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Trigger-tester</h3>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {triggers.filter((t) => t.enabled).length} aktiva
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Simulera triggers manuellt. Bryggan POST:ar samma körning till{" "}
        <code className="text-[10px] bg-muted px-1 rounded">/api/public/trigger</code>.
      </p>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
      ) : (
        <div className="grid gap-1.5">
          {TRIGGER_CATALOG.map((entry) => {
            const trig = triggerByKey.get(entry.key);
            const scene = trig ? sceneById.get(trig.scene_id) : undefined;
            const mapped = !!trig && trig.enabled;
            return (
              <div
                key={entry.key}
                className={`flex items-center justify-between gap-2 rounded-md border p-2 text-xs ${
                  mapped ? "" : "opacity-60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{entry.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {mapped && scene ? `→ ${scene.name}` : "Ingen scen mappad"}
                  </div>
                </div>
                {mapped ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={busy === trig!.id}
                    onClick={() => fire(trig!)}
                  >
                    {busy === trig!.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Zap className="h-3 w-3 mr-1" />
                        Testa
                      </>
                    )}
                  </Button>
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
