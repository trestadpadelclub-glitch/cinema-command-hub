import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Power,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Loader2,
  RefreshCw,
  CircleDot,
  CircleOff,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { sendMarantz, marantzMvToDb, type MarantzStatus } from "@/lib/projector";
import { fetchInputs, fetchAppSettings, updateAppSettings, type MarantzInput, type MarantzLabels } from "@/lib/scenes";
import { toast } from "sonner";

interface Props {
  householdCode: string;
  marantzStatus: MarantzStatus | null;
  marantzReachable: boolean | null;
  onMarantzRefresh: () => Promise<void>;
}

const SMART_SELECTS = [1, 2, 3, 4] as const;

// Marantz/Denon MS-koder. Skickas som `MS<CODE>`. Statussvar returnerar
// motsvarande sträng (t.ex. "DOLBY ATMOS"). Vissa upmixers (Atmos/Auro/Neural:X)
// är bara giltiga om aktuell källa har en kompatibel bitström — annars
// ignorerar AVR:n kommandot.
const SOUND_MODES: { code: string; label: string }[] = [
  // Snabbval — AVR väljer bästa läge utifrån källa
  { code: "MOVIE", label: "Movie" },
  { code: "MUSIC", label: "Music" },
  { code: "GAME", label: "Game" },
  { code: "AUTO", label: "Auto" },
  // Surround-upmixers
  { code: "DOLBY ATMOS", label: "Dolby Atmos" },
  { code: "DOLBY SURROUND", label: "Dolby Surround" },
  { code: "DTS NEURAL:X", label: "DTS Neural:X" },
  { code: "DTS VIRTUAL:X", label: "DTS Virtual:X" },
  { code: "AURO3D", label: "Auro-3D" },
  { code: "AURO2DSURR", label: "Auro-2D Surround" },
  // Native bitstream-lägen
  { code: "DOLBY DIGITAL", label: "Dolby Digital" },
  { code: "DTS SURROUND", label: "DTS Surround" },
  { code: "MULTI CH IN", label: "Multi Ch In" },
  // Stereo / direct
  { code: "STEREO", label: "Stereo" },
  { code: "MCH STEREO", label: "Multi Ch Stereo" },
  { code: "VIRTUAL", label: "Virtual" },
  { code: "DIRECT", label: "Direct" },
  { code: "PURE DIRECT", label: "Pure Direct" },
];

const DIRAC_SLOTS: { value: string; label: string }[] = [
  { value: "OFF", label: "Off" },
  { value: "1", label: "Slot 1" },
  { value: "2", label: "Slot 2" },
  { value: "3", label: "Slot 3" },
];

const SPEAKER_PRESETS = [1, 2] as const;

