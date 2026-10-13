-- FunText invite-code repair. Run AFTER 202610130001_funtext_chat.sql.
-- Safe to re-run. Normalizes pasted spaces/hyphens and gives clear errors.
create or replace function public.ft_join_conversation(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Сначала дождись подключения анонимной сессии';
  end if;

  if char_length(v_code) < 10 or char_length(v_code) > 32 then
    raise exception 'Неверный формат кода. Нужен код приглашения из окна создания беседы (10–32 символа)';
  end if;

  select c.id
    into v_id
    from public.ft_conversations c
   where upper(c.invite_code) = v_code
   limit 1;

  if v_id is null then
    raise exception 'Беседа с таким кодом не найдена. Проверь код и проект Supabase';
  end if;

  insert into public.ft_conversation_members(conversation_id, user_id, role)
  values (v_id, v_user, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.ft_join_conversation(text) from public, anon;
grant execute on function public.ft_join_conversation(text) to authenticated;

-- Ensure chat data can be delivered over Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'ft_messages'
    ) then
      alter publication supabase_realtime add table public.ft_messages;
    end if;

    if to_regclass('public.ft_attachments') is not null
       and not exists (
         select 1 from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = 'ft_attachments'
       ) then
      alter publication supabase_realtime add table public.ft_attachments;
    end if;
  end if;
exception
  when insufficient_privilege then
    raise notice 'Enable ft_messages and ft_attachments in Supabase Database -> Publications.';
end;
$$;
