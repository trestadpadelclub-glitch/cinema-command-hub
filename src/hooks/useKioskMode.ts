import { useEffect, useState, useCallback } from "react";

const KIOSK_KEY = "kiosk_mode_enabled";
const MOBILE_BREAKPOINT = 768;

export function getKioskEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KIOSK_KEY) === "1";
}

export function setKioskEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KIOSK_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new Event("kiosk-changed"));
}

/**
 * Returns whether the kiosk-locked phone view should currently be shown.
 * Conditions:
 *   - kiosk toggle is enabled in localStorage
 *   - viewport is mobile (< 768px)
 *   - user has not temporarily unlocked (double-tap on header)
 */
export function useKioskMode() {
  const [enabled, setEnabled] = useState<boolean>(() => getKioskEnabled());
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === "undefined"
      ? false
      : window.innerWidth < MOBILE_BREAKPOINT,
  );
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    const onKioskChange = () => {
      const next = getKioskEnabled();
      setEnabled(next);
      if (next) setUnlocked(false);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("kiosk-changed", onKioskChange);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("kiosk-changed", onKioskChange);
    };
  }, []);

  const locked = enabled && isMobile && !unlocked;

  // Lock body scroll while kiosk view is active
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [locked]);

  const unlock = useCallback(() => setUnlocked(true), []);
  const relock = useCallback(() => setUnlocked(false), []);

  return { locked, enabled, isMobile, unlock, relock };
}
