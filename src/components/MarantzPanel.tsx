import { useEffect, useState } from "react";
import {
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Tv,
  Disc,
  Cast,
  Satellite,
  Radio,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendMarantz } from "@/lib/projector";
import {
  fetchInputs,
  upsertInput,
  deleteInput,
  type MarantzInput,
} from "@/lib/scenes";
import { toast } from "sonner";

const ICON_MAP: Record<string, typeof Tv> = {
  tv: Tv,
  disc: Disc,
  cast: Cast,
  satellite: Satellite,
  radio: Radio,
};

const ICON_OPTIONS = ["tv", "disc", "cast", "satellite", "radio"];

// Standardiserade Marantz-input-koder (skickas som SI<CODE>)
const MARANTZ_INPUT_CODES: { code: string; label: string }[] = [
  { code: "CBL/SAT", label: "CBL/SAT" },
  { code: "DVD", label: "DVD" },
  { code: "BD", label: "Blu-ray (BD)" },
  { code: "GAME", label: "Game" },
  { code: "AUX1", label: "AUX1" },
  { code: "AUX2", label: "AUX2" },
  { code: "MPLAY", label: "Media Player (MPLAY)" },
  { code: "TV", label: "TV Audio" },
  { code: "TUNER", label: "Tuner" },
  { code: "PHONO", label: "Phono" },
  { code: "CD", label: "CD" },
  { code: "NET", label: "NET (Streaming)" },
  { code: "BT", label: "Bluetooth" },
  { code: "8K", label: "8K" },
];

interface Props {
  householdCode: string;
  /** Aktuell input enligt status — markeras som aktiv. */
  activeInput?: string | null;
}

export function MarantzPanel({ householdCode, activeInput }: Props) {
  const [inputs, setInputs] = useState<MarantzInput[]>([]);
  const [muted, setMuted] = useState(false);
  const [editing, setEditing] = useState<MarantzInput | "new" | null>(null);

  const refresh = async () => {
    const list = await fetchInputs(householdCode);
    setInputs(list);
  };

  useEffect(() => {
    refresh();
  }, [householdCode]);

  const send = async (cmd: string, label: string) => {
    const res = await sendMarantz(cmd);
    if (!res.ok) {
      toast.error(`Marantz ${label} misslyckades`, {
        description: res.error || `Status ${res.status}`,
      });
    }
  };

  const handleInput = (i: MarantzInput) => send(`SI${i.marantz_code}`, i.label);

  const handleSaveInput = async (input: Omit<MarantzInput, "id">) => {
    await upsertInput(householdCode, input);
    toast.success("Källa sparad");
    setEditing(null);
    refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteInput(id);
    toast.success("Källa borttagen");
    refresh();
  };

  return (
    <div className="space-y-4">
      {/* Volume + Mute */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Volume
          </Label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button
            size="lg"
            variant="secondary"
            className="h-16 text-lg"
            onClick={() => send("MVDOWN", "vol-")}
          >
            <Minus className="h-6 w-6" />
          </Button>
          <Button
            size="lg"
            variant={muted ? "destructive" : "secondary"}
            className="h-16 text-lg"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              send(`MU${next ? "ON" : "OFF"}`, "mute");
            }}
          >
            {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-16 text-lg"
            onClick={() => send("MVUP", "vol+")}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </Card>

      {/* Source picker */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Source
          </Label>
          <Dialog
            open={editing !== null}
            onOpenChange={(o) => !o && setEditing(null)}
          >
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setEditing("new")}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Lägg till
              </Button>
            </DialogTrigger>
            {editing && (
              <InputEditor
                input={editing === "new" ? null : editing}
                nextPosition={
                  inputs.length > 0
                    ? Math.max(...inputs.map((i) => i.position)) + 1
                    : 1
                }
                onSave={handleSaveInput}
                onDelete={
                  editing !== "new" ? () => handleDelete(editing.id) : undefined
                }
              />
            )}
          </Dialog>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {inputs.map((i) => {
            const Icon = ICON_MAP[i.icon] ?? Tv;
            const active = activeInput === i.marantz_code;
            return (
              <div key={i.id} className="relative group">
                <Button
                  variant={active ? "default" : "secondary"}
                  className={`w-full h-20 flex-col gap-1.5 ${
                    active ? "shadow-[var(--cinema-glow)]" : ""
                  }`}
                  onClick={() => handleInput(i)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs">{i.label}</span>
                </Button>
                <button
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-foreground"
                  onClick={() => setEditing(i)}
                  aria-label="Redigera"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function InputEditor({
  input,
  nextPosition,
  onSave,
  onDelete,
}: {
  input: MarantzInput | null;
  nextPosition: number;
  onSave: (i: Omit<MarantzInput, "id">) => void;
  onDelete?: () => void;
}) {
  const [label, setLabel] = useState(input?.label ?? "");
  const [code, setCode] = useState(input?.marantz_code ?? "");
  const [icon, setIcon] = useState(input?.icon ?? "tv");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{input ? "Redigera källa" : "Ny källa"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Namn</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Apple TV"
          />
        </div>
        <div className="space-y-1">
          <Label>Marantz input-kod</Label>
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger>
              <SelectValue placeholder="Välj input…" />
            </SelectTrigger>
            <SelectContent>
              {MARANTZ_INPUT_CODES.map((opt) => (
                <SelectItem key={opt.code} value={opt.code}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Skickas som <code className="text-primary/80">SI{code || "<KOD>"}</code> till receivern.
          </p>
        </div>
        <div className="space-y-1">
          <Label>Ikon</Label>
          <Select value={icon} onValueChange={setIcon}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ICON_OPTIONS.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter className="flex !justify-between">
        <div>
          {onDelete && (
            <Button variant="ghost" onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1.5" />
              Ta bort
            </Button>
          )}
        </div>
        <Button
          onClick={() =>
            onSave({
              position: input?.position ?? nextPosition,
              label: label.trim(),
              marantz_code: code.trim(),
              icon,
            })
          }
          disabled={!label.trim() || !code.trim()}
        >
          <Check className="h-4 w-4 mr-1.5" />
          Spara
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
