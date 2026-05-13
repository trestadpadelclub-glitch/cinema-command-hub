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
  type LampControl,
  type DynamicControl,
  type PicMode,
  type Motionflow,
  type Gamma,
  type ColorTemp,
  type Action,
  type ProjectorSettings,
  type InputSource,
  type RemoteKey,
} from "@/lib/projector";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRef, type ReactNode } from "react";

interface Props {
  settings: ProjectorSettings;
  onChange: (s: ProjectorSettings) => void;
  /** Visa "Power Action"-väljare överst (för scen-tuning). */
  showPowerAction?: boolean;
}

const LAMP_LEVELS: LampControl[] = ["low", "high"];
const DYNAMIC_LEVELS: DynamicControl[] = ["off", "full"];
const PIC_MODES: PicMode[] = [
  "cinema_film_1",
  "cinema_film_2",
  "reference",
  "tv",
  "photo",
  "bright_cinema",
  "bright_tv",
  "game",
  "user",
];
const INPUT_OPTS: InputSource[] = ["hdmi1", "hdmi2"];
const MOTIONFLOW_OPTS: Motionflow[] = [
  "off",
  "true_cinema",
  "smooth_low",
  "smooth_high",
  "impulse",
  "combination",
];
const GAMMA_OPTS: Gamma[] = ["off", "1.8", "2.0", "2.1", "2.2", "2.4", "2.6", "gamma7", "gamma8", "gamma9", "gamma10"];

const GAMMA_LABELS: Record<Gamma, string> = {
  off: "Off",
  "1.8": "Gamma 1.8",
  "2.0": "Gamma 2.0",
  "2.1": "Gamma 2.1",
  "2.2": "Gamma 2.2 (SDR)",
  "2.4": "Gamma 2.4 (BT.1886)",
  "2.6": "Gamma 2.6 (DCI)",
  gamma7: "Gamma 7",
  gamma8: "Gamma 8",
  gamma9: "Gamma 9",
  gamma10: "Gamma 10",
};
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
  sharpness:
    "Klassisk skärpa (kantförstärkning). 0 = naturlig. Höga värden ger ringingar / halo runt kanter. Behövs sällan om Reality Creation används.",
  input: "Aktiv HDMI-ingång på projektorn.",
  blank:
    "Släck bilden tillfälligt utan att stänga av projektorn. Lasern står kvar i standby-läge.",
  remote: "Virtuell fjärrkontroll — navigera projektorns OSD-meny.",
};

const XW5000ES_ADCP_NOTE =
  "Skickas via korrigerad ADCP numeric-syntax i bridge v9.";

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
  bright_tv:
    "Maxljust TV-profil för dagsljus / mycket omgivande ljus. Sämre svärta men bilden 'orkar' synas.",
  game:
    "Optimerad för minsta input lag. Mindre bildbehandling — använd när responstid är viktigare än bildkvalitet.",
  photo: "Optimerad för stillbilder/foton.",
  user: "Egen sparad profil. Använd för en personligt kalibrerad inställning.",
};

const LAMP_INFO: Record<LampControl, string> = {
  low: "Lägre lampeffekt — djupare svärta, tystare fläkt, längre lamplivslängd. Default i mörkt rum.",
  high: "Full lampeffekt — mer ljus i HDR / ljust rum. Kortare lamplivslängd och något högre fläktljud.",
};

