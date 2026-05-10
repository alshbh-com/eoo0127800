
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "mark read own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "system insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);
CREATE POLICY "admin manage notifications" ON public.notifications
  FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Settings (singleton)
CREATE TABLE public.app_settings (
  id int PRIMARY KEY DEFAULT 1,
  app_name text NOT NULL DEFAULT 'O&R',
  currency text NOT NULL DEFAULT 'ج.م',
  commission_rate numeric NOT NULL DEFAULT 0,
  support_phone text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.app_settings(id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "admin update settings" ON public.app_settings FOR UPDATE USING (has_role(auth.uid(),'admin'));

-- Trigger to auto-notify on order events
CREATE OR REPLACE FUNCTION public.tg_notify_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  rest_user uuid;
  drv_user uuid;
  admin_id uuid;
BEGIN
  SELECT user_id INTO rest_user FROM public.restaurants WHERE id = NEW.restaurant_id;
  IF NEW.driver_id IS NOT NULL THEN
    SELECT user_id INTO drv_user FROM public.drivers WHERE id = NEW.driver_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- notify all admins
    FOR admin_id IN SELECT user_id FROM public.user_roles WHERE role='admin' LOOP
      INSERT INTO public.notifications(user_id,title,body,link)
      VALUES (admin_id, 'طلب جديد', 'طلب '||NEW.order_number||' من العميل '||NEW.customer_name, '/admin');
    END LOOP;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF rest_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,title,body,link)
      VALUES (rest_user,'تحديث حالة الطلب','الطلب '||NEW.order_number||' أصبح '||NEW.status,'/restaurant');
    END IF;
    IF drv_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,title,body,link)
      VALUES (drv_user,'تحديث على طلبك','الطلب '||NEW.order_number||' أصبح '||NEW.status,'/driver');
    END IF;
  ELSIF NEW.driver_id IS DISTINCT FROM OLD.driver_id AND NEW.driver_id IS NOT NULL THEN
    IF drv_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,title,body,link)
      VALUES (drv_user,'طلب جديد على حسابك','تم إسناد الطلب '||NEW.order_number||' إليك','/driver');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_order_ins ON public.orders;
DROP TRIGGER IF EXISTS trg_notify_order_upd ON public.orders;
CREATE TRIGGER trg_notify_order_ins AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_order();
CREATE TRIGGER trg_notify_order_upd AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_order();

-- Notify on chat message
CREATE OR REPLACE FUNCTION public.tg_notify_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sender_name text;
BEGIN
  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  INSERT INTO public.notifications(user_id,title,body,link)
  VALUES (NEW.recipient_id,'رسالة جديدة', COALESCE(sender_name,'مستخدم')||': '||LEFT(NEW.body,80), null);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
CREATE TRIGGER trg_notify_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_message();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
