-- Allow AES-GCM ciphertext (base64url expands UTF-8 text).
-- Run in Supabase Dashboard -> SQL Editor after the existing migrations.
alter table public.ft_messages
  drop constraint if exists ft_messages_content_check;
alter table public.ft_messages
  add constraint ft_messages_content_check
  check (char_length(trim(content)) between 1 and 30000);
