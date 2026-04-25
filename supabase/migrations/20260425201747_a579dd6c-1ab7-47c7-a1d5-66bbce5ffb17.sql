ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS projector_delay_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marantz_delay_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lights_delay_ms integer NOT NULL DEFAULT 0;

ALTER TABLE public.scene_lights
  ADD COLUMN IF NOT EXISTS delay_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fade_ms integer NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS public.automation_events;

-- Uppdatera seed_household så den inte längre försöker skapa automation_events
CREATE OR REPLACE FUNCTION public.seed_household(_code text, _name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.households (code, name) VALUES (_code, COALESCE(_name, _code))
    ON CONFLICT (code) DO NOTHING;

  INSERT INTO public.scenes (household_code, scene_number, name, scene_payload)
  SELECT _code, n, 'Scen ' || n, n::text
  FROM generate_series(1, 10) n
  ON CONFLICT (household_code, scene_number) DO NOTHING;

  INSERT INTO public.marantz_inputs (household_code, position, label, marantz_code, icon) VALUES
    (_code, 1, 'Apple TV',   'MPLAY', 'tv'),
    (_code, 2, 'Formuler',   'CBL',   'satellite'),
    (_code, 3, 'Blu-ray',    'BD',    'disc'),
    (_code, 4, 'Chromecast', 'GAME',  'cast')
  ON CONFLICT (household_code, position) DO NOTHING;

  INSERT INTO public.app_settings (household_code) VALUES (_code)
  ON CONFLICT (household_code) DO NOTHING;
END;
$function$;