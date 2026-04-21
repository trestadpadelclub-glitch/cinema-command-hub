import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Menu, RotateCcw, EyeOff, Eye } from "lucide-react";
import {
  sendCommand,
  PIC_MODE_LABELS,
  MOTIONFLOW_LABELS,
  COLOR_TEMP_LABELS,
  type HdrEnhancer,
  type DynamicControl,
  type PicMode,
  type Motionflow,
  type Gamma,
  type ColorTemp,
  type Action,
  type ProjectorSettings,
  type InputSource,
  type BlankState,
  type RemoteKey,
} from "@/lib/projector";
import { toast } from "sonner";
import { useRef, type ReactNode } from "react";

interface Props {
  settings: ProjectorSettings;
  onChange: (s: ProjectorSettings) => void;
}

const HDR_LEVELS: HdrEnhancer[] = ["off", "low", "middle", "high"];
const DYNAMIC_LEVELS: DynamicControl[] = ["off", "limited", "middle", "full"];
const PIC_MODES: PicMode[] = [
  "cinema_film_1",
  "cinema_film_2",
  "reference",
  "tv",
  "bright_cinema",
];
const MOTIONFLOW_OPTS: Motionflow[] = [
  "off",
  "true_cinema",
  "smooth_low",
  "smooth_high",
  "impulse",
  "combination",
];
const GAMMA_OPTS: Gamma[] = ["off", "1.8", "2.0", "2.1", "2.2", "2.4", "2.6"];
const COLOR_TEMP_OPTS: ColorTemp[] = [
  "d93",
  "d75",
  "d65",
  "d55",
  "custom1",
  "custom2",
  "custom3",
  "custom4",
  "custom5",
];

// ---------- Descriptions (Swedish, expert-tone) ----------

const SECTION_INFO: Record<string, string> = {
  pic_mode:
    "Övergripande bildprofil. Bestämmer utgångsläget för färg, gamma, ljusstyrka och bildbearbetning. Välj efter källtyp och rumsljus.",
  laser_output:
    "Laserns ljusuteffekt (0–100%). Lägre = djupare svärta och längre livslängd. Högre = mer punch i HDR / ljust rum.",
  brightness:
    "Svartnivå, inte 'ljusstyrka' som på TV. 50 = neutral referens. 51–52 lyfter skuggor om bilden ser för mörk ut (Black Crush).",
  contrast:
    "Vitnivå / highlight-clipping. För högt värde klipper ljusa detaljer. 90 är typiskt referensläge.",
  color:
    "Färgmättnad. 50 = neutral / kalibrerad. Höj försiktigt om bilden upplevs urvattnad.",
  reality_creation:
    "Sonys uppskalning + skärpa + brusreducering i ett. 0 = av, 20 är referens, 40–60 motverkar mjuk/komprimerad källa (IPTV, stream).",
  hdr_enhancer:
    "Lyfter mellantoner i HDR-bilden så highlights och skuggor blir mer läsbara på en projektor som inte når 1000+ nits.",
  dynamic_control:
    "Dynamisk laser/iris-styrning per scen. Förbättrar upplevd kontrast men kan ge synliga ljusändringar.",
  motionflow:
    "Mellanbildsinterpoleringen (MEMC). Av för film. På för sport / panoreringar. För hög nivå ger 'såpopera-effekt'.",
  gamma_correction:
    "Bestämmer hur snabbt bilden går från svart till vitt. Högre tal = mörkare mellantoner / mer kontrast. 2.2 = standard SDR. 2.4 = mörkt rum / film.",
  color_temp:
    "Vitpunkt. D65 är film/Rec.709/HDR10-referens. Lägre D-tal = varmare/rödare. Högre = kallare/blåare. Custom = egen kalibrering.",
};

const PIC_MODE_INFO: Record<PicMode, string> = {
  cinema_film_1:
    "Mörkt rum, HDR-film. Varmast vitpunkt, lägst gamma — mest 'biokänsla'. Default för 4K HDR Blu-ray i hemmabio.",
  cinema_film_2:
    "Mörkt rum, SDR-film & serier. Lite ljusare än Film 1, fortfarande filmiskt. Bra för Blu-ray / streaming i SDR.",
  reference:
    "Kalibreringsneutral. Minimal bildbearbetning, sant mot källan. Använd vid ICC/CalMAN-kalibrering eller när du vill se exakt vad källan skickar.",
  tv: "Ljus och färgstark profil för broadcast-TV och nyheter. Mer kontrast och färg, mindre filmkänsla.",
  bright_cinema:
    "Halvljust rum eller dagsljus. Maxar ljusstyrka på bekostnad av svärta och färgnoggrannhet.",
};

