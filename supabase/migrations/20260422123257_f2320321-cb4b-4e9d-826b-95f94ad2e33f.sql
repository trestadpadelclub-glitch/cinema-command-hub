-- LIGHTS: lista med fysiska lampor per household
CREATE TABLE public.lights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_code text NOT NULL,
  position integer NOT NULL,
  name text NOT NULL,
  tuya_device_id text NOT NULL,
  light_type text NOT NULL DEFAULT 'dimmer', -- dimmer | cct | rgb | rgbcct
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_code, position)
);

ALTER TABLE public.lights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all" ON public.lights FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_lights_touch
  BEFORE UPDATE ON public.lights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SCENE_LIGHTS: per scen + lampa
CREATE TABLE public.scene_lights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  light_id uuid NOT NULL REFERENCES public.lights(id) ON DELETE CASCADE,
  in_scene boolean NOT NULL DEFAULT false,
  on_state boolean NOT NULL DEFAULT true,
  brightness integer,        -- 0-100
  kelvin integer,            -- 2700-6500
  color_hex text,            -- #RRGGBB
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scene_id, light_id)
);

ALTER TABLE public.scene_lights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all" ON public.scene_lights FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_scene_lights_touch
  BEFORE UPDATE ON public.scene_lights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_scene_lights_scene ON public.scene_lights(scene_id);
CREATE INDEX idx_scene_lights_light ON public.scene_lights(light_id);
CREATE INDEX idx_lights_household ON public.lights(household_code);