
-- Households (en rad per delad nyckel — bara för UI-listning, alla anrop scopas på koden)
CREATE TABLE public.households (
  code TEXT PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scenes (10 default per household, men användaren kan skapa fler om hen vill)
CREATE TABLE public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_code TEXT NOT NULL,
  scene_number INT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- projektor-inställningar (JSON för flexibilitet)
  projector_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- marantz overrides
  marantz_input TEXT,           -- ex "MEDIA PLAYER", "BD"
  marantz_volume INT,           -- master volume value (om null = rör inte)
  -- ljus
  lights_on BOOLEAN,            -- null = rör inte
  -- backend payload-namn (skickas som value i {action:"scene", value: scene_payload})
  scene_payload TEXT,           -- ex "1", null = använd scene_number
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_code, scene_number)
);

-- Marantz inputs (konfigurerbara källor med ikon)
CREATE TABLE public.marantz_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_code TEXT NOT NULL,
  position INT NOT NULL,         -- visningsordning
  label TEXT NOT NULL,           -- "Apple TV"
  marantz_code TEXT NOT NULL,    -- "MEDIA PLAYER" / "BD" / "GAME" etc
  icon TEXT NOT NULL DEFAULT 'tv', -- lucide-icon namn: 'tv', 'disc', 'cast', 'satellite', 'radio'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_code, position)
);

-- Automation events (delay + fade)
CREATE TABLE public.automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_code TEXT NOT NULL,
  event_key TEXT NOT NULL,       -- 'marantz_start', 'input_change', 'formuler_play', 'formuler_pause'
  label TEXT NOT NULL,
  delay_ms INT NOT NULL DEFAULT 0,
  fade_ms INT NOT NULL DEFAULT 0,
  lights_target INT,             -- 0-100 (% ljus efter event), null = rör inte
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_code, event_key)
);

-- App-settings per household (poll-intervall, etc)
CREATE TABLE public.app_settings (
  household_code TEXT PRIMARY KEY,
  poll_enabled BOOLEAN NOT NULL DEFAULT true,
  poll_interval_seconds INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER touch_scenes BEFORE UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_automation BEFORE UPDATE ON public.automation_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_app_settings BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS: helt öppet (LAN-läge, household-koden är "lösenordet")
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marantz_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all" ON public.households FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.scenes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.marantz_inputs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.automation_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- Helper: seeda en ny household med 10 scener + default-källor + default-events
CREATE OR REPLACE FUNCTION public.seed_household(_code TEXT, _name TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.households (code, name) VALUES (_code, COALESCE(_name, _code))
    ON CONFLICT (code) DO NOTHING;

  -- 10 scener
  INSERT INTO public.scenes (household_code, scene_number, name, scene_payload)
  SELECT _code, n, 'Scen ' || n, n::text
  FROM generate_series(1, 10) n
  ON CONFLICT (household_code, scene_number) DO NOTHING;

  -- 4 default-källor
  INSERT INTO public.marantz_inputs (household_code, position, label, marantz_code, icon) VALUES
    (_code, 1, 'Apple TV',   'MPLAY', 'tv'),
    (_code, 2, 'Formuler',   'CBL',   'satellite'),
    (_code, 3, 'Blu-ray',    'BD',    'disc'),
    (_code, 4, 'Chromecast', 'GAME',  'cast')
  ON CONFLICT (household_code, position) DO NOTHING;

  -- Default automation-events
  INSERT INTO public.automation_events (household_code, event_key, label, delay_ms, fade_ms, lights_target) VALUES
    (_code, 'marantz_start',  'Starta Marantz',     0,    1000, 30),
    (_code, 'input_change',   'Byt Input',          200,  500,  NULL),
    (_code, 'formuler_play',  'Play på Formuler',   0,    2000, 0),
    (_code, 'formuler_pause', 'Pause på Formuler',  0,    1500, 40)
  ON CONFLICT (household_code, event_key) DO NOTHING;

  -- App-settings
  INSERT INTO public.app_settings (household_code) VALUES (_code)
  ON CONFLICT (household_code) DO NOTHING;
END;
$$;
