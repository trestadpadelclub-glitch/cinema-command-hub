import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Projector } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { SettingsDialog } from "@/components/SettingsDialog";
import { PowerControl } from "@/components/PowerControl";
import { PresetGrid } from "@/components/PresetGrid";
import { ManualControls } from "@/components/ManualControls";
import { AiAssistant } from "@/components/AiAssistant";
import {
  sendCommand,
  type ProjectorSettings,
} from "@/lib/projector";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Sony XW5000ES — Intelligent Cinema Control" },
      {
        name: "description",
        content:
          "Intelligent fjärrkontroll för Sony XW5000ES-projektorn med presets, manuella kontroller och AI-assistent.",
      },
    ],
  }),
});

function Index() {
  const [settings, setSettings] = useState<ProjectorSettings>({
    pic_mode: "Cinema 1",
    laser_output: 75,
    brightness: 50,
    reality_creation: 20,
    hdr_enhancer: "off",
    dynamic_control: "limited",
  });

  // Expose actions globally for future Web Speech API integration
  useEffect(() => {
    type CinemaApi = {
      sendCommand: typeof sendCommand;
      setSettings: typeof setSettings;
    };
    (window as unknown as { cinemaControl: CinemaApi }).cinemaControl = {
      sendCommand,
      setSettings,
    };
  }, []);

  return (
    <div className="min-h-screen bg-[image:var(--gradient-screen)] text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--gradient-projector)] shadow-[var(--cinema-glow)]">
              <Projector className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Sony XW5000ES
              </h1>
              <p className="text-xs text-muted-foreground">
                Intelligent Cinema Control
              </p>
            </div>
          </div>
          <SettingsDialog />
        </header>

        <main className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Section title="Power">
              <PowerControl />
            </Section>

            <Section title="Quick Presets">
              <PresetGrid onApplied={(s) => setSettings({ ...settings, ...s })} />
            </Section>

            <Section title="Manual Controls">
              <ManualControls settings={settings} onChange={setSettings} />
            </Section>
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <AiAssistant
              current={settings}
              onApplied={(s) => setSettings(s)}
            />
          </aside>
        </main>

        <footer className="mt-10 text-center text-xs text-muted-foreground/70">
          Bridge-URL konfigureras via kugghjulet · Inställningar sparas lokalt
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
