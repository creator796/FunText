-- FunText group management. Run after 202610130001_funtext_chat.sql.
-- Idempotent function definitions; no table changes required.

create or replace function public.ft_rename_conversation(
  p_conversation_id uuid,
  p_title text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if char_length(v_title) < 1 or char_length(v_title) > 48 then
    raise exception 'Название должно содержать от 1 до 48 символов';
  end if;
  if not exists (
    select 1 from public.ft_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = v_user and m.role = 'owner'
  ) then
    raise exception 'Только владелец может менять название беседы';
  end if;
  update public.ft_conversations
     set title = v_title
   where id = p_conversation_id;
  if not found then raise exception 'Беседа не найдена'; end if;
end;
$$;

create or replace function public.ft_kick_member(
  p_conversation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_user_id = v_user then raise exception 'Нельзя исключить самого себя. Используй выход из беседы'; end if;
  if not exists (
    select 1 from public.ft_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = v_user and m.role = 'owner'
  ) then
    raise exception 'Только владелец может исключать участников';
  end if;
  delete from public.ft_conversation_members
   where conversation_id = p_conversation_id
     and user_id = p_user_id
     and role <> 'owner';
  if not found then raise exception 'Участник не найден или это владелец'; end if;
end;
$$;

create or replace function public.ft_rotate_invite_code(
  p_conversation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.ft_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = v_user and m.role = 'owner'
  ) then
    raise exception 'Только владелец может обновить код приглашения';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
  update public.ft_conversations
     set invite_code = v_code
   where id = p_conversation_id;
  if not found then raise exception 'Беседа не найдена'; end if;
  return v_code;
end;
$$;

create or replace function public.ft_leave_conversation(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1 from public.ft_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = v_user and m.role = 'owner'
  ) then
    raise exception 'Владелец не может выйти без передачи прав. Удали беседу или передай владение позже';
  end if;
  delete from public.ft_conversation_members
   where conversation_id = p_conversation_id and user_id = v_user;
  if not found then raise exception 'Ты уже не состоишь в этой беседе'; end if;
end;
$$;

create or replace function public.ft_delete_conversation(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.ft_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = v_user and m.role = 'owner'
  ) then
    raise exception 'Только владелец может удалить беседу';
  end if;
  delete from public.ft_conversations where id = p_conversation_id;
  if not found then raise exception 'Беседа не найдена'; end if;
end;
$$;

revoke all on function public.ft_rename_conversation(uuid,text) from public, anon;
revoke all on function public.ft_kick_member(uuid,uuid) from public, anon;
revoke all on function public.ft_rotate_invite_code(uuid) from public, anon;
revoke all on function public.ft_leave_conversation(uuid) from public, anon;
revoke all on function public.ft_delete_conversation(uuid) from public, anon;

grant execute on function public.ft_rename_conversation(uuid,text) to authenticated;
grant execute on function public.ft_kick_member(uuid,uuid) to authenticated;
grant execute on function public.ft_rotate_invite_code(uuid) to authenticated;
grant execute on function public.ft_leave_conversation(uuid) to authenticated;
grant execute on function public.ft_delete_conversation(uuid) to authenticated;
