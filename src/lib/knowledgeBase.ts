const KB_KEY = "cinema-brain-knowledge-base";

export const DEFAULT_MASTER_INSTRUCTIONS = `EQUIPMENT:
- Projector: Sony VPL-XW5000ES (4K SXRD laser)
- Screens: 90" White Board, 110" White Spandex
- Room lighting: 0% (pitch black) by default

CALIBRATION RULES:
- SDR: use Color: 40 and Gamma: 2.2 to avoid red/oversaturated skin tones
- HDR10: prefer pic_mode "cinema_film_1", hdr_enhancer "middle", dynamic_control "limited"
- IPTV / compressed sources: raise reality_creation (50–60) to counter compression artifacts
- Sports / motion content: enable motionflow "smooth_low" or "true_cinema"
- Bright room (lighting > 30%): increase laser_output toward 90–100
- Pitch black room: laser_output 70–85 is plenty, preserves laser life

PRIORITIES:
- "Max Image Quality" → push laser higher, allow fan noise
- "Silent Fan" → cap laser_output at 75 to keep fan low`;

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
