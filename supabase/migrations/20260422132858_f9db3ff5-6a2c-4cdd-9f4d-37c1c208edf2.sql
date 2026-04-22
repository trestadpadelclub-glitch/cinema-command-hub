-- Trigger-mappning: en trigger pekar på max EN scen (unik på household + trigger_key)
CREATE TABLE public.scene_triggers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_code text NOT NULL,
  trigger_key text NOT NULL,
  scene_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  -- Per-trigger filter: vilka delar av scenen som ska köras
  run_projector boolean NOT NULL DEFAULT true,
  run_marantz boolean NOT NULL DEFAULT true,
  run_lights boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT scene_triggers_unique_per_household UNIQUE (household_code, trigger_key)
);

ALTER TABLE public.scene_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all" ON public.scene_triggers FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER scene_triggers_touch_updated_at
  BEFORE UPDATE ON public.scene_triggers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_scene_triggers_lookup ON public.scene_triggers (household_code, trigger_key) WHERE enabled = true;
CREATE INDEX idx_scene_triggers_scene ON public.scene_triggers (scene_id);