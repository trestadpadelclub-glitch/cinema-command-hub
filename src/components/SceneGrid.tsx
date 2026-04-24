import { useEffect, useState } from "react";
import {
  Lightbulb,
  Play,
  Pencil,
  Settings2,
  Power,
  Loader2,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ManualControls } from "@/components/ManualControls";
import { SceneLightsDialog } from "@/components/SceneLightsDialog";
import { SceneTriggersDialog } from "@/components/SceneTriggersDialog";
import { fetchTriggers, type SceneTrigger } from "@/lib/triggers";
import { toast } from "sonner";
import {
  sendScene,
  type ProjectorSettings,
  type SceneLightCommand,
} from "@/lib/projector";
import {
  fetchScenes,
  fetchInputs,
  fetchLights,
  fetchSceneLights,
  updateScene,
  type Scene,
  type MarantzInput,
} from "@/lib/scenes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  householdCode: string;
  /** Scen-id som matchar nuvarande projektor-status, eller null. */
  activeSceneId?: string | null;
}

export function SceneGrid({ householdCode, activeSceneId }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [inputs, setInputs] = useState<MarantzInput[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Scene | null>(null);
  const [tuning, setTuning] = useState<Scene | null>(null);
  const [tuningLights, setTuningLights] = useState<Scene | null>(null);
  const [tuningTriggers, setTuningTriggers] = useState<Scene | null>(null);
  const [triggers, setTriggers] = useState<SceneTrigger[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchScenes(householdCode),
      fetchInputs(householdCode),
      fetchTriggers(householdCode),
    ])
      .then(([s, i, t]) => {
        if (!cancelled) {
          setScenes(s);
          setInputs(i);
          setTriggers(t);
        }
      })
      .catch((e) => toast.error("Kunde inte ladda scener", { description: String(e) }));
    return () => {
      cancelled = true;
    };
  }, [householdCode]);

  const refresh = async () => {
    const [s, t] = await Promise.all([
      fetchScenes(householdCode),
      fetchTriggers(householdCode),
    ]);
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

  const [saving, setSaving] = useState(false);
  const saveEdit = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await updateScene(editing.id, {
        name: editing.name,
        lights_on: editing.lights_on,
        marantz_power: editing.marantz_power,
        marantz_input: editing.marantz_input,
        marantz_volume: editing.marantz_volume,
        scene_payload: editing.scene_payload,
      });
      toast.success("Scen sparad");
      setEditing(null);
      refresh();
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      const isFetchFail = msg.includes("Failed to fetch") || msg.includes("NetworkError");
      toast.error("Kunde inte spara scenen", {
        description: isFetchFail
          ? "Nätverksfel mot databasen. Stäng av eventuell ad-blocker / privacy-extension för denna sida och försök igen."
          : msg,
      });
    } finally {
      setSaving(false);
    }
  };

  const saveTuning = async (settings: ProjectorSettings) => {
    if (!tuning) return;
    await updateScene(tuning.id, { projector_settings: settings });
    toast.success(`Tuning sparad för "${tuning.name}"`);
    setTuning(null);
    refresh();
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
                {s.lights_on === true && (
                  <Lightbulb className="h-3 w-3 text-amber-400" />
                )}
                {s.marantz_input && (
                  <span className="truncate">{s.marantz_input}</span>
                )}
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
                  title="Byt namn / källa"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setTuningLights(s)}
                  title="Tuna lampor för denna scen"
                >
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
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
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setTuning(s)}
                  title="Tuna projektor-inställningar"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit name / lights / input dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera scen</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Namn</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Scen-payload (skickas till backend som value)</Label>
                <Input
                  value={editing.scene_payload ?? String(editing.scene_number)}
                  onChange={(e) =>
                    setEditing({ ...editing, scene_payload: e.target.value })
                  }
                  placeholder={String(editing.scene_number)}
                />
              </div>
              <div className="space-y-1">
                <Label>Marantz Input</Label>
                <Select
                  value={editing.marantz_input ?? "none"}
                  onValueChange={(v) =>
                    setEditing({
                      ...editing,
                      marantz_input: v === "none" ? null : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— rör inte —</SelectItem>
                    {inputs.map((i) => (
                      <SelectItem key={i.id} value={i.marantz_code}>
                        {i.label} ({i.marantz_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Marantz Volym (0-98, tomt = rör inte)</Label>
                <Input
                  type="number"
                  min={0}
                  max={98}
                  value={editing.marantz_volume ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      marantz_volume: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <Label>Tänd ljus när scen körs</Label>
                </div>
                <Select
                  value={
                    editing.lights_on === null
                      ? "none"
                      : editing.lights_on
                        ? "on"
                        : "off"
                  }
                  onValueChange={(v) =>
                    setEditing({
                      ...editing,
                      lights_on: v === "none" ? null : v === "on",
                    })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Rör inte</SelectItem>
                    <SelectItem value="on">Tänd</SelectItem>
                    <SelectItem value="off">Släck</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Avbryt
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tuning dialog */}
      <Dialog open={!!tuning} onOpenChange={(o) => !o && setTuning(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Tuna projektor — {tuning?.name}
              </span>
            </DialogTitle>
          </DialogHeader>
          {tuning && (
            <SceneTuner
              initial={tuning.projector_settings}
              onSave={saveTuning}
              onCancel={() => setTuning(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Lights tuning dialog */}
      {tuningLights && (
        <SceneLightsDialog
          open={!!tuningLights}
          onOpenChange={(o) => !o && setTuningLights(null)}
          householdCode={householdCode}
          sceneId={tuningLights.id}
          sceneName={tuningLights.name}
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

function SceneTuner({
  initial,
  onSave,
  onCancel,
}: {
  initial: ProjectorSettings;
  onSave: (s: ProjectorSettings) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ProjectorSettings>(initial);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Reglagen skickar live till projektorn (förhandsgranskning). Klicka Spara för att skriva
        värdena till scenen.
      </p>
      <ManualControls settings={draft} onChange={setDraft} showPowerAction />
      <div className="flex justify-end gap-2 sticky bottom-0 bg-background pt-2">
        <Button variant="ghost" onClick={onCancel}>
          Avbryt
        </Button>
        <Button onClick={() => onSave(draft)}>
          <Power className="h-4 w-4 mr-1.5" />
          Spara till scen
        </Button>
      </div>
    </div>
  );
}
