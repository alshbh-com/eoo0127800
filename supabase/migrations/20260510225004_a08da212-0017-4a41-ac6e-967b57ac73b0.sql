
-- Products table for each restaurant
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_restaurant ON public.products(restaurant_id);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view products" ON public.products FOR SELECT USING (
  has_role(auth.uid(),'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND r.user_id=auth.uid())
);
CREATE POLICY "manage products" ON public.products FOR ALL USING (
  has_role(auth.uid(),'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND r.user_id=auth.uid())
) WITH CHECK (
  has_role(auth.uid(),'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND r.user_id=auth.uid())
);

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Daily order number (resets each day)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS daily_number integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_date date NOT NULL DEFAULT (now()::date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_daily_unique ON public.orders(order_date, daily_number);

CREATE OR REPLACE FUNCTION public.tg_set_daily_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE next_n integer;
BEGIN
  IF NEW.daily_number IS NULL THEN
    SELECT COALESCE(MAX(daily_number),0)+1 INTO next_n FROM public.orders WHERE order_date = NEW.order_date;
    NEW.daily_number := next_n;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_set_daily_number ON public.orders;
CREATE TRIGGER orders_set_daily_number BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_daily_number();

-- Backfill existing rows
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY order_date ORDER BY created_at) AS rn FROM public.orders WHERE daily_number IS NULL
)
UPDATE public.orders o SET daily_number = n.rn FROM numbered n WHERE o.id = n.id;