export function MarantzRemote({
  householdCode,
  marantzStatus,
  marantzReachable,
  onMarantzRefresh,
}: Props) {
  const [inputs, setInputs] = useState<MarantzInput[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Lokal UI-state — speglar senast skickade kommando, men synkas mot status nedan.
  const [selectedInput, setSelectedInput] = useState<string>("");
  const [smartSelect, setSmartSelect] = useState<string>("");
  const [soundMode, setSoundMode] = useState<string>("");
  const [diracSlot, setDiracSlot] = useState<string>("");
  const [speakerPreset, setSpeakerPreset] = useState<string>("");

  // Volym-slider (lokalt drag-värde, optimistisk uppdatering)
  const [volDrag, setVolDrag] = useState<number | null>(null);
  const volTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Anpassningsbara namn för Speaker presets & Dirac slots
  const [labels, setLabels] = useState<MarantzLabels>({});

  // Status kommer från bryggan (pollas) och används både för visning och aktiva val.
  const muted = marantzStatus?.mute ?? false;
  const currentPower = marantzStatus?.power === "on" ? "ON" : marantzStatus?.power === "off" ? "Standby" : "—";
  const currentVolume = (() => {
    const volNum = marantzStatus?.volume;
    if (typeof volNum !== "number") return "—";
    const volDb = marantzMvToDb(volNum);
    return `${volNum} (${volDb >= 0 ? "+" : ""}${volDb} dB)`;
  })();
  const liveVolume = volDrag ?? marantzStatus?.volume ?? 0;

  useEffect(() => {
    fetchInputs(householdCode).then(setInputs);
    fetchAppSettings(householdCode).then((s) => setLabels(s.marantz_labels ?? {}));
  }, [householdCode]);

  const speakerPresetLabel = (n: 1 | 2): string =>
    (n === 1 ? labels.speaker_preset_1 : labels.speaker_preset_2) || `Preset ${n}`;
  const diracSlotLabel = (n: 1 | 2 | 3): string =>
    (n === 1 ? labels.dirac_1 : n === 2 ? labels.dirac_2 : labels.dirac_3) || `Slot ${n}`;

  const saveLabel = async (key: keyof MarantzLabels, value: string) => {
    const next = { ...labels, [key]: value.trim() || undefined };
    setLabels(next);
    try {
      await updateAppSettings(householdCode, { marantz_labels: next });
    } catch (e) {
      toast.error("Kunde inte spara namn", { description: String(e) });
    }
  };

  // Synka radio-knappar / dropdown med faktisk receiver-status när den uppdateras.
  useEffect(() => {
    if (!marantzStatus) return;
    if (marantzStatus.input) setSelectedInput(marantzStatus.input);
    if (typeof marantzStatus.smart_select === "number") {
      setSmartSelect(String(marantzStatus.smart_select));
    }
    if (marantzStatus.sound_mode) {
      const match = SOUND_MODES.find((m) => m.code === marantzStatus.sound_mode);
      setSoundMode(match ? match.code : marantzStatus.sound_mode);
    }
    if (marantzStatus.dirac) setDiracSlot(marantzStatus.dirac);
    if (typeof marantzStatus.speaker_preset === "number") {
      setSpeakerPreset(String(marantzStatus.speaker_preset));
    }
  }, [
    marantzStatus?.input,
    marantzStatus?.smart_select,
    marantzStatus?.sound_mode,
    marantzStatus?.dirac,
    marantzStatus?.speaker_preset,
  ]);

  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      await onMarantzRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const send = async (cmd: string, label: string, key: string) => {
    setBusy(key);
    const res = await sendMarantz(cmd);
    setBusy(null);
    if (!res.ok) {
      toast.error(`Marantz ${label} misslyckades`, {
        description: res.error || `Status ${res.status}`,
      });
      return false;
    }
    toast.success(`${label} skickat`);
    // Refresha status efter ~600ms så användaren ser uppdaterat värde.
    setTimeout(() => { onMarantzRefresh().catch(() => {}); }, 600);
    return true;
  };

  const handlePower = (state: "on" | "off") =>
    send(state === "on" ? "PWON" : "PWSTANDBY", `Power ${state.toUpperCase()}`, `pw-${state}`);

  const handleInput = (code: string) => {
    setSelectedInput(code);
    send(`SI${code}`, `Input ${code}`, `input`);
  };

  const handleSmart = (n: string) => {
    setSmartSelect(n);
    send(`MSSMART${n}`, `Smart Select ${n}`, `smart`);
  };

  const handleSoundMode = (code: string) => {
    setSoundMode(code);
    send(`MS${code}`, `Sound Mode ${code}`, `sm`);
  };

  const handleDirac = (slot: string) => {
    setDiracSlot(slot);
    const cmd = slot === "OFF" ? "PSDIRAC OFF" : `PSDIRAC ${slot}`;
    send(cmd, `Dirac ${slot}`, `dirac`);
  };

  const handleSpeaker = (n: string) => {
    setSpeakerPreset(n);
    send(`SPPR ${n}`, `Speaker Preset ${n}`, `spk`);
  };

  // Volym-slider: optimistisk drag, debounced send som absolut MV-värde.
  const handleVolumeDrag = (v: number) => {
    setVolDrag(v);
    if (volTimerRef.current) clearTimeout(volTimerRef.current);
    volTimerRef.current = setTimeout(() => {
      const padded = v.toString().padStart(2, "0");
      send(`MV${padded}`, `Volym ${v}`, "vol-set").finally(() => {
        // Släpp drag-värdet så status-pollen tar över UI:t igen.
        setTimeout(() => setVolDrag(null), 800);
      });
    }, 250);
  };

  const inputLabel = (() => {
    if (!marantzStatus?.input) return null;
    const match = inputs.find((i) => i.marantz_code === marantzStatus.input);
    return match ? `${match.label} (${match.marantz_code})` : marantzStatus.input;
  })();
  const soundModeLabel = (() => {
    if (!marantzStatus?.sound_mode) return "—";
    return SOUND_MODES.find((m) => m.code === marantzStatus.sound_mode)?.label ?? marantzStatus.sound_mode;
  })();
  const diracLabel = (() => {
    if (!marantzStatus?.dirac) return "—";
    if (marantzStatus.dirac === "OFF") return "Av";
    const n = Number(marantzStatus.dirac);
    return n === 1 || n === 2 || n === 3 ? diracSlotLabel(n) : `Slot ${marantzStatus.dirac}`;
  })();
  const speakerLabel = (() => {
    const n = marantzStatus?.speaker_preset;
    if (n === 1 || n === 2) return speakerPresetLabel(n);
    return "—";
  })();
  const smartLabel = marantzStatus?.smart_select != null ? `Smart ${marantzStatus.smart_select}` : "—";

  return (
    <div className="space-y-4">
      {/* Status — speglar receiverns aktuella tillstånd */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Aktuell status
          </Label>
          <div className="flex items-center gap-2">
            {marantzReachable === false ? (
              <Badge variant="destructive" className="gap-1">
                <CircleOff className="h-3 w-3" /> Offline
              </Badge>
            ) : marantzReachable === true ? (
              <Badge variant="secondary" className="gap-1 bg-emerald-600/15 text-emerald-400 border-emerald-600/30">
                <CircleDot className="h-3 w-3" /> Online
              </Badge>
            ) : (
              <Badge variant="secondary">…</Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={refreshStatus}
              disabled={refreshing}
              aria-label="Uppdatera status"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {marantzReachable === false ? (
          <p className="text-xs text-muted-foreground">
            Kunde inte nå bryggan. Kontrollera att <code>Formuler_alfa_status_v33.py</code> körs och att Marantz är på samma nät.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <StatusItem
              label="Power"
              value={
                marantzStatus?.power === "on"
                  ? <span className="text-emerald-400">● ON</span>
                  : marantzStatus?.power === "off"
                    ? <span className="text-muted-foreground">○ Standby</span>
                    : "—"
              }
            />
            <StatusItem
              label="Volym"
              value={currentVolume}
            />
            <StatusItem
              label="Mute"
              value={muted ? <span className="text-destructive">MUTED</span> : "Av"}
            />
            <StatusItem label="Källa" value={inputLabel ?? marantzStatus?.input ?? "—"} />
            <StatusItem label="Sound mode" value={marantzStatus?.sound_mode ?? "—"} />
            <StatusItem
              label="Smart Select"
              value={marantzStatus?.smart_select != null ? `Smart ${marantzStatus.smart_select}` : "—"}
            />
            <StatusItem
              label="Dirac"
              value={marantzStatus?.dirac ? (marantzStatus.dirac === "OFF" ? "Av" : `Slot ${marantzStatus.dirac}`) : "—"}
            />
            <StatusItem
              label="Högtalare"
              value={marantzStatus?.speaker_preset != null ? `Preset ${marantzStatus.speaker_preset}` : "—"}
            />
          </div>
        )}
      </Card>

      {/* Power */}
      <Card className="p-4">
        <SettingHeader label="Power" value={currentPower} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            variant={marantzStatus?.power === "on" ? "default" : "secondary"}
            className={`h-14 ${marantzStatus?.power === "on" ? "shadow-[var(--cinema-glow)]" : ""}`}
            onClick={() => handlePower("on")}
            disabled={busy === "pw-on"}
          >
            {busy === "pw-on" ? (
              <Loader2 className="h-5 w-5 mr-1.5 animate-spin" />
            ) : (
              <Power className="h-5 w-5 mr-1.5" />
            )}
            ON
          </Button>
          <Button
            size="lg"
            variant={marantzStatus?.power === "off" ? "default" : "destructive"}
            className={`h-14 ${marantzStatus?.power === "off" ? "shadow-[var(--cinema-glow)]" : ""}`}
            onClick={() => handlePower("off")}
            disabled={busy === "pw-off"}
          >
            {busy === "pw-off" ? (
              <Loader2 className="h-5 w-5 mr-1.5 animate-spin" />
            ) : (
              <Power className="h-5 w-5 mr-1.5" />
            )}
            OFF / Standby
          </Button>
        </div>
      </Card>

      {/* Volume */}
      <Card className="p-4">
        <SettingHeader label="Volume" value={`${currentVolume}${muted ? " · Muted" : ""}`} />

        {/* Slider — drag för exakt volym (MV-skala 0..98) */}
        <div className="mb-4 px-1">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Drag för exakt volym
            </span>
            <span className="font-mono text-sm tabular-nums text-primary">
              MV{liveVolume.toString().padStart(2, "0")} ·{" "}
              {marantzMvToDb(liveVolume) >= 0 ? "+" : ""}
              {marantzMvToDb(liveVolume)} dB
            </span>
          </div>
          <Slider
            value={[liveVolume]}
            min={0}
            max={98}
            step={1}
            onValueChange={(v) => handleVolumeDrag(v[0])}
            disabled={marantzReachable === false}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button
            size="lg"
            variant="secondary"
            className="h-16 text-lg"
            onClick={() => send("MVDOWN", "Vol-", "vol-")}
            disabled={busy === "vol-"}
          >
            <Minus className="h-6 w-6" />
          </Button>
          <Button
            size="lg"
            variant={muted ? "destructive" : "secondary"}
            className="h-16 text-lg"
            onClick={async () => {
              const next = !muted;
              await send(
                `MU${next ? "ON" : "OFF"}`,
                `Mute ${next ? "ON" : "OFF"}`,
                "mute",
              );
            }}
            disabled={busy === "mute"}
          >
            {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-16 text-lg"
            onClick={() => send("MVUP", "Vol+", "vol+")}
            disabled={busy === "vol+"}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </Card>

      {/* Input source dropdown */}
      <Card className="p-4">
        <SettingHeader label="Input Source" value={inputLabel ?? marantzStatus?.input ?? "—"} />
        <Select value={selectedInput} onValueChange={handleInput}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Välj källa…" />
          </SelectTrigger>
          <SelectContent>
            {inputs.length === 0 && (
              <SelectItem value="__none" disabled>
                Inga källor — lägg till i Devices-fliken
              </SelectItem>
            )}
            {inputs.map((i) => (
              <SelectItem key={i.id} value={i.marantz_code}>
                {i.label}{" "}
                <span className="text-muted-foreground text-xs ml-1">
                  ({i.marantz_code})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {/* Smart Select */}
      <Card className="p-4">
        <SettingHeader label="Smart Select" value={smartLabel} />
        <RadioGroup
          value={smartSelect}
          onValueChange={handleSmart}
          className="grid grid-cols-4 gap-2"
        >
          {SMART_SELECTS.map((n) => {
            const val = String(n);
            const active = smartSelect === val;
            return (
              <label
                key={n}
                htmlFor={`smart-${n}`}
                className={`flex flex-col items-center justify-center gap-1.5 h-16 rounded-md border cursor-pointer transition-colors ${
                  active
                    ? "border-primary bg-primary/15 shadow-[var(--cinema-glow)]"
                    : "border-border bg-secondary/40 hover:bg-secondary"
                }`}
              >
                <RadioGroupItem id={`smart-${n}`} value={val} className="sr-only" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Smart
                </span>
                <span className="text-lg font-semibold">{n}</span>
              </label>
            );
          })}
        </RadioGroup>
      </Card>

      {/* Sound Mode */}
      <Card className="p-4">
        <SettingHeader label="Sound Mode" value={soundModeLabel} />
        <RadioGroup
          value={soundMode}
          onValueChange={handleSoundMode}
          className="grid grid-cols-2 sm:grid-cols-3 gap-2"
        >
          {SOUND_MODES.map((m) => {
            const active = soundMode === m.code;
            return (
              <label
                key={m.code}
                htmlFor={`sm-${m.code}`}
                className={`flex items-center gap-2 px-3 h-11 rounded-md border cursor-pointer transition-colors ${
                  active
                    ? "border-primary bg-primary/15"
                    : "border-border bg-secondary/40 hover:bg-secondary"
                }`}
              >
                <RadioGroupItem id={`sm-${m.code}`} value={m.code} />
                <span className="text-sm">{m.label}</span>
              </label>
            );
          })}
        </RadioGroup>
      </Card>

      {/* Dirac Live slot */}
      <Card className="p-4">
        <SettingHeader label="Dirac Live" value={diracLabel} />
        <RadioGroup
          value={diracSlot}
          onValueChange={handleDirac}
          className="grid grid-cols-4 gap-2"
        >
          {DIRAC_SLOTS.map((s) => {
            const active = diracSlot === s.value;
            const display =
              s.value === "OFF"
                ? s.label
                : diracSlotLabel(Number(s.value) as 1 | 2 | 3);
            return (
              <label
                key={s.value}
                htmlFor={`dirac-${s.value}`}
                className={`flex items-center justify-center gap-2 h-12 rounded-md border cursor-pointer transition-colors ${
                  active
                    ? "border-primary bg-primary/15"
                    : "border-border bg-secondary/40 hover:bg-secondary"
                }`}
              >
                <RadioGroupItem id={`dirac-${s.value}`} value={s.value} />
                <span className="text-sm truncate">{display}</span>
              </label>
            );
          })}
        </RadioGroup>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <LabelEditor
            title="Slot 1 namn"
            value={labels.dirac_1 ?? ""}
            placeholder="t.ex. Film"
            onSave={(v) => saveLabel("dirac_1", v)}
          />
          <LabelEditor
            title="Slot 2 namn"
            value={labels.dirac_2 ?? ""}
            placeholder="t.ex. Musik"
            onSave={(v) => saveLabel("dirac_2", v)}
          />
          <LabelEditor
            title="Slot 3 namn"
            value={labels.dirac_3 ?? ""}
            placeholder="t.ex. Sport"
            onSave={(v) => saveLabel("dirac_3", v)}
          />
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Skickar <code className="text-primary/80">PSDIRAC 1/2/3</code> eller{" "}
          <code className="text-primary/80">PSDIRAC OFF</code>.
        </p>
      </Card>

      {/* Speaker preset */}
      <Card className="p-4">
        <SettingHeader label="Speaker Preset" value={speakerLabel} />
        <RadioGroup
          value={speakerPreset}
          onValueChange={handleSpeaker}
          className="grid grid-cols-2 gap-2"
        >
          {SPEAKER_PRESETS.map((n) => {
            const val = String(n);
            const active = speakerPreset === val;
            return (
              <label
                key={n}
                htmlFor={`spk-${n}`}
                className={`flex flex-col items-center justify-center gap-1 h-16 rounded-md border cursor-pointer transition-colors ${
                  active
                    ? "border-primary bg-primary/15 shadow-[var(--cinema-glow)]"
                    : "border-border bg-secondary/40 hover:bg-secondary"
                }`}
              >
                <RadioGroupItem id={`spk-${n}`} value={val} className="sr-only" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Högtalare
                </span>
                <span className="text-base font-semibold truncate max-w-full px-2">
                  {speakerPresetLabel(n)}
                </span>
              </label>
            );
          })}
        </RadioGroup>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <LabelEditor
            title="Preset 1 namn"
            value={labels.speaker_preset_1 ?? ""}
            placeholder="t.ex. 7.1.4 Atmos"
            onSave={(v) => saveLabel("speaker_preset_1", v)}
          />
          <LabelEditor
            title="Preset 2 namn"
            value={labels.speaker_preset_2 ?? ""}
            placeholder="t.ex. 5.1 Stereo+Sub"
            onSave={(v) => saveLabel("speaker_preset_2", v)}
          />
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Skickar <code className="text-primary/80">SPPR 1</code> /{" "}
          <code className="text-primary/80">SPPR 2</code>.
        </p>
      </Card>
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium truncate">{value}</span>
    </div>
  );
}

function SettingHeader({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <span className="max-w-[65%] truncate rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
        {value}
      </span>
    </div>
  );
}

function LabelEditor({
  title,
  value,
  placeholder,
  onSave,
}: {
  title: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-border bg-secondary/30 hover:bg-secondary text-left transition-colors"
      >
        <span className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          <span className="text-xs truncate">
            {value || <span className="text-muted-foreground italic">{placeholder ?? "— ange namn —"}</span>}
          </span>
        </span>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void onSave(draft);
            setEditing(false);
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="h-9 text-xs"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 flex-shrink-0"
        onClick={() => {
          void onSave(draft);
          setEditing(false);
        }}
        aria-label="Spara"
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 flex-shrink-0"
        onClick={() => {
          setDraft(value);
          setEditing(false);
        }}
        aria-label="Avbryt"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
