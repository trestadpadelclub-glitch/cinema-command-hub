import { createFileRoute } from "@tanstack/react-router";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SCHEMA_HINT = `Return ONLY a JSON object with these allowed keys (omit any you don't want to set):
- pic_mode: "cinema_film_1" | "cinema_film_2" | "reference" | "tv" | "bright_cinema"
- laser_output: integer 0-100
- brightness: integer 0-100
- contrast: integer 0-100
- color: integer 0-100
- reality_creation: integer 0-100
- hdr_enhancer: "off" | "low" | "middle" | "high"
- dynamic_control: "off" | "limited" | "middle" | "full"
- motionflow: "off" | "true_cinema" | "smooth_low" | "smooth_high" | "impulse" | "combination"
- gamma_correction: "off" | "1.8" | "2.0" | "2.1" | "2.2" | "2.4" | "2.6"

Each key/value will be sent to the Sony bridge as { command: "<key> <value>" }.`;

const SETTINGS_TOOL = {
  type: "function" as const,
  function: {
    name: "set_projector_settings",
    description: "Apply calibrated projector settings to the Sony bridge.",
    parameters: {
      type: "object",
      properties: {
        pic_mode: {
          type: "string",
          enum: [
            "cinema_film_1",
            "cinema_film_2",
            "reference",
            "tv",
            "bright_cinema",
          ],
        },
        laser_output: { type: "integer", minimum: 0, maximum: 100 },
        brightness: { type: "integer", minimum: 0, maximum: 100 },
        contrast: { type: "integer", minimum: 0, maximum: 100 },
        color: { type: "integer", minimum: 0, maximum: 100 },
        reality_creation: { type: "integer", minimum: 0, maximum: 100 },
        hdr_enhancer: {
          type: "string",
          enum: ["off", "low", "middle", "high"],
        },
        dynamic_control: {
          type: "string",
          enum: ["off", "limited", "middle", "full"],
        },
        motionflow: {
          type: "string",
          enum: [
            "off",
            "true_cinema",
            "smooth_low",
            "smooth_high",
            "impulse",
            "combination",
          ],
        },
        gamma_correction: {
          type: "string",
          enum: ["off", "1.8", "2.0", "2.1", "2.2", "2.4", "2.6"],
        },
      },
      additionalProperties: false,
    },
  },
};

