import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Projector, RotateCw, Loader2, Inbox } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/SettingsDialog";

import { ManualControls } from "@/components/ManualControls";
import { AiAssistant } from "@/components/AiAssistant";
import { RemoteHub } from "@/components/RemoteHub";
import { CustomRemote } from "@/components/CustomRemote";
import { ExpertCalibration } from "@/components/ExpertCalibration";
import { SceneGrid } from "@/components/SceneGrid";
import { MarantzPanel } from "@/components/MarantzPanel";
import { MarantzRemote } from "@/components/MarantzRemote";
import { LightsManager } from "@/components/LightsManager";
import { TriggerTester } from "@/components/TriggerTester";
import { PollingControl } from "@/components/PollingControl";
import { LockedRemoteCarousel } from "@/components/LockedRemoteCarousel";
import { useKioskMode } from "@/hooks/useKioskMode";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  sendCommand,
  applySettings,
  getStatus,
  parseStatus,
  runBridgeCommands,
  type BridgeEndpointCommand,
  type ProjectorSettings,
} from "@/lib/projector";
import { useHousehold } from "@/hooks/useHousehold";
import { useMarantzStatus } from "@/hooks/useMarantzStatus";
import { fetchAppSettings } from "@/lib/scenes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Master Control Hub — Hembio" },
      {
        name: "description",
        content:
          "Master Control Hub för hembio: scener, Marantz Cinema 50, Sony VPL-HW65ES och ljus-automation.",
      },
    ],
  }),
});

const DEFAULT_SETTINGS: ProjectorSettings = {
  pic_mode: "cinema_film_1",
  lamp_control: "high",
  brightness: 50,
  contrast: 90,
  color: 50,
  reality_creation: 20,
  dynamic_control: "off",
  motionflow: "off",
  gamma_correction: "2.2",
};

interface TriggerEventPayload {
  commands?: BridgeEndpointCommand[];
}

