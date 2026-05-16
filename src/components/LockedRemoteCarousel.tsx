import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FormulerRemote } from "@/components/FormulerRemote";
import { MarantzRemote } from "@/components/MarantzRemote";
import { LightsRemote } from "@/components/LightsRemote";
import { ChromecastRemote } from "@/components/ChromecastRemote";
import { BlurayRemote } from "@/components/BlurayRemote";
import { ManualControls } from "@/components/ManualControls";
import { PowerControl } from "@/components/PowerControl";
import { useStatusLeds } from "@/hooks/useStatusLeds";
import { PIC_MODE_LABELS, type MarantzStatus, type ProjectorSettings } from "@/lib/projector";

interface Props {
  householdCode: string;
  settings: ProjectorSettings;
  onSettingsChange: (s: ProjectorSettings) => void;
  marantzStatus: MarantzStatus | null;
  marantzReachable: boolean | null;
  onMarantzRefresh: () => Promise<void>;
  onUnlock: () => void;
}

const PAGES = ["Sony", "Marantz", "Formuler", "Lights", "Cast", "Blu-ray"] as const;
const DEFAULT_INDEX = 2; // Formuler

function StatusFlag({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
      <span className="opacity-70">{label}:</span>
      <span className="font-mono">{value}</span>
    </span>
  );
}

export function LockedRemoteCarousel({
  householdCode,
  settings,
  onSettingsChange,
  marantzStatus,
  marantzReachable,
  onMarantzRefresh,
  onUnlock,
}: Props) {
  const [emblaRef, embla] = useEmblaCarousel({
    startIndex: DEFAULT_INDEX,
    align: "start",
    containScroll: "trimSnaps",
    loop: false,
  });
  const [selected, setSelected] = useState(DEFAULT_INDEX);

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setSelected(embla.selectedScrollSnap());
    embla.on("select", onSelect);
    embla.on("reInit", onSelect);
    onSelect();
    return () => {
      embla.off("select", onSelect);
      embla.off("reInit", onSelect);
    };
  }, [embla]);

  const leds = useStatusLeds(householdCode, marantzStatus, marantzReachable);
  const picLabel = leds.picMode
    ? (PIC_MODE_LABELS[leds.picMode as keyof typeof PIC_MODE_LABELS] ?? leds.picMode)
    : null;

  const ledData = [
    { on: leds.projOn, title: "Projektor" },
    { on: leds.marantzOn, title: "Marantz" },
    { on: leds.formulerOn, title: "Formuler" },
    { on: leds.lightsOn, title: "Lights" },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-background overflow-hidden flex flex-col">
      {/* Top header — LEDs + Marantz flags + page indicator + unlock */}
      <div className="shrink-0 w-full bg-primary/15 border-b border-primary/40">
        <div className="flex items-center justify-center gap-2 pt-1.5">
          {ledData.map((s, i) => (
            <span
              key={i}
              title={`${s.title}: ${s.on === null ? "okänt" : s.on ? "ON" : "OFF"}`}
              className={
                "h-3 w-3 rounded-full border " +
                (s.on === null
                  ? "bg-muted-foreground/30 border-muted-foreground/40"
                  : s.on
                    ? "bg-emerald-500 border-emerald-300 shadow-[0_0_6px_rgb(16_185_129/0.8)]"
                    : "bg-red-500 border-red-300 shadow-[0_0_6px_rgb(239_68_68/0.8)]")
              }
            />
          ))}
        </div>
        <div className="pb-1 pt-1 flex items-center justify-center gap-1.5 flex-wrap px-2">
          <StatusFlag label="Sound" value={marantzStatus?.sound_mode ?? null} />
          <StatusFlag label="Dirac" value={marantzStatus?.dirac ?? null} />
          <StatusFlag label="Pic" value={picLabel} />
        </div>
        <div className="flex items-center justify-between px-2 pb-1">
          <button
            type="button"
            onClick={() => embla?.scrollPrev()}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-primary disabled:opacity-30"
            disabled={selected === 0}
            aria-label="Föregående"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <div className="text-xs font-semibold text-primary tracking-wide">
              {PAGES[selected]}
            </div>
            <div className="flex items-center gap-1">
              {PAGES.map((_, i) => (
                <span
                  key={i}
                  className={
                    "h-1.5 rounded-full transition-all " +
                    (i === selected ? "w-4 bg-primary" : "w-1.5 bg-primary/30")
                  }
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => embla?.scrollNext()}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-primary disabled:opacity-30"
            disabled={selected === PAGES.length - 1}
            aria-label="Nästa"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <button
          type="button"
          onDoubleClick={onUnlock}
          onClick={(e) => e.preventDefault()}
          className="w-full text-center text-[11px] font-semibold py-1 text-primary select-none touch-manipulation border-t border-primary/30"
          title="Dubbelklicka för att låsa upp"
        >
          🔒 LÅST — dubbelklicka här för att låsa upp · svep för att byta
        </button>
      </div>

      {/* Embla viewport — fills remaining height */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden" ref={emblaRef} style={{ touchAction: "pan-y" }}>
        <div className="flex h-full">
          {/* Sony */}
          <div className="min-w-0 shrink-0 grow-0 basis-full h-full overflow-y-auto p-3 space-y-4">
            <PowerControl />
            <ManualControls settings={settings} onChange={onSettingsChange} />
          </div>
          {/* Marantz */}
          <div className="min-w-0 shrink-0 grow-0 basis-full h-full overflow-y-auto p-3">
            <MarantzRemote
              householdCode={householdCode}
              marantzStatus={marantzStatus}
              marantzReachable={marantzReachable}
              onMarantzRefresh={onMarantzRefresh}
            />
          </div>
          {/* Formuler — uses its own locked layout */}
          <div className="min-w-0 shrink-0 grow-0 basis-full h-full overflow-hidden">
            <FormulerRemote
              householdCode={householdCode}
              marantzStatus={marantzStatus}
              marantzReachable={marantzReachable}
              onMarantzRefresh={onMarantzRefresh}
              forceLocked
            />
          </div>
          {/* Lights */}
          <div className="min-w-0 shrink-0 grow-0 basis-full h-full overflow-y-auto p-3">
            <LightsRemote householdCode={householdCode} />
          </div>
          {/* Cast */}
          <div className="min-w-0 shrink-0 grow-0 basis-full h-full overflow-y-auto p-3">
            <ChromecastRemote />
          </div>
          {/* Blu-ray */}
          <div className="min-w-0 shrink-0 grow-0 basis-full h-full overflow-y-auto p-3">
            <BlurayRemote householdCode={householdCode} />
          </div>
        </div>
        </div>
        {/* Edge swipe/tap zones — overlay narrow strips on left/right so iOS users can swipe past inner sliders/buttons */}
        <button
          type="button"
          aria-label="Föregående remote"
          onClick={() => embla?.scrollPrev()}
          disabled={selected === 0}
          className="absolute left-0 top-0 h-full w-6 z-10 bg-transparent disabled:opacity-0"
          style={{ touchAction: "pan-y" }}
        />
        <button
          type="button"
          aria-label="Nästa remote"
          onClick={() => embla?.scrollNext()}
          disabled={selected === PAGES.length - 1}
          className="absolute right-0 top-0 h-full w-6 z-10 bg-transparent disabled:opacity-0"
          style={{ touchAction: "pan-y" }}
        />
      </div>
    </div>
  );
}
