import { useEffect, useState } from "react";
import { Lightbulb, Loader2, Monitor, Volume2, Clock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManualControls } from "@/components/ManualControls";
import {
  fetchInputs,
  fetchLights,
  fetchSceneLights,
  updateScene,
  upsertSceneLight,
  type Light,
  type MarantzInput,
  type Scene,
  type SceneLight,
} from "@/lib/scenes";
import type { ProjectorSettings } from "@/lib/projector";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  householdCode: string;
  scene: Scene;
  onSaved?: () => void;
}

interface LightRow {
  light: Light;
  in_scene: boolean;
  on_state: boolean;
  brightness: number;
  kelvin: number;
  color_hex: string;
  delay_ms: number;
  fade_ms: number;
}

const LIGHT_DEFAULTS = { brightness: 80, kelvin: 3000, color_hex: "#ffaa55" };
const SOUND_MODES = [
  { code: "MOVIE", label: "Movie" },
  { code: "MUSIC", label: "Music" },
  { code: "GAME", label: "Game" },
  { code: "DIRECT", label: "Direct" },
  { code: "PURE DIRECT", label: "Pure Direct" },
  { code: "STEREO", label: "Stereo" },
  { code: "AUTO", label: "Auto" },
  { code: "MCH STEREO", label: "Multi Ch Stereo" },
  { code: "DOLBY DIGITAL", label: "Dolby Digital" },
  { code: "DTS SURROUND", label: "DTS Surround" },
];
const DIRAC_SLOTS = ["OFF", "1", "2", "3"];

