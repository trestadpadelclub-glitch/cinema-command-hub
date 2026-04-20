import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Check, AlertCircle } from "lucide-react";
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
  sendCommand,
} from "@/lib/projector";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(DEFAULT_BRIDGE_URL);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(getBridgeUrl());
      setTestResult(null);
    }
  }, [open]);

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
    const res = await sendCommand({ action: "ping" } as never);
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
