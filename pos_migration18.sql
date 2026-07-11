drop policy if exists customers_self_read on customers;
create policy customers_self_read on customers
  for select using (profile_id = auth.uid());

drop policy if exists messages_own on messages;

drop policy if exists messages_select_own on messages;
create policy messages_select_own on messages
  for select using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists messages_insert_own on messages;
create policy messages_insert_own on messages
  for insert with check (from_id = auth.uid());

drop policy if exists messages_update_recipient on messages;
create policy messages_update_recipient on messages
  for update using (to_id = auth.uid()) with check (to_id = auth.uid());
