import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Projector, Save, Plus } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SettingsDialog } from "@/components/SettingsDialog";
import { PowerControl } from "@/components/PowerControl";
import { PresetGrid } from "@/components/PresetGrid";
import { ManualControls } from "@/components/ManualControls";
import { AiAssistant } from "@/components/AiAssistant";
import { ExpertCalibration } from "@/components/ExpertCalibration";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  sendCommand,
  applySettings,
  getStatus,
  PRESETS,
  getCustomPresets,
  saveCustomPresets,
  isModifiedFrom,
  extractPresetSettings,
  type Preset,
  type ProjectorSettings,
} from "@/lib/projector";
import { toast } from "sonner";

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

const DEFAULT_SETTINGS: ProjectorSettings = {
  pic_mode: "Cinema 1",
  laser_output: 75,
  brightness: 50,
  contrast: 90,
  reality_creation: 20,
  hdr_enhancer: "off",
  dynamic_control: "limited",
};

function Index() {
  const [settings, setSettings] = useState<ProjectorSettings>(DEFAULT_SETTINGS);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<ProjectorSettings>(DEFAULT_SETTINGS);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setCustomPresets(getCustomPresets());
  }, []);

  // Expose actions globally for future Web Speech API integration
  useEffect(() => {
    type CinemaApi = {
      sendCommand: typeof sendCommand;
      applySettings: typeof applySettings;
      getStatus: typeof getStatus;
      setSettings: typeof setSettings;
    };
    (window as unknown as { cinemaControl: CinemaApi }).cinemaControl = {
      sendCommand,
      applySettings,
      getStatus,
      setSettings,
    };
  }, []);

  const modified = activePresetId !== null && isModifiedFrom(settings, baseline);

  const handlePresetApplied = (preset: Preset) => {
    const next = { ...settings, ...preset.settings };
    setSettings(next);
    setBaseline(next);
    setActivePresetId(preset.id);
  };

  const handleManualChange = (next: ProjectorSettings) => {
    setSettings(next);
  };

  const handleAiApplied = (next: ProjectorSettings) => {
    setSettings(next);
  };

  const handleDeleteCustom = (id: string) => {
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    if (activePresetId === id) setActivePresetId(null);
    toast.success("Preset borttagen");
  };

  const handleSaveOver = () => {
    if (!activePresetId) return;
    const fixed = PRESETS.find((p) => p.id === activePresetId);
    const existingCustom = customPresets.find((p) => p.id === activePresetId);
    const nextSettings = extractPresetSettings(settings);

    let updated: Preset[];
    if (existingCustom) {
      // Uppdatera befintlig custom preset (inkl. override av fast preset med samma id)
      updated = customPresets.map((p) =>
        p.id === activePresetId ? { ...p, settings: nextSettings } : p,
      );
    } else {
      // Skapa override för fast preset under samma id — vinner över den fasta i listan
      const base: Preset = fixed ?? {
        id: activePresetId,
        label: activePresetId,
        description: "",
        settings: nextSettings,
      };
      updated = [...customPresets, { ...base, settings: nextSettings }];
    }
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setBaseline(settings);
    toast.success(`"${fixed?.label ?? existingCustom?.label}" uppdaterad`);
  };

  const handleSaveAs = () => {
    const name = newName.trim();
    if (!name) return;
    const newPreset: Preset = {
      id: `custom-${Date.now()}`,
      label: name,
      description: "Egen preset",
      settings: extractPresetSettings(settings),
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setActivePresetId(newPreset.id);
    setBaseline(settings);
    setSaveAsOpen(false);
    setNewName("");
    toast.success(`Preset "${name}" sparad`);
  };

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

        <Tabs defaultValue="control" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="control">Control</TabsTrigger>
            <TabsTrigger value="calibration">Expert Calibration</TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="mt-0">
            <main className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="space-y-6">
                <Section title="Power">
                  <PowerControl />
                </Section>

                <Section title="Quick Presets">
                  <PresetGrid
                    customPresets={customPresets}
                    activePresetId={activePresetId}
                    modified={modified}
                    onApplied={handlePresetApplied}
                    onDeleteCustom={handleDeleteCustom}
                  />
                </Section>

                {modified && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
                    <p className="text-sm text-amber-200/90">
                      Du har osparade ändringar (avvikelse från preset).
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={handleSaveOver}>
                        <Save className="h-4 w-4 mr-1.5" />
                        Spara
                      </Button>
                      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm">
                            <Plus className="h-4 w-4 mr-1.5" />
                            Spara som ny
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Spara som ny preset</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-2">
                            <Label htmlFor="preset-name">Namn</Label>
                            <Input
                              id="preset-name"
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              placeholder="T.ex. Kvällsläge"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveAs();
                              }}
                            />
                          </div>
                          <DialogFooter>
                            <Button
                              variant="ghost"
                              onClick={() => setSaveAsOpen(false)}
                            >
                              Avbryt
                            </Button>
                            <Button onClick={handleSaveAs} disabled={!newName.trim()}>
                              Spara
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                )}

                <Section title="Manual Controls">
                  <ManualControls
                    settings={settings}
                    onChange={handleManualChange}
                  />
                </Section>
              </div>

              <aside className="lg:sticky lg:top-6 lg:self-start">
                <AiAssistant current={settings} onApplied={handleAiApplied} />
              </aside>
            </main>
          </TabsContent>

          <TabsContent value="calibration" className="mt-0">
            <ExpertCalibration />
          </TabsContent>
        </Tabs>

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