const DYNAMIC_INFO: Record<DynamicControl, string> = {
  off: "Statisk lampa. Ingen scen-anpassning. Mest 'ärlig' bild.",
  full: "Dynamisk iris/lampstyrning per scen. Maxar upplevd kontrast men kan ge synliga ljusändringar.",
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
  gamma7: "Sony-specifik kurva 7. Alternativ profil — testa mot din källa.",
  gamma8: "Sony-specifik kurva 8. Alternativ profil — testa mot din källa.",
  gamma9: "Sony-specifik kurva 9. Alternativ profil — testa mot din källa.",
  gamma10: "Sony-specifik kurva 10. Alternativ profil — testa mot din källa.",
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

export function ManualControls({ settings, onChange, showPowerAction }: Props) {
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
        {showPowerAction && (
          <Card className="p-5">
            <SectionLabel info="Vad ska scenen göra med projektorns ström? 'Rör inte' = scenen lämnar power-state ifred. 'Slå på' / 'Stäng av' skickar power-kommando innan övriga inställningar.">
              Power Action (när scen körs)
            </SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <OptionButton
                active={settings.power === undefined}
                onClick={() => {
                  const { power: _drop, ...rest } = settings;
                  void _drop;
                  onChange(rest);
                }}
                info="Scenen rör inte projektorns ström."
              >
                Rör inte
              </OptionButton>
              <OptionButton
                active={settings.power === "on"}
                onClick={() => onChange({ ...settings, power: "on" })}
                info="Scenen slår på projektorn (skickas före övriga inställningar)."
              >
                Slå på
              </OptionButton>
              <OptionButton
                active={settings.power === "off"}
                onClick={() => onChange({ ...settings, power: "off" })}
                info="Scenen stänger av projektorn. Övriga inställningar hoppas då över."
              >
                Stäng av
              </OptionButton>
            </div>
          </Card>
        )}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Picture Mode</Label>
              <InfoTip text={SECTION_INFO.pic_mode} />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    sendCommand({ action: "remote_key", value: "reset" }).then((res) => {
                      if (!res.ok) {
                        toast.error("Bridge-fel", {
                          description: res.error || `Status ${res.status}`,
                        });
                      } else {
                        toast.success("Reset skickad", {
                          description: "Återställer aktiv picture mode till fabriksvärden.",
                        });
                      }
                    });
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Reset
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs whitespace-normal text-left leading-snug">
                Återställer den aktiva picture mode (brightness, contrast, color, gamma m.m.) till Sonys fabriksvärden. Påverkar bara nuvarande preset.
              </TooltipContent>
            </Tooltip>
          </div>
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

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.laser_output}>Lamp Control</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {LAMP_LEVELS.map((lvl) => (
              <OptionButton
                key={lvl}
                active={(settings.lamp_control ?? "high") === lvl}
                onClick={() => update("lamp_control", lvl, { lamp_control: lvl })}
                info={LAMP_INFO[lvl]}
                className="capitalize"
              >
                {lvl}
              </OptionButton>
            ))}
          </div>
        </Card>

        <SliderRow
          label="Brightness"
          info={`${SECTION_INFO.brightness} ${XW5000ES_ADCP_NOTE}`}
          hint="50 = neutral · skickas via bridge v9"
          value={settings.brightness ?? 50}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("brightness", v, { brightness: v })}
        />

        <SliderRow
          label="Contrast"
          info={`${SECTION_INFO.contrast} ${XW5000ES_ADCP_NOTE}`}
          value={settings.contrast ?? 90}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("contrast", v, { contrast: v })}
        />

        <SliderRow
          label="Color"
          info={`${SECTION_INFO.color} ${XW5000ES_ADCP_NOTE}`}
          hint="50 = neutral mättnad · skickas via bridge v9"
          value={settings.color ?? 50}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("color", v, { color: v })}
        />

        <SliderRow
          label="Reality Creation"
          info={`${SECTION_INFO.reality_creation} ${XW5000ES_ADCP_NOTE}`}
          hint="0 = av · skickas som real_cre/real_cre_reso via bridge v9"
          value={settings.reality_creation ?? 20}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("reality_creation", Math.round(v), { reality_creation: Math.round(v) })}
        />

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.dynamic_control}>
            Dynamic Control
          </SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {DYNAMIC_LEVELS.map((lvl) => (
              <OptionButton
                key={lvl}
                active={(settings.dynamic_control ?? "off") === lvl}
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
          <SectionLabel info={`${SECTION_INFO.motionflow} ${XW5000ES_ADCP_NOTE}`}>
            Motionflow
          </SectionLabel>
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
          <Select
            value={settings.gamma_correction ?? "2.2"}
            onValueChange={(v) =>
              update("gamma_correction", v as Gamma, { gamma_correction: v as Gamma })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Välj gamma" />
            </SelectTrigger>
            <SelectContent>
              {GAMMA_OPTS.map((g) => (
                <SelectItem key={g} value={g}>
                  {GAMMA_LABELS[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            {GAMMA_INFO[(settings.gamma_correction ?? "2.2") as Gamma]}
          </p>
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

        <SliderRow
          label="Sharpness"
          info={`${SECTION_INFO.sharpness} ${XW5000ES_ADCP_NOTE}`}
          hint="0 = naturlig · skickas via bridge v9"
          value={settings.sharpness ?? 0}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("sharpness", v, { sharpness: v })}
        />

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.input}>Input</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {INPUT_OPTS.map((i) => (
              <OptionButton
                key={i}
                active={(settings.input ?? "hdmi1") === i}
                onClick={() => update("input", i, { input: i })}
                info={`Växla aktiv ingång till ${i.toUpperCase()}.`}
                className="uppercase"
              >
                {i}
              </OptionButton>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.blank}>Blank Screen</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <OptionButton
              active={(settings.blank ?? "off") === "off"}
              onClick={() => update("blank", "off", { blank: "off" })}
              info="Visa bilden normalt."
            >
              <Eye className="h-4 w-4 mr-1.5" /> Visible
            </OptionButton>
            <OptionButton
              active={settings.blank === "on"}
              onClick={() => update("blank", "on", { blank: "on" })}
              info="Släck bilden tillfälligt (laser går till standby)."
            >
              <EyeOff className="h-4 w-4 mr-1.5" /> Blank
            </OptionButton>
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel info={SECTION_INFO.remote}>Remote</SectionLabel>
          <RemotePad onKey={(k) => sendRemote(k)} />
        </Card>
      </div>
    </TooltipProvider>
  );

  function sendRemote(key: RemoteKey) {
    sendCommand({ action: "remote_key", value: key }).then((res) => {
      if (!res.ok)
        toast.error("Bridge-fel", {
          description: res.error || `Status ${res.status}`,
        });
    });
  }
}

function RemotePad({ onKey }: { onKey: (k: RemoteKey) => void }) {
  const btn =
    "h-10 w-10 inline-flex items-center justify-center rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition-colors";
  return (
    <div className="flex flex-col items-center gap-2">
      <button className={btn} onClick={() => onKey("up")} aria-label="Up">
        <ChevronUp className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2">
        <button className={btn} onClick={() => onKey("left")} aria-label="Left">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90 px-3 w-auto`}
          onClick={() => onKey("enter")}
        >
          Enter
        </button>
        <button className={btn} onClick={() => onKey("right")} aria-label="Right">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <button className={btn} onClick={() => onKey("down")} aria-label="Down">
        <ChevronDown className="h-5 w-5" />
      </button>
      <div className="flex gap-2 mt-2">
        <button
          className={`${btn} w-auto px-3 gap-1.5`}
          onClick={() => onKey("menu")}
        >
          <Menu className="h-4 w-4" /> Menu
        </button>
        <button
          className={`${btn} w-auto px-3 gap-1.5`}
          onClick={() => onKey("reset")}
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
      </div>
    </div>
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