function Index() {
  const { code: household, ready } = useHousehold();
  const kiosk = useKioskMode();
  const [settings, setSettings] = useState<ProjectorSettings>(DEFAULT_SETTINGS);
  const [power, setPower] = useState<"on" | "off" | "unknown">("unknown");
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [pollIntervalS, setPollIntervalS] = useState(5);
  const [pollEnabled, setPollEnabled] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Global Marantz-status — pollas i samma takt som projektorn.
  const marantz = useMarantzStatus({
    enabled: pollEnabled,
    intervalSeconds: pollIntervalS,
  });

  const syncStatus = async (mode: "power" | "full" = "power", showToast = false) => {
    const res = await getStatus();
    if (!res.ok) {
      setPower("unknown");
      if (showToast)
        toast.error("Kunde inte hämta status", {
          description: res.error || `Status ${res.status}`,
        });
      return;
    }
    const parsed = parseStatus(res.data);
    if (parsed.power === "on" || parsed.power === "off") setPower(parsed.power);
    // Slå alltid in alla parsade fält i state — annars halkar reglagen efter.
    // Vi tar bort `power` så det inte krockar med ProjectorSettings-typen.
    const { power: _ignored, ...settingsPatch } = parsed;
    if (Object.keys(settingsPatch).length > 0) {
      setSettings((prev) => ({ ...prev, ...settingsPatch }));
    }
    if (mode === "full" && showToast) {
      toast.success("Status synkad från projektorn");
    }
    // Marantz input om bridgen råkar skicka det
    const raw = res.data as Record<string, unknown> | undefined;
    if (raw && typeof raw.marantz_input === "string") {
      setActiveInput(raw.marantz_input);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([syncStatus("full", true), marantz.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (marantz.status?.input) setActiveInput(marantz.status.input);
  }, [marantz.status?.input]);

  // Initial sync + load polling config
  useEffect(() => {
    if (!household) return;
    syncStatus("full", false);
    fetchAppSettings(household).then((s) => {
      setPollEnabled(s.poll_enabled);
      setPollIntervalS(s.poll_interval_seconds);
    });
  }, [household]);

  // Manage polling interval based on settings
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (pollEnabled && pollIntervalS > 0) {
      intervalRef.current = setInterval(() => syncStatus("power", false), pollIntervalS * 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollEnabled, pollIntervalS]);

  useEffect(() => {
    if (!household) return;
    const channel = supabase
      .channel(`trigger-events-${household}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trigger_events",
          filter: `household_code=eq.${household}`,
        },
        async ({ new: event }) => {
          const payload = event.payload as TriggerEventPayload;
          if (!Array.isArray(payload.commands)) return;
          const results = await runBridgeCommands(payload.commands);
          const failed = results.find((r) => !r.ok);
          if (failed) {
            toast.error(`Trigger "${event.trigger_key}" misslyckades delvis`, {
              description: failed.error || `Status ${failed.status}`,
            });
          } else {
            toast.success(`Scen "${event.scene_name}" aktiverad`, {
              description: `${results.length} kommandon skickade`,
            });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [household]);

  const refetchPollSettings = async () => {
    if (!household) return;
    const s = await fetchAppSettings(household);
    setPollEnabled(s.poll_enabled);
    setPollIntervalS(s.poll_interval_seconds);
  };

  // Expose for future Web Speech API
  useEffect(() => {
    (window as unknown as { cinemaControl: unknown }).cinemaControl = {
      sendCommand,
      applySettings,
      getStatus,
      setSettings,
    };
  }, []);

  if (!ready || !household) {
    return (
      <div className="min-h-screen bg-[image:var(--gradient-screen)] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (kiosk.locked) {
    return (
      <>
        <LockedRemoteCarousel
          householdCode={household}
          settings={settings}
          onSettingsChange={setSettings}
          marantzStatus={marantz.status}
          marantzReachable={marantz.reachable}
          onMarantzRefresh={marantz.refetch}
          onUnlock={kiosk.unlock}
        />
        <Toaster theme="dark" position="top-center" richColors />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[image:var(--gradient-screen)] text-foreground">
      {kiosk.enabled && kiosk.isMobile && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 px-3 py-1.5 text-[11px] text-amber-200 flex items-center justify-between">
          <span>Kiosk-läge upplåst (tillfälligt)</span>
          <button onClick={kiosk.relock} className="underline font-medium">
            Lås igen
          </button>
        </div>
      )}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--gradient-projector)] shadow-[var(--cinema-glow)]">
              <Projector className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Master Control Hub</h1>
                <span
                  title={
                    power === "on"
                      ? "Projektor på"
                      : power === "off"
                        ? "Projektor av"
                        : "Status okänd"
                  }
                  className={`inline-block h-3 w-3 rounded-full border border-black/30 transition-colors ${
                    power === "on"
                      ? "bg-emerald-500 shadow-[0_0_10px_oklch(0.72_0.18_150/0.9)] animate-pulse"
                      : power === "off"
                        ? "bg-red-500 shadow-[0_0_8px_oklch(0.62_0.22_27/0.7)]"
                        : "bg-muted-foreground/40"
                  }`}
                />
                <button
                  type="button"
                  onClick={handleRefresh}
                  title="Hämta alla aktuella inställningar nu"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <RotateCw className="h-3 w-3" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sony VPL-HW65ES · Marantz Cinema 50 · <span className="font-mono">{household}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Hämta aktuell status"
            >
              <RotateCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <SettingsDialog />
          </div>
        </header>

        <Tabs defaultValue="remotes" className="w-full">
          <TabsList className="mb-6 flex flex-wrap h-auto">
            <TabsTrigger value="scenes">Scenes</TabsTrigger>
            <TabsTrigger value="remotes">Remotes</TabsTrigger>
            <TabsTrigger value="custom">Custom Remote</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="marantz">Marantz Remote</TabsTrigger>
            <TabsTrigger value="automation">Inställningar</TabsTrigger>
            <TabsTrigger value="calibration">Expert Calibration</TabsTrigger>
          </TabsList>

          {/* SCENES */}
          <TabsContent value="scenes" className="mt-0 space-y-6">
            <Section title="Smart Scenes">
              <SceneGrid householdCode={household} />
            </Section>
          </TabsContent>

          {/* REMOTES — swipeable hub */}
          <TabsContent value="remotes" className="mt-0">
            <Section title="Remote Hub">
              <RemoteHub
                householdCode={household}
                settings={settings}
                onSettingsChange={setSettings}
                marantzStatus={marantz.status}
                marantzReachable={marantz.reachable}
                onMarantzRefresh={marantz.refetch}
              />
            </Section>
          </TabsContent>

          {/* CUSTOM REMOTE — macros */}
          <TabsContent value="custom" className="mt-0">
            <Section title="Custom Remote — makron">
              <CustomRemote householdCode={household} />
            </Section>
          </TabsContent>

          {/* DEVICES */}
          <TabsContent value="devices" className="mt-0">
            <main className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="space-y-6">
                <Section title="Marantz Cinema 50">
                  <MarantzPanel
                    householdCode={household}
                    activeInput={marantz.status?.input ?? activeInput}
                  />
                </Section>
                <Section title="Lights — dina lampor">
                  <LightsManager householdCode={household} />
                </Section>
                <Section title="Sony VPL-HW65ES — Manual Controls">
                  <ManualControls settings={settings} onChange={setSettings} />
                </Section>
              </div>
              <aside className="lg:sticky lg:top-6 lg:self-start">
                <AiAssistant current={settings} onApplied={setSettings} />
              </aside>
            </main>
          </TabsContent>

          {/* AUTOMATION */}
          {/* MARANTZ REMOTE */}
          <TabsContent value="marantz" className="mt-0">
            <Section title="Marantz Cinema 50 — Fjärrkontroll">
              <MarantzRemote
                householdCode={household}
                marantzStatus={marantz.status}
                marantzReachable={marantz.reachable}
                onMarantzRefresh={marantz.refetch}
              />
            </Section>
          </TabsContent>

          <TabsContent value="automation" className="mt-0 space-y-6">
            <Section title="Polling & Anslutning">
              <PollingControl
                householdCode={household}
                onChange={refetchPollSettings}
                onManualPoll={handleRefresh}
              />
            </Section>
            <Section title="Scen-triggers (auto-körning)">
              <TriggerTester householdCode={household} />
            </Section>
          </TabsContent>

          {/* CALIBRATION */}
          <TabsContent value="calibration" className="mt-0">
            <ExpertCalibration />
          </TabsContent>
        </Tabs>

        <footer className="mt-10 text-center text-xs text-muted-foreground/70">
          Bridge konfigureras via kugghjulet · Scener &amp; automation synkas via household-kod
        </footer>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}
