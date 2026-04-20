import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { sendCommand, type HdrEnhancer, type ProjectorSettings } from "@/lib/projector";
import { toast } from "sonner";
import { useRef } from "react";

interface Props {
  settings: ProjectorSettings;
  onChange: (s: ProjectorSettings) => void;
}

const HDR_LEVELS: HdrEnhancer[] = ["off", "low", "middle", "high"];

export function ManualControls({ settings, onChange }: Props) {
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const send = (key: string, payload: ProjectorSettings) => {
    clearTimeout(debounceRef.current[key]);
    debounceRef.current[key] = setTimeout(async () => {
      const res = await sendCommand({ action: "settings", ...payload });
      if (!res.ok) {
        toast.error("Bridge-fel", {
          description: res.error || `Status ${res.status}`,
        });
      }
    }, 250);
  };

  const update = (patch: ProjectorSettings, key: string) => {
    onChange({ ...settings, ...patch });
    send(key, patch);
  };

  return (
    <div className="space-y-4">
      <SliderRow
        label="Laser Output"
        value={settings.laser_output ?? 75}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={(v) => update({ laser_output: v }, "laser")}
      />

      <SliderRow
        label="Brightness"
        hint="50 = neutral · 51-52 lyfter skuggor (Black Crush)"
        value={settings.brightness ?? 50}
        min={45}
        max={55}
        step={1}
        onChange={(v) => update({ brightness: v }, "bright")}
      />

      <SliderRow
        label="Reality Creation"
        value={settings.reality_creation ?? 20}
        min={0}
        max={100}
        step={5}
        onChange={(v) => update({ reality_creation: v }, "reality")}
      />

      <Card className="p-5">
        <Label className="text-sm font-medium mb-3 block">HDR Enhancer</Label>
        <div className="grid grid-cols-4 gap-2">
          {HDR_LEVELS.map((lvl) => {
            const active = (settings.hdr_enhancer ?? "off") === lvl;
            return (
              <Button
                key={lvl}
                variant={active ? "default" : "secondary"}
                size="sm"
                onClick={() => update({ hdr_enhancer: lvl }, "hdr")}
                className={`capitalize ${active ? "shadow-[var(--cinema-glow)]" : ""}`}
              >
                {lvl}
              </Button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between mb-1">
        <Label className="text-sm font-medium">{label}</Label>
        <span className="font-mono text-lg text-primary tabular-nums">
          {value}
          {suffix ?? ""}
        </span>
      </div>
      {hint && <p className="text-xs text-muted-foreground mb-3">{hint}</p>}
      <div className="flex items-center gap-3 mt-3">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </Button>
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange(v[0])}
          className="flex-1"
        />
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </Button>
      </div>
    </Card>
  );
}
