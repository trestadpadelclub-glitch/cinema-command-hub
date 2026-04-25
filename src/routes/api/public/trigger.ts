import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

const VALID_TRIGGERS = new Set([
  "chromecast_on",
  "chromecast_off",
  "marantz_on",
  "marantz_off",
  "formuler_on",
  "formuler_off",
  "movie_playing",
  "movie_paused",
  "movie_stopped",
]);

interface TriggerRequest {
  household_code: string;
  trigger_key: string;
}

/**
 * Public endpoint för Python-bryggan att rapportera händelser till.
 *
 * POST /api/public/trigger
 * Body: { household_code: "abc", trigger_key: "chromecast_on" }
 *
 * Svar (200): {
 *   matched: true,
 *   scene: { id, name, scene_number, scene_payload, projector_settings, marantz_input, marantz_volume, lights_on },
 *   filters: { run_projector, run_marantz, run_lights },
 *   scene_lights: [ { device_id, name, type, on, brightness?, kelvin?, color? } ]
 * }
 *
 * Svar (200): { matched: false } när ingen trigger är mappad.
 *
 * Bryggan är ansvarig för att exekvera kommandona lokalt mot hårdvaran.
 */
export const Route = createFileRoute("/api/public/trigger")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        let body: TriggerRequest;
        try {
          body = (await request.json()) as TriggerRequest;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const householdCode = String(body.household_code || "").trim();
        const triggerKey = String(body.trigger_key || "").trim();

        if (!householdCode || householdCode.length > 64) {
          return json({ error: "Invalid household_code" }, 400);
        }
        if (!VALID_TRIGGERS.has(triggerKey)) {
          return json({ error: "Invalid trigger_key" }, 400);
        }

        // Slå upp trigger-mappning
        const { data: trigger, error: trigErr } = await supabaseAdmin
          .from("scene_triggers")
          .select("*")
          .eq("household_code", householdCode)
          .eq("trigger_key", triggerKey)
          .eq("enabled", true)
          .maybeSingle();

        if (trigErr) {
          console.error("Trigger lookup failed", trigErr);
          return json({ error: "Database error" }, 500);
        }

        if (!trigger) {
          return json({ matched: false, reason: "no_mapping" }, 200);
        }

        // Hämta scenen
        const { data: scene, error: sceneErr } = await supabaseAdmin
          .from("scenes")
          .select("*")
          .eq("id", trigger.scene_id)
          .maybeSingle();

        if (sceneErr || !scene) {
          console.error("Scene lookup failed", sceneErr);
          return json({ matched: false, reason: "scene_missing" }, 200);
        }

        if (!scene.enabled) {
          return json({ matched: false, reason: "scene_disabled" }, 200);
        }

        // Hämta lampor — alltid (triggern speglar Kör-knappen exakt)
        let sceneLights: Array<Record<string, unknown>> = [];
        {
          const [{ data: lights }, { data: sceneLightRows }] = await Promise.all([
            supabaseAdmin.from("lights").select("*").eq("household_code", householdCode),
            supabaseAdmin.from("scene_lights").select("*").eq("scene_id", scene.id),
          ]);
          const lightById = new Map((lights ?? []).map((l) => [l.id, l]));
          sceneLights = (sceneLightRows ?? [])
            .filter((r) => r.in_scene)
            .map((r) => {
              const l = lightById.get(r.light_id);
              if (!l) return null;
              const treatAsOff = r.on_state && r.brightness === 0;
              const cmd: Record<string, unknown> = {
                device_id: l.tuya_device_id,
                name: l.name,
                type: l.light_type,
                on: treatAsOff ? false : r.on_state,
              };
              if (!treatAsOff) {
                if (r.brightness !== null) cmd.brightness = r.brightness;
                if ((l.light_type === "cct" || l.light_type === "rgbcct") && r.kelvin !== null)
                  cmd.kelvin = r.kelvin;
                if ((l.light_type === "rgb" || l.light_type === "rgbcct") && r.color_hex)
                  cmd.color = r.color_hex;
              }
              return cmd;
            })
            .filter((c): c is Record<string, unknown> => c !== null);
        }

        // Bygg en färdig kommandosekvens som bryggan kör i ordning.
        // Spegelbild av runScene() i SceneGrid + sendScene() i src/lib/projector.ts.
        // Filter-flaggor (run_projector/run_marantz/run_lights) ignoreras —
        // triggern ska göra exakt samma sak som ett klick på "Kör".
        type Cmd =
          | { endpoint: "/api/projector"; body: { action: "scene"; value: string } }
          | { endpoint: "/api/lights"; body: { action: "lights"; value: "on" | "off" } }
          | {
              endpoint: "/api/lights";
              body: { action: "scene_lights"; value: { lights: Array<Record<string, unknown>> } };
            }
          | { endpoint: "/api/marantz"; body: { action: "marantz"; value: string } }
          | { endpoint: "/api/projector"; body: Record<string, unknown> };

        const commands: Cmd[] = [];

        // Hjälp: läs projector_settings (kan vara null)
        const projSettings =
          scene.projector_settings && typeof scene.projector_settings === "object"
            ? (scene.projector_settings as Record<string, unknown>)
            : {};
        const projPower = projSettings.power;

        // 0. Projektor POWER FIRST (om scenen säger något)
        //    Speglar applySettings(): power skickas före allt annat på projektorn.
        if (projPower === "on" || projPower === "off") {
          commands.push({
            endpoint: "/api/projector",
            body: { action: "power", value: projPower },
          });
        }

        // 1. Scene payload till projektor — hoppa över om vi just stängt av
        if (projPower !== "off") {
          commands.push({
            endpoint: "/api/projector",
            body: { action: "scene", value: scene.scene_payload || String(scene.scene_number) },
          });
        }

        // 2. lights on/off
        if (scene.lights_on === true || scene.lights_on === false) {
          commands.push({
            endpoint: "/api/lights",
            body: { action: "lights", value: scene.lights_on ? "on" : "off" },
          });
        }

        // 3. Per-lampa
        if (sceneLights.length > 0) {
          commands.push({
            endpoint: "/api/lights",
            body: { action: "scene_lights", value: { lights: sceneLights } },
          });
        }

        // 4. Marantz power FIRST — om "off" så skippa input/volym
        let marantzOff = false;
        if (scene.marantz_power === "on" || scene.marantz_power === "off") {
          commands.push({
            endpoint: "/api/marantz",
            body: { action: "marantz", value: scene.marantz_power === "on" ? "PWON" : "PWSTANDBY" },
          });
          if (scene.marantz_power === "off") marantzOff = true;
        }

        // 5. Marantz input
        if (!marantzOff && scene.marantz_input) {
          commands.push({
            endpoint: "/api/marantz",
            body: { action: "marantz", value: `SI${scene.marantz_input}` },
          });
        }

        // 6. Marantz volume
        if (!marantzOff && typeof scene.marantz_volume === "number") {
          const v = String(scene.marantz_volume).padStart(2, "0");
          commands.push({
            endpoint: "/api/marantz",
            body: { action: "marantz", value: `MV${v}` },
          });
        }

        // 7. Projector tuning settings — expandera till {action,value} per fält.
        //    Bridge accepterar EN action per anrop, så vi får INTE skicka raw-objektet.
        //    `power` är redan hanterat först (steg 0) — hoppa över här.
        //    Reality Creation splittas: real_cre on/off + reality_creation_val (om >0).
        if (projPower !== "off") {
          const SETTING_KEYS = [
            "pic_mode",
            "laser_output",
            "brightness",
            "contrast",
            "color",
            "sharpness",
            "hdr_enhancer",
            "dynamic_control",
            "motionflow",
            "gamma_correction",
            "color_temp",
            "input",
            "blank",
          ] as const;
          for (const key of SETTING_KEYS) {
            const v = projSettings[key];
            if (v === undefined || v === null) continue;
            commands.push({
              endpoint: "/api/projector",
              body: { action: key, value: v as string | number },
            });
          }
          const rc = projSettings.reality_creation;
          if (typeof rc === "number") {
            const lvl = Math.max(0, Math.min(100, Math.round(rc)));
            commands.push({
              endpoint: "/api/projector",
              body: { action: "real_cre", value: lvl > 0 ? "on" : "off" },
            });
            if (lvl > 0) {
              commands.push({
                endpoint: "/api/projector",
                body: { action: "reality_creation_val", value: lvl },
              });
            }
          }
        }

        const { error: eventErr } = await supabaseAdmin.from("trigger_events").insert({
          household_code: householdCode,
          trigger_key: triggerKey,
          scene_id: scene.id,
          scene_name: scene.name,
          payload: { commands },
        } as never);
        if (eventErr) console.error("Trigger event insert failed", eventErr);

        return json(
          {
            matched: true,
            trigger_key: triggerKey,
            scene: {
              id: scene.id,
              name: scene.name,
              scene_number: scene.scene_number,
              scene_payload: scene.scene_payload,
              projector_settings: scene.projector_settings,
              marantz_power: scene.marantz_power,
              marantz_input: scene.marantz_input,
              marantz_volume: scene.marantz_volume,
              lights_on: scene.lights_on,
            },
            scene_lights: sceneLights,
            commands,
          },
          200,
        );
      },
    },
  },
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
