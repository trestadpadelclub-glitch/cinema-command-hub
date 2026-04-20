import { Sparkles, Send, Undo2, Redo2, Check, Loader2, Bot, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  analyzeInstruction,
  applySettings,
  type ProjectorSettings,
} from "@/lib/projector";
import { getMasterInstructions } from "@/lib/knowledgeBase";
import { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";

interface Props {
  current: ProjectorSettings;
  onApplied: (s: ProjectorSettings) => void;
}

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      proposal: ProjectorSettings; // delta only
      baseBefore: ProjectorSettings; // full snapshot before this proposal would apply
      applied: boolean;
    };

const EXAMPLES = [
  "Bilden är för mörk i skuggorna",
  "Highlights är utbrända",
  "Bilden ser suddig och komprimerad ut",
  "Färgerna känns urvattnade",
];

// Pretty-print a settings delta as "key: old → new" lines
function describeDelta(
  delta: ProjectorSettings,
  before: ProjectorSettings,
): { key: string; from: unknown; to: unknown }[] {
  return Object.entries(delta)
    .filter(([k, v]) => v !== undefined && v !== (before as Record<string, unknown>)[k])
    .map(([k, v]) => ({
      key: k,
      from: (before as Record<string, unknown>)[k] ?? "—",
      to: v,
    }));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function AiAssistant({ current, onApplied }: Props) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);

  // Undo / redo stacks of full ProjectorSettings snapshots.
  // `current` (from parent) is the "live" state.
  const [undoStack, setUndoStack] = useState<ProjectorSettings[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectorSettings[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, analyzing]);

  const pendingProposal = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && !m.applied) return m;
    }
    return null;
  }, [messages]);

  // ---------- Analyze ----------

  const callAi = async (
    userText: string,
    history: ChatMessage[],
  ): Promise<ProjectorSettings | null> => {
    try {
      type Turn = { role: "user" | "assistant"; content: string };
      const chatHistory: Turn[] = history.map((m) =>
        m.role === "user"
          ? { role: "user", content: m.text }
          : { role: "assistant", content: JSON.stringify(m.proposal) },
      );
      chatHistory.push({ role: "user", content: userText });

      const res = await fetch("/api/cinema-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "calibrate",
          masterInstructions: getMasterInstructions(),
          scenario: { source: "manual_controls_chat" },
          currentSettings: current,
          chatHistory,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { settings?: ProjectorSettings };
      return data.settings ?? null;
    } catch {
      return null;
    }
  };

  const analyze = async (input?: string) => {
    const t = (input ?? text).trim();
    if (!t || analyzing) return;
    if (input) setText("");
    else setText("");

    const userMsg: ChatMessage = { id: uid(), role: "user", text: t };
    const historyForAi = [...messages];
    setMessages((prev) => [...prev, userMsg]);
    setAnalyzing(true);

    let aiSettings = await callAi(t, historyForAi);

    // Fallback to local rule engine
    let usedFallback = false;
    if (!aiSettings || Object.keys(aiSettings).length === 0) {
      const local = analyzeInstruction(t, current);
      if (local.length > 0) {
        aiSettings = local.reduce<ProjectorSettings>(
          (acc, s) => ({ ...acc, ...s.changes }),
          {},
        );
        usedFallback = true;
      }
    }

    setAnalyzing(false);

    if (!aiSettings || Object.keys(aiSettings).length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: "Jag hittade inga tydliga justeringar. Försök beskriva problemet mer specifikt (skuggor, highlights, färger, skärpa, rörelse).",
          proposal: {},
          baseBefore: current,
          applied: true, // nothing to apply
        },
      ]);
      return;
    }

    // Trim to actual diff vs current
    const diff: ProjectorSettings = {};
    for (const [k, v] of Object.entries(aiSettings)) {
      if (v !== undefined && v !== (current as Record<string, unknown>)[k]) {
        (diff as Record<string, unknown>)[k] = v;
      }
    }

    if (Object.keys(diff).length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: "Inställningarna ser redan optimala ut för det du beskriver — inga ändringar föreslås.",
          proposal: {},
          baseBefore: current,
          applied: true,
        },
      ]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        text: usedFallback
          ? "Förslag (lokal regelmotor — AI ej tillgänglig):"
          : "Förslag baserat på din beskrivning:",
        proposal: diff,
        baseBefore: current,
        applied: false,
      },
    ]);
  };

  // ---------- Apply / Undo / Redo ----------

  const apply = async (msg: Extract<ChatMessage, { role: "assistant" }>) => {
    if (applying || msg.applied) return;
    setApplying(true);
    const before = current;
    const next: ProjectorSettings = { ...current, ...msg.proposal };
    const results = await applySettings(msg.proposal);
    const failed = results.find((r) => !r.ok);
    setApplying(false);
    if (failed) {
      toast.error(`Fel vid ${failed.command?.action}`, {
        description: failed.error || `Status ${failed.status}`,
      });
      return;
    }
    setUndoStack((s) => [...s, before]);
    setRedoStack([]);
    onApplied(next);
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, applied: true } : m)),
    );
    toast.success(`${Object.keys(msg.proposal).length} justering(ar) tillämpade`);
  };

  const restoreSnapshot = async (snapshot: ProjectorSettings) => {
    // Push only fields that differ from current
    const diff: ProjectorSettings = {};
    for (const [k, v] of Object.entries(snapshot)) {
      if (v !== undefined && v !== (current as Record<string, unknown>)[k]) {
        (diff as Record<string, unknown>)[k] = v;
      }
    }
    if (Object.keys(diff).length === 0) {
      onApplied(snapshot);
      return true;
    }
    const results = await applySettings(diff);
    const failed = results.find((r) => !r.ok);
    if (failed) {
      toast.error(`Fel vid ${failed.command?.action}`, {
        description: failed.error || `Status ${failed.status}`,
      });
      return false;
    }
    onApplied(snapshot);
    return true;
  };

  const undo = async () => {
    if (undoStack.length === 0 || applying) return;
    setApplying(true);
    const prev = undoStack[undoStack.length - 1];
    const ok = await restoreSnapshot(prev);
    setApplying(false);
    if (ok) {
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => [...s, current]);
      toast.success("Ångrade senaste ändring");
    }
  };

  const redo = async () => {
    if (redoStack.length === 0 || applying) return;
    setApplying(true);
    const nxt = redoStack[redoStack.length - 1];
    const ok = await restoreSnapshot(nxt);
    setApplying(false);
    if (ok) {
      setRedoStack((s) => s.slice(0, -1));
      setUndoStack((s) => [...s, current]);
      toast.success("Återställde ändring");
    }
  };

  // ---------- UI ----------

  return (
    <Card className="p-5 border-primary/30 bg-gradient-to-br from-card to-accent/20 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Cinema Assistant</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={undo}
            disabled={undoStack.length === 0 || applying}
            title={`Ångra (${undoStack.length})`}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={redo}
            disabled={redoStack.length === 0 || applying}
            title={`Gör om (${redoStack.length})`}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Beskriv vad du ser i bilden eller rummet. Jag föreslår justeringar — du
        bestämmer om de ska tillämpas.
      </p>

      {/* Chat thread */}
      <ScrollArea className="h-[340px] rounded-md border border-border bg-background/40 p-3">
        <div ref={scrollRef} className="space-y-3">
          {messages.length === 0 && !analyzing && (
            <div className="text-xs text-muted-foreground italic text-center py-8">
              Inga meddelanden än. Beskriv ett bildproblem nedan eller välj ett
              exempel.
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex items-start gap-2 justify-end">
                <div className="rounded-lg bg-primary/15 text-foreground px-3 py-2 text-sm max-w-[85%]">
                  {m.text}
                </div>
                <User className="h-4 w-4 text-muted-foreground shrink-0 mt-2" />
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2">
                <Bot className="h-4 w-4 text-primary shrink-0 mt-2" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                    {m.text}
                  </div>

                  {Object.keys(m.proposal).length > 0 && (
                    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Föreslagna ändringar
                      </div>
                      <ul className="text-xs font-mono space-y-1">
                        {describeDelta(m.proposal, m.baseBefore).map((row) => (
                          <li key={row.key} className="flex items-baseline gap-2">
                            <span className="text-muted-foreground">{row.key}:</span>
                            <span className="text-muted-foreground/70 line-through">
                              {String(row.from)}
                            </span>
                            <span className="text-primary">→ {String(row.to)}</span>
                          </li>
                        ))}
                      </ul>
                      {!m.applied ? (
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={() => apply(m)}
                            disabled={applying}
                          >
                            {applying ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5 mr-1" />
                            )}
                            Tillämpa
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setMessages((prev) =>
                                prev.map((x) =>
                                  x.id === m.id && x.role === "assistant"
                                    ? { ...x, applied: true, proposal: {} }
                                    : x,
                                ),
                              )
                            }
                          >
                            Avvisa
                          </Button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-primary/80 flex items-center gap-1 pt-1">
                          <Check className="h-3 w-3" /> Tillämpad
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {analyzing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyserar…
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Examples */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
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
      )}

      {/* Input */}
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            pendingProposal
              ? "Be om en justering av förslaget, eller beskriv nästa problem…"
              : "T.ex. 'Bilden är för mörk i skuggorna'…"
          }
          className="min-h-16 resize-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") analyze();
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {pendingProposal
              ? "Det finns ett otillämpat förslag i chatten."
              : "Cmd/Ctrl+Enter för att analysera."}
          </span>
          <Button
            onClick={() => analyze()}
            disabled={!text.trim() || analyzing}
            size="sm"
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Analysera
          </Button>
        </div>
      </div>
    </Card>
  );
}
