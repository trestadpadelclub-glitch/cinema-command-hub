import { useEffect, useState } from "react";
import { Power, Wifi, WifiOff, RotateCw, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchAppSettings, updateAppSettings } from "@/lib/scenes";
import { toast } from "sonner";

interface Props {
  householdCode: string;
  onChange?: () => void;
  onManualPoll?: () => void;
}

const PRESETS = [3, 5, 10, 30, 60];

export function PollingControl({ householdCode, onChange, onManualPoll }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [interval, setInterval] = useState(5);
  const [code, setCode] = useState(householdCode);

  useEffect(() => {
    fetchAppSettings(householdCode).then((s) => {
      setEnabled(s.poll_enabled);
      setInterval(s.poll_interval_seconds);
    });
    setCode(householdCode);
  }, [householdCode]);

  const save = async (next: { poll_enabled?: boolean; poll_interval_seconds?: number }) => {
    await updateAppSettings(householdCode, next);
    onChange?.();
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {enabled ? (
            <Wifi className="h-5 w-5 text-emerald-400" />
          ) : (
            <WifiOff className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <Label className="text-sm font-semibold">Auto-Refresh</Label>
            <p className="text-xs text-muted-foreground">
              Polla bridge för status med jämna mellanrum
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            save({ poll_enabled: v });
          }}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Intervall</Label>
          <Select
            value={String(interval)}
            onValueChange={(v) => {
              const n = Number(v);
              setInterval(n);
              save({ poll_interval_seconds: n });
            }}
            disabled={!enabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} sekunder
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="secondary"
          onClick={onManualPoll}
          title="Hämta status nu"
        >
          <RotateCw className="h-4 w-4 mr-1.5" />
          Polla nu
        </Button>
      </div>

      <div className="border-t pt-4 space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
          Household-kod (delas mellan dina enheter)
        </Label>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono"
            placeholder="bio-1234"
          />
          <Button
            variant="secondary"
            disabled={code.trim() === householdCode || !code.trim()}
            onClick={() => {
              localStorage.setItem("cinema_household_code", code.trim());
              window.location.reload();
            }}
          >
            <Save className="h-4 w-4 mr-1.5" />
            Byt
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Skriv in samma kod på mobilen för att synka scener och automation.
        </p>
      </div>
    </Card>
  );
}
