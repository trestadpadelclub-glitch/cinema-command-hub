DROP POLICY IF EXISTS "open all" ON public.trigger_events;

CREATE POLICY "open read" ON public.trigger_events
FOR SELECT
USING (true);