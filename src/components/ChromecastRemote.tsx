import { useState } from "react";
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Cast,
  LogOut,
  Loader2,
  WifiOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useChromecastStatus } from "@/hooks/useChromecastStatus";
import {
  sendChromecastCommand,
  setChromecastVolume,
  setChromecastMute,
  type ChromecastAction,
} from "@/lib/projector";
import { toast } from "sonner";

function fmt(sec?: number): string {
  if (!sec || sec < 0 || !isFinite(sec)) return "--:--";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function ChromecastRemote() {
  const { status, reachable, refetch } = useChromecastStatus({
    enabled: true,
    intervalSeconds: 2,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);

  const send = async (action: ChromecastAction) => {
    setBusy(action);
    try {
      const res = await sendChromecastCommand(action);
      if (!res.ok) toast.error(`Cast ${action}`, { description: res.error || `Status ${res.status}` });
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  const onVolume = async (v: number[]) => {
    const next = v[0] ?? 0;
    setVolumeDraft(next);
    setBusy("volume");
    try {
      const res = await setChromecastVolume(next);
      if (!res.ok) toast.error("Volym", { description: res.error || `Status ${res.status}` });
    } finally {
      setBusy(null);
    }
  };

  const toggleMute = async () => {
    setBusy("mute");
    try {
      const res = await setChromecastMute(!status?.muted);
      if (!res.ok) toast.error("Mute", { description: res.error || `Status ${res.status}` });
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  const playState = status?.media_state ?? "UNKNOWN";
  const isPlaying = playState === "PLAYING";

  if (reachable === false) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <WifiOff className="h-5 w-5 mx-auto mb-2" />
        Bryggan svarar inte på <code>/api/chromecast/status</code>. Kontrollera att Python v33 körs och att{" "}
        <code>pychromecast</code> är installerat.
      </Card>
    );
  }

  const volumeValue = volumeDraft ?? Math.round((status?.volume ?? 0));

  return (
    <div className="space-y-4">
      {/* Status-kort */}
      <Card className="p-4">
        <div className="flex items-start gap-4">
          {status?.album_art ? (
            <img
              src={status.album_art}
              alt=""
              className="h-20 w-20 rounded-md object-cover bg-muted"
            />
          ) : (
            <div className="h-20 w-20 rounded-md bg-muted flex items-center justify-center">
              <Cast className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">
                {status?.device_name || "—"}
              </span>
              {status?.connected ? (
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 text-[10px]">
                  ansluten
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  ej ansluten
                </Badge>
              )}
              {status?.app_name && (
                <Badge variant="secondary" className="text-[10px]">{status.app_name}</Badge>
              )}
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  isPlaying
                    ? "border-emerald-500/50 text-emerald-400"
                    : playState === "PAUSED"
                      ? "border-amber-500/50 text-amber-400"
                      : ""
                }`}
              >
                {playState}
              </Badge>
            </div>
            <div className="mt-1 truncate text-base font-semibold">
              {status?.title || <span className="text-muted-foreground font-normal">Inget spelas</span>}
            </div>
            {status?.artist && (
              <div className="text-xs text-muted-foreground truncate">{status.artist}</div>
            )}
            <div className="mt-2 flex items-center gap-2 text-[11px] font-mono tabular-nums text-muted-foreground">
              <span>{fmt(status?.position)}</span>
              <div className="flex-1 h-1 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: status?.duration && status?.position
                      ? `${Math.min(100, (status.position / status.duration) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
              <span>{fmt(status?.duration)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Transport */}
      <div className="grid grid-cols-5 gap-2">
        <Button
          variant="secondary"
          size="lg"
          className="h-16"
          onClick={() => send("previous")}
          disabled={busy !== null || !status?.connected}
        >
          {busy === "previous" ? <Loader2 className="h-5 w-5 animate-spin" /> : <SkipBack className="h-5 w-5" />}
        </Button>
        <Button
          size="lg"
          className="h-16 col-span-1"
          onClick={() => send(isPlaying ? "pause" : "play")}
          disabled={busy !== null || !status?.connected}
        >
          {busy === "play" || busy === "pause" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Play className="h-6 w-6" />
          )}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="h-16"
          onClick={() => send("stop")}
          disabled={busy !== null || !status?.connected}
        >
          {busy === "stop" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Square className="h-5 w-5" />}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="h-16"
          onClick={() => send("next")}
          disabled={busy !== null || !status?.connected}
        >
          {busy === "next" ? <Loader2 className="h-5 w-5 animate-spin" /> : <SkipForward className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="h-16"
          onClick={() => send("quit_app")}
          disabled={busy !== null || !status?.connected}
          title="Stäng appen på Chromecast"
        >
          {busy === "quit_app" ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
        </Button>
      </div>

      {/* Volym */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Volym</div>
          <div className="text-lg font-mono tabular-nums">{volumeValue}%</div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            disabled={busy !== null || !status?.connected}
          >
            {status?.muted ? <VolumeX className="h-5 w-5 text-destructive" /> : <Volume2 className="h-5 w-5" />}
          </Button>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[volumeValue]}
            onValueChange={(v) => setVolumeDraft(v[0] ?? 0)}
            onValueCommit={onVolume}
            disabled={busy !== null || !status?.connected}
            className="flex-1"
          />
        </div>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        Triggers: <code>chromecast_playing</code> · <code>chromecast_paused</code> · <code>chromecast_stopped</code> kan
        kopplas till scener via "Triggers"-knappen på en scen.
      </p>
    </div>
  );
}
