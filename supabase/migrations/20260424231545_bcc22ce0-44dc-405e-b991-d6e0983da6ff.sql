CREATE TABLE public.trigger_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_code text NOT NULL,
  trigger_key text NOT NULL,
  scene_id uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  scene_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.trigger_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all" ON public.trigger_events FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_trigger_events_household_created ON public.trigger_events (household_code, created_at DESC);
CREATE INDEX idx_trigger_events_scene ON public.trigger_events (scene_id);