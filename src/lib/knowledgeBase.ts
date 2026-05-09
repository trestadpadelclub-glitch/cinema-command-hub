const KB_KEY = "cinema-brain-knowledge-base";

export const DEFAULT_MASTER_INSTRUCTIONS = `EQUIPMENT:
- Projector: Sony VPL-HW65ES (Full HD SXRD lamp-based)
- Screens: 90" White Board, 110" White Spandex
- Room lighting: 0% (pitch black) by default

CALIBRATION RULES:
- SDR: use Color: 50 and Gamma: 2.2 to avoid red/oversaturated skin tones
- HDR-like sources: prefer pic_mode "cinema_film_1", dynamic_control "full"
- IPTV / compressed sources: raise reality_creation (50–60) to counter compression artifacts
- Sports / motion content: enable motionflow "smooth_low" or "true_cinema"
- Bright room (lighting > 30%): set lamp_control "high"
- Pitch black room: lamp_control "low" preserves contrast and lamp life

PRIORITIES:
- "Max Image Quality" → lamp_control "high", allow fan noise
- "Silent Fan" → lamp_control "low" to keep fan low`;

export function getMasterInstructions(): string {
  if (typeof window === "undefined") return DEFAULT_MASTER_INSTRUCTIONS;
  const stored = localStorage.getItem(KB_KEY);
  return stored ?? DEFAULT_MASTER_INSTRUCTIONS;
}

export function setMasterInstructions(text: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KB_KEY, text);
}

export function appendToMasterInstructions(addendum: string) {
  if (typeof window === "undefined") return;
  const current = getMasterInstructions().trimEnd();
  const stamp = new Date().toISOString().slice(0, 10);
  const block = `\n\nLEARNED ${stamp}:\n${addendum.trim()}`;
  setMasterInstructions(current + block);
}
