// Projector bridge client + types
// Bridge API: POST /api/projector  body: { action, value }
// One action per request — multi-setting payloads are split client-side.

const BRIDGE_URL_KEY = "sony_xw5000es_bridge_url";
export const DEFAULT_BRIDGE_URL = "http://localhost:5000/api/projector";

// Bridge-supported pic modes (XW5000ES). Values match what the bridge expects.
export type PicMode =
  | "cinema_film_1"
  | "cinema_film_2"
  | "reference"
  | "tv"
  | "bright_cinema";

export const PIC_MODE_LABELS: Record<PicMode, string> = {
  cinema_film_1: "Cinema Film 1",
  cinema_film_2: "Cinema Film 2",
  reference: "Reference",
  tv: "TV",
  bright_cinema: "Bright Cinema",
};

export type HdrEnhancer = "off" | "low" | "middle" | "high";
export type DynamicControl = "off" | "limited" | "middle" | "full";

// Motionflow: bridge sends motion_flow "<value>"
export type Motionflow =
  | "off"
  | "true_cinema"
  | "smooth_low"
  | "smooth_high"
  | "impulse"
  | "combination";

export const MOTIONFLOW_LABELS: Record<Motionflow, string> = {
  off: "Off",
  true_cinema: "True Cinema",
  smooth_low: "Smooth Low",
  smooth_high: "Smooth High",
  impulse: "Impulse",
  combination: "Combination",
};

// Gamma values supported by bridge (sent as gamma_correct "<value>")
export type Gamma = "off" | "1.8" | "2.0" | "2.1" | "2.2" | "2.4" | "2.6";

export interface ProjectorSettings {
  pic_mode?: PicMode;
  laser_output?: number; // 0-100 (bridge multiplies by 10)
  brightness?: number; // 0-100
  contrast?: number; // 0-100
  color?: number; // 0-100
  reality_creation?: number; // 0-100
  hdr_enhancer?: HdrEnhancer;
  dynamic_control?: DynamicControl;
  motionflow?: Motionflow;
  gamma_correction?: Gamma;
}

export type Action =
  | "power"
  | "pic_mode"
  | "hdr_enhancer"
  | "dynamic_control"
  | "laser_output"
  | "reality_creation"
  | "brightness"
  | "contrast"
  | "color"
  | "motionflow"
  | "gamma_correction"
  | "range";

export interface SingleCommand {
  action: Action;
  value: string | number;
}

export interface CommandResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
  command?: SingleCommand;
}

// --- bridge URL persistence ---

function sanitizeBridgeUrl(raw: string): string {
  // Trim whitespace, strip trailing slashes, and remove an accidental
  // trailing "/status" so users can paste the status URL by mistake.
  let u = raw.trim().replace(/\/+$/, "");
  u = u.replace(/\/status$/i, "");
  return u || DEFAULT_BRIDGE_URL;
}

export function getBridgeUrl(): string {
  if (typeof window === "undefined") return DEFAULT_BRIDGE_URL;
  const stored = localStorage.getItem(BRIDGE_URL_KEY);
  return stored ? sanitizeBridgeUrl(stored) : DEFAULT_BRIDGE_URL;
}

export function setBridgeUrl(url: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BRIDGE_URL_KEY, sanitizeBridgeUrl(url));
}

function statusUrl(): string {
  // /api/projector  ->  /api/projector/status
  return getBridgeUrl() + "/status";
}

// --- low level ---

export async function sendCommand(cmd: SingleCommand): Promise<CommandResult> {
  const url = getBridgeUrl();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      /* keep raw text */
    }
    return { ok: res.ok, status: res.status, data, command: cmd };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
      command: cmd,
    };
  }
}

