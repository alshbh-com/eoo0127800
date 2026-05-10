GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_chat_contacts() TO authenticated, service_role;