import { useEffect, useState } from "react";
import { Zap, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  TRIGGER_CATALOG,
  fetchTriggers,
  setTrigger,
  clearTrigger,
  type SceneTrigger,
  type TriggerKey,
  type TriggerCatalogEntry,
} from "@/lib/triggers";
import type { Scene } from "@/lib/scenes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  householdCode: string;
  scene: Scene;
}

interface RowState {
  enabled: boolean;
  /** Är denna trigger för närvarande mappad till EN ANNAN scen? */
  ownedByOther: { sceneId: string } | null;
  filters: { run_projector: boolean; run_marantz: boolean; run_lights: boolean };
}

const DEFAULT_FILTERS = { run_projector: true, run_marantz: true, run_lights: true };

export function SceneTriggersDialog({ open, onOpenChange, householdCode, scene }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allTriggers, setAllTriggers] = useState<SceneTrigger[]>([]);
  const [rows, setRows] = useState<Record<TriggerKey, RowState>>(
    () => buildInitialRows([], scene.id),
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchTriggers(householdCode)
      .then((triggers) => {
        setAllTriggers(triggers);
        setRows(buildInitialRows(triggers, scene.id));
      })
      .catch((e) => toast.error("Kunde inte ladda triggers", { description: String(e) }))
      .finally(() => setLoading(false));
  }, [open, householdCode, scene.id]);

  const toggleEnabled = (key: TriggerKey, val: boolean) => {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], enabled: val } }));
  };

  const toggleFilter = (
    key: TriggerKey,
    field: keyof RowState["filters"],
    val: boolean,
  ) => {
    setRows((prev) => ({
      ...prev,
      [key]: { ...prev[key], filters: { ...prev[key].filters, [field]: val } },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const entry of TRIGGER_CATALOG) {
        const row = rows[entry.key];
        // Är denna trigger redan mappad till denna scen?
        const existing = allTriggers.find(
          (t) => t.trigger_key === entry.key && t.scene_id === scene.id,
        );
        if (row.enabled) {
          await setTrigger(householdCode, entry.key, scene.id, row.filters, true);
        } else if (existing) {
          // Användaren stängde av en trigger som tidigare pekade på denna scen
          await clearTrigger(householdCode, entry.key);
        }
      }
      toast.success("Triggers sparade");
      onOpenChange(false);
    } catch (e) {
      toast.error("Kunde inte spara triggers", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const grouped = groupCatalog();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Triggers — {scene.name}
          </DialogTitle>
          <DialogDescription>
            Välj vilka händelser från Python-bryggan som automatiskt ska köra denna scen.
            En trigger kan bara peka på en scen åt gången — väljer du en trigger som redan används någon annanstans, flyttas den hit.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([groupName, entries]) => (
              <div key={groupName} className="space-y-2">
                <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {groupName}
                </h4>
                <div className="space-y-2">
                  {entries.map((entry) => {
                    const row = rows[entry.key];
                    return (
                      <div
                        key={entry.key}
                        className={`rounded-lg border p-3 transition-colors ${
                          row.enabled ? "border-primary/60 bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Label className="font-medium">{entry.label}</Label>
                              <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {entry.key}
                              </code>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {entry.description}
                            </p>
                            {row.ownedByOther && !row.enabled && (
                              <p className="text-[11px] text-amber-500 mt-1 flex items-center gap-1">
                                ⚠️ Används redan av en annan scen — om du aktiverar här flyttas den.
                              </p>
                            )}
                          </div>
                          <Switch
                            checked={row.enabled}
                            onCheckedChange={(v) => toggleEnabled(entry.key, v)}
                          />
                        </div>
                        {row.enabled && (
                          <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-3 gap-2 text-xs">
                            <FilterToggle
                              label="Projektor"
                              checked={row.filters.run_projector}
                              onChange={(v) => toggleFilter(entry.key, "run_projector", v)}
                            />
                            <FilterToggle
                              label="Marantz"
                              checked={row.filters.run_marantz}
                              onChange={(v) => toggleFilter(entry.key, "run_marantz", v)}
                            />
                            <FilterToggle
                              label="Lampor"
                              checked={row.filters.run_lights}
                              onChange={(v) => toggleFilter(entry.key, "run_lights", v)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border px-2 py-1.5 cursor-pointer hover:bg-accent/50">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </label>
  );
}

function buildInitialRows(
  triggers: SceneTrigger[],
  sceneId: string,
): Record<TriggerKey, RowState> {
  const out = {} as Record<TriggerKey, RowState>;
  for (const entry of TRIGGER_CATALOG) {
    const existing = triggers.find((t) => t.trigger_key === entry.key);
    const isMine = existing?.scene_id === sceneId;
    out[entry.key] = {
      enabled: isMine && (existing?.enabled ?? false),
      ownedByOther: existing && !isMine ? { sceneId: existing.scene_id } : null,
      filters: isMine
        ? {
            run_projector: existing!.run_projector,
            run_marantz: existing!.run_marantz,
            run_lights: existing!.run_lights,
          }
        : { ...DEFAULT_FILTERS },
    };
  }
  return out;
}

function groupCatalog(): Array<[string, TriggerCatalogEntry[]]> {
  const groups = new Map<string, TriggerCatalogEntry[]>();
  for (const entry of TRIGGER_CATALOG) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group)!.push(entry);
  }
  return Array.from(groups.entries());
}