export async function getStatus(): Promise<CommandResult> {
  try {
    const res = await fetch(statusUrl(), { method: "GET" });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      /* keep */
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Map of which ProjectorSettings keys correspond to which bridge action.
// All listed keys map 1:1 to the action name.
const SETTINGS_ACTIONS: Action[] = [
  "pic_mode",
  "laser_output",
  "brightness",
  "contrast",
  "color",
  "reality_creation",
  "hdr_enhancer",
  "dynamic_control",
  "motionflow",
  "gamma_correction",
];

/**
 * Apply multiple settings sequentially — bridge accepts ONE action per call.
 * Returns array of per-command results.
 */
export async function applySettings(
  settings: ProjectorSettings,
): Promise<CommandResult[]> {
  const results: CommandResult[] = [];
  for (const action of SETTINGS_ACTIONS) {
    const value = settings[action as keyof ProjectorSettings];
    if (value === undefined || value === null) continue;
    const res = await sendCommand({ action, value: value as string | number });
    results.push(res);
    if (!res.ok) break; // stop on first failure
  }
  return results;
}

// ----- Quick presets -----

export interface Preset {
  id: string;
  label: string;
  description: string;
  settings: Required<
    Pick<
      ProjectorSettings,
      | "pic_mode"
      | "laser_output"
      | "brightness"
      | "contrast"
      | "color"
      | "hdr_enhancer"
      | "dynamic_control"
      | "reality_creation"
      | "motionflow"
      | "gamma_correction"
    >
  >;
}

export const PRESETS: Preset[] = [
  {
    id: "4k-hdr-movie",
    label: "4K HDR Movie",
    description: "Cinema 1 · Laser 100 · Brightness 50 · HDR Middle · Limited dynamic",
    settings: {
      pic_mode: "cinema_film_1",
      laser_output: 100,
      brightness: 50,
      contrast: 90,
      hdr_enhancer: "middle",
      dynamic_control: "limited",
      reality_creation: 20,
      color: 50,
      motionflow: "off",
      gamma_correction: "2.2",
    },
  },
  {
    id: "sdr-tv-sports",
    label: "SDR TV / Sports",
    description: "Cinema Film 2 · Laser 75 · Brightness 50 · HDR Off · Middle dynamic",
    settings: {
      pic_mode: "cinema_film_2",
      laser_output: 75,
      brightness: 50,
      contrast: 90,
      hdr_enhancer: "off",
      dynamic_control: "middle",
      reality_creation: 40,
      color: 50,
      motionflow: "off",
      gamma_correction: "2.2",
    },
  },
  {
    id: "iptv-formuler",
    label: "IPTV / Formuler",
    description: "Cinema Film 2 · Laser 75 · Brightness 50 · Reality 60 (motverkar komprimering)",
    settings: {
      pic_mode: "cinema_film_2",
      laser_output: 75,
      brightness: 50,
      contrast: 90,
      hdr_enhancer: "off",
      dynamic_control: "middle",
      reality_creation: 60,
      color: 50,
      motionflow: "smooth_low",
      gamma_correction: "2.2",
    },
  },
];

// ----- Custom presets (localStorage) -----

const CUSTOM_PRESETS_KEY = "sony_xw5000es_custom_presets";

export function getCustomPresets(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Preset[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: Preset[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

const PRESET_KEYS: (keyof Preset["settings"])[] = [
  "pic_mode",
  "laser_output",
  "brightness",
  "contrast",
  "hdr_enhancer",
  "dynamic_control",
  "reality_creation",
];

/** True if any preset-tracked field in `current` deviates from `baseline`. */
export function isModifiedFrom(
  current: ProjectorSettings,
  baseline: ProjectorSettings,
): boolean {
  return PRESET_KEYS.some((k) => current[k] !== baseline[k]);
}

/** Extract only the preset-tracked fields from a settings object. */
export function extractPresetSettings(
  s: ProjectorSettings,
): Preset["settings"] {
  return {
    pic_mode: s.pic_mode ?? "Cinema 1",
    laser_output: s.laser_output ?? 75,
    brightness: s.brightness ?? 50,
    contrast: s.contrast ?? 90,
    hdr_enhancer: s.hdr_enhancer ?? "off",
    dynamic_control: s.dynamic_control ?? "limited",
    reality_creation: s.reality_creation ?? 20,
  };
}

// ----- Rule-based AI assistant -----

export interface AiSuggestion {
  reason: string;
  changes: ProjectorSettings;
}

const HDR_ORDER: HdrEnhancer[] = ["off", "low", "middle", "high"];

function bumpHdr(current: HdrEnhancer | undefined, dir: 1 | -1): HdrEnhancer {
  const idx = HDR_ORDER.indexOf(current ?? "off");
  const next = Math.min(HDR_ORDER.length - 1, Math.max(0, idx + dir));
  return HDR_ORDER[next];
}

export function analyzeInstruction(
  text: string,
  current: ProjectorSettings,
): AiSuggestion[] {
  const t = text.toLowerCase();
  const out: AiSuggestion[] = [];
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  if (
    has("för mörk", "mörk i skugg", "skuggor", "black crush", "too dark", "shadows")
  ) {
    out.push({
      reason: "Höjer brightness till 51 för att lyfta skuggdetaljer.",
      changes: { brightness: 51 },
    });
    out.push({
      reason: "Höjer HDR Enhancer ett steg för bättre skuggkontrast.",
      changes: { hdr_enhancer: bumpHdr(current.hdr_enhancer, 1) },
    });
  }

  if (has("för ljus", "för ljust", "blekt", "uttvättad", "washed out", "too bright")) {
    out.push({
      reason: "Sänker brightness till 50 (neutralt referensvärde).",
      changes: { brightness: 50 },
    });
    out.push({
      reason: "Sänker laser till 80 för djupare svärta.",
      changes: { laser_output: 80 },
    });
  }

  if (has("suddig", "mjuk", "oskarp", "soft", "blurry", "komprim")) {
    out.push({
      reason: "Höjer Reality Creation till 60 för skarpare detaljer.",
      changes: { reality_creation: 60 },
    });
  }

  if (has("för skarp", "artefakt", "ringing", "too sharp")) {
    out.push({
      reason: "Sänker Reality Creation till 20 för naturligare bild.",
      changes: { reality_creation: 20 },
    });
  }

  if (has("utbränd", "clipping", "highlights", "vitt utbränt")) {
    out.push({
      reason: "Sätter Dynamic Control till Limited för att skydda highlights.",
      changes: { dynamic_control: "limited" },
    });
    out.push({
      reason: "Sänker HDR Enhancer ett steg.",
      changes: { hdr_enhancer: bumpHdr(current.hdr_enhancer, -1) },
    });
  }

  if (has("ansträngande", "trött i ögon", "för intensiv", "eye strain")) {
    out.push({
      reason: "Sänker laser till 60 för bekvämare ljusstyrka.",
      changes: { laser_output: 60 },
    });
  }

  return out;
}
