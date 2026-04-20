import { useState } from "react";
import {
  Film,
  Monitor,
  Sparkles,
  Disc,
  Tv,
  Sun,
  Frame,
  Gauge,
  Send,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getBridgeUrl, sendCommand, type Action } from "@/lib/projector";

type Resolution = "4K" | "1080p" | "HD/SD";
type Format = "SDR" | "HDR10" | "HLG";
type Source = "UHD-Disk" | "Blu-ray" | "Formuler" | "Chromecast" | "Other";
type Service = "IPTV" | "Netflix" | "YouTube" | "Physical Disk" | "Other";
type Screen = '90" White Board' | '110" White Spandex';
type Priority = "Max Image Quality" | "Silent Fan";

interface Scenario {
  title: string;
  resolution: Resolution;
  format: Format;
  source: Source;
  service: Service;
  lighting: number;
  screen: Screen;
  priority: Priority;
}

const DEFAULT_SCENARIO: Scenario = {
  title: "",
  resolution: "4K",
  format: "HDR10",
  source: "UHD-Disk",
  service: "Physical Disk",
  lighting: 0,
  screen: '110" White Spandex',
  priority: "Max Image Quality",
};

function formatScenario(s: Scenario): string {
  const priority = s.priority === "Max Image Quality" ? "Max Quality" : "Silent Fan";
  return `Title: ${s.title || "Untitled"} | Res: ${s.resolution} | Format: ${s.format} | Source: ${s.source} | Service: ${s.service} | Lighting: ${s.lighting}% | Screen: ${s.screen} | Priority: ${priority}`;
}