type ChatTurn = { role: "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/cinema-brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!LOVABLE_API_KEY) {
          return Response.json(
            { error: "LOVABLE_API_KEY is not configured" },
            { status: 500 },
          );
        }

        let body: {
          mode?: "calibrate" | "summarize";
          masterInstructions?: string;
          scenario?: Record<string, unknown>;
          currentSettings?: Record<string, unknown>;
          liveSettings?: Record<string, unknown> | null;
          chatHistory?: ChatTurn[];
          finalSettings?: Record<string, unknown>;
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const mode = body.mode ?? "calibrate";
        const masterInstructions =
          (body.masterInstructions ?? "").toString().trim() ||
          "(no master instructions provided)";

        // ---------- SUMMARIZE MODE: produce KB addendum ----------
        if (mode === "summarize") {
          const scenario = body.scenario ?? {};
          const finalSettings = body.finalSettings ?? {};
          const chatHistory = body.chatHistory ?? [];

          const sysPrompt = `You curate a calibration knowledge base for the Sony VPL-XW5000ES.
Given the current Master Instructions, the scenario, the chat refinements, and the final settings the user accepted, write 1-4 short bullet rules (in English) capturing what we learned that should generalize to future calibrations. Be concise, specific, and actionable. Do NOT repeat rules already present. Output ONLY the bullet lines, each starting with "- ". No preface, no closing remarks.`;

          const userPrompt = `EXISTING MASTER INSTRUCTIONS:
${masterInstructions}

SCENARIO:
${JSON.stringify(scenario, null, 2)}

REFINEMENT CHAT:
${chatHistory.map((m) => `[${m.role}] ${m.content}`).join("\n") || "(none)"}

FINAL ACCEPTED SETTINGS:
${JSON.stringify(finalSettings, null, 2)}

Write the new lessons to add to the knowledge base.`;

          const aiRes = await fetch(GATEWAY_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: userPrompt },
              ],
            }),
          });

          if (!aiRes.ok) {
            if (aiRes.status === 429)
              return Response.json({ error: "Rate limit exceeded." }, { status: 429 });
            if (aiRes.status === 402)
              return Response.json(
                { error: "AI credits exhausted." },
                { status: 402 },
              );
            return Response.json(
              { error: `AI gateway error (${aiRes.status})` },
              { status: 502 },
            );
          }

          const data = await aiRes.json();
          const summary: string =
            data?.choices?.[0]?.message?.content?.trim() ?? "";
          if (!summary) {
            return Response.json(
              { error: "AI returned no summary." },
              { status: 502 },
            );
          }
          return Response.json({ summary });
        }

        // ---------- CALIBRATE MODE (initial + refinement) ----------
        const scenario = body.scenario ?? {};
        const currentSettings = body.currentSettings ?? {};
        const liveSettings = body.liveSettings ?? null;
        const chatHistory = body.chatHistory ?? [];

        const systemPrompt = `You are an expert home cinema calibrator for the Sony VPL-XW5000ES laser projector.
You output projector settings as a single JSON object that matches the bridge schema below.
You are given the projector's CURRENT LIVE SETTINGS (read directly from the device). Treat these as the actual starting point — your proposal should be a deliberate, well-motivated delta from this baseline, not an unrelated configuration. Only change values where the scenario, master instructions, or user feedback give a clear reason; keep everything else aligned with the live baseline so the user's existing tuning is respected.
When refining, change ONLY what the user's feedback requires — keep all other values from the previous proposal stable. Move strategically toward the optimum in small, deliberate steps.
Do NOT include explanations, markdown, or extra keys — only the JSON object.

${SCHEMA_HINT}`;

        const liveBlock = liveSettings && Object.keys(liveSettings).length > 0
          ? `CURRENT LIVE PROJECTOR SETTINGS (read from the device right now — primary baseline):
${JSON.stringify(liveSettings, null, 2)}

`
          : `CURRENT LIVE PROJECTOR SETTINGS: (unavailable — projector did not respond; rely on master instructions and scenario)

`;

        const baseUserPrompt = `MASTER INSTRUCTIONS (knowledge base):
${masterInstructions}

CURRENT SCENARIO:
${JSON.stringify(scenario, null, 2)}

${liveBlock}PREVIOUS AI PROPOSAL (keep stable unless feedback or live readings say otherwise):
${JSON.stringify(currentSettings, null, 2)}

Produce the optimal calibration JSON for this scenario, weighing the live baseline as a primary input alongside the master instructions and scenario.`;

        const messages: Array<{ role: string; content: string }> = [
          { role: "system", content: systemPrompt },
          { role: "user", content: baseUserPrompt },
        ];
        // Append refinement chat (user feedback + previous AI JSON proposals)
        for (const turn of chatHistory) {
          messages.push({ role: turn.role, content: turn.content });
        }

        const aiRes = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages,
            tools: [SETTINGS_TOOL],
            tool_choice: {
              type: "function",
              function: { name: "set_projector_settings" },
            },
          }),
        });

        if (!aiRes.ok) {
          if (aiRes.status === 429) {
            return Response.json(
              { error: "Rate limit exceeded, please try again later." },
              { status: 429 },
            );
          }
          if (aiRes.status === 402) {
            return Response.json(
              {
                error:
                  "AI credits exhausted. Add funds at Settings → Workspace → Usage.",
              },
              { status: 402 },
            );
          }
          const text = await aiRes.text();
          console.error("AI gateway error:", aiRes.status, text);
          return Response.json(
            { error: `AI gateway error (${aiRes.status})` },
            { status: 502 },
          );
        }

        const data = await aiRes.json();
        const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
        const argsStr: string | undefined = toolCall?.function?.arguments;

        let settings: Record<string, unknown> | null = null;
        if (argsStr) {
          try {
            settings = JSON.parse(argsStr);
          } catch (e) {
            console.error("Failed to parse tool args:", argsStr, e);
          }
        }

        if (!settings) {
          const content: string | undefined = data?.choices?.[0]?.message?.content;
          if (content) {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
              try {
                settings = JSON.parse(match[0]);
              } catch {
                /* ignore */
              }
            }
          }
        }

        if (!settings) {
          return Response.json(
            { error: "AI did not return valid settings JSON." },
            { status: 502 },
          );
        }

        return Response.json({ settings });
      },
    },
  },
});
