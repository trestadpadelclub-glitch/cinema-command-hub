import { useEffect, useMemo, useRef, useState } from "react";
import { Power, Lightbulb, Loader2, Wifi, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLightsStatus } from "@/hooks/useLightsStatus";
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
  sendSceneLights,
  type SceneLightCommand,
  type LightStatus,
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
  const [lightBusy, setLightBusy] = useState<string | null>(null);
  const [manualLevels, setManualLevels] = useState<Record<string, number>>({});
  const [manualColors, setManualColors] = useState<Record<string, string>>({});
  const lightDeviceIds = useMemo(() => lights.map((l) => l.tuya_device_id).filter(Boolean), [lights]);

  // Realtidsstatus från bryggan (v33). Pollar var 5s.
  const { lights: lightStatus, reachable: statusReachable, refetch: refetchLightsStatus } = useLightsStatus({
    enabled: true,
    intervalSeconds: 5,
    deviceIds: lightDeviceIds,
  });

  // Debounce timer för live-skickning under draggning
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lightDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  const buildSingleLightCommand = (
    light: Light,
    st: LightStatus | undefined,
    on: boolean,
    brightness = manualLevels[light.id] ?? st?.brightness ?? 80,
    colorOverride?: string,
  ): SceneLightCommand => {
    const cmd: SceneLightCommand = {
      device_id: light.tuya_device_id,
      name: light.name,
      type: light.light_type,
      on,
    };
    if (on) {
      cmd.brightness = clamp(Math.round(brightness), 1, 100);
      if ((light.light_type === "cct" || light.light_type === "rgbcct") && typeof st?.kelvin === "number") {
        cmd.kelvin = st.kelvin;
      }
      if (light.light_type === "rgb" || light.light_type === "rgbcct") {
        const color = colorOverride ?? manualColors[light.id] ?? st?.color_hex;
        if (color) cmd.color = color;
      }
    }
    return cmd;
  };

  const sendSingleLight = async (
    light: Light,
    st: LightStatus | undefined,
    on: boolean,
    brightness?: number,
    showToast = true,
    colorOverride?: string,
  ) => {
    setLightBusy(light.id);
    const res = await sendSceneLights([buildSingleLightCommand(light, st, on, brightness, colorOverride)]);
    setLightBusy(null);
    if (!res.ok) {
      toast.error(`Kunde inte styra ${light.name}`, {
        description: res.error || `Status ${res.status}`,
      });
      return;
    }
    if (showToast) toast.success(`${light.name}: ${on ? "ON" : "OFF"}`);
    setTimeout(() => refetchLightsStatus().catch(() => {}), 450);
  };

  const handleLightLevel = (light: Light, st: LightStatus | undefined, value: number) => {
    const level = clamp(Math.round(value), 1, 100);
    setManualLevels((prev) => ({ ...prev, [light.id]: level }));
    if (lightDebounceRef.current[light.id]) clearTimeout(lightDebounceRef.current[light.id]);
    lightDebounceRef.current[light.id] = setTimeout(() => {
      void sendSingleLight(light, st, true, level, false);
    }, 220);
  };

  const handleLightColor = (light: Light, st: LightStatus | undefined, hex: string) => {
    setManualColors((prev) => ({ ...prev, [light.id]: hex }));
    const key = `${light.id}__color`;
    if (lightDebounceRef.current[key]) clearTimeout(lightDebounceRef.current[key]);
    lightDebounceRef.current[key] = setTimeout(() => {
      const level = manualLevels[light.id] ?? st?.brightness ?? 80;
      void sendSingleLight(light, st, true, level, false, hex);
    }, 220);
  };

  useEffect(() => {
    return () => {
      Object.values(lightDebounceRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

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
          <span>+90%</span>
        </div>
      </Card>

      {/* Live-status per lampa (v33) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Aktuell status</h3>
            {statusReachable === false ? (
              <Badge variant="outline" className="text-[10px] gap-1">
                <WifiOff className="h-3 w-3" /> v33 krävs
              </Badge>
            ) : statusReachable ? (
              <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/50 text-emerald-400">
                <Wifi className="h-3 w-3" /> live
              </Badge>
            ) : null}
          </div>
          <span className="text-[10px] text-muted-foreground">{lights.length} konfigurerade</span>
        </div>

        {statusReachable === false && (
          <p className="text-[11px] text-muted-foreground">
            Bryggan svarar inte på <code>/api/lights/status</code>. Uppdatera till Python v33 för
            statusfeedback.
          </p>
        )}

        <div className="grid gap-2">
          {lights.map((light) => {
            const st = lightStatus.find((s) => s.device_id === light.tuya_device_id);
            const isOn = st?.on === true;
            const level = manualLevels[light.id] ?? st?.brightness ?? (isOn ? 100 : 80);
            const busyThisLight = lightBusy === light.id;
            return (
              <div
                key={light.id}
                className="grid gap-3 rounded-md border p-3 text-xs sm:grid-cols-[1fr_240px] sm:items-center"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                      st?.online ? "bg-primary" : "bg-muted-foreground/40"
                    }`}
                    title={st?.online ? "online" : "offline"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{light.name}</span>
                    <Badge variant="outline" className="text-[9px] uppercase">
                      {light.light_type}
                    </Badge>
                    {st && (
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${
                          isOn ? "border-primary/50 text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {isOn ? "ON" : "OFF"}
                      </Badge>
                    )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <div className="w-16 h-1 rounded bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${Math.max(0, Math.min(100, Number(st?.brightness ?? 0)))}%` }}
                          />
                        </div>
                        {typeof st?.brightness === "number" ? `${st.brightness}%` : "—%"}
                      </span>
                      {typeof st?.kelvin === "number" && <span>{st.kelvin}K</span>}
                      {st?.color_hex && (
                        <span className="flex items-center gap-1">
                          <span
                            className="inline-block h-3 w-3 rounded border border-border"
                            style={{ backgroundColor: st.color_hex }}
                          />
                          {st.color_hex}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant={!isOn ? "default" : "secondary"}
                      disabled={busyThisLight}
                      onClick={() => void sendSingleLight(light, st, false)}
                    >
                      {busyThisLight ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "OFF"}
                    </Button>
                    <Button
                      size="sm"
                      variant={isOn ? "default" : "secondary"}
                      disabled={busyThisLight}
                      onClick={() => void sendSingleLight(light, st, true, level)}
                    >
                      {busyThisLight ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "ON"}
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Intensitet</span>
                      <span className="font-mono">{level}%</span>
                    </div>
                    <Slider
                      min={1}
                      max={100}
                      step={1}
                      value={[level]}
                      onValueChange={([v]) => handleLightLevel(light, st, v)}
                      disabled={busyThisLight}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {lights.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">
              Inga lampor konfigurerade. Lägg till under Lights Manager.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
