import { useCallback, useEffect, useRef, useState } from "react";
import { getLightsStatus, type LightStatus } from "@/lib/projector";

interface Options {
  enabled: boolean;
  intervalSeconds: number;
}

export function useLightsStatus({ enabled, intervalSeconds }: Options) {
  const [lights, setLights] = useState<LightStatus[]>([]);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    const res = await getLightsStatus();
    if (!res.ok) {
      setReachable(false);
      return;
    }
    setReachable(true);
    setLights(res.lights);
  }, []);

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
  }, [enabled, intervalSeconds, refetch]);

  return { lights, reachable, refetch };
}
