import { useEffect, useState } from "react";
import { Lightbulb, Clock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  fetchEvents,
  updateEvent,
  type AutomationEvent,
} from "@/lib/scenes";
import { toast } from "sonner";

interface Props {
  householdCode: string;
}

export function AutomationSettings({ householdCode }: Props) {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchEvents(householdCode)
      .then((e) => {
        if (!cancelled) {
          setEvents(e);
          setLoading(false);
        }
      })
      .catch((e) => {
        toast.error("Kunde inte ladda automation", { description: String(e) });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [householdCode]);

  const update = (id: string, patch: Partial<AutomationEvent>) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  };

  const save = async (e: AutomationEvent) => {
    try {
      await updateEvent(e.id, {
        delay_ms: e.delay_ms,
        fade_ms: e.fade_ms,
        lights_target: e.lights_target,
        enabled: e.enabled,
        label: e.label,
      });
      toast.success(`"${e.label}" sparad`);
    } catch (err) {
      toast.error("Kunde inte spara", { description: String(err) });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Laddar automation…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-medium mb-1">Så här används värdena</p>
        <p className="text-muted-foreground">
          När en händelse triggas (t.ex. Marantz startas) väntar appen <strong>delay</strong> ms,
          sen tonas ljuset under <strong>fade</strong> ms till <strong>target%</strong>. Värdena
          skickas med i scen-anropet så att backenden kan utföra dem.
        </p>
      </div>

      {events.map((e) => (
        <Card key={e.id} className="p-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary flex-shrink-0">
                <Clock className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <Input
                  value={e.label}
                  onChange={(ev) => update(e.id, { label: ev.target.value })}
                  className="font-semibold border-0 bg-transparent px-0 h-auto text-base focus-visible:ring-0"
                />
                <p className="text-xs text-muted-foreground font-mono">{e.event_key}</p>
              </div>
            </div>
            <Switch
              checked={e.enabled}
              onCheckedChange={(v) => update(e.id, { enabled: v })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <Label className="text-muted-foreground">Delay</Label>
                <span className="font-mono">{e.delay_ms} ms</span>
              </div>
              <Slider
                value={[e.delay_ms]}
                min={0}
                max={5000}
                step={50}
                onValueChange={([v]) => update(e.id, { delay_ms: v })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <Label className="text-muted-foreground">Fade</Label>
                <span className="font-mono">{e.fade_ms} ms</span>
              </div>
              <Slider
                value={[e.fade_ms]}
                min={0}
                max={5000}
                step={100}
                onValueChange={([v]) => update(e.id, { fade_ms: v })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <Label className="text-muted-foreground flex items-center gap-1">
                  <Lightbulb className="h-3 w-3 text-amber-400" />
                  Ljusnivå
                </Label>
                <span className="font-mono">
                  {e.lights_target === null ? "—" : `${e.lights_target}%`}
                </span>
              </div>
              <Slider
                value={[e.lights_target ?? 0]}
                min={0}
                max={100}
                step={5}
                onValueChange={([v]) => update(e.id, { lights_target: v })}
              />
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                onClick={() =>
                  update(e.id, {
                    lights_target: e.lights_target === null ? 50 : null,
                  })
                }
              >
                {e.lights_target === null ? "Aktivera ljusstyrning" : "Rör inte ljus"}
              </button>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button size="sm" onClick={() => save(e)}>
              Spara
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
