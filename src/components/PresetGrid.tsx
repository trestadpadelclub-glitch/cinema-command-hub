import { Film, Tv, Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PRESETS, applySettings, type Preset, type ProjectorSettings } from "@/lib/projector";
import { toast } from "sonner";
import { useState } from "react";

const ICONS: Record<string, typeof Film> = {
  "4k-hdr-movie": Film,
  "sdr-tv-sports": Tv,
  "iptv-formuler": Radio,
};

interface Props {
  onApplied: (settings: ProjectorSettings) => void;
}

export function PresetGrid({ onApplied }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const apply = async (p: Preset) => {
    setBusy(p.id);
    const results = await applySettings(p.settings);
    setBusy(null);
    const failed = results.find((r) => !r.ok);
    if (!failed) {
      toast.success(`Preset: ${p.label}`, {
        description: `${results.length} inställningar skickade`,
      });
      onApplied(p.settings);
    } else {
      toast.error(`Preset misslyckades vid ${failed.command?.action}`, {
        description: failed.error || `Status ${failed.status}`,
      });
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {PRESETS.map((p) => {
        const Icon = ICONS[p.id] ?? Film;
        const active = busy === p.id;
        return (
          <Card
            key={p.id}
            onClick={() => !active && apply(p)}
            className={`group cursor-pointer p-5 transition-all hover:border-primary/60 hover:shadow-[var(--cinema-glow)] ${
              active ? "border-primary shadow-[var(--cinema-glow-strong)]" : ""
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary group-hover:bg-primary/25 transition-colors">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">{p.label}</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {p.description}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
