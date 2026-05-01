import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Check, AlertCircle, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getKioskEnabled, setKioskEnabled } from "@/hooks/useKioskMode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_BRIDGE_URL,
  getBridgeUrl,
  setBridgeUrl,
  getStatus,
} from "@/lib/projector";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(DEFAULT_BRIDGE_URL);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [kiosk, setKiosk] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl(getBridgeUrl());
      setTestResult(null);
      setKiosk(getKioskEnabled());
    }
  }, [open]);

  const handleKioskToggle = (v: boolean) => {
    setKiosk(v);
    setKioskEnabled(v);
  };

  const handleSave = () => {
    setBridgeUrl(url.trim() || DEFAULT_BRIDGE_URL);
    setOpen(false);
  };

  const handleReset = () => {
    setUrl(DEFAULT_BRIDGE_URL);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setBridgeUrl(url.trim() || DEFAULT_BRIDGE_URL);
    const res = await getStatus();
    setTesting(false);
    if (res.ok) {
      setTestResult({ ok: true, msg: `Anslutning OK (status ${res.status})` });
    } else {
      setTestResult({
        ok: false,
        msg: res.error || `Status ${res.status}`,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-accent/40"
          aria-label="Inställningar"
        >
          <SettingsIcon className="h-5 w-5 text-muted-foreground hover:text-primary" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bridge-inställningar</DialogTitle>
          <DialogDescription>
            URL till din lokala Python-bridge (Flask API). Sparas i webbläsaren.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="bridge-url">Bridge URL</Label>
            <Input
              id="bridge-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={DEFAULT_BRIDGE_URL}
              className="font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Standard: <code className="text-primary/80">{DEFAULT_BRIDGE_URL}</code>
              <br />
              Skriv <strong>basadressen</strong> (utan <code>/status</code>) — t.ex.{" "}
              <code className="text-primary/80">http://192.168.86.40:5000/api/projector</code>.
            </p>
            <p className="text-xs text-muted-foreground">
              Obs: Bridge URL sparas per webbadress. Om du använder publicerad sida behöver den sparas där också.
            </p>
            {typeof window !== "undefined" &&
              window.location.protocol === "https:" &&
              url.trim().toLowerCase().startsWith("http://") && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Sidan körs på <strong>HTTPS</strong> men bridgen är{" "}
                    <strong>HTTP</strong>. Webbläsaren blockerar anropet (Mixed
                    Content). För LAN-läge: kör <code>bun dev --host</code> på
                    datorn och öppna appen via <code>http://&lt;datorns-IP&gt;:5173</code>{" "}
                    på alla enheter (samma WiFi).
                  </span>
                </div>
              )}
            <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Lokalt LAN-läge (iPhone/iPad på samma WiFi)</p>
              <p>1. Installera beroenden: <code>pip install tinytuya pychromecast</code></p>
              <p>2. Starta bryggan (v33): <code>python Formuler_alfa_status_v33.py</code></p>
              <p>3. Starta appen: <code>bun dev --host</code></p>
              <p>4. Öppna <code>http://&lt;datorns-IP&gt;:5173</code> i Safari på iPad/iPhone.</p>
              <p>5. Sätt Bridge URL ovan till <code>http://&lt;datorns-IP&gt;:5000/api/projector</code>.</p>
              <p className="pt-1 text-[10px]">
                <a href="/downloads/Formuler_alfa_status_v33.py" download className="text-primary underline">
                  Ladda ner v33
                </a>
                {" · "}
                <span>v32 fungerar fortfarande, men saknar Lights-status och Chromecast-fjärrkontroll.</span>
              </p>
            </div>
          </div>

          {/* Kiosk-läge */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <Label htmlFor="kiosk-toggle" className="font-medium cursor-pointer">
                  Kiosk-läge på telefon
                </Label>
              </div>
              <Switch id="kiosk-toggle" checked={kiosk} onCheckedChange={handleKioskToggle} />
            </div>
            <p className="text-xs text-muted-foreground">
              Visar en låst favorit-fjärrkontroll när appen öppnas på en telefon (skärm &lt; 768px). Ingen scroll, ingen meny.
              <strong className="text-foreground"> Dubbeltryck på rubriken</strong> för att låsa upp tillfälligt.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? "Testar…" : "Testa anslutning"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Återställ
            </Button>
          </div>

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                testResult.ok
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {testResult.ok ? (
                <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              )}
              <span className="break-all">{testResult.msg}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave}>Spara</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
