import { useEffect, useState } from "react";
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
  Save,
  FolderOpen,
  History,
  Trash2,
  RotateCcw,
  Eraser,
  Brain,
  MessageSquare,
  BookmarkPlus,
  User,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { KnowledgeBaseDialog } from "@/components/KnowledgeBaseDialog";
import { appendToMasterInstructions, getMasterInstructions } from "@/lib/knowledgeBase";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sendCommand, getStatus, parseStatus, type Action } from "@/lib/projector";

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
  notes: string;
}

interface ExpertPreset {
  id: string;
  name: string;
  scenario: Scenario;
  json: string;
  createdAt: number;
}

interface HistoryEntry {
  id: string;
  timestamp: number;
  scenario: Scenario;
  json: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
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
  notes: "",
};

const PRESETS_KEY = "expert-calibration-presets";
const HISTORY_KEY = "expert-calibration-history";
const HISTORY_LIMIT = 20;

function formatScenario(s: Scenario): string {
  const priority = s.priority === "Max Image Quality" ? "Max Quality" : "Silent Fan";
  const base = `Title: ${s.title || "Untitled"} | Res: ${s.resolution} | Format: ${s.format} | Source: ${s.source} | Service: ${s.service} | Lighting: ${s.lighting}% | Screen: ${s.screen} | Priority: ${priority}`;
  return s.notes.trim() ? `${base}\nNotes: ${s.notes.trim()}` : base;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExpertCalibration() {
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [json, setJson] = useState("");
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<ExpertPreset[]>(() =>
    loadJSON<ExpertPreset[]>(PRESETS_KEY, []),
  );
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    loadJSON<HistoryEntry[]>(HISTORY_KEY, []),
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [refining, setRefining] = useState(false);
  const [savingToKb, setSavingToKb] = useState(false);
  const [liveBaseline, setLiveBaseline] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const update = <K extends keyof Scenario>(key: K, value: Scenario[K]) => {
    setScenario((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = async () => {
    const text = formatScenario(scenario);
    const title = scenario.title.trim() || "Expert calibration scenario";
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        toast.success("Scenario öppnat för delning");
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success("Scenario copied! Send this to your expert.", {
        description: text,
      });
    } catch {
      downloadTextFile(`expert-scenario-${Date.now()}.txt`, text);
      toast.success("Kunde inte kopiera — laddade ner textfil istället");
    }
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Ange ett namn för presetten");
      return;
    }
    const preset: ExpertPreset = {
      id: crypto.randomUUID(),
      name,
      scenario,
      json,
      createdAt: Date.now(),
    };
    setPresets((prev) => [preset, ...prev]);
    setPresetName("");
    setSelectedPresetId(preset.id);
    toast.success(`Preset "${name}" sparad`);
  };

  const handleLoadPreset = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setSelectedPresetId(id);
    setScenario(preset.scenario);
    setJson(preset.json);
    setChat([]);
    setChatInput("");
    toast.success(`Loaded "${preset.name}"`);
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId) return;
    const preset = presets.find((p) => p.id === selectedPresetId);
    setPresets((prev) => prev.filter((p) => p.id !== selectedPresetId));
    setSelectedPresetId("");
    if (preset) toast.success(`Removed "${preset.name}"`);
  };

  const handleClearForm = () => {
    setScenario(DEFAULT_SCENARIO);
    setJson("");
    setSelectedPresetId("");
    setPresetName("");
    setChat([]);
    setChatInput("");
    toast.success("Formuläret återställt");
  };

  const handleReuseHistory = (entry: HistoryEntry) => {
    setScenario(entry.scenario);
    setJson(entry.json);
    setChat([]);
    setChatInput("");
    toast.success("Inställningar laddade från historiken");
  };

  const handleClearHistory = () => {
    setHistory([]);
    toast.success("Historik rensad");
  };

  const callBrain = async (chatHistory: ChatMessage[], liveSettings?: Record<string, unknown>) => {
    let currentSettings: Record<string, unknown> = {};
    try {
      if (json.trim()) currentSettings = JSON.parse(json);
    } catch {
      /* ignore — let AI start from scratch */
    }
    const res = await fetch("/api/public/cinema-brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "calibrate",
        masterInstructions: getMasterInstructions(),
        scenario,
        currentSettings,
        liveSettings: liveSettings ?? null,
        chatHistory: chatHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `AI-fel (${res.status})`);
    const settings = data?.settings;
    if (!settings || typeof settings !== "object") {
      throw new Error("AI returnerade inga settings");
    }
    return settings as Record<string, unknown>;
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      // Step 1: Fetch live projector settings to use as baseline input.
      let liveSettings: Record<string, unknown> | undefined;
      const statusRes = await getStatus();
      if (statusRes.ok) {
        const parsed = parseStatus(statusRes.data);
        // Strip power; we only care about picture settings here.
        const { power: _p, ...rest } = parsed;
        if (Object.keys(rest).length > 0) {
          liveSettings = rest as Record<string, unknown>;
          setLiveBaseline(liveSettings);
          toast.info("Aktuella projektor-inställningar hämtade", {
            description: `${Object.keys(rest).length} fält lästa från projektorn`,
          });
        }
      } else {
        setLiveBaseline(null);
        toast.warning("Kunde inte läsa projektorns aktuella läge", {
          description: "AI fortsätter utan live-baseline",
        });
      }

      const settings = await callBrain([], liveSettings);
      const pretty = JSON.stringify(settings, null, 2);
      setJson(pretty);
      setChat([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: pretty,
          timestamp: Date.now(),
        },
      ]);
      toast.success("AI-kalibrering klar — granska, chatta för justeringar, tryck Apply", {
        description: `${Object.keys(settings).length} inställningar föreslagna`,
      });
    } catch (err) {
      toast.error("Kunde inte nå AI:n", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRefine = async () => {
    const text = chatInput.trim();
    if (!text) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const nextChat = [...chat, userMsg];
    setChat(nextChat);
    setChatInput("");
    setRefining(true);
    try {
      const settings = await callBrain(nextChat);
      const pretty = JSON.stringify(settings, null, 2);
      setJson(pretty);
      setChat([
        ...nextChat,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: pretty,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      toast.error("Refinement misslyckades", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefining(false);
    }
  };

  const handleSaveToKb = async () => {
    if (!json.trim()) {
      toast.error("Ingen aktuell JSON att spara från");
      return;
    }
    let finalSettings: Record<string, unknown>;
    try {
      finalSettings = JSON.parse(json);
    } catch {
      toast.error("Ogiltig JSON");
      return;
    }
    setSavingToKb(true);
    try {
      const res = await fetch("/api/public/cinema-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summarize",
          masterInstructions: getMasterInstructions(),
          scenario,
          finalSettings,
          chatHistory: chat.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || `AI-fel (${res.status})`);
        return;
      }
      const summary: string = data?.summary ?? "";
      if (!summary) {
        toast.error("AI returnerade ingen sammanfattning");
        return;
      }
      appendToMasterInstructions(summary);
      toast.success("Lärdomar sparade till Knowledge Base", {
        description: summary.split("\n")[0],
      });
    } catch (err) {
      toast.error("Kunde inte uppdatera KB", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingToKb(false);
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
      if (value === undefined || value === null) {
        setProgress({ done: i + 1, total: entries.length });
        continue;
      }
      const res = await sendCommand({
        action: key as Action,
        value: value as string | number,
      });
      if (!res.ok) failures++;
      setProgress({ done: i + 1, total: entries.length });
      if (i < entries.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    setApplying(false);
    setProgress(null);

    // Append to history
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      scenario,
      json,
    };
    setHistory((prev) => [entry, ...prev].slice(0, HISTORY_LIMIT));

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
      {/* Presets bar */}
      <section className="rounded-xl border border-border/60 bg-card/40 p-5 sm:p-6 backdrop-blur">
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">My Presets</h3>
            <p className="text-xs text-muted-foreground">
              Spara och ladda dina favoritkonfigurationer.
            </p>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Load Preset
            </Label>
            <div className="flex gap-2">
              <Select
                value={selectedPresetId}
                onValueChange={handleLoadPreset}
                disabled={presets.length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue
                    placeholder={presets.length === 0 ? "Inga sparade presets" : "Välj preset…"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleDeletePreset}
                disabled={!selectedPresetId}
                title="Ta bort vald preset"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Save Current as Preset
            </Label>
            <div className="flex gap-2">
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSavePreset();
                }}
              />
              <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
                <Save className="h-4 w-4 mr-1.5" />
                Save
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Questionnaire */}
      <section className="rounded-xl border border-border/60 bg-card/40 p-5 sm:p-6 backdrop-blur">
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Film className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Scenario Questionnaire</h3>
            <p className="text-xs text-muted-foreground">
              Beskriv visningsscenariot för din kalibreringsexpert.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleClearForm}>
            <Eraser className="h-4 w-4 mr-1.5" />
            Clear Form
          </Button>
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

          <Field label="Priority" icon={<Gauge className="h-4 w-4" />} className="sm:col-span-2">
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

          <Field
            label="Free-text Notes (skickas med till experten & AI)"
            icon={<MessageSquare className="h-4 w-4" />}
            className="sm:col-span-2"
          >
            <Textarea
              value={scenario.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="t.ex. 'mörka skuggdetaljer i grottscenen försvinner', 'vill ha varmare hudtoner', 'fläktljud får inte överstiga 28 dB'…"
              className="min-h-[80px] resize-y"
            />
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
          <div className="flex-1">
            <h3 className="text-base font-semibold">Apply Expert Settings</h3>
            <p className="text-xs text-muted-foreground">
              Låt Cinema Brain (AI) generera, eller klistra in JSON från experten.
            </p>
          </div>
          <KnowledgeBaseDialog />
          <Button onClick={handleAnalyze} disabled={analyzing} size="sm">
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Analyserar…
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-1.5" />
                AI Analyze
              </>
            )}
          </Button>
        </header>

        <div className="space-y-3">
          <RecipeDiffView json={json} baseline={liveBaseline} />

          <Label
            htmlFor="expert-json"
            className="text-xs uppercase tracking-wider text-muted-foreground"
          >
            JSON Payload
          </Label>
          <Textarea
            id="expert-json"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder={`{\n  "pic_mode": "cinema_film_1",\n  "contrast": 84,\n  "brightness": 50,\n  "laser_output": 90,\n  "hdr_enhancer": "middle"\n}`}
            spellCheck={false}
            className="font-mono text-sm min-h-[180px] resize-y"
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Skickar via <code className="text-primary/80">{`{ command: "key value" }`}</code> med
              100ms paus mellan varje.
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

      {/* Refinement Chat */}
      <section className="rounded-xl border border-border/60 bg-card/40 p-5 sm:p-6 backdrop-blur">
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Refinement Chat</h3>
            <p className="text-xs text-muted-foreground">
              Chatta med Cinema Brain — beskriv vad du vill justera, AI:n uppdaterar endast det som
              behövs i JSON ovan.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveToKb}
            disabled={savingToKb || !json.trim()}
            title="Låt AI sammanfatta lärdomarna och lägg till i Knowledge Base"
          >
            {savingToKb ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Sparar…
              </>
            ) : (
              <>
                <BookmarkPlus className="h-4 w-4 mr-1.5" />
                Save to Knowledge Base
              </>
            )}
          </Button>
        </header>

        {chat.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">
            Kör "AI Analyze" först — sedan kan du chatta här för att finjustera.
          </p>
        ) : (
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 mb-4">
            {chat.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-primary/10 text-foreground"
                      : "bg-muted/60 text-foreground"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <pre className="whitespace-pre-wrap font-mono text-xs">{m.content}</pre>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-accent/40">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="t.ex. 'sänk lasern lite, fläkten hörs', 'mer skuggdetaljer'…"
            disabled={refining}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleRefine();
              }
            }}
          />
          <Button
            onClick={handleRefine}
            disabled={refining || !chatInput.trim() || chat.length === 0}
          >
            {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </section>

      {/* History */}
      <section className="rounded-xl border border-border/60 bg-card/40 p-5 sm:p-6 backdrop-blur">
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <History className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Recent Calibrations</h3>
            <p className="text-xs text-muted-foreground">
              De senaste {HISTORY_LIMIT} applicerade kalibreringarna.
            </p>
          </div>
          {history.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearHistory}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              Clear
            </Button>
          )}
        </header>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">
            Inga applicerade kalibreringar ännu.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Movie Title</TableHead>
                <TableHead>Resolution</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-xs">
                    {new Date(h.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>{h.scenario.title || "—"}</TableCell>
                  <TableCell>{h.scenario.resolution}</TableCell>
                  <TableCell>{h.scenario.format}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleReuseHistory(h)}>
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Re-use
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
        checked ? "border-primary/60 bg-primary/5" : "border-border/60 hover:bg-accent/30"
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

void sendCommand;
export type { Action };

const RECIPE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "pic_mode", label: "Picture Mode" },
  { key: "color_temp", label: "Color Temperature" },
  { key: "gamma_correction", label: "Gamma" },
  { key: "laser_output", label: "Laser Output" },
  { key: "brightness", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "color", label: "Color" },
  { key: "sharpness", label: "Sharpness" },
  { key: "reality_creation", label: "Reality Creation" },
  { key: "hdr_enhancer", label: "HDR Enhancer" },
  { key: "dynamic_control", label: "Dynamic Control" },
  { key: "motionflow", label: "Motionflow" },
];

