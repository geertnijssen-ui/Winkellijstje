-- Winkellijstje: volledig schema
-- Uitvoeren in Supabase: SQL Editor > New query > plak dit bestand > Run.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text not null default '#2f855a',
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.stores (household_id);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  household_id uuid references public.households on delete set null,
  display_name text not null default '',
  -- "winkelmodus": in welke winkel staat deze persoon nu (voor meldingen)
  shopping_store_id uuid references public.stores on delete set null,
  shopping_since timestamptz,
  created_at timestamptz not null default now()
);
create index on public.profiles (household_id);

-- Afdelingen binnen een winkel (groenten, zuivel, diepvries ...), met eigen volgorde
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  store_id uuid not null references public.stores on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.sections (store_id);

-- Catalogus van alles wat jullie ooit kochten (voor autocomplete en het onthouden van de winkel)
create table public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name text not null check (length(trim(name)) > 0),
  name_key text not null,
  favorite boolean not null default false,
  use_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, name_key)
);

-- Product -> winkel(s). Leeg = "Algemeen". Een product kan bij meerdere winkels horen.
create table public.product_stores (
  household_id uuid not null references public.households on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  store_id uuid not null references public.stores on delete cascade,
  section_id uuid references public.sections on delete set null,
  primary key (product_id, store_id)
);
create index on public.product_stores (household_id);
create index on public.product_stores (store_id);

-- De eigenlijke lijst. Afgevinkte items blijven bewaard als geschiedenis.
create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  quantity numeric,
  unit text,
  note text,
  source text not null default 'app' check (source in ('app', 'siri', 'keep', 'favorites')),
  added_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  checked_at timestamptz,
  checked_by uuid references public.profiles on delete set null,
  checked_store_id uuid references public.stores on delete set null
);
create index on public.items (household_id, checked_at);
-- Maximaal één open regel per product: dubbels worden samengevoegd
create unique index items_one_open_per_product on public.items (product_id) where checked_at is null;

