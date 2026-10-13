-- FunText cloud chat schema. Run in Supabase Dashboard -> SQL Editor.
create table if not exists public.ft_conversations (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(trim(title)) between 1 and 48),
 invite_code text not null unique,
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.ft_conversation_members (
 conversation_id uuid not null references public.ft_conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check (role in ('owner','member')),
 joined_at timestamptz not null default now(),
 primary key (conversation_id,user_id)
);
create table if not exists public.ft_messages (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references public.ft_conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 content text not null check (char_length(trim(content)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists ft_messages_conversation_created_idx on public.ft_messages(conversation_id,created_at);
alter table public.ft_conversations enable row level security;
alter table public.ft_conversation_members enable row level security;
alter table public.ft_messages enable row level security;
create or replace function public.ft_is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(select 1 from public.ft_conversation_members m where m.conversation_id=p_conversation_id and m.user_id=auth.uid());
$$;
revoke all on function public.ft_is_conversation_member(uuid) from public, anon;
grant execute on function public.ft_is_conversation_member(uuid) to authenticated;
drop policy if exists ft_conversations_member_select on public.ft_conversations;
create policy ft_conversations_member_select on public.ft_conversations for select to authenticated using (public.ft_is_conversation_member(id));
drop policy if exists ft_members_same_conversation_select on public.ft_conversation_members;
create policy ft_members_same_conversation_select on public.ft_conversation_members for select to authenticated using (user_id=auth.uid() or public.ft_is_conversation_member(conversation_id));
drop policy if exists ft_messages_member_select on public.ft_messages;
create policy ft_messages_member_select on public.ft_messages for select to authenticated using (public.ft_is_conversation_member(conversation_id));
drop policy if exists ft_messages_member_insert on public.ft_messages;
create policy ft_messages_member_insert on public.ft_messages for insert to authenticated with check (sender_id=auth.uid() and public.ft_is_conversation_member(conversation_id));
grant select on public.ft_conversations, public.ft_conversation_members, public.ft_messages to authenticated;
grant insert on public.ft_messages to authenticated;
grant usage, select on sequence public.ft_messages_id_seq to authenticated;
create or replace function public.ft_create_conversation(p_title text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_user uuid:=auth.uid(); v_title text:=trim(coalesce(p_title,'')); v_invite text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if char_length(v_title)<1 or char_length(v_title)>48 then raise exception 'Название должно содержать от 1 до 48 символов'; end if;
 v_invite:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 insert into public.ft_conversations(title,invite_code,created_by) values(v_title,v_invite,v_user) returning id into v_id;
 insert into public.ft_conversation_members(conversation_id,user_id,role) values(v_id,v_user,'owner');
 return v_id;
end;
$$;
create or replace function public.ft_join_conversation(p_invite_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_code text:=upper(trim(coalesce(p_invite_code,'')));
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if char_length(v_code)<10 or char_length(v_code)>32 then raise exception 'Неверный код приглашения'; end if;
 select c.id into v_id from public.ft_conversations c where c.invite_code=v_code;
 if v_id is null then raise exception 'Беседа с таким кодом не найдена'; end if;
 insert into public.ft_conversation_members(conversation_id,user_id,role) values(v_id,v_user,'member') on conflict(conversation_id,user_id) do nothing;
 return v_id;
end;
$$;
revoke all on function public.ft_create_conversation(text) from public, anon;
revoke all on function public.ft_join_conversation(text) from public, anon;
grant execute on function public.ft_create_conversation(text) to authenticated;
grant execute on function public.ft_join_conversation(text) to authenticated;
do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ft_messages') then
  alter publication supabase_realtime add table public.ft_messages;
 end if;
exception when insufficient_privilege then
 raise notice 'Enable ft_messages in Database -> Publications manually.';
end;
$$;
