import { useRef, useState } from "react";
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
  const [selected, setSelected] = useState(DEFAULT_INDEX);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const goPrev = () => setSelected((i) => Math.max(0, i - 1));
  const goNext = () => setSelected((i) => Math.min(PAGES.length - 1, i + 1));

  const handleTouchStartCapture = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEndCapture = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) goNext();
    else goPrev();
  };

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
            onClick={goPrev}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary disabled:opacity-30"
            disabled={selected === 0}
            aria-label="Föregående"
          >
            <ChevronLeft className="h-6 w-6" />
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
            onClick={goNext}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary disabled:opacity-30"
            disabled={selected === PAGES.length - 1}
            aria-label="Nästa"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
        <button
          type="button"
          onDoubleClick={onUnlock}
          onClick={(e) => e.preventDefault()}
          className="w-full text-center text-[11px] font-semibold py-1 text-primary select-none touch-manipulation border-t border-primary/30"
          title="Dubbelklicka för att låsa upp"
        >
          🔒 LÅST — dubbelklicka här för att låsa upp
        </button>
      </div>

      {/* Embla viewport — fills remaining height */}
      <div
        className="relative flex-1 min-h-0 overflow-hidden"
        onTouchStartCapture={handleTouchStartCapture}
        onTouchEndCapture={handleTouchEndCapture}
      >
        <div
          className="absolute inset-0 flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${selected * 100}%)` }}
        >
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
        {/* Edge tap zones — visible fallback navigation on top of controls */}
        <button
          type="button"
          aria-label="Föregående remote"
          onClick={goPrev}
          disabled={selected === 0}
          className="absolute left-0 top-0 h-full w-11 z-10 flex items-center justify-start pl-1 text-primary disabled:opacity-0"
        >
          <span className="inline-flex h-12 w-7 items-center justify-center rounded-r-md border-y border-r border-primary/40 bg-background/85 shadow-sm">
            <ChevronLeft className="h-5 w-5" />
          </span>
        </button>
        <button
          type="button"
          aria-label="Nästa remote"
          onClick={goNext}
          disabled={selected === PAGES.length - 1}
          className="absolute right-0 top-0 h-full w-11 z-10 flex items-center justify-end pr-1 text-primary disabled:opacity-0"
        >
          <span className="inline-flex h-12 w-7 items-center justify-center rounded-l-md border-y border-l border-primary/40 bg-background/85 shadow-sm">
            <ChevronRight className="h-5 w-5" />
          </span>
        </button>
      </div>
    </div>
  );
}
