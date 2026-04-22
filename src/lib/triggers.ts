import { supabase } from "@/integrations/supabase/client";

export type TriggerKey =
  | "chromecast_on"
  | "chromecast_off"
  | "marantz_on"
  | "marantz_off"
  | "formuler_on"
  | "formuler_off"
  | "movie_playing"
  | "movie_paused"
  | "movie_stopped";

export interface TriggerCatalogEntry {
  key: TriggerKey;
  label: string;
  group: "Källor" | "Uppspelning";
  description: string;
}

/** Hårdkodad katalog över giltiga triggers. Bryggan rapporterar dessa till /api/public/trigger. */
export const TRIGGER_CATALOG: TriggerCatalogEntry[] = [
  { key: "chromecast_on", label: "Chromecast PÅ", group: "Källor", description: "Chromecast-streamen aktiverad" },
  { key: "chromecast_off", label: "Chromecast AV", group: "Källor", description: "Chromecast-streamen avslutad" },
  { key: "marantz_on", label: "Marantz PÅ", group: "Källor", description: "Marantz Cinema 50 slogs på" },
  { key: "marantz_off", label: "Marantz AV", group: "Källor", description: "Marantz Cinema 50 slogs av" },
  { key: "formuler_on", label: "Formuler PÅ", group: "Källor", description: "Formuler-boxen slogs på" },
  { key: "formuler_off", label: "Formuler AV", group: "Källor", description: "Formuler-boxen slogs av" },
  { key: "movie_playing", label: "Film spelas", group: "Uppspelning", description: "Uppspelning startar/återupptas" },
  { key: "movie_paused", label: "Film pausad", group: "Uppspelning", description: "Uppspelning pausad" },
  { key: "movie_stopped", label: "Film stoppad", group: "Uppspelning", description: "Uppspelning stoppad" },
];

export interface SceneTrigger {
  id: string;
  household_code: string;
  trigger_key: TriggerKey;
  scene_id: string;
  enabled: boolean;
  run_projector: boolean;
  run_marantz: boolean;
  run_lights: boolean;
}

export async function fetchTriggers(householdCode: string): Promise<SceneTrigger[]> {
  const { data, error } = await supabase
    .from("scene_triggers")
    .select("*")
    .eq("household_code", householdCode);
  if (error) throw error;
  return (data ?? []) as unknown as SceneTrigger[];
}

/**
 * Mappa en trigger till en scen. Eftersom (household, trigger_key) är unik
 * kommer en befintlig mappning att flyttas automatiskt till den nya scenen.
 */
export async function setTrigger(
  householdCode: string,
  triggerKey: TriggerKey,
  sceneId: string,
  filters: { run_projector: boolean; run_marantz: boolean; run_lights: boolean },
  enabled = true,
) {
  const { error } = await supabase
    .from("scene_triggers")
    .upsert(
      {
        household_code: householdCode,
        trigger_key: triggerKey,
        scene_id: sceneId,
        enabled,
        ...filters,
      },
      { onConflict: "household_code,trigger_key" },
    );
  if (error) throw error;
}

export async function clearTrigger(householdCode: string, triggerKey: TriggerKey) {
  const { error } = await supabase
    .from("scene_triggers")
    .delete()
    .eq("household_code", householdCode)
    .eq("trigger_key", triggerKey);
  if (error) throw error;
}

export async function updateTriggerFilters(
  id: string,
  patch: Partial<Pick<SceneTrigger, "run_projector" | "run_marantz" | "run_lights" | "enabled">>,
) {
  const { error } = await supabase
    .from("scene_triggers")
    .update(patch as never)
    .eq("id", id);
  if (error) throw error;
}
