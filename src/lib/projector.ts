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
  | "bright_cinema"
  | "bright_tv"
  | "game"
  | "user1"
  | "user2"
  | "user3";

export const PIC_MODE_LABELS: Record<PicMode, string> = {
  cinema_film_1: "Cinema Film 1",
  cinema_film_2: "Cinema Film 2",
  reference: "Reference",
  tv: "TV",
  bright_cinema: "Bright Cinema",
  bright_tv: "Bright TV",
  game: "Game",
  user1: "User 1",
  user2: "User 2",
  user3: "User 3",
};

export type InputSource = "hdmi1" | "hdmi2";
export type BlankState = "on" | "off";
export type RemoteKey =
  | "menu"
  | "up"
  | "down"
  | "left"
  | "right"
  | "enter"
  | "reset";

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

// Color temperature presets supported by XW5000ES bridge
export type ColorTemp =
  | "d93"
  | "d75"
  | "d65"
  | "d55"
  | "custom1"
  | "custom2"
  | "custom3"
  | "custom4"
  | "custom5";

export const COLOR_TEMP_LABELS: Record<ColorTemp, string> = {
  d93: "D93",
  d75: "D75",
  d65: "D65 (Cinema)",
  d55: "D55",
  custom1: "Custom 1",
  custom2: "Custom 2",
  custom3: "Custom 3",
  custom4: "Custom 4",
  custom5: "Custom 5",
};

export type PowerAction = "on" | "off";

export interface ProjectorSettings {
  /** Power-action att skicka när scen körs. Saknas = rör inte. */
  power?: PowerAction;
  pic_mode?: PicMode;
  laser_output?: number; // 0-100 (bridge multiplies by 10)
  brightness?: number; // 0-100
  contrast?: number; // 0-100
  color?: number; // 0-100
  sharpness?: number; // 0-100
  reality_creation?: number; // 0-100
  hdr_enhancer?: HdrEnhancer;
  dynamic_control?: DynamicControl;
  motionflow?: Motionflow;
  gamma_correction?: Gamma;
  color_temp?: ColorTemp;
  input?: InputSource;
  blank?: BlankState;
}

export type Action =
  | "power"
  | "pic_mode"
  | "hdr_enhancer"
  | "dynamic_control"
  | "laser_output"
  | "reality_creation"
  | "real_cre"
  | "reality_creation_val"
  | "brightness"
  | "contrast"
  | "color"
  | "sharpness"
  | "motionflow"
  | "gamma_correction"
  | "color_temp"
  | "input"
  | "blank"
  | "remote_key"
  | "range"
  | "scene"
  | "marantz"
  | "lights"
  | "scene_lights";


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
  // Bridge endpoint: /api/projector  ->  /api/projector/status
  return getBridgeUrl() + "/status";
}

/**
 * Derive the lights endpoint from the projector bridge URL.
 * `<base>/api/projector` -> `<base>/api/lights`
 * If the URL doesn't end with `/api/projector`, fall back to replacing the
 * last path segment, or appending `/api/lights`.
 */
function lightsUrl(): string {
  const base = getBridgeUrl();
  if (/\/api\/projector$/i.test(base)) {
    return base.replace(/\/api\/projector$/i, "/api/lights");
  }
  // Replace last segment if it looks like a path; otherwise append.
  if (/\/[^/]+$/.test(base)) {
    return base.replace(/\/[^/]+$/, "/api/lights");
  }
  return base.replace(/\/+$/, "") + "/api/lights";
}

/**
 * Derive the marantz endpoint from the projector bridge URL.
 * `<base>/api/projector` -> `<base>/api/marantz`
 */
function marantzUrl(): string {
  const base = getBridgeUrl();
  if (/\/api\/projector$/i.test(base)) {
    return base.replace(/\/api\/projector$/i, "/api/marantz");
  }
  if (/\/[^/]+$/.test(base)) {
    return base.replace(/\/[^/]+$/, "/api/marantz");
  }
  return base.replace(/\/+$/, "") + "/api/marantz";
}

async function postJson(url: string, body: unknown, command: SingleCommand): Promise<CommandResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : undefined; } catch { /* keep raw */ }
    return { ok: res.ok, status: res.status, data, command };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
      command,
    };
  }
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
  const url = statusUrl();
  try {
    console.log("[bridge] GET", url);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // Skip the ngrok free-tier HTML warning page
        "ngrok-skip-browser-warning": "true",
        Accept: "application/json",
      },
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      /* keep raw */
    }
    console.log("[bridge] status", res.status, data);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error("[bridge] fetch failed", url, err);
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Map of which ProjectorSettings keys correspond to which bridge action.
// All listed keys map 1:1 to the action name, EXCEPT reality_creation
// which is split into two commands (real_cre on/off + reality_creation_val level).
const SETTINGS_ACTIONS: Action[] = [
  "pic_mode",
  "laser_output",
  "brightness",
  "contrast",
  "color",
  "sharpness",
  // reality_creation handled separately below
  "hdr_enhancer",
  "dynamic_control",
  "motionflow",
  "gamma_correction",
  "color_temp",
];

