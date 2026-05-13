ALTER TABLE public.scenes
ADD COLUMN IF NOT EXISTS marantz_mute boolean,
ADD COLUMN IF NOT EXISTS marantz_sound_mode text,
ADD COLUMN IF NOT EXISTS marantz_smart_select integer,
ADD COLUMN IF NOT EXISTS marantz_dirac text,
ADD COLUMN IF NOT EXISTS marantz_speaker_preset integer,
ADD COLUMN IF NOT EXISTS projector_blank_delay_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.scenes
ADD CONSTRAINT scenes_marantz_smart_select_range
CHECK (marantz_smart_select IS NULL OR marantz_smart_select BETWEEN 1 AND 4) NOT VALID;

ALTER TABLE public.scenes
ADD CONSTRAINT scenes_marantz_speaker_preset_range
CHECK (marantz_speaker_preset IS NULL OR marantz_speaker_preset BETWEEN 1 AND 2) NOT VALID;

ALTER TABLE public.scenes
ADD CONSTRAINT scenes_projector_blank_delay_range
CHECK (projector_blank_delay_seconds BETWEEN 0 AND 60) NOT VALID;