export function ExpertCalibration() {
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [json, setJson] = useState("");
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const update = <K extends keyof Scenario>(key: K, value: Scenario[K]) => {
    setScenario((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = async () => {
    const text = formatScenario(scenario);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Scenario copied! Send this to your expert.", {
        description: text,
      });
    } catch {
      toast.error("Kunde inte kopiera till urklipp", { description: text });
    }
  };

  const handleApply = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("JSON måste vara ett objekt");
      }
    } catch (err) {
      toast.error("Ogiltig JSON", {
        description: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      toast.error("JSON är tom");
      return;
    }

    setApplying(true);
    setProgress({ done: 0, total: entries.length });
    let failures = 0;

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      // Bridge expects: { command: "key value" }
      const commandStr = `${key} ${value}`;
      try {
        const res = await fetch(getBridgeUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: commandStr }),
        });
        if (!res.ok) failures++;
      } catch {
        failures++;
      }
      setProgress({ done: i + 1, total: entries.length });
      if (i < entries.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    setApplying(false);
    setProgress(null);

    if (failures === 0) {
      toast.success(`Kalibrering applicerad — ${entries.length} kommandon skickade`);
    } else {
      toast.error(
        `${entries.length - failures}/${entries.length} kommandon lyckades (${failures} fel)`,
      );
    }
  };

  return (
    <div className="space-y-8">
      {/* Questionnaire */}
      <section className="rounded-xl border border-border/60 bg-card/40 p-5 sm:p-6 backdrop-blur">
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Film className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Scenario Questionnaire</h3>
            <p className="text-xs text-muted-foreground">
              Beskriv visningsscenariot för din kalibreringsexpert.
            </p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Movie Title & Year" icon={<Film className="h-4 w-4" />}>
            <Input
              value={scenario.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="t.ex. Dune (2021)"
            />
          </Field>

          <Field label="Resolution" icon={<Monitor className="h-4 w-4" />}>
            <SelectInput
              value={scenario.resolution}
              onChange={(v) => update("resolution", v as Resolution)}
              options={["4K", "1080p", "HD/SD"]}
            />
          </Field>

          <Field label="Format" icon={<Sparkles className="h-4 w-4" />}>
            <SelectInput
              value={scenario.format}
              onChange={(v) => update("format", v as Format)}
              options={["SDR", "HDR10", "HLG"]}
            />
          </Field>

          <Field label="Source" icon={<Disc className="h-4 w-4" />}>
            <SelectInput
              value={scenario.source}
              onChange={(v) => update("source", v as Source)}
              options={["UHD-Disk", "Blu-ray", "Formuler", "Chromecast", "Other"]}
            />
          </Field>

          <Field label="Service" icon={<Tv className="h-4 w-4" />}>
            <SelectInput
              value={scenario.service}
              onChange={(v) => update("service", v as Service)}
              options={["IPTV", "Netflix", "YouTube", "Physical Disk", "Other"]}
            />
          </Field>

          <Field label="Screen Type" icon={<Frame className="h-4 w-4" />}>
            <SelectInput
              value={scenario.screen}
              onChange={(v) => update("screen", v as Screen)}
              options={['90" White Board', '110" White Spandex']}
            />
          </Field>

          <Field
            label={`Lighting · ${scenario.lighting}% ${scenario.lighting === 0 ? "(Pitch Black)" : ""}`}
            icon={<Sun className="h-4 w-4" />}
            className="sm:col-span-2"
          >
            <Slider
              value={[scenario.lighting]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => update("lighting", v[0])}
              className="py-1"
            />
          </Field>

          <Field
            label="Priority"
            icon={<Gauge className="h-4 w-4" />}
            className="sm:col-span-2"
          >
            <RadioGroup
              value={scenario.priority}
              onValueChange={(v) => update("priority", v as Priority)}
              className="grid grid-cols-2 gap-2"
            >
              <PriorityCard
                value="Max Image Quality"
                label="Max Image Quality"
                description="Bästa bild, högre fläktljud"
                checked={scenario.priority === "Max Image Quality"}
              />
              <PriorityCard
                value="Silent Fan"
                label="Silent Fan"
                description="Tystare, något lägre ljus"
                checked={scenario.priority === "Silent Fan"}
              />
            </RadioGroup>
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground line-clamp-2 font-mono">
            {formatScenario(scenario)}
          </p>
          <Button onClick={handleExport} className="flex-shrink-0">
            <Send className="h-4 w-4 mr-1.5" />
            Export to Expert
          </Button>
        </div>
      </section>

      {/* Apply Expert Settings */}
      <section className="rounded-xl border border-border/60 bg-card/40 p-5 sm:p-6 backdrop-blur">
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Apply Expert Settings</h3>
            <p className="text-xs text-muted-foreground">
              Klistra in JSON från experten — varje nyckel/värde skickas som ett
              kommando.
            </p>
          </div>
        </header>

        <div className="space-y-3">
          <Label htmlFor="expert-json" className="text-xs uppercase tracking-wider text-muted-foreground">
            JSON Payload
          </Label>
          <Textarea
            id="expert-json"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder={`{\n  "pic_mode": "Cinema 1",\n  "contrast": 84,\n  "brightness": 50,\n  "laser_output": 90,\n  "hdr_enhancer": "middle"\n}`}
            spellCheck={false}
            className="font-mono text-sm min-h-[180px] resize-y"
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Skickar via{" "}
              <code className="text-primary/80">{`{ command: "key value" }`}</code>{" "}
              med 100ms paus mellan varje.
            </p>
            <Button onClick={handleApply} disabled={applying || !json.trim()}>
              {applying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  {progress ? `${progress.done}/${progress.total}` : "Skickar…"}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Apply Calibration
                </>
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------- helpers ----------

function Field({
  label,
  icon,
  className,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="text-primary/80">{icon}</span>
        {label}
      </Label>
      {children}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PriorityCard({
  value,
  label,
  description,
  checked,
}: {
  value: string;
  label: string;
  description: string;
  checked: boolean;
}) {
  return (
    <Label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
        checked
          ? "border-primary/60 bg-primary/5"
          : "border-border/60 hover:bg-accent/30"
      }`}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Label>
  );
}

// Note: `sendCommand` and `Action` re-exported for tree-shake friendliness
void sendCommand;
export type { Action };
