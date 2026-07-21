-- VOLTEN GYM - Migracion 25: TARJETA DE REGALO
-- Correr en Supabase -> SQL Editor -> New query -> pegar todo -> Run.
-- Se puede correr varias veces sin problema.
--
-- Crea las tarjetas de regalo: se vende una por un monto, queda con un
-- codigo que se le da al cliente, y ese codigo se puede usar para pagar.
-- Si el saldo no alcanza, el resto se paga con otro metodo.

create table if not exists gift_cards (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  branch_id     uuid references branches(id),
  initial_value numeric(10,2) not null check (initial_value > 0),
  balance       numeric(10,2) not null check (balance >= 0),
  active        boolean not null default true,
  sold_by       uuid references profiles(id),
  sold_to       uuid references customers(id),
  buyer_name    text,
  notes         text,
  expires_on    date,
  created_at    timestamptz not null default now()
);

-- Cada vez que se usa una tarjeta queda el rastro de cuanto y en que venta.
create table if not exists gift_card_uses (
  id           uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references gift_cards(id) on delete cascade,
  sale_id      uuid references sales(id),
  amount       numeric(10,2) not null check (amount > 0),
  used_by      uuid references profiles(id),
  branch_id    uuid references branches(id),
  created_at   timestamptz not null default now()
);

create index if not exists gift_cards_code_idx on gift_cards (upper(code));
create index if not exists gift_card_uses_card_idx on gift_card_uses (gift_card_id);

alter table gift_cards     enable row level security;
alter table gift_card_uses enable row level security;

-- Solo el personal las vende, consulta y canjea. Los socios no las tocan.
drop policy if exists "gift_cards_staff_all" on gift_cards;
create policy "gift_cards_staff_all" on gift_cards
  for all using (is_staff()) with check (is_staff());

drop policy if exists "gift_card_uses_staff_all" on gift_card_uses;
create policy "gift_card_uses_staff_all" on gift_card_uses
  for all using (is_staff()) with check (is_staff());

-- Descuenta el saldo de forma segura: bloquea la tarjeta mientras cobra,
-- para que dos cajas no puedan gastar el mismo saldo al mismo tiempo.
-- Devuelve cuanto se alcanzo a usar (0 si el codigo no existe, esta
-- inactivo, vencido, o ya no tiene saldo).
create or replace function redeem_gift_card(p_code text, p_amount numeric, p_sale uuid, p_branch uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card   gift_cards%rowtype;
  v_usable numeric(10,2);
begin
  if not is_staff() then
    raise exception 'Solo el personal puede canjear tarjetas de regalo';
  end if;

  select * into v_card from gift_cards
   where upper(code) = upper(trim(p_code))
   for update;

  if not found then return 0; end if;
  if not v_card.active then return 0; end if;
  if v_card.expires_on is not null and v_card.expires_on < current_date then return 0; end if;

  v_usable := least(v_card.balance, p_amount);
  if v_usable <= 0 then return 0; end if;

  update gift_cards
     set balance = balance - v_usable,
         active  = case when balance - v_usable <= 0 then false else active end
   where id = v_card.id;

  insert into gift_card_uses (gift_card_id, sale_id, amount, used_by, branch_id)
  values (v_card.id, p_sale, v_usable, auth.uid(), p_branch);

  return v_usable;
end;
$$;

grant execute on function redeem_gift_card(text, numeric, uuid, uuid) to authenticated;
