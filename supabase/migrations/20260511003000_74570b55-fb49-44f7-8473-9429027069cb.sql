-- 1) Enable pg_net for outbound HTTP from Postgres
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2) Secret storage table (server-only)
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
-- No policies = nobody can read it through PostgREST. Only SECURITY DEFINER functions can access it.

-- 3) Generate and store the webhook secret if missing
INSERT INTO public.app_secrets(key, value)
VALUES ('onesignal_webhook_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 4) Helper for the endpoint to read the secret with elevated privileges
CREATE OR REPLACE FUNCTION public.get_app_secret(_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.app_secrets WHERE key = _key
$$;
REVOKE EXECUTE ON FUNCTION public.get_app_secret(text) FROM PUBLIC, anon, authenticated;
-- service_role can still execute it

-- 5) Trigger function: on every new notification, POST to our endpoint
CREATE OR REPLACE FUNCTION public.tg_push_onesignal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  webhook_secret text;
  endpoint_url text := 'https://project--7111be33-b0c5-47c5-80a1-7a40bc65823a.lovable.app/api/public/notify-push';
BEGIN
  SELECT value INTO webhook_secret FROM public.app_secrets WHERE key = 'onesignal_webhook_secret';
  IF webhook_secret IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', COALESCE(NEW.body, ''),
      'link', NEW.link
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block notification insert if the push call fails
  RETURN NEW;
END $$;

-- 6) Attach trigger
DROP TRIGGER IF EXISTS notifications_push_onesignal ON public.notifications;
CREATE TRIGGER notifications_push_onesignal
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_push_onesignal();