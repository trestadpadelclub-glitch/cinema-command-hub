import { useEffect, useState } from "react";
import {
  getStatus,
  parseStatus,
  getLightsStatus,
  getBridgeUrl,
  listFormulerApps,
  type MarantzStatus,
} from "@/lib/projector";
import { fetchLights, type Light } from "@/lib/scenes";

/**
 * Polls projector / Marantz / Formuler / Lights status for the LED row used
 * on the locked-screen carousel header. Mirrors the logic that previously
 * lived inside FormulerRemote.
 */
export function useStatusLeds(
  householdCode: string,
  marantzStatus: MarantzStatus | null,
  marantzReachable: boolean | null,
) {
  const [lights, setLights] = useState<Light[]>([]);
  const [projOn, setProjOn] = useState<boolean | null>(null);
  const [formulerOn, setFormulerOn] = useState<boolean | null>(null);
  const [lightsOn, setLightsOn] = useState<boolean | null>(null);
  const [picMode, setPicMode] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchLights(householdCode)
      .then((l) => { if (alive) setLights(l); })
      .catch(() => { /* tyst */ });
    return () => { alive = false; };
  }, [householdCode]);

  const lightDeviceIds = lights
    .filter((l) => l.enabled)
    .map((l) => l.tuya_device_id)
    .filter(Boolean);
  const lightIdsKey = lightDeviceIds.join("|");

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await getStatus();
        if (!alive) return;
        if (r.ok) {
          const p = parseStatus(r.data);
          setProjOn(p.power === "on");
          setPicMode(p.pic_mode ?? null);
        } else setProjOn(false);
      } catch { if (alive) setProjOn(false); }

      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const base = getBridgeUrl().replace(/\/api\/projector$/i, "").replace(/\/+$/, "");
        const res = await fetch(`${base}/debug/formuler-audio`, {
          headers: { accept: "application/json", "ngrok-skip-browser-warning": "true" },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const text = await res.text().catch(() => "");
        if (!alive) return;
        const hasDumpsys = res.ok && text.trim().length > 20 && !text.trim().startsWith("{");
        if (hasDumpsys) setFormulerOn(true);
        else {
          const fallback = await listFormulerApps();
          if (!alive) return;
          setFormulerOn(fallback.ok && fallback.apps.length > 0);
        }
      } catch { if (alive) setFormulerOn(false); }

      try {
        if (lightDeviceIds.length === 0) {
          if (alive) setLightsOn(false);
          return;
        }
        const r = await getLightsStatus(lightDeviceIds);
        if (!alive) return;
        if (r.ok) {
          const now = Date.now();
          setLightsOn(
            r.lights.some((l) => {
              if (!lightDeviceIds.includes(l.device_id)) return false;
              if (l.online === false || l.on !== true) return false;
              if (typeof l.last_seen === "number") return now - l.last_seen * 1000 <= 120000;
              if (typeof l.last_seen === "string") {
                const ts = Number(l.last_seen) || Date.parse(l.last_seen);
                return Number.isFinite(ts) ? now - (ts < 10_000_000_000 ? ts * 1000 : ts) <= 120000 : true;
              }
              return true;
            }),
          );
        } else setLightsOn(false);
      } catch { if (alive) setLightsOn(false); }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightIdsKey]);

  const marantzOn = marantzReachable !== false && marantzStatus?.power === "on";

  return { projOn, marantzOn, formulerOn, lightsOn, picMode };
}