export function SceneEditorDialog({ open, onOpenChange, householdCode, scene, onSaved }: Props) {
  const [tab, setTab] = useState("picture");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Picture / general
  const [name, setName] = useState(scene.name);
  const [scenePayload, setScenePayload] = useState(
    scene.scene_payload ?? String(scene.scene_number),
  );
  const [projectorSettings, setProjectorSettings] = useState<ProjectorSettings>(
    scene.projector_settings,
  );

  // Sound
  const [marantzPower, setMarantzPower] = useState<"on" | "off" | null>(scene.marantz_power);
  const [marantzInput, setMarantzInput] = useState<string | null>(scene.marantz_input);
  const [marantzVolume, setMarantzVolume] = useState<number | null>(scene.marantz_volume);
  const [marantzMute, setMarantzMute] = useState<boolean | null>(scene.marantz_mute);
  const [marantzSoundMode, setMarantzSoundMode] = useState<string | null>(scene.marantz_sound_mode);
  const [marantzSmartSelect, setMarantzSmartSelect] = useState<number | null>(scene.marantz_smart_select);
  const [marantzDirac, setMarantzDirac] = useState<string | null>(scene.marantz_dirac);
  const [marantzSpeakerPreset, setMarantzSpeakerPreset] = useState<number | null>(scene.marantz_speaker_preset);
  const [inputs, setInputs] = useState<MarantzInput[]>([]);

  // Lights
  const [lightsOn, setLightsOn] = useState<boolean | null>(scene.lights_on);
  const [lightRows, setLightRows] = useState<LightRow[]>([]);

  // Timing — per device
  const [projectorDelayMs, setProjectorDelayMs] = useState(scene.projector_delay_ms);
  const [marantzDelayMs, setMarantzDelayMs] = useState(scene.marantz_delay_ms);
  const [lightsDelayMs, setLightsDelayMs] = useState(scene.lights_delay_ms);
  const [projectorBlankDelaySeconds, setProjectorBlankDelaySeconds] = useState(scene.projector_blank_delay_seconds ?? 0);

  // Reset state whenever dialog opens with a (potentially new) scene
  useEffect(() => {
    if (!open) return;
    setName(scene.name);
    setScenePayload(scene.scene_payload ?? String(scene.scene_number));
    setProjectorSettings(scene.projector_settings);
    setMarantzPower(scene.marantz_power);
    setMarantzInput(scene.marantz_input);
    setMarantzVolume(scene.marantz_volume);
    setMarantzMute(scene.marantz_mute);
    setMarantzSoundMode(scene.marantz_sound_mode);
    setMarantzSmartSelect(scene.marantz_smart_select);
    setMarantzDirac(scene.marantz_dirac);
    setMarantzSpeakerPreset(scene.marantz_speaker_preset);
    setLightsOn(scene.lights_on);
    setProjectorDelayMs(scene.projector_delay_ms);
    setMarantzDelayMs(scene.marantz_delay_ms);
    setLightsDelayMs(scene.lights_delay_ms);
    setProjectorBlankDelaySeconds(scene.projector_blank_delay_seconds ?? 0);
    setTab("picture");

    setLoading(true);
    Promise.all([
      fetchInputs(householdCode),
      fetchLights(householdCode),
      fetchSceneLights(scene.id),
    ])
      .then(([ins, lights, sceneLights]) => {
        setInputs(ins);
        const map = new Map<string, SceneLight>(sceneLights.map((s) => [s.light_id, s]));
        setLightRows(
          lights
            .filter((l) => l.enabled)
            .map((l) => {
              const s = map.get(l.id);
              return {
                light: l,
                in_scene: s?.in_scene ?? false,
                on_state: s?.on_state ?? true,
                brightness: s?.brightness ?? LIGHT_DEFAULTS.brightness,
                kelvin: s?.kelvin ?? LIGHT_DEFAULTS.kelvin,
                color_hex: s?.color_hex ?? LIGHT_DEFAULTS.color_hex,
                delay_ms: s?.delay_ms ?? 0,
                fade_ms: s?.fade_ms ?? 0,
              };
            }),
        );
      })
      .catch((e) => toast.error("Kunde inte ladda scen-data", { description: String(e) }))
      .finally(() => setLoading(false));
  }, [open, scene, householdCode]);

  const updateLightRow = (id: string, patch: Partial<LightRow>) =>
    setLightRows((prev) => prev.map((r) => (r.light.id === id ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateScene(scene.id, {
        name,
        scene_payload: scenePayload,
        projector_settings: projectorSettings,
        marantz_power: marantzPower,
        marantz_input: marantzInput,
        marantz_volume: marantzVolume,
        marantz_mute: marantzMute,
        marantz_sound_mode: marantzSoundMode,
        marantz_smart_select: marantzSmartSelect,
        marantz_dirac: marantzDirac,
        marantz_speaker_preset: marantzSpeakerPreset,
        lights_on: lightsOn,
        projector_blank_delay_seconds: projectorBlankDelaySeconds,
        projector_delay_ms: projectorDelayMs,
        marantz_delay_ms: marantzDelayMs,
        lights_delay_ms: lightsDelayMs,
      });
      // Spara per-lampa
      for (const r of lightRows) {
        await upsertSceneLight({
          scene_id: scene.id,
          light_id: r.light.id,
          in_scene: r.in_scene,
          on_state: r.on_state,
          brightness: r.brightness,
          kelvin: r.kelvin,
          color_hex: r.color_hex,
          delay_ms: r.delay_ms,
          fade_ms: r.fade_ms,
        });
      }
      toast.success(`"${name}" sparad`);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      const isFetchFail = msg.includes("Failed to fetch") || msg.includes("NetworkError");
      toast.error("Kunde inte spara", {
        description: isFetchFail
          ? "Nätverksfel mot databasen. Stäng av eventuell ad-blocker / privacy-extension för denna sida och försök igen."
          : msg,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Scene {scene.scene_number}
              </span>
              <span className="truncate">{name}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Laddar…
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="picture" className="gap-1.5">
                <Monitor className="h-3.5 w-3.5" />
                Bild
              </TabsTrigger>
              <TabsTrigger value="sound" className="gap-1.5">
                <Volume2 className="h-3.5 w-3.5" />
                Ljud
              </TabsTrigger>
              <TabsTrigger value="lights" className="gap-1.5">
                <Lightbulb className="h-3.5 w-3.5" />
                Ljus
              </TabsTrigger>
              <TabsTrigger value="timing" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Timing
              </TabsTrigger>
            </TabsList>

            {/* ----------- BILD ----------- */}
            <TabsContent value="picture" className="flex-1 overflow-y-auto pr-1 space-y-4 mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Namn</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Scen-payload</Label>
                  <Input
                    value={scenePayload}
                    onChange={(e) => setScenePayload(e.target.value)}
                    placeholder={String(scene.scene_number)}
                  />
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-3">
                  Reglagen skickar live till projektorn. Klicka <strong>Spara</strong> nedan för att
                  skriva värdena till scenen.
                </p>
                <ManualControls
                  settings={projectorSettings}
                  onChange={setProjectorSettings}
                  showPowerAction
                />
              </div>
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Blank-delay</Label>
                    <p className="text-xs text-muted-foreground">
                      Används bara om scenens Blank Screen är satt till Blank. Bilden blir synlig igen efter vald tid.
                    </p>
                  </div>
                  <span className="font-mono text-sm text-primary tabular-nums">
                    {projectorBlankDelaySeconds}s
                  </span>
                </div>
                <Slider
                  value={[projectorBlankDelaySeconds]}
                  min={0}
                  max={60}
                  step={1}
                  disabled={projectorSettings.blank !== "on"}
                  onValueChange={([v]) => setProjectorBlankDelaySeconds(v)}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0s = permanent blank</span>
                  <span>60s max</span>
                </div>
              </div>
            </TabsContent>

            {/* ----------- LJUD ----------- */}
            <TabsContent value="sound" className="flex-1 overflow-y-auto pr-1 space-y-4 mt-4">
              <div className="space-y-1">
                <Label>Marantz Power</Label>
                <Select
                  value={marantzPower ?? "none"}
                  onValueChange={(v) => setMarantzPower(v === "none" ? null : (v as "on" | "off"))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— rör inte —</SelectItem>
                    <SelectItem value="on">Slå på</SelectItem>
                    <SelectItem value="off">Stäng av</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Marantz Input</Label>
                <Select
                  value={marantzInput ?? "none"}
                  onValueChange={(v) => setMarantzInput(v === "none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— rör inte —</SelectItem>
                    {inputs.map((i) => (
                      <SelectItem key={i.id} value={i.marantz_code}>
                        {i.label} ({i.marantz_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Marantz Volym (0–98, tomt = rör inte)</Label>
                <Input
                  type="number"
                  min={0}
                  max={98}
                  value={marantzVolume ?? ""}
                  onChange={(e) =>
                    setMarantzVolume(e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Mute</Label>
                  <Select
                    value={marantzMute === null ? "none" : marantzMute ? "on" : "off"}
                    onValueChange={(v) => setMarantzMute(v === "none" ? null : v === "on")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— rör inte —</SelectItem>
                      <SelectItem value="on">Mute på</SelectItem>
                      <SelectItem value="off">Mute av</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Sound Mode</Label>
                  <Select value={marantzSoundMode ?? "none"} onValueChange={(v) => setMarantzSoundMode(v === "none" ? null : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— rör inte —</SelectItem>
                      {SOUND_MODES.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Smart Select</Label>
                  <Select value={marantzSmartSelect ? String(marantzSmartSelect) : "none"} onValueChange={(v) => setMarantzSmartSelect(v === "none" ? null : Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— rör inte —</SelectItem>
                      {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>Smart {n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Dirac</Label>
                  <Select value={marantzDirac ?? "none"} onValueChange={(v) => setMarantzDirac(v === "none" ? null : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— rör inte —</SelectItem>
                      {DIRAC_SLOTS.map((slot) => <SelectItem key={slot} value={slot}>{slot === "OFF" ? "Off" : `Slot ${slot}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Speaker Preset</Label>
                  <Select value={marantzSpeakerPreset ? String(marantzSpeakerPreset) : "none"} onValueChange={(v) => setMarantzSpeakerPreset(v === "none" ? null : Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— rör inte —</SelectItem>
                      <SelectItem value="1">Preset 1</SelectItem>
                      <SelectItem value="2">Preset 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* ----------- LJUS ----------- */}
            <TabsContent value="lights" className="flex-1 overflow-y-auto pr-1 space-y-3 mt-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <Label>Master-ljus när scen körs</Label>
                </div>
                <Select
                  value={lightsOn === null ? "none" : lightsOn ? "on" : "off"}
                  onValueChange={(v) => setLightsOn(v === "none" ? null : v === "on")}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Rör inte</SelectItem>
                    <SelectItem value="on">Tänd</SelectItem>
                    <SelectItem value="off">Släck</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {lightRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Inga lampor inlagda. Lägg till dem under <strong>Devices → Lights</strong>.
                </p>
              ) : (
                lightRows.map((r) => {
                  const t = r.light.light_type;
                  const showKelvin = t === "cct" || t === "rgbcct";
                  const showColor = t === "rgb" || t === "rgbcct";
                  return (
                    <div
                      key={r.light.id}
                      className={`rounded-lg border p-3 space-y-3 transition-opacity ${
                        r.in_scene ? "" : "opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Switch
                            checked={r.in_scene}
                            onCheckedChange={(v) => updateLightRow(r.light.id, { in_scene: v })}
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{r.light.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {r.light.light_type}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">På</Label>
                          <Switch
                            checked={r.on_state}
                            disabled={!r.in_scene}
                            onCheckedChange={(v) => updateLightRow(r.light.id, { on_state: v })}
                          />
                        </div>
                      </div>

                      {r.in_scene && r.on_state && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <Label>Intensitet</Label>
                              <span className="font-mono">{r.brightness}%</span>
                            </div>
                            <Slider
                              value={[r.brightness]}
                              min={0}
                              max={100}
                              step={1}
                              onValueChange={([v]) => updateLightRow(r.light.id, { brightness: v })}
                            />
                          </div>
                          {showKelvin && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <Label>Färgtemp</Label>
                                <span className="font-mono">{r.kelvin}K</span>
                              </div>
                              <Slider
                                value={[r.kelvin]}
                                min={2700}
                                max={6500}
                                step={50}
                                onValueChange={([v]) => updateLightRow(r.light.id, { kelvin: v })}
                              />
                            </div>
                          )}
                          {showColor && (
                            <div className="space-y-1 sm:col-span-2">
                              <Label className="text-xs">Färg</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="color"
                                  value={r.color_hex}
                                  onChange={(e) =>
                                    updateLightRow(r.light.id, {
                                      color_hex: e.target.value,
                                    })
                                  }
                                  className="h-9 w-16 p-1 cursor-pointer"
                                />
                                <Input
                                  value={r.color_hex}
                                  onChange={(e) =>
                                    updateLightRow(r.light.id, {
                                      color_hex: e.target.value,
                                    })
                                  }
                                  className="font-mono text-xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* ----------- TIMING ----------- */}
            <TabsContent value="timing" className="flex-1 overflow-y-auto pr-1 space-y-4 mt-4">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                Delay = hur många millisekunder appen väntar innan kommandot skickas till respektive
                enhet, räknat från att scenen startas. Fade (på lampor) = hur lång övergångstid
                bryggan ska använda när ljusnivån ändras.
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Enheter
                </h4>
                <DeviceDelayRow
                  icon={<Monitor className="h-4 w-4" />}
                  label="Projektor"
                  value={projectorDelayMs}
                  onChange={setProjectorDelayMs}
                />
                <DeviceDelayRow
                  icon={<Volume2 className="h-4 w-4" />}
                  label="Marantz"
                  value={marantzDelayMs}
                  onChange={setMarantzDelayMs}
                />
                <DeviceDelayRow
                  icon={<Lightbulb className="h-4 w-4 text-amber-400" />}
                  label="Ljus (master)"
                  value={lightsDelayMs}
                  onChange={setLightsDelayMs}
                />
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Per lampa
                </h4>
                {lightRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Inga lampor inlagda.
                  </p>
                ) : (
                  lightRows
                    .filter((r) => r.in_scene)
                    .map((r) => (
                      <div key={r.light.id} className="rounded-lg border p-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-amber-400" />
                          <span className="font-medium text-sm">{r.light.name}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <Label>Delay</Label>
                              <span className="font-mono">{r.delay_ms} ms</span>
                            </div>
                            <Slider
                              value={[r.delay_ms]}
                              min={0}
                              max={5000}
                              step={50}
                              onValueChange={([v]) => updateLightRow(r.light.id, { delay_ms: v })}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <Label>Fade</Label>
                              <span className="font-mono">{r.fade_ms} ms</span>
                            </div>
                            <Slider
                              value={[r.fade_ms]}
                              min={0}
                              max={5000}
                              step={100}
                              onValueChange={([v]) => updateLightRow(r.light.id, { fade_ms: v })}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                )}
                {lightRows.length > 0 && lightRows.every((r) => !r.in_scene) && (
                  <p className="text-xs text-muted-foreground italic text-center py-2">
                    Aktivera lampor under <strong>Ljus</strong>-tabben för att kunna sätta
                    delay/fade per lampa.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeviceDelayRow({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{label}</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{value} ms</span>
      </div>
      <Slider value={[value]} min={0} max={5000} step={50} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