const HDR_INFO: Record<HdrEnhancer, string> = {
  off: "Ingen extra HDR-bearbetning. Använd vid SDR eller om HDR-källan redan ser perfekt ut.",
  low: "Lätt lyft av highlights/skuggor. Bra på välmastrad HDR där du bara vill ha lite mer pop.",
  middle:
    "Standardläge för HDR-film på XW5000ES. Bra balans mellan synliga highlights och bevarad svärta.",
  high: "Maximal tone-mapping. Använd på mörka HDR-filmer där detaljer försvinner i svart — kan ge platt bild på ljus HDR.",
};

const DYNAMIC_INFO: Record<DynamicControl, string> = {
  off: "Statisk laser. Ingen scen-anpassning. Mest 'ärlig' bild, lägst kontrast-intryck.",
  limited:
    "Mild dynamisk justering. Rekommenderat för film — höjer upplevd kontrast utan synliga pumpningar.",
  middle:
    "Tydligare dynamisk effekt. Bra för blandat innehåll (TV, sport, stream).",
  full: "Aggressivast. Maxad upplevd kontrast men risk för synliga ljusändringar mellan scener.",
};

const MOTIONFLOW_INFO: Record<Motionflow, string> = {
  off: "Inga mellanbilder. KORREKT VAL FÖR FILM (24p). Bevarar regissörens avsikt.",
  true_cinema:
    "Eliminerar 3:2 pulldown-judder utan att lägga till mellanbilder. Filmkänsla med jämnare panoreringar.",
  smooth_low:
    "Lätt interpolering. Mjukare panoreringar utan tydlig såpopera-effekt. Bra för IPTV / streaming.",
  smooth_high:
    "Kraftig interpolering. Mycket mjuk rörelse — bäst för sport, värst för film.",
  impulse:
    "Black Frame Insertion. Skarpare rörelse genom mörka bildrutor men halverar upplevd ljusstyrka.",
  combination:
    "Smooth + Impulse i kombination. Maximal rörelseskärpa men ljusförlust och risk för flimmer.",
};

const GAMMA_INFO: Record<Gamma, string> = {
  off: "Använder pic-modens inbyggda gamma. Standardval om du inte aktivt vill överstyra.",
  "1.8": "Mycket ljusa mellantoner. Historiskt Mac-/print-standard. Sällan användbart för film.",
  "2.0": "Ljusare bild. Bra för ljust rum eller när skuggor försvinner.",
  "2.1": "Lätt mörkare än SDR-standard. Kompromiss mellan halvljust och mörkt rum.",
  "2.2": "SDR-standard (Rec.709 / sRGB). Default för TV, gaming och de flesta källor.",
  "2.4": "BT.1886 / hemmabio-standard. Mörkare mellantoner, mer kontrast — kräver mörkt rum.",
  "2.6":
    "Cinema/DCI-standard. Mycket mörka mellantoner. Endast för helt mörkt rum och kalibrerad miljö.",
};

const COLOR_TEMP_INFO: Record<ColorTemp, string> = {
  d93: "9300K. Kall/blåaktig vitpunkt. Asiatisk TV-standard, ger 'modern TV-look'. Inte för film.",
  d75: "7500K. Något kallare än neutral. Kan användas för broadcast/sport där bilden känns för varm.",
  d65: "6500K. Industristandard för film, Rec.709, HDR10 och Blu-ray. DEFAULT för all film/serier.",
  d55: "5500K. Varmare, närmare projektorlampors klassiska look. Sällan korrekt — mest nostalgi.",
  custom1: "Egen kalibrerad vitpunkt #1. Typiskt D65 för HDR efter mätning.",
  custom2: "Egen kalibrerad vitpunkt #2. Typiskt D65 för SDR efter mätning.",
  custom3: "Fri kalibreringsslot. Använd för t.ex. ljust rum / dagsljus-profil.",
  custom4: "Fri kalibreringsslot.",
  custom5: "Fri kalibreringsslot.",
};

// ---------- Helpers ----------

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-xs whitespace-normal text-left leading-snug"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({ children, info }: { children: ReactNode; info: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Label className="text-sm font-medium">{children}</Label>
      <InfoTip text={info} />
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  info,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  info: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "default" : "secondary"}
          size="sm"
          onClick={onClick}
          className={`${active ? "shadow-[var(--cinema-glow)]" : ""} ${className ?? ""}`}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-xs whitespace-normal text-left leading-snug"
      >
        {info}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------- Main component ----------

