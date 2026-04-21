import { Film, Tv, Radio, Star, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  PRESETS,
  applySettings,
  PIC_MODE_LABELS,
  MOTIONFLOW_LABELS,
  COLOR_TEMP_LABELS,
  type Preset,
} from "@/lib/projector";
import { toast } from "sonner";
import { Fragment, useState } from "react";

const RECIPE_LABELS: Record<string, string> = {
  pic_mode: "Picture Mode",
  laser_output: "Laser Output",
  brightness: "Brightness",
  contrast: "Contrast",
  color: "Color",
  reality_creation: "Reality Creation",
  hdr_enhancer: "HDR Enhancer",
  dynamic_control: "Dynamic Control",
  motionflow: "Motionflow",
  gamma_correction: "Gamma",
  color_temp: "Color Temp",
};

function formatRecipeValue(key: string, value: unknown): string {
  if (value === undefined || value === null) return "—";
  switch (key) {
    case "pic_mode":
      return PIC_MODE_LABELS[value as keyof typeof PIC_MODE_LABELS] ?? String(value);
    case "motionflow":
      return MOTIONFLOW_LABELS[value as keyof typeof MOTIONFLOW_LABELS] ?? String(value);
    case "color_temp":
      return COLOR_TEMP_LABELS[value as keyof typeof COLOR_TEMP_LABELS] ?? String(value);
    case "hdr_enhancer":
    case "dynamic_control":
      return String(value).charAt(0).toUpperCase() + String(value).slice(1);
    default:
      return String(value);
  }
}

const ICONS: Record<string, typeof Film> = {
  "4k-hdr-movie": Film,
  "sdr-tv-sports": Tv,
  "iptv-formuler": Radio,
};

interface Props {
  customPresets: Preset[];
  activePresetId: string | null;
  modified: boolean;
  onApplied: (preset: Preset) => void;
  onDeleteCustom: (id: string) => void;
}

export function PresetGrid({
  customPresets,
  activePresetId,
  modified,
  onApplied,
  onDeleteCustom,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  // Custom preset med samma id som en fast preset överskrider den fasta
  const all = [
    ...PRESETS.map((p) => customPresets.find((c) => c.id === p.id) ?? p),
    ...customPresets.filter((c) => !PRESETS.find((p) => p.id === c.id)),
  ];

  const apply = async (p: Preset) => {
    setBusy(p.id);
    onApplied(p);
    const results = await applySettings(p.settings);
    setBusy(null);
    const failed = results.find((r) => !r.ok);
    if (!failed) {
      toast.success(`Preset: ${p.label}`, {
        description: `${results.length} inställningar skickade`,
      });
    } else {
      toast.error(`Preset misslyckades vid ${failed.command?.action}`, {
        description: failed.error || `Status ${failed.status}`,
      });
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {all.map((p) => {
        const Icon = ICONS[p.id] ?? Star;
        const isCustom = !PRESETS.find((x) => x.id === p.id);
        const busyNow = busy === p.id;
        const isActive = activePresetId === p.id;
        return (
          <HoverCard key={p.id} openDelay={150} closeDelay={80}>
            <HoverCardTrigger asChild>
              <Card
                onClick={() => !busyNow && apply(p)}
                className={`group relative cursor-pointer p-5 transition-all hover:border-primary/60 hover:shadow-[var(--cinema-glow)] ${
                  isActive
                    ? "border-primary shadow-[var(--cinema-glow)]"
                    : ""
                } ${busyNow ? "shadow-[var(--cinema-glow-strong)]" : ""}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary group-hover:bg-primary/25 transition-colors">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-foreground flex-1 min-w-0 truncate">
                    {p.label}
                  </h3>
                  {isActive && modified && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/60 text-amber-400 text-[10px] px-1.5 py-0"
                    >
                      Modified
                    </Badge>
                  )}
                  {isCustom && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCustom(p.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      aria-label="Ta bort preset"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {p.description}
                </p>
              </Card>
            </HoverCardTrigger>
            <HoverCardContent align="start" className="w-72 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{p.label}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  Recept
                </span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {Object.entries(RECIPE_LABELS).map(([key, label]) => (
                  <Fragment key={key}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-mono text-foreground">
                      {formatRecipeValue(
                        key,
                        p.settings[key as keyof typeof p.settings],
                      )}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}
