import { useCallback, useEffect, useRef, useState } from "react";
import { getLightsStatus, type LightStatus } from "@/lib/projector";

interface Options {
  enabled: boolean;
  intervalSeconds: number;
  deviceIds?: string[];
}

export function useLightsStatus({ enabled, intervalSeconds, deviceIds = [] }: Options) {
  const [lights, setLights] = useState<LightStatus[]>([]);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceKey = deviceIds.join(",");

  const refetch = useCallback(async () => {
    const res = await getLightsStatus(deviceIds);
    if (!res.ok) {
      setReachable(false);
      return;
    }
    setReachable(true);
    setLights(res.lights);
  }, [deviceKey]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    refetch();
    timerRef.current = setInterval(refetch, Math.max(2, intervalSeconds) * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, intervalSeconds, refetch, deviceKey]);

  return { lights, reachable, refetch };
}
