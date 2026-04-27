import { useEffect, useRef, useState, useCallback } from "react";
import { getMarantzStatus, parseMarantzStatus, type MarantzStatus } from "@/lib/projector";

interface Options {
  enabled: boolean;
  intervalSeconds: number;
}

/**
 * Pollar Marantz-bryggan (/api/marantz/status) i bakgrunden.
 * Returnerar senast lästa status + en refetch-funktion.
 *
 * Använd EN gång på högsta nivå (Index) och dela ner via context/props
 * om fler komponenter behöver det.
 */
export function useMarantzStatus({ enabled, intervalSeconds }: Options) {
  const [status, setStatus] = useState<MarantzStatus | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    const res = await getMarantzStatus();
    if (!res.ok) {
      setReachable(false);
      return;
    }
    const parsed = parseMarantzStatus(res.data);
    setReachable(true);
    setStatus(parsed);
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

  return { status, reachable, refetch };
}