export function ManualControls({ settings, onChange }: Props) {
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const send = (action: Action, value: string | number) => {
    clearTimeout(debounceRef.current[action]);
    debounceRef.current[action] = setTimeout(async () => {
      const res = await sendCommand({ action, value });
      if (!res.ok) {
        toast.error("Bridge-fel", {
          description: res.error || `Status ${res.status}`,
        });
      }
    }, 250);
  };

  const update = (
    action: Action,
    value: string | number,
    patch: ProjectorSettings,
  ) => {
    onChange({ ...settings, ...patch });
    send(action, value);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.pic_mode}>Picture Mode</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {PIC_MODES.map((m) => (
              <OptionButton
                key={m}
                active={(settings.pic_mode ?? "cinema_film_1") === m}
                onClick={() => update("pic_mode", m, { pic_mode: m })}
                info={PIC_MODE_INFO[m]}
              >
                {PIC_MODE_LABELS[m]}
              </OptionButton>
            ))}
          </div>
        </Card>

        <SliderRow
          label="Laser Output"
          info={SECTION_INFO.laser_output}
          value={settings.laser_output ?? 75}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(v) => update("laser_output", v, { laser_output: v })}
        />

        <SliderRow
          label="Brightness"
          info={SECTION_INFO.brightness}
          hint="50 = neutral · 51-52 lyfter skuggor (Black Crush)"
          value={settings.brightness ?? 50}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("brightness", v, { brightness: v })}
        />

        <SliderRow
          label="Contrast"
          info={SECTION_INFO.contrast}
          value={settings.contrast ?? 90}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("contrast", v, { contrast: v })}
        />

        <SliderRow
          label="Color"
          info={SECTION_INFO.color}
          hint="50 = neutral mättnad"
          value={settings.color ?? 50}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("color", v, { color: v })}
        />

        <SliderRow
          label="Reality Creation"
          info={SECTION_INFO.reality_creation}
          value={settings.reality_creation ?? 20}
          min={0}
          max={100}
          step={5}
          onChange={(v) => update("reality_creation", v, { reality_creation: v })}
        />

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.hdr_enhancer}>HDR Enhancer</SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {HDR_LEVELS.map((lvl) => (
              <OptionButton
                key={lvl}
                active={(settings.hdr_enhancer ?? "off") === lvl}
                onClick={() => update("hdr_enhancer", lvl, { hdr_enhancer: lvl })}
                info={HDR_INFO[lvl]}
                className="capitalize"
              >
                {lvl}
              </OptionButton>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.dynamic_control}>
            Dynamic Control
          </SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {DYNAMIC_LEVELS.map((lvl) => (
              <OptionButton
                key={lvl}
                active={(settings.dynamic_control ?? "limited") === lvl}
                onClick={() =>
                  update("dynamic_control", lvl, { dynamic_control: lvl })
                }
                info={DYNAMIC_INFO[lvl]}
                className="capitalize"
              >
                {lvl}
              </OptionButton>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.motionflow}>Motionflow</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {MOTIONFLOW_OPTS.map((m) => (
              <OptionButton
                key={m}
                active={(settings.motionflow ?? "off") === m}
                onClick={() => update("motionflow", m, { motionflow: m })}
                info={MOTIONFLOW_INFO[m]}
              >
                {MOTIONFLOW_LABELS[m]}
              </OptionButton>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.gamma_correction}>
            Gamma Correction
          </SectionLabel>
          <div className="grid grid-cols-7 gap-2">
            {GAMMA_OPTS.map((g) => (
              <OptionButton
                key={g}
                active={(settings.gamma_correction ?? "2.2") === g}
                onClick={() =>
                  update("gamma_correction", g, { gamma_correction: g })
                }
                info={GAMMA_INFO[g]}
              >
                {g}
              </OptionButton>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.color_temp}>
            Color Temperature
          </SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">
            D65 = filmreferens · D93 = kallare/blåare · Custom 1-5 = egna kalibreringar
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {COLOR_TEMP_OPTS.map((ct) => (
              <OptionButton
                key={ct}
                active={(settings.color_temp ?? "d65") === ct}
                onClick={() => update("color_temp", ct, { color_temp: ct })}
                info={COLOR_TEMP_INFO[ct]}
              >
                {COLOR_TEMP_LABELS[ct]}
              </OptionButton>
            ))}
          </div>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function SliderRow({
  label,
  info,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  info?: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">{label}</Label>
          {info && <InfoTip text={info} />}
        </div>
        <span className="font-mono text-lg text-primary tabular-nums">
          {value}
          {suffix ?? ""}
        </span>
      </div>
      {hint && <p className="text-xs text-muted-foreground mb-3">{hint}</p>}
      <div className="flex items-center gap-3 mt-3">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </Button>
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange(v[0])}
          className="flex-1"
        />
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </Button>
      </div>
    </Card>
  );
}
