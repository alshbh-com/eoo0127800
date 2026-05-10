
-- Complaints system
CREATE TYPE public.complaint_status AS ENUM ('open','in_progress','resolved','rejected');

CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  subject text NOT NULL,
  description text,
  status public.complaint_status NOT NULL DEFAULT 'open',
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage complaints" ON public.complaints
  FOR ALL USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "creator view own complaints" ON public.complaints
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "restaurant view related complaints" ON public.complaints
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id = complaints.restaurant_id AND r.user_id = auth.uid())
  );

CREATE POLICY "driver view related complaints" ON public.complaints
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM public.drivers d WHERE d.id = complaints.driver_id AND d.user_id = auth.uid())
  );

CREATE POLICY "users create complaints" ON public.complaints
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE TRIGGER complaints_updated_at BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Notify admins on new complaint
CREATE OR REPLACE FUNCTION public.tg_notify_complaint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE admin_id uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    FOR admin_id IN SELECT user_id FROM public.user_roles WHERE role='admin' LOOP
      INSERT INTO public.notifications(user_id,title,body,link)
      VALUES (admin_id, 'شكوى جديدة', NEW.subject, '/admin');
    END LOOP;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications(user_id,title,body,link)
    VALUES (NEW.created_by, 'تحديث شكوى', 'حالة شكواك: '||NEW.status::text, null);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER complaints_notify
AFTER INSERT OR UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_complaint();

-- Add 'on_hold' status for orders
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'on_hold';

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
