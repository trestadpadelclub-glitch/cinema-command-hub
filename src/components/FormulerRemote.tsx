import { useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  ArrowLeft,
  Menu as MenuIcon,
  Power,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { sendFormulerCommand } from "@/lib/projector";
import { toast } from "sonner";

const KEYCODES = {
  up: "KEYCODE_DPAD_UP",
  down: "KEYCODE_DPAD_DOWN",
  left: "KEYCODE_DPAD_LEFT",
  right: "KEYCODE_DPAD_RIGHT",
  ok: "KEYCODE_DPAD_CENTER",
  back: "KEYCODE_BACK",
  home: "KEYCODE_HOME",
  menu: "KEYCODE_MENU",
  power: "KEYCODE_POWER",
} as const;

type KeyName = keyof typeof KEYCODES;

export function FormulerRemote() {
  const [busy, setBusy] = useState<KeyName | null>(null);

  const press = async (key: KeyName, label: string) => {
    setBusy(key);
    const res = await sendFormulerCommand(KEYCODES[key]);
    setBusy(null);
    if (!res.ok) {
      toast.error(`Formuler ${label} misslyckades`, {
        description: res.error || `Status ${res.status}`,
      });
    }
  };

  const dpadBtn = (
    key: KeyName,
    label: string,
    icon: React.ReactNode,
    extra = "",
  ) => (
    <Button
      variant="secondary"
      className={`h-16 w-16 rounded-full p-0 ${extra}`}
      onClick={() => press(key, label)}
      disabled={busy === key}
      aria-label={label}
    >
      {busy === key ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* D-Pad */}
      <Card className="p-6">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-4 block text-center">
          Navigation
        </Label>
        <div className="mx-auto w-fit grid grid-cols-3 grid-rows-3 gap-2 items-center justify-items-center">
          <div />
          {dpadBtn("up", "Upp", <ChevronUp className="h-7 w-7" />)}
          <div />
          {dpadBtn("left", "Vänster", <ChevronLeft className="h-7 w-7" />)}
          <Button
            className="h-20 w-20 rounded-full text-base font-semibold shadow-[var(--cinema-glow)]"
            onClick={() => press("ok", "OK")}
            disabled={busy === "ok"}
            aria-label="OK"
          >
            {busy === "ok" ? <Loader2 className="h-6 w-6 animate-spin" /> : "OK"}
          </Button>
          {dpadBtn("right", "Höger", <ChevronRight className="h-7 w-7" />)}
          <div />
          {dpadBtn("down", "Ner", <ChevronDown className="h-7 w-7" />)}
          <div />
        </div>
      </Card>

      {/* Utility */}
      <Card className="p-4">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-3 block">
          Funktioner
        </Label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            className="h-14 flex-col gap-1"
            onClick={() => press("back", "Back")}
            disabled={busy === "back"}
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-xs">Back</span>
          </Button>
          <Button
            variant="secondary"
            className="h-14 flex-col gap-1"
            onClick={() => press("home", "Home")}
            disabled={busy === "home"}
          >
            <Home className="h-5 w-5" />
            <span className="text-xs">Home</span>
          </Button>
          <Button
            variant="secondary"
            className="h-14 flex-col gap-1"
            onClick={() => press("menu", "Menu")}
            disabled={busy === "menu"}
          >
            <MenuIcon className="h-5 w-5" />
            <span className="text-xs">Menu</span>
          </Button>
        </div>
        <div className="mt-2">
          <Button
            variant="ghost"
            className="w-full h-11"
            onClick={() => press("power", "Power")}
            disabled={busy === "power"}
          >
            <Power className="h-4 w-4 mr-1.5" />
            Power
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Skickar ADB-keyevents via bridge:{" "}
          <code className="text-primary/80">/api/formuler</code>
        </p>
      </Card>
    </div>
  );
}
