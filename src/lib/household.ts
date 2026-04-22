// Household-kod hanterar "ägande" av scener/automation utan inloggning.
// Koden lagras i localStorage och skickas som filterkolumn i alla queries.
// Två enheter med samma kod ser samma data.

const KEY = "cinema_household_code";

export function getHouseholdCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setHouseholdCode(code: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, code.trim());
}

export function clearHouseholdCode() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

/** Slumpa fram en läsbar kod, t.ex. "soffa-7421" */
export function generateHouseholdCode(): string {
  const words = ["soffa", "salong", "bio", "loft", "studio", "matsal", "kök", "bar"];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}-${n}`;
}
