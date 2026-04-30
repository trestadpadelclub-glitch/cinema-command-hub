import { useCallback, useEffect, useRef, useState } from "react";
import { getChromecastStatus, type ChromecastStatus } from "@/lib/projector";

interface Options {
  enabled: boolean;
  intervalSeconds: number;
}

export function useChromecastStatus({ enabled, intervalSeconds }: Options) {
  const [status, setStatus] = useState<ChromecastStatus | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    const res = await getChromecastStatus();
    if (!res.ok) {
      setReachable(false);
      return;
    }
    setReachable(true);
    setStatus(res.status);
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
    timerRef.current = setInterval(refetch, Math.max(1, intervalSeconds) * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, intervalSeconds, refetch]);

  return { status, reachable, refetch };
}
