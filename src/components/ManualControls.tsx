import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  sendCommand,
  PIC_MODE_LABELS,
  MOTIONFLOW_LABELS,
  COLOR_TEMP_LABELS,
  type HdrEnhancer,
  type DynamicControl,
  type PicMode,
  type Motionflow,
  type Gamma,
  type ColorTemp,
  type Action,
  type ProjectorSettings,
} from "@/lib/projector";
import { toast } from "sonner";
import { useRef } from "react";

interface Props {
  settings: ProjectorSettings;
  onChange: (s: ProjectorSettings) => void;
}

const HDR_LEVELS: HdrEnhancer[] = ["off", "low", "middle", "high"];
const DYNAMIC_LEVELS: DynamicControl[] = ["off", "limited", "middle", "full"];
const PIC_MODES: PicMode[] = [
  "cinema_film_1",
  "cinema_film_2",
  "reference",
  "tv",
  "bright_cinema",
];
const MOTIONFLOW_OPTS: Motionflow[] = [
  "off",
  "true_cinema",
  "smooth_low",
  "smooth_high",
  "impulse",
  "combination",
];
const GAMMA_OPTS: Gamma[] = ["off", "1.8", "2.0", "2.1", "2.2", "2.4", "2.6"];
const COLOR_TEMP_OPTS: ColorTemp[] = [
  "d93",
  "d75",
  "d65",
  "d55",
  "custom1",
  "custom2",
  "custom3",
  "custom4",
  "custom5",
];

export function ManualControls({ settings, onChange }: Props) {
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const send = (action: Action, value: string | number) => {
    clearTimeout(debounceRef.current[action]);
    debounceRef.current[action] = setTimeout(async () => {
      const res = await sendCommand({ action, value });
      if (!res.ok) {
        toast.error("Bridge-fel", {
          description: res.error || `Status ${res.status}`,
        });
      }
    }, 250);
  };

  const update = (action: Action, value: string | number, patch: ProjectorSettings) => {
    onChange({ ...settings, ...patch });
    send(action, value);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Label className="text-sm font-medium mb-3 block">Picture Mode</Label>
        <div className="grid grid-cols-3 gap-2">
          {PIC_MODES.map((m) => {
            const active = (settings.pic_mode ?? "cinema_film_1") === m;
            return (
              <Button
                key={m}
                variant={active ? "default" : "secondary"}
                size="sm"
                onClick={() => update("pic_mode", m, { pic_mode: m })}
                className={active ? "shadow-[var(--cinema-glow)]" : ""}
              >
                {PIC_MODE_LABELS[m]}
              </Button>
            );
          })}
        </div>
      </Card>

      <SliderRow
        label="Laser Output"
        value={settings.laser_output ?? 75}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={(v) => update("laser_output", v, { laser_output: v })}
      />

      <SliderRow
        label="Brightness"
        hint="50 = neutral · 51-52 lyfter skuggor (Black Crush)"
        value={settings.brightness ?? 50}
        min={0}
        max={100}
        step={1}
        onChange={(v) => update("brightness", v, { brightness: v })}
      />

      <SliderRow
        label="Contrast"
        value={settings.contrast ?? 90}
        min={0}
        max={100}
        step={1}
        onChange={(v) => update("contrast", v, { contrast: v })}
      />

      <SliderRow
        label="Color"
        hint="50 = neutral mättnad"
        value={settings.color ?? 50}
        min={0}
        max={100}
        step={1}
        onChange={(v) => update("color", v, { color: v })}
      />

      <SliderRow
        label="Reality Creation"
        value={settings.reality_creation ?? 20}
        min={0}
        max={100}
        step={5}
        onChange={(v) => update("reality_creation", v, { reality_creation: v })}
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
                onClick={() => update("hdr_enhancer", lvl, { hdr_enhancer: lvl })}
                className={`capitalize ${active ? "shadow-[var(--cinema-glow)]" : ""}`}
              >
                {lvl}
              </Button>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <Label className="text-sm font-medium mb-3 block">Dynamic Control</Label>
        <div className="grid grid-cols-4 gap-2">
          {DYNAMIC_LEVELS.map((lvl) => {
            const active = (settings.dynamic_control ?? "limited") === lvl;
            return (
              <Button
                key={lvl}
                variant={active ? "default" : "secondary"}
                size="sm"
                onClick={() => update("dynamic_control", lvl, { dynamic_control: lvl })}
                className={`capitalize ${active ? "shadow-[var(--cinema-glow)]" : ""}`}
              >
                {lvl}
              </Button>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <Label className="text-sm font-medium mb-3 block">Motionflow</Label>
        <div className="grid grid-cols-3 gap-2">
          {MOTIONFLOW_OPTS.map((m) => {
            const active = (settings.motionflow ?? "off") === m;
            return (
              <Button
                key={m}
                variant={active ? "default" : "secondary"}
                size="sm"
                onClick={() => update("motionflow", m, { motionflow: m })}
                className={active ? "shadow-[var(--cinema-glow)]" : ""}
              >
                {MOTIONFLOW_LABELS[m]}
              </Button>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <Label className="text-sm font-medium mb-3 block">Gamma Correction</Label>
        <div className="grid grid-cols-7 gap-2">
          {GAMMA_OPTS.map((g) => {
            const active = (settings.gamma_correction ?? "2.2") === g;
            return (
              <Button
                key={g}
                variant={active ? "default" : "secondary"}
                size="sm"
                onClick={() => update("gamma_correction", g, { gamma_correction: g })}
                className={active ? "shadow-[var(--cinema-glow)]" : ""}
              >
                {g}
              </Button>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <Label className="text-sm font-medium mb-3 block">Color Temperature</Label>
        <p className="text-xs text-muted-foreground mb-3">
          D65 = filmreferens · D93 = kallare/blåare · Custom 1-5 = egna kalibreringar
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {COLOR_TEMP_OPTS.map((ct) => {
            const active = (settings.color_temp ?? "d65") === ct;
            return (
              <Button
                key={ct}
                variant={active ? "default" : "secondary"}
                size="sm"
                onClick={() => update("color_temp", ct, { color_temp: ct })}
                className={active ? "shadow-[var(--cinema-glow)]" : ""}
              >
                {COLOR_TEMP_LABELS[ct]}
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
