import { supabase } from "@/integrations/supabase/client";
import type { ProjectorSettings } from "@/lib/projector";

export interface Scene {
  id: string;
  household_code: string;
  scene_number: number;
  name: string;
  enabled: boolean;
  projector_settings: ProjectorSettings;
  marantz_power: "on" | "off" | null;
  marantz_input: string | null;
  marantz_volume: number | null;
  lights_on: boolean | null;
  scene_payload: string | null;
  projector_delay_ms: number;
  marantz_delay_ms: number;
  lights_delay_ms: number;
  updated_at: string;
}

export interface MarantzInput {
  id: string;
  position: number;
  label: string;
  marantz_code: string;
  icon: string;
}


export interface MarantzLabels {
  speaker_preset_1?: string;
  speaker_preset_2?: string;
  dirac_1?: string;
  dirac_2?: string;
  dirac_3?: string;
}

export interface AppSettings {
  household_code: string;
  poll_enabled: boolean;
  poll_interval_seconds: number;
  marantz_labels?: MarantzLabels;
}

export type LightType = "dimmer" | "cct" | "rgb" | "rgbcct";

export interface Light {
  id: string;
  household_code: string;
  position: number;
  name: string;
  tuya_device_id: string;
  light_type: LightType;
  enabled: boolean;
}

export interface SceneLight {
  id: string;
  scene_id: string;
  light_id: string;
  in_scene: boolean;
  on_state: boolean;
  brightness: number | null;
  kelvin: number | null;
  color_hex: string | null;
  delay_ms: number;
  fade_ms: number;
}

// ---------- Scenes ----------

export async function fetchScenes(householdCode: string): Promise<Scene[]> {
  const { data, error } = await supabase
    .from("scenes")
    .select("*")
    .eq("household_code", householdCode)
    .order("scene_number");
  if (error) throw error;
  return (data ?? []) as unknown as Scene[];
}

export async function updateScene(
  id: string,
  patch: Partial<Omit<Scene, "id" | "household_code" | "updated_at">>,
) {
  // Vissa nätverk/ad-blockers blockerar PATCH mot Supabase REST.
  // Hämta hela raden, mergea patchen och kör upsert (POST) istället.
  const { data: current, error: fetchErr } = await supabase
    .from("scenes")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;
  const merged = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("scenes")
    .upsert(merged as never, { onConflict: "id" });
  if (error) throw error;
}

// ---------- Marantz inputs ----------

export async function fetchInputs(householdCode: string): Promise<MarantzInput[]> {
  const { data, error } = await supabase
    .from("marantz_inputs")
    .select("*")
    .eq("household_code", householdCode)
    .order("position");
  if (error) throw error;
  return (data ?? []) as unknown as MarantzInput[];
}

export async function upsertInput(
  householdCode: string,
  input: Omit<MarantzInput, "id">,
) {
  const { error } = await supabase
    .from("marantz_inputs")
    .upsert(
      { household_code: householdCode, ...input },
      { onConflict: "household_code,position" },
    );
  if (error) throw error;
}

export async function deleteInput(id: string) {
  const { error } = await supabase.from("marantz_inputs").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Lights ----------

export async function fetchLights(householdCode: string): Promise<Light[]> {
  const { data, error } = await supabase
    .from("lights")
    .select("*")
    .eq("household_code", householdCode)
    .order("position");
  if (error) throw error;
  return (data ?? []) as unknown as Light[];
}

export async function createLight(
  householdCode: string,
  input: Omit<Light, "id" | "household_code">,
) {
  const { error } = await supabase
    .from("lights")
    .insert({ household_code: householdCode, ...input } as never);
  if (error) throw error;
}

export async function updateLight(
  id: string,
  patch: Partial<Omit<Light, "id" | "household_code">>,
) {
  // Hämta aktuell rad och gör en upsert (POST) istället för PATCH.
  // Vissa nätverk/extensions blockerar PATCH-requests till Supabase.
  const { data: current, error: fetchErr } = await supabase
    .from("lights")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;
  const merged = { ...current, ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from("lights")
    .upsert(merged as never, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteLight(id: string) {
  const { error } = await supabase.from("lights").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Scene lights ----------

export async function fetchSceneLights(sceneId: string): Promise<SceneLight[]> {
  const { data, error } = await supabase
    .from("scene_lights")
    .select("*")
    .eq("scene_id", sceneId);
  if (error) throw error;
  return (data ?? []) as unknown as SceneLight[];
}

export async function upsertSceneLight(
  row: Omit<SceneLight, "id"> & { id?: string },
) {
  const { error } = await supabase
    .from("scene_lights")
    .upsert(row as never, { onConflict: "scene_id,light_id" });
  if (error) throw error;
}

// Automation events removed — timing now lives on scenes & scene_lights

// ---------- App settings ----------

export async function fetchAppSettings(householdCode: string): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("household_code", householdCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      household_code: householdCode,
      poll_enabled: true,
      poll_interval_seconds: 5,
    };
  }
  return data as unknown as AppSettings;
}

export async function updateAppSettings(
  householdCode: string,
  patch: Partial<Pick<AppSettings, "poll_enabled" | "poll_interval_seconds">>,
) {
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { household_code: householdCode, ...patch },
      { onConflict: "household_code" },
    );
  if (error) throw error;
}
