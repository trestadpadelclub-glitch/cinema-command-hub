ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS marantz_power text;
ALTER TABLE public.scenes DROP CONSTRAINT IF EXISTS scenes_marantz_power_check;
ALTER TABLE public.scenes ADD CONSTRAINT scenes_marantz_power_check CHECK (marantz_power IS NULL OR marantz_power IN ('on','off'));