/**
 * Parse the JSON returned by GET /api/projector/status into ProjectorSettings.
 * - laser_level (0-1000) is divided by 10 → 0-100
 * - picture_mode bridge variants like "cinema_film1" are normalized to "cinema_film_1"
 * - unknown / null values are skipped
 */
export interface ProjectorStatus extends Omit<ProjectorSettings, "power"> {
  power?: "on" | "off" | string;
}

export function parseStatus(raw: unknown): ProjectorStatus {
  const out: ProjectorStatus = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;

  const str = (v: unknown) =>
    typeof v === "string" ? v.replace(/^"|"$/g, "").trim() : undefined;
  const num = (v: unknown) => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)))
      return Number(v);
    return undefined;
  };

  const power = str(r.power);
  if (power) {
    const p = power.toLowerCase();
    // "err_cmd" / "error" / "" => behandla som okänd (skriv inte över UI)
    if (p === "on" || p === "off" || p === "standby") {
      out.power = p === "standby" ? "off" : (p as "on" | "off");
    }
  }

  const pm = str(r.picture_mode ?? r.pic_mode);
  if (pm) {
    const map: Record<string, PicMode> = {
      cinema_film1: "cinema_film_1",
      cinema_film2: "cinema_film_2",
      brt_tv: "bright_tv",
      brt_cine: "bright_cinema",
      bright_cine: "bright_cinema",
    };
    out.pic_mode = (map[pm] ?? pm) as PicMode;
  }

  const laser = num(r.laser_level ?? r.laser_output ?? r.light_output_val);
  if (laser !== undefined)
    out.laser_output = Math.round(laser > 100 ? laser / 10 : laser);

  const dyn = str(r.dynamic_control ?? r.light_output_dyn);
  if (dyn) out.dynamic_control = dyn as DynamicControl;

  const input = str(r.input);
  if (input) out.input = input as InputSource;

  const brightness = num(r.brightness);
  if (brightness !== undefined) out.brightness = brightness;
  const contrast = num(r.contrast);
  if (contrast !== undefined) out.contrast = contrast;
  const color = num(r.color);
  if (color !== undefined) out.color = color;
  const sharpness = num(r.sharpness);
  if (sharpness !== undefined) out.sharpness = sharpness;

  const hdr = str(r.hdr_enhancer);
  if (hdr) out.hdr_enhancer = hdr as HdrEnhancer;

  // Motionflow — bridge sends `motion_flow` or `motionflow`
  const mf = str(r.motion_flow ?? r.motionflow);
  if (mf) {
    const mfMap: Record<string, Motionflow> = {
      truecinema: "true_cinema",
      "true-cinema": "true_cinema",
      smoothlow: "smooth_low",
      smoothhigh: "smooth_high",
    };
    out.motionflow = (mfMap[mf.toLowerCase()] ?? mf) as Motionflow;
  }

  // Gamma — bridge sends `gamma_correct` or `gamma_correction`
  const gamma = str(r.gamma_correct ?? r.gamma_correction);
  if (gamma) out.gamma_correction = gamma as Gamma;

  // Color temperature
  const ct = str(r.color_temp ?? r.color_temperature);
  if (ct) out.color_temp = ct.toLowerCase() as ColorTemp;

  // Reality Creation — bridge can send `reality_creation`, `reality_creation_val`,
  // and/or `real_cre` (on/off). If real_cre is "off", force level to 0.
  const realCre = str(r.real_cre);
  const rcVal = num(r.reality_creation_val ?? r.reality_creation);
  if (realCre && realCre.toLowerCase() === "off") {
    out.reality_creation = 0;
  } else if (rcVal !== undefined) {
    out.reality_creation = Math.max(0, Math.min(100, Math.round(rcVal)));
  }

  const blank = str(r.blank);
  if (blank) out.blank = blank.toLowerCase() as BlankState;

  return out;
}

/**
 * Apply multiple settings sequentially — bridge accepts ONE action per call.
 * Reality Creation is split into two commands:
 *   - `real_cre` : "on" | "off"  (0 -> off, >0 -> on)
 *   - `reality_creation_val` : integer level
 * Returns array of per-command results.
 */
export async function applySettings(
  settings: ProjectorSettings,
): Promise<CommandResult[]> {
  const results: CommandResult[] = [];
  // Power FIRST — om scenen säger "off" så är det ingen idé att skicka övriga inställningar
  if (settings.power === "on" || settings.power === "off") {
    const res = await sendCommand({ action: "power" as Action, value: settings.power });
    results.push(res);
    if (!res.ok || settings.power === "off") return results;
  }
  for (const action of SETTINGS_ACTIONS) {
    const value = settings[action as keyof ProjectorSettings];
    if (value === undefined || value === null) continue;
    const res = await sendCommand({ action, value: value as string | number });
    results.push(res);
    if (!res.ok) break; // stop on first failure
  }
  // Reality Creation: send on/off + level
  if (settings.reality_creation !== undefined && settings.reality_creation !== null) {
    const level = Math.round(settings.reality_creation);
    const onOff = await sendRealityCreation(level);
    results.push(...onOff);
  }
  return results;
}

