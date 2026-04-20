import { Sparkles, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  analyzeInstruction,
  sendCommand,
  type AiSuggestion,
  type ProjectorSettings,
} from "@/lib/projector";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  current: ProjectorSettings;
  onApplied: (s: ProjectorSettings) => void;
}

const EXAMPLES = [
  "Bilden är för mörk i skuggorna",
  "Highlights är utbrända",
  "Bilden är suddig och komprimerad",
  "För ljust för kvällsvisning",
];

export function AiAssistant({ current, onApplied }: Props) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<AiSuggestion[] | null>(null);

  const analyze = (input?: string) => {
    const t = (input ?? text).trim();
    if (!t) return;
    if (input) setText(input);
    const s = analyzeInstruction(t, current);
    setSuggestions(s);
    if (s.length === 0) {
      toast.info("Inga matchande regler hittades. Prova ett av exemplen.");
    }
  };

  const apply = async (sug: AiSuggestion) => {
    const res = await sendCommand({ action: "settings", ...sug.changes });
    if (res.ok) {
      toast.success("Justering applicerad");
      onApplied({ ...current, ...sug.changes });
    } else {
      toast.error("Bridge-fel", { description: res.error || `Status ${res.status}` });
    }
  };

  const applyAll = async () => {
    if (!suggestions || suggestions.length === 0) return;
    const merged = suggestions.reduce<ProjectorSettings>(
      (acc, s) => ({ ...acc, ...s.changes }),
      {},
    );
    const res = await sendCommand({ action: "settings", ...merged });
    if (res.ok) {
      toast.success(`${suggestions.length} justeringar applicerade`);
      onApplied({ ...current, ...merged });
    } else {
      toast.error("Bridge-fel", { description: res.error || `Status ${res.status}` });
    }
  };

  return (
    <Card className="p-5 border-primary/30 bg-gradient-to-br from-card to-accent/20">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">AI Cinema Assistant</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Beskriv vad du ser så föreslår jag justeringar.
      </p>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="T.ex. 'Bilden är för mörk i skuggorna'…"
        className="min-h-20 resize-none mb-3"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") analyze();
        }}
      />

      <div className="flex flex-wrap gap-1.5 mb-3">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => analyze(ex)}
            className="text-xs px-2 py-1 rounded-md bg-secondary/60 text-secondary-foreground hover:bg-primary/20 hover:text-primary transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>

      <Button onClick={() => analyze()} className="w-full" disabled={!text.trim()}>
        <Wand2 className="h-4 w-4 mr-2" />
        Analysera
      </Button>

      {suggestions && suggestions.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Förslag ({suggestions.length})
            </p>
            <Button size="sm" variant="default" onClick={applyAll}>
              Tillämpa alla
            </Button>
          </div>
          {suggestions.map((s, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/40 p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm">{s.reason}</p>
                <p className="text-xs text-primary/80 font-mono mt-1 truncate">
                  {Object.entries(s.changes)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(" · ")}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => apply(s)}>
                Tillämpa
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
