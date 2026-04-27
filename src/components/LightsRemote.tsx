import { useEffect, useMemo, useRef, useState } from "react";
import { Power, Lightbulb, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchScenes,
  fetchLights,
  fetchSceneLights,
  type Scene,
  type Light,
  type SceneLight,
} from "@/lib/scenes";
import {
  sendScene,
  type SceneLightCommand,
} from "@/lib/projector";
import { toast } from "sonner";

interface Props {
  householdCode: string;
}

const LS_ON_KEY = (h: string) => `lights_remote_on_scene_${h}`;
const LS_OFF_KEY = (h: string) => `lights_remote_off_scene_${h}`;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export function LightsRemote({ householdCode }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [lights, setLights] = useState<Light[]>([]);
  const [onSceneId, setOnSceneId] = useState<string>("");
  const [offSceneId, setOffSceneId] = useState<string>("");
  const [onSceneLights, setOnSceneLights] = useState<SceneLight[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"on" | "off" | null>(null);
  const [offset, setOffset] = useState(0); // -50..+50

  // Debounce timer för live-skickning under draggning
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, l] = await Promise.all([
          fetchScenes(householdCode),
          fetchLights(householdCode),
        ]);
        if (!alive) return;
        setScenes(s);
        setLights(l);
        const savedOn = localStorage.getItem(LS_ON_KEY(householdCode)) ?? "";
        const savedOff = localStorage.getItem(LS_OFF_KEY(householdCode)) ?? "";
        if (savedOn && s.some((x) => x.id === savedOn)) setOnSceneId(savedOn);
        if (savedOff && s.some((x) => x.id === savedOff)) setOffSceneId(savedOff);
      } catch (e) {
        toast.error("Kunde inte ladda scener/lampor", {
          description: String(e),
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [householdCode]);

  // Ladda scene_lights för den valda ON-scenen (default-värdena vi justerar relativt)
  useEffect(() => {
    if (!onSceneId) {
      setOnSceneLights([]);
      return;
    }
    fetchSceneLights(onSceneId)
      .then(setOnSceneLights)
      .catch((e) =>
        toast.error("Kunde inte ladda ljusinställningar för ON-scenen", {
          description: String(e),
        }),
      );
  }, [onSceneId]);

  const lightsById = useMemo(() => {
    const m = new Map<string, Light>();
    for (const l of lights) m.set(l.id, l);
    return m;
  }, [lights]);

  const onScene = scenes.find((s) => s.id === onSceneId) ?? null;
  const offScene = scenes.find((s) => s.id === offSceneId) ?? null;

  /** Bygg scene_lights-payload med offset applicerat på brightness.
   * Matchar logiken i SceneGrid "Kör": brightness=0 tolkas som släck. */
  const buildOnLightsPayload = (offsetPct: number): SceneLightCommand[] => {
    const out: SceneLightCommand[] = [];
    for (const sl of onSceneLights) {
      if (!sl.in_scene) continue;
      const light = lightsById.get(sl.light_id);
      if (!light) continue;
      // Default brightness=0 betyder "släck" i scenen
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
        // Applicera offset, clamp 10..100
        const adjusted = clamp(Math.round(baseBrightness + offsetPct), 10, 100);
        cmd.brightness = adjusted;
        if ((light.light_type === "cct" || light.light_type === "rgbcct") && sl.kelvin !== null)
          cmd.kelvin = sl.kelvin;
        if ((light.light_type === "rgb" || light.light_type === "rgbcct") && sl.color_hex)
          cmd.color = sl.color_hex;
      }
      out.push(cmd);
    }
    return out;
  };

  const handleOn = async () => {
    if (!onScene) {
      toast.error("Välj en ON-scen först");
      return;
    }
    setBusy("on");
    try {
      const payload = buildOnLightsPayload(offset);
      const results = await sendScene({
        scenePayload: onScene.scene_payload ?? String(onScene.scene_number),
        sceneLights: payload,
        // Endast ljus — hoppa över projektor & marantz
      });
      const failed = results.find((r) => !r.ok);
      if (failed) {
        toast.error("Kunde inte tända alla lampor", {
          description: failed.error || `Status ${failed.status}`,
        });
      } else {
        toast.success(`ON: ${onScene.name}`, {
          description:
            offset === 0
              ? `${payload.length} lampor`
              : `${payload.length} lampor · ${offset > 0 ? "+" : ""}${offset}%`,
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleOff = async () => {
    if (!offScene) {
      toast.error("Välj en OFF-scen först");
      return;
    }
    setBusy("off");
    try {
      // För OFF-scenen kör vi scene_lights direkt från databasen utan offset.
      const offSceneLights = await fetchSceneLights(offScene.id);
      const payload: SceneLightCommand[] = [];
      for (const sl of offSceneLights) {
        if (!sl.in_scene) continue;
        const light = lightsById.get(sl.light_id);
        if (!light) continue;
        const treatAsOff = sl.on_state && (sl.brightness ?? 0) === 0;
        const cmd: SceneLightCommand = {
          device_id: light.tuya_device_id,
          name: light.name,
          type: light.light_type,
          on: treatAsOff ? false : sl.on_state,
          delay_ms: sl.delay_ms ?? 0,
          fade_ms: sl.fade_ms ?? 0,
        };
        if (!treatAsOff && sl.on_state) {
          if (sl.brightness !== null) cmd.brightness = sl.brightness;
          if ((light.light_type === "cct" || light.light_type === "rgbcct") && sl.kelvin !== null)
            cmd.kelvin = sl.kelvin;
          if ((light.light_type === "rgb" || light.light_type === "rgbcct") && sl.color_hex)
            cmd.color = sl.color_hex;
        }
        payload.push(cmd);
      }
      const results = await sendScene({
        scenePayload: offScene.scene_payload ?? String(offScene.scene_number),
        sceneLights: payload,
      });
      const failed = results.find((r) => !r.ok);
      if (failed) {
        toast.error("Kunde inte släcka alla lampor", {
          description: failed.error || `Status ${failed.status}`,
        });
      } else {
        toast.success(`OFF: ${offScene.name}`);
      }
    } catch (e) {
      toast.error("Fel vid släckning", { description: String(e) });
    } finally {
      setBusy(null);
    }
  };

  /** Live-uppdatera lamporna när man drar i offset-reglaget. */
  const pushLiveOffset = (newOffset: number) => {
    if (!onScene) return;
    if (onSceneLights.length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const payload = buildOnLightsPayload(newOffset);
      if (payload.length === 0) return;
      // Skicka enbart scene_lights (ingen scene_payload-trigger till projektorn)
      sendScene({
        scenePayload: onScene.scene_payload ?? String(onScene.scene_number),
        sceneLights: payload,
      }).catch(() => {
        /* tyst — visas inte under dragning */
      });
    }, 200);
  };

  const handleOffsetChange = (v: number[]) => {
    const next = v[0] ?? 0;
    setOffset(next);
    pushLiveOffset(next);
  };

  const saveOnScene = (id: string) => {
    setOnSceneId(id);
    localStorage.setItem(LS_ON_KEY(householdCode), id);
  };
  const saveOffScene = (id: string) => {
    setOffSceneId(id);
    localStorage.setItem(LS_OFF_KEY(householdCode), id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Laddar scener…
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Du har inga scener ännu. Skapa scener först under fliken Scenes.
      </Card>
    );
  }

  const onLightCount = onSceneLights.filter((sl) => sl.in_scene).length;

  return (
    <div className="space-y-5">
      {/* Scen-väljare */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">ON-scen (tänd grupp)</Label>
          <Select value={onSceneId} onValueChange={saveOnScene}>
            <SelectTrigger>
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
          {onScene && (
            <p className="text-[10px] text-muted-foreground">
              {onLightCount} lampa{onLightCount === 1 ? "" : "or"} i scenen
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">OFF-scen (släck grupp)</Label>
          <Select value={offSceneId} onValueChange={saveOffScene}>
            <SelectTrigger>
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
      </div>

      {/* ON / OFF-knappar */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          size="lg"
          variant="secondary"
          onClick={handleOff}
          disabled={busy !== null || !offScene}
          className="h-24 flex-col gap-1.5 border border-destructive/40 hover:bg-destructive/15 hover:text-destructive"
        >
          {busy === "off" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Power className="h-6 w-6" />
          )}
          <span className="text-sm font-semibold">OFF</span>
        </Button>
        <Button
          size="lg"
          onClick={handleOn}
          disabled={busy !== null || !onScene}
          className="h-24 flex-col gap-1.5 bg-amber-500 text-amber-950 hover:bg-amber-400"
        >
          {busy === "on" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Lightbulb className="h-6 w-6" />
          )}
          <span className="text-sm font-semibold">ON</span>
        </Button>
      </div>

      {/* Offset-reglage */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Intensitet (relativ)</div>
            <p className="text-[10px] text-muted-foreground">
              Justerar hela ON-gruppen relativt scenens default. Skickas live.
            </p>
          </div>
          <div
            className={`text-lg font-mono tabular-nums ${
              offset === 0
                ? "text-muted-foreground"
                : offset > 0
                  ? "text-amber-400"
                  : "text-blue-400"
            }`}
          >
            {offset > 0 ? "+" : ""}
            {offset}%
          </div>
        </div>
        <Slider
          min={-90}
          max={90}
          step={5}
          value={[offset]}
          onValueChange={handleOffsetChange}
          disabled={!onScene || onLightCount === 0}
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>−90%</span>
          <button
            type="button"
            onClick={() => handleOffsetChange([0])}
            className="hover:text-foreground transition-colors"
          >
            återställ till 0
          </button>
          <span>+50%</span>
        </div>
      </Card>
    </div>
  );
}
