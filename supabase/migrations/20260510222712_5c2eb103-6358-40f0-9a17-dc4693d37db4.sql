
-- Messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  recipient_id uuid not null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_messages_pair on public.messages (sender_id, recipient_id, created_at desc);
create index if not exists idx_messages_recipient on public.messages (recipient_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists "view own messages" on public.messages;
create policy "view own messages" on public.messages
  for select using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "send messages" on public.messages;
create policy "send messages" on public.messages
  for insert with check (sender_id = auth.uid());

drop policy if exists "mark read own" on public.messages;
create policy "mark read own" on public.messages
  for update using (recipient_id = auth.uid());

-- Allow viewing profiles of chat contacts
drop policy if exists "view chat contacts profiles" on public.profiles;
create policy "view chat contacts profiles" on public.profiles
  for select using (true);

-- Allow viewing user_roles (needed to know counterpart's role)
drop policy if exists "view all roles" on public.user_roles;
create policy "view all roles" on public.user_roles
  for select using (true);

-- RPC to fetch allowed chat contacts based on caller role
create or replace function public.get_chat_contacts()
returns table(user_id uuid, full_name text, role app_role)
language plpgsql stable security definer set search_path = public
as $$
declare my_roles app_role[];
begin
  select array_agg(r.role) into my_roles from public.user_roles r where r.user_id = auth.uid();
  if my_roles is null then return; end if;

  return query
    select distinct p.id, p.full_name, ur.role
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id <> auth.uid()
      and (
        ('admin'::app_role = any(my_roles))
        or ('restaurant'::app_role = any(my_roles) and ur.role in ('admin'::app_role,'driver'::app_role))
        or ('driver'::app_role = any(my_roles) and ur.role in ('admin'::app_role,'restaurant'::app_role))
      );
end$$;

-- Enable realtime
alter publication supabase_realtime add table public.messages;
