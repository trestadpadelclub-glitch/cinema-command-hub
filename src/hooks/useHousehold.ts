import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getHouseholdCode,
  setHouseholdCode as persistCode,
  generateHouseholdCode,
} from "@/lib/household";

/**
 * Returnerar aktuell household-kod, eller null om ingen valts än.
 * Tillhandahåller setCode() för att byta/skapa.
 */
export function useHousehold() {
  const [code, setCode] = useState<string | null>(() => getHouseholdCode());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      let c = getHouseholdCode();
      if (!c) {
        c = generateHouseholdCode();
        persistCode(c);
      }
      // seed:a alltid (idempotent)
      await supabase.rpc("seed_household", { _code: c, _name: c });
      if (!cancelled) {
        setCode(c);
        setReady(true);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const switchTo = async (newCode: string) => {
    const c = newCode.trim();
    if (!c) return;
    persistCode(c);
    await supabase.rpc("seed_household", { _code: c, _name: c });
    setCode(c);
  };

  return { code, ready, switchTo };
}
