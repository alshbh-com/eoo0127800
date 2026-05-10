
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'restaurant', 'driver');
CREATE TYPE public.order_status AS ENUM ('pending','accepted','preparing','picked_up','on_the_way','delivered','cancelled','returned');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS SETOF public.app_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.user_roles WHERE user_id = auth.uid() $$;

-- ============ CITIES ============
CREATE TABLE public.cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  delivery_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- ============ RESTAURANTS ============
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_restaurants_city ON public.restaurants(city_id);

-- ============ DRIVERS ============
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  vehicle_type TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  location_updated_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_drivers_city ON public.drivers(city_id);
CREATE INDEX idx_drivers_online ON public.drivers(is_online) WHERE is_online = true;

-- ============ ORDERS ============
CREATE SEQUENCE public.order_number_seq START 1000;

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT ('ORD-' || nextval('public.order_number_seq')::TEXT),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  items_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) GENERATED ALWAYS AS (items_total + delivery_price) STORED,
  status public.order_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_restaurant ON public.orders(restaurant_id);
CREATE INDEX idx_orders_driver ON public.orders(driver_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);

-- ============ ORDER STATUS HISTORY ============
CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_osh_order ON public.order_status_history(order_id);

-- ============ TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER t_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER t_cities_updated BEFORE UPDATE ON public.cities FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER t_restaurants_updated BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER t_drivers_updated BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER t_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ AUTO PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.raw_user_meta_data->>'phone');
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ ORDER STATUS HISTORY TRIGGER ============
CREATE OR REPLACE FUNCTION public.tg_log_order_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.order_status_history(order_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_orders_log_status AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.tg_log_order_status();

-- ============ RLS POLICIES ============

-- profiles
CREATE POLICY "users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin insert profile" ON public.profiles FOR INSERT WITH CHECK (public.has_role(auth.uid(),'admin') OR auth.uid() = id);

-- user_roles
CREATE POLICY "users view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- cities
CREATE POLICY "all view cities" ON public.cities FOR SELECT USING (true);
CREATE POLICY "admin manage cities" ON public.cities FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- restaurants
CREATE POLICY "view restaurants" ON public.restaurants FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR user_id = auth.uid() OR public.has_role(auth.uid(),'driver')
);
CREATE POLICY "admin manage restaurants" ON public.restaurants FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "restaurant update own" ON public.restaurants FOR UPDATE USING (user_id = auth.uid());

-- drivers
CREATE POLICY "view drivers" ON public.drivers FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR user_id = auth.uid() OR public.has_role(auth.uid(),'restaurant')
);
CREATE POLICY "admin manage drivers" ON public.drivers FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "driver update own" ON public.drivers FOR UPDATE USING (user_id = auth.uid());

-- orders
CREATE POLICY "view orders" ON public.orders FOR SELECT USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = orders.restaurant_id AND r.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = orders.driver_id AND d.user_id = auth.uid())
);
CREATE POLICY "restaurant create order" ON public.orders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "update orders" ON public.orders FOR UPDATE USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = orders.restaurant_id AND r.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = orders.driver_id AND d.user_id = auth.uid())
);
CREATE POLICY "admin delete orders" ON public.orders FOR DELETE USING (public.has_role(auth.uid(),'admin'));

-- order status history
CREATE POLICY "view order history" ON public.order_status_history FOR SELECT USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.orders o JOIN public.restaurants r ON r.id = o.restaurant_id WHERE o.id = order_id AND r.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.orders o JOIN public.drivers d ON d.id = o.driver_id WHERE o.id = order_id AND d.user_id = auth.uid())
);

-- realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.drivers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
