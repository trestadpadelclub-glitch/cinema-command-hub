// Projector bridge client + types
// Bridge API: POST /api/projector  body: { action, value }
// One action per request — multi-setting payloads are split client-side.

const BRIDGE_URL_KEY = "sony_xw5000es_bridge_url";
export const DEFAULT_BRIDGE_URL = "http://localhost:5000/api/projector";

export type PicMode =
  | "Cinema 1"
  | "Cinema 2"
  | "Reference"
  | "TV"
  | "Photo"
  | "Game"
  | "Bright Cinema"
  | "Bright TV"
  | "User";

export type HdrEnhancer = "off" | "low" | "middle" | "high";
export type DynamicControl = "off" | "limited" | "middle" | "full";

export interface ProjectorSettings {
  pic_mode?: PicMode;
  laser_output?: number; // 0-100 (bridge multiplies by 10)
  brightness?: number; // ~45-55
  reality_creation?: number; // 0-100
  hdr_enhancer?: HdrEnhancer;
  dynamic_control?: DynamicControl;
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

export function getBridgeUrl(): string {
  if (typeof window === "undefined") return DEFAULT_BRIDGE_URL;
  return localStorage.getItem(BRIDGE_URL_KEY) || DEFAULT_BRIDGE_URL;
}

export function setBridgeUrl(url: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BRIDGE_URL_KEY, url);
}

function statusUrl(): string {
  // /api/projector  ->  /api/projector/status
  return getBridgeUrl().replace(/\/+$/, "") + "/status";
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
  "reality_creation",
  "hdr_enhancer",
  "dynamic_control",
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
      | "hdr_enhancer"
      | "dynamic_control"
      | "reality_creation"
    >
  >;
}

export const PRESETS: Preset[] = [
  {
    id: "4k-hdr-movie",
    label: "4K HDR Movie",
    description: "Cinema 1 · Laser 100 · HDR Middle · Limited dynamic",
    settings: {
      pic_mode: "Cinema 1",
      laser_output: 100,
      hdr_enhancer: "middle",
      dynamic_control: "limited",
      reality_creation: 20,
    },
  },
  {
    id: "sdr-tv-sports",
    label: "SDR TV / Sports",
    description: "Cinema 2 · Laser 75 · HDR Off · Middle dynamic",
    settings: {
      pic_mode: "Cinema 2",
      laser_output: 75,
      hdr_enhancer: "off",
      dynamic_control: "middle",
      reality_creation: 40,
    },
  },
  {
    id: "iptv-formuler",
    label: "IPTV / Formuler",
    description: "Cinema 2 · Laser 75 · Reality 60 (motverkar komprimering)",
    settings: {
      pic_mode: "Cinema 2",
      laser_output: 75,
      hdr_enhancer: "off",
      dynamic_control: "middle",
      reality_creation: 60,
    },
  },
];

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
