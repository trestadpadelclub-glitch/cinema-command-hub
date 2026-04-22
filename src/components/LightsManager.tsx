import { useEffect, useState } from "react";
import { Lightbulb, Plus, Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchLights,
  createLight,
  updateLight,
  deleteLight,
  type Light,
  type LightType,
} from "@/lib/scenes";
import { toast } from "sonner";

const LIGHT_TYPE_LABELS: Record<LightType, string> = {
  dimmer: "Dimmer (bara intensitet)",
  cct: "CCT (intensitet + kelvin)",
  rgb: "RGB (intensitet + färg)",
  rgbcct: "RGBCCT (allt)",
};

interface Props {
  householdCode: string;
}

export function LightsManager({ householdCode }: Props) {
  const [lights, setLights] = useState<Light[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Light> | null>(null);

  const refresh = async () => {
    const l = await fetchLights(householdCode);
    setLights(l);
    setLoading(false);
  };

  useEffect(() => {
    refresh().catch((e) =>
      toast.error("Kunde inte ladda lampor", { description: String(e) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdCode]);

  const startNew = () => {
    setEditing({
      position: (lights.at(-1)?.position ?? 0) + 1,
      name: "",
      tuya_device_id: "",
      light_type: "rgbcct",
      enabled: true,
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim() || !editing.tuya_device_id?.trim()) {
      toast.error("Namn och Tuya device-ID krävs");
      return;
    }
    try {
      if (editing.id) {
        await updateLight(editing.id, {
          name: editing.name,
          tuya_device_id: editing.tuya_device_id,
          light_type: editing.light_type as LightType,
          enabled: editing.enabled ?? true,
          position: editing.position ?? 1,
        });
      } else {
        await createLight(householdCode, {
          position: editing.position ?? 1,
          name: editing.name,
          tuya_device_id: editing.tuya_device_id,
          light_type: (editing.light_type ?? "dimmer") as LightType,
          enabled: editing.enabled ?? true,
        });
      }
      toast.success("Sparad");
      setEditing(null);
      refresh();
    } catch (e) {
      toast.error("Kunde inte spara", { description: String(e) });
    }
  };

  const remove = async (l: Light) => {
    if (!confirm(`Ta bort "${l.name}"?`)) return;
    try {
      await deleteLight(l.id);
      toast.success("Borttagen");
      refresh();
    } catch (e) {
      toast.error("Kunde inte ta bort", { description: String(e) });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Laddar lampor…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Lägg in dina Tuya-lampor en gång. Sedan kan du tuna dem per scen.
        </p>
        <Button size="sm" onClick={startNew}>
          <Plus className="h-4 w-4 mr-1" />
          Lägg till lampa
        </Button>
      </div>

      {lights.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Inga lampor ännu. Klicka "Lägg till lampa".
        </Card>
      ) : (
        <div className="grid gap-2">
          {lights.map((l) => (
            <Card
              key={l.id}
              className={`p-3 flex items-center gap-3 ${l.enabled ? "" : "opacity-50"}`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 flex-shrink-0">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{l.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {l.tuya_device_id} · {LIGHT_TYPE_LABELS[l.light_type]}
                </div>
              </div>
              <Switch
                checked={l.enabled}
                onCheckedChange={(v) => updateLight(l.id, { enabled: v }).then(refresh)}
              />
              <Button size="sm" variant="ghost" onClick={() => setEditing(l)}>
                Redigera
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => remove(l)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Redigera lampa" : "Ny lampa"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Namn</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Taklampa, Smart Lighting..."
                />
              </div>
              <div className="space-y-1">
                <Label>Tuya Device ID</Label>
                <Input
                  value={editing.tuya_device_id ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, tuya_device_id: e.target.value })
                  }
                  placeholder="bf7d066731f88e90c78gqc"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label>Lamp-typ</Label>
                <Select
                  value={editing.light_type ?? "dimmer"}
                  onValueChange={(v) =>
                    setEditing({ ...editing, light_type: v as LightType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LIGHT_TYPE_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Position (sortering)</Label>
                <Input
                  type="number"
                  value={editing.position ?? 1}
                  onChange={(e) =>
                    setEditing({ ...editing, position: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Avbryt
            </Button>
            <Button onClick={save}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