-- Favorietensets, bv. "Weekboodschappen"
create table public.staple_sets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.staple_set_items (
  household_id uuid not null references public.households on delete cascade,
  set_id uuid not null references public.staple_sets on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  quantity numeric,
  unit text,
  primary key (set_id, product_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Sleutels voor Siri-snelkoppelingen en het Google Keep-script
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- Zorgt dat een offline wijziging die twee keer binnenkomt maar één keer telt
create table private.processed_ops (
  id uuid primary key,
  created_at timestamptz not null default now()
);

-- Instellingen voor de push-webhook (zie docs/SETUP.md)
create table private.settings (
  key text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------

create or replace function public.my_household()
returns uuid language sql stable security definer set search_path = '' as $$
  select household_id from public.profiles where id = auth.uid()
$$;

create or replace function public.name_key(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(p), '\s+', ' ', 'g'))
$$;

-- Profiel aanmaken bij registratie
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Huishouden
-- ---------------------------------------------------------------------------

create or replace function public.create_household(p_name text)
returns public.households language plpgsql security definer set search_path = '' as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if (select household_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Je zit al in een huishouden';
  end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Ons huishouden')) returning * into h;
  update public.profiles set household_id = h.id where id = auth.uid();
  return h;
end $$;

create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = '' as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'Onbekende uitnodigingscode'; end if;
  update public.profiles set household_id = h.id where id = auth.uid();
  return h;
end $$;

-- ---------------------------------------------------------------------------
-- Item toevoegen (met samenvoegen van dubbels)
-- ---------------------------------------------------------------------------

-- Interne versie: ook gebruikt door de Siri/Keep-API (met service role)
create or replace function private.add_item(
  p_household uuid,
  p_user uuid,
  p_name text,
  p_quantity numeric default null,
  p_unit text default null,
  p_note text default null,
  p_source text default 'app',
  p_op_id uuid default null,
  p_product_id uuid default null
) returns public.items language plpgsql security definer set search_path = '' as $$
declare
  v_key text := public.name_key(p_name);
  v_product uuid;
  v_item public.items;
  v_unit text := nullif(lower(trim(coalesce(p_unit, ''))), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_inserted boolean;
begin
  if v_key = '' then raise exception 'Lege naam'; end if;

  -- Idempotent: dezelfde offline-operatie nog eens? Dan niets doen.
  if p_op_id is not null then
    insert into private.processed_ops (id) values (p_op_id) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if not v_inserted then
      select i.* into v_item from public.items i
        join public.products p on p.id = i.product_id
        where p.household_id = p_household and p.name_key = v_key
        order by i.checked_at nulls first, i.created_at desc limit 1;
      return v_item;
    end if;
  end if;

  insert into public.products (id, household_id, name, name_key, use_count, last_used_at)
  values (coalesce(p_product_id, gen_random_uuid()), p_household, trim(p_name), v_key, 1, now())
  on conflict (household_id, name_key)
    do update set use_count = public.products.use_count + 1, last_used_at = now()
  returning id into v_product;

  select * into v_item from public.items
    where product_id = v_product and checked_at is null
    for update;

  if v_item.id is null then
    insert into public.items (id, household_id, product_id, quantity, unit, note, source, added_by)
    values (coalesce(p_op_id, gen_random_uuid()), p_household, v_product, p_quantity, v_unit, v_note, p_source, p_user)
    returning * into v_item;
  else
    if coalesce(v_item.unit, '') = coalesce(v_unit, '') then
      update public.items set quantity = coalesce(quantity, 1) + coalesce(p_quantity, 1) where id = v_item.id;
    else
      -- andere eenheid (bv. 500 g + 1 kg): niet optellen, wel noteren
      v_note := concat_ws(' ', '+', p_quantity::text, v_unit) || coalesce(', ' || v_note, '');
    end if;
    if v_note is not null and position(lower(v_note) in lower(coalesce(v_item.note, ''))) = 0 then
      update public.items set note = concat_ws(', ', nullif(note, ''), v_note) where id = v_item.id;
    end if;
    update public.items set updated_at = now() where id = v_item.id returning * into v_item;
  end if;

  return v_item;
end $$;

revoke all on function private.add_item from public, anon, authenticated;

-- Publieke versie voor de app
create or replace function public.add_item(
  p_name text,
  p_quantity numeric default null,
  p_unit text default null,
  p_note text default null,
  p_op_id uuid default null,
  p_product_id uuid default null,
  p_source text default 'app'
) returns public.items language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.my_household();
begin
  if v_household is null then raise exception 'Geen huishouden'; end if;
  return private.add_item(v_household, auth.uid(), p_name, p_quantity, p_unit, p_note,
    case when p_source in ('app', 'favorites') then p_source else 'app' end, p_op_id, p_product_id);
end $$;

-- Wrapper zodat de server (service role) de interne functie via RPC kan aanroepen
create or replace function public.api_add_item(
  p_household uuid, p_user uuid, p_name text,
  p_quantity numeric default null, p_unit text default null, p_note text default null,
  p_source text default 'siri'
) returns public.items language sql security definer set search_path = '' as $$
  select * from private.add_item(p_household, p_user, p_name, p_quantity, p_unit, p_note, p_source)
$$;
revoke all on function public.api_add_item from public, anon, authenticated;
grant execute on function public.api_add_item to service_role;

-- Een hele favorietenset in één keer op de lijst zetten
create or replace function public.add_staple_set(p_set_id uuid, p_op_id uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := public.my_household();
  r record;
  n int := 0;
  v_inserted boolean;
begin
  if p_op_id is not null then
    insert into private.processed_ops (id) values (p_op_id) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if not v_inserted then return 0; end if;
  end if;
  for r in
    select p.name, si.quantity, si.unit from public.staple_set_items si
    join public.products p on p.id = si.product_id
    where si.set_id = p_set_id and si.household_id = v_household
  loop
    -- niet dubbel optellen als het al op de lijst staat
    if not exists (
      select 1 from public.items i join public.products p2 on p2.id = i.product_id
      where p2.household_id = v_household and p2.name_key = public.name_key(r.name) and i.checked_at is null
    ) then
      perform private.add_item(v_household, auth.uid(), r.name, r.quantity, r.unit, null, 'favorites');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Winkels van een product in één keer instellen (het "onthouden")
create or replace function public.set_product_stores(p_product_id uuid, p_store_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.my_household();
begin
  if not exists (select 1 from public.products where id = p_product_id and household_id = v_household) then
    raise exception 'Onbekend product';
  end if;
  delete from public.product_stores
    where product_id = p_product_id and not (store_id = any(coalesce(p_store_ids, '{}')));
  insert into public.product_stores (household_id, product_id, store_id)
    select v_household, p_product_id, s.id from public.stores s
    where s.id = any(coalesce(p_store_ids, '{}')) and s.household_id = v_household
  on conflict do nothing;
end $$;

-- API-sleutel aanmaken; de sleutel zelf wordt alleen nu getoond
create or replace function public.create_api_token(p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := public.my_household();
  v_token text := 'wl_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if v_household is null then raise exception 'Geen huishouden'; end if;
  insert into public.api_tokens (household_id, user_id, name, token_hash)
  values (v_household, auth.uid(), coalesce(nullif(trim(p_name), ''), 'Sleutel'),
          encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end $$;

-- ---------------------------------------------------------------------------
-- Push-melding als er iets wordt toegevoegd (via pg_net naar de app)
-- ---------------------------------------------------------------------------

create or replace function private.notify_item_added()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.settings where key = 'webhook_url';
  select value into v_secret from private.settings where key = 'webhook_secret';
  if v_url is null then return new; end if;
  -- Alleen sturen als er iemand anders in winkelmodus staat
  if exists (
    select 1 from public.profiles
    where household_id = new.household_id
      and shopping_store_id is not null
      and shopping_since > now() - interval '3 hours'
      and id is distinct from new.added_by
  ) then
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('item_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
    );
  end if;
  return new;
exception when others then
  return new; -- een melding mag het toevoegen nooit blokkeren
end $$;

create trigger items_notify_added
  after insert on public.items
  for each row execute function private.notify_item_added();

create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger items_touch before update on public.items
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: je ziet alleen de gegevens van je eigen huishouden
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.sections enable row level security;
alter table public.products enable row level security;
alter table public.product_stores enable row level security;
alter table public.items enable row level security;
alter table public.staple_sets enable row level security;
alter table public.staple_set_items enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.api_tokens enable row level security;

create policy "eigen huishouden lezen" on public.households for select using (id = public.my_household());
create policy "eigen huishouden wijzigen" on public.households for update using (id = public.my_household());

create policy "profielen in huishouden" on public.profiles for select
  using (id = auth.uid() or household_id = public.my_household());
create policy "eigen profiel wijzigen" on public.profiles for update using (id = auth.uid());
-- huishouden wisselen kan alleen via create_household/join_household
revoke update on public.profiles from authenticated, anon;
grant update (display_name, shopping_store_id, shopping_since) on public.profiles to authenticated;

do $$
declare t text;
begin
  foreach t in array array['stores', 'sections', 'products', 'product_stores', 'items', 'staple_sets', 'staple_set_items']
  loop
    execute format(
      'create policy "huishouden" on public.%I for all using (household_id = public.my_household()) with check (household_id = public.my_household())', t);
  end loop;
end $$;

create policy "eigen push" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "sleutels lezen" on public.api_tokens for select using (household_id = public.my_household());
create policy "sleutels verwijderen" on public.api_tokens for delete using (household_id = public.my_household());
revoke insert, update on public.api_tokens from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Realtime: wijzigingen meteen naar beide telefoons
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.items, public.products, public.product_stores, public.stores,
  public.sections, public.staple_sets, public.staple_set_items, public.profiles;
