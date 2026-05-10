
revoke all on function public.get_chat_contacts() from public, anon;
grant execute on function public.get_chat_contacts() to authenticated;
