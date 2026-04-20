import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendCommand } from "@/lib/projector";
import { toast } from "sonner";
import { useState } from "react";

export function PowerControl() {
  const [busy, setBusy] = useState<"on" | "off" | null>(null);

  const handle = async (value: "on" | "off") => {
    setBusy(value);
    const res = await sendCommand({ action: "power", value });
    setBusy(null);
    if (res.ok) {
      toast.success(value === "on" ? "Projektor startas…" : "Projektor stängs av…");
    } else {
      toast.error("Bridge-fel", { description: res.error || `Status ${res.status}` });
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Button
        size="lg"
        onClick={() => handle("on")}
        disabled={busy !== null}
        className="h-24 text-lg font-semibold bg-gradient-to-br from-primary to-primary/70 text-primary-foreground hover:from-primary hover:to-primary shadow-[var(--cinema-glow)] hover:shadow-[var(--cinema-glow-strong)] transition-all"
      >
        <Power className="h-6 w-6 mr-2" />
        Power ON
      </Button>
      <Button
        size="lg"
        variant="destructive"
        onClick={() => handle("off")}
        disabled={busy !== null}
        className="h-24 text-lg font-semibold shadow-lg hover:shadow-[0_0_30px_oklch(0.62_0.22_27/0.5)] transition-all"
      >
        <Power className="h-6 w-6 mr-2" />
        Power OFF
      </Button>
    </div>
  );
}
