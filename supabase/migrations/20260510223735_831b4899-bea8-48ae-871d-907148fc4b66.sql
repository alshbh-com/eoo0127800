DROP POLICY IF EXISTS "system insert notifications" ON public.notifications;
CREATE POLICY "admin insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (has_role(auth.uid(),'admin'));