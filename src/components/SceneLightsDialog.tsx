import { useEffect, useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchLights,
  fetchSceneLights,
  upsertSceneLight,
  type Light,
  type SceneLight,
} from "@/lib/scenes";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  householdCode: string;
  sceneId: string;
  sceneName: string;
}

interface RowState {
  light: Light;
  in_scene: boolean;
  on_state: boolean;
  brightness: number;
  kelvin: number;
  color_hex: string;
}

const DEFAULTS = { brightness: 80, kelvin: 3000, color_hex: "#ffaa55" };

export function SceneLightsDialog({
  open,
  onOpenChange,
  householdCode,
  sceneId,
  sceneName,
}: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([fetchLights(householdCode), fetchSceneLights(sceneId)])
      .then(([lights, scene]) => {
        const map = new Map<string, SceneLight>(scene.map((s) => [s.light_id, s]));
        setRows(
          lights
            .filter((l) => l.enabled)
            .map((l) => {
              const s = map.get(l.id);
              return {
                light: l,
                in_scene: s?.in_scene ?? false,
                on_state: s?.on_state ?? true,
                brightness: s?.brightness ?? DEFAULTS.brightness,
                kelvin: s?.kelvin ?? DEFAULTS.kelvin,
                color_hex: s?.color_hex ?? DEFAULTS.color_hex,
              };
            }),
        );
      })
      .catch((e) =>
        toast.error("Kunde inte ladda ljus", { description: String(e) }),
      )
      .finally(() => setLoading(false));
  }, [open, householdCode, sceneId]);

  const update = (id: string, patch: Partial<RowState>) =>
    setRows((prev) =>
      prev.map((r) => (r.light.id === id ? { ...r, ...patch } : r)),
    );

  const save = async () => {
    setSaving(true);
    try {
      for (const r of rows) {
        await upsertSceneLight({
          scene_id: sceneId,
          light_id: r.light.id,
          in_scene: r.in_scene,
          on_state: r.on_state,
          brightness: r.brightness,
          kelvin: r.kelvin,
          color_hex: r.color_hex,
        });
      }
      toast.success(`Ljus sparat för "${sceneName}"`);
      onOpenChange(false);
    } catch (e) {
      toast.error("Kunde inte spara", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-400" />
              Ljus — {sceneName}
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Laddar…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Inga lampor inlagda. Lägg till dem under <strong>Devices → Lights</strong>.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const t = r.light.light_type;
              const showBrightness = true; // alla typer
              const showKelvin = t === "cct" || t === "rgbcct";
              const showColor = t === "rgb" || t === "rgbcct";
              return (
                <div
                  key={r.light.id}
                  className={`rounded-lg border p-3 space-y-3 transition-opacity ${
                    r.in_scene ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Switch
                        checked={r.in_scene}
                        onCheckedChange={(v) => update(r.light.id, { in_scene: v })}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{r.light.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {r.light.light_type}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">På</Label>
                      <Switch
                        checked={r.on_state}
                        disabled={!r.in_scene}
                        onCheckedChange={(v) => update(r.light.id, { on_state: v })}
                      />
                    </div>
                  </div>

                  {r.in_scene && r.on_state && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {showBrightness && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <Label>Intensitet</Label>
                            <span className="font-mono">{r.brightness}%</span>
                          </div>
                          <Slider
                            value={[r.brightness]}
                            min={0}
                            max={100}
                            step={1}
                            onValueChange={([v]) =>
                              update(r.light.id, { brightness: v })
                            }
                          />
                        </div>
                      )}
                      {showKelvin && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <Label>Färgtemp</Label>
                            <span className="font-mono">{r.kelvin}K</span>
                          </div>
                          <Slider
                            value={[r.kelvin]}
                            min={2700}
                            max={6500}
                            step={50}
                            onValueChange={([v]) => update(r.light.id, { kelvin: v })}
                          />
                        </div>
                      )}
                      {showColor && (
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs">Färg</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="color"
                              value={r.color_hex}
                              onChange={(e) =>
                                update(r.light.id, { color_hex: e.target.value })
                              }
                              className="h-9 w-16 p-1 cursor-pointer"
                            />
                            <Input
                              value={r.color_hex}
                              onChange={(e) =>
                                update(r.light.id, { color_hex: e.target.value })
                              }
                              className="font-mono text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={save} disabled={saving || rows.length === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