function RecipeDiffView({
  json,
  baseline,
}: {
  json: string;
  baseline: Record<string, unknown> | null;
}) {
  let parsed: Record<string, unknown> | null = null;
  try {
    if (json.trim()) {
      const obj = JSON.parse(json);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        parsed = obj as Record<string, unknown>;
      }
    }
  } catch {
    /* ignore */
  }
  if (!parsed) return null;

  const fmt = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Recipe (changes shown in italic)
        </p>
        {baseline ? (
          <span className="text-[10px] text-muted-foreground">vs live baseline</span>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">
            no live baseline — diff disabled
          </span>
        )}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {RECIPE_FIELDS.map(({ key, label }) => {
          if (!(key in parsed!)) return null;
          const newVal = parsed![key];
          const oldVal = baseline ? baseline[key] : undefined;
          const changed =
            baseline !== null && oldVal !== undefined && String(oldVal) !== String(newVal);
          return (
            <div
              key={key}
              className="flex items-baseline justify-between gap-2 px-2 py-1 rounded text-xs"
            >
              <span className="text-muted-foreground">{label}</span>
              <span
                className={
                  changed ? "italic font-semibold text-primary" : "font-mono text-foreground"
                }
                title={changed ? `was: ${fmt(oldVal)} → now: ${fmt(newVal)}` : undefined}
              >
                {changed ? (
                  <>
                    <span className="line-through opacity-60 mr-1 not-italic font-normal">
                      {fmt(oldVal)}
                    </span>
                    {fmt(newVal)}
                  </>
                ) : (
                  fmt(newVal)
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