/**
 * Reality Creation needs two commands:
 *   - `real_cre` "on" | "off"
 *   - `reality_creation_val` <integer>
 */
export async function sendRealityCreation(level: number): Promise<CommandResult[]> {
  const lvl = Math.max(0, Math.min(100, Math.round(level)));
  const out: CommandResult[] = [];
  out.push(await sendCommand({ action: "real_cre" as Action, value: lvl > 0 ? "on" : "off" }));
  if (lvl > 0) {
    out.push(await sendCommand({ action: "reality_creation_val" as Action, value: lvl }));
  }
  return out;
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
      | "color_temp"
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
      color_temp: "d65",
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
      color_temp: "d65",
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
      color_temp: "d65",
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
  "color",
  "hdr_enhancer",
  "dynamic_control",
  "reality_creation",
  "motionflow",
  "gamma_correction",
  "color_temp",
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
    pic_mode: s.pic_mode ?? "cinema_film_1",
    laser_output: s.laser_output ?? 75,
    brightness: s.brightness ?? 50,
    contrast: s.contrast ?? 90,
    color: s.color ?? 50,
    hdr_enhancer: s.hdr_enhancer ?? "off",
    dynamic_control: s.dynamic_control ?? "limited",
    reality_creation: s.reality_creation ?? 20,
    motionflow: s.motionflow ?? "off",
    gamma_correction: s.gamma_correction ?? "2.2",
    color_temp: s.color_temp ?? "d65",
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

// =====================================================================
// Master Control Hub: scen, marantz, lights
// Backend (Python) tar emot ALLA via samma POST /api/projector
// med {action, value} (samt valfria extra-fält som payload).
// =====================================================================

export interface SceneLightCommand {
  device_id: string;
  name?: string;
  type: "dimmer" | "cct" | "rgb" | "rgbcct";
  on: boolean;
  brightness?: number;
  kelvin?: number;
  color?: string;
}

export interface SceneCommandPayload {
  scenePayload: string;
  projectorSettings?: ProjectorSettings;
  marantzPower?: "on" | "off" | null;
  marantzInput?: string | null;
  marantzVolume?: number | null;
  lightsOn?: boolean | null;
  sceneLights?: SceneLightCommand[];
}

/** Skicka en scen — först {action:"scene", value:N}, sen ev. extra parametrar. */
export async function sendScene(p: SceneCommandPayload): Promise<CommandResult[]> {
  const results: CommandResult[] = [];
  results.push(
    await sendCommand({ action: "scene" as Action, value: p.scenePayload }),
  );
  if (p.lightsOn === true || p.lightsOn === false) {
    results.push(
      await postJson(
        lightsUrl(),
        { action: "lights", value: p.lightsOn ? "on" : "off" },
        { action: "lights" as Action, value: p.lightsOn ? "on" : "off" },
      ),
    );
  }
  if (p.sceneLights && p.sceneLights.length > 0) {
    results.push(
      await postJson(
        lightsUrl(),
        { action: "scene_lights", value: { lights: p.sceneLights } },
        { action: "scene_lights" as Action, value: p.sceneLights.length },
      ),
    );
  }
  // Marantz power FIRST — om "off" så skippa input/volym
  if (p.marantzPower === "on" || p.marantzPower === "off") {
    results.push(await sendMarantz(p.marantzPower === "on" ? "PWON" : "PWSTANDBY"));
    if (p.marantzPower === "off") {
      // Skippa input/volym när vi just stängt av
      if (p.projectorSettings && Object.keys(p.projectorSettings).length > 0) {
        const more = await applySettings(p.projectorSettings);
        results.push(...more);
      }
      return results;
    }
  }
  if (p.marantzInput) {
    results.push(await sendMarantz(`SI${p.marantzInput}`));
  }
  if (typeof p.marantzVolume === "number") {
    const v = String(p.marantzVolume).padStart(2, "0");
    results.push(await sendMarantz(`MV${v}`));
  }
  if (p.projectorSettings && Object.keys(p.projectorSettings).length > 0) {
    const more = await applySettings(p.projectorSettings);
    results.push(...more);
  }
  return results;
}

/** Marantz remote control — vol/mute/input osv. POST /api/marantz */
export async function sendMarantz(value: string): Promise<CommandResult> {
  return postJson(
    marantzUrl(),
    { action: "marantz", value },
    { action: "marantz" as Action, value },
  );
}

/** Toggle / explicit set lights — POST /api/lights {action:"lights", value}. */
export async function sendLights(value: "toggle" | "on" | "off"): Promise<CommandResult> {
  return postJson(
    lightsUrl(),
    { action: "lights", value },
    { action: "lights" as Action, value },
  );
}

