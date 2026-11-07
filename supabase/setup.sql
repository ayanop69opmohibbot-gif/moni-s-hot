-- =====================================================================================
--  Moni's Hot  -  database setup for Supabase
--  Run this ONCE:  Supabase dashboard > SQL Editor > New query > paste everything > Run
--  Safe to run again later (it only creates what is missing / refreshes the rules).
-- =====================================================================================

-- ---------- tables ----------
create table if not exists public.categories (
    name        text primary key check (char_length(name) between 2 and 40),
    image       text not null default '',
    created_at  timestamptz not null default now()
);

create table if not exists public.products (
    id           uuid primary key default gen_random_uuid(),
    title        text not null check (char_length(title) between 3 and 80),
    description  text not null check (char_length(description) between 10 and 400),
    category     text not null references public.categories(name) on update cascade on delete restrict,
    price        integer not null check (price between 1 and 1000000),
    image        text not null check (char_length(image) between 1 and 400),
    best_seller  boolean not null default false,
    available    boolean not null default true,
    created_at   timestamptz not null default now()
);
create unique index if not exists products_title_unique on public.products (lower(title));

create table if not exists public.profiles (          -- one row per customer who signs up
    id          uuid primary key references auth.users(id) on delete cascade,
    name        text not null default '',
    email       text not null default '',
    created_at  timestamptz not null default now(),
    last_login  timestamptz
);

create table if not exists public.admins (            -- who may open the admin panel
    user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.orders (
    order_id    text primary key,
    user_id     uuid references auth.users(id) on delete set null,
    user_email  text,
    customer    text not null,
    email       text not null,
    phone       text not null,
    address     text not null,
    city        text not null,
    payment     text not null check (payment in ('cod','card','jazz','easy')),
    total       integer not null check (total >= 0),
    items       jsonb not null,
    status      text not null default 'Order Placed'
                check (status in ('Order Placed','Preparing','Out for Delivery','Delivered','Cancelled')),
    created_at  timestamptz not null default now()
);

create table if not exists public.messages (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    email       text not null,
    subject     text not null default '',
    message     text not null,
    is_read     boolean not null default false,
    created_at  timestamptz not null default now()
);

-- ---------- helper: is the current user the admin? ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- every new sign-up gets a profile row ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, name, email)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 60), coalesce(new.email, ''))
    on conflict (id) do nothing;
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------- placing an order (the SERVER recalculates prices, so nobody can cheat) ----------
create or replace function public.place_order(
    p_customer text, p_email text, p_phone text, p_address text, p_city text, p_payment text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    uid   uuid := auth.uid();
    r     record;
    prod  public.products;
    lines jsonb := '[]'::jsonb;
    total integer := 0;
    oid   text;
    rec   public.orders;
begin
    if uid is null then
        raise exception 'Please log in to place your order' using errcode = 'PT401';
    end if;
    if char_length(trim(coalesce(p_customer, ''))) < 3 then raise exception 'Enter your full name'; end if;
    if coalesce(p_email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Enter a valid email'; end if;
    if coalesce(p_phone, '') !~ '^03[0-9]{2}-?[0-9]{7}$' then raise exception 'Enter a valid phone (03XX-XXXXXXX)'; end if;
    if char_length(trim(coalesce(p_address, ''))) < 10 then raise exception 'Enter your complete address'; end if;
    if char_length(trim(coalesce(p_city, ''))) < 2 then raise exception 'Select a city'; end if;
    if coalesce(p_payment, '') not in ('cod','card','jazz','easy') then raise exception 'Choose a payment method'; end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
        raise exception 'Your cart is empty';
    end if;
    if exists (select 1 from jsonb_array_elements(p_items) it
               where coalesce(it ->> 'qty', '') !~ '^[0-9]{1,3}$' or (it ->> 'qty')::int not between 1 and 10) then
        raise exception 'Invalid quantity';
    end if;

    for r in
        select it ->> 'title' as title, least(10, sum((it ->> 'qty')::int))::int as qty
        from jsonb_array_elements(p_items) it group by it ->> 'title'
    loop
        select * into prod from public.products where title = r.title and available;
        if not found then raise exception '"%" is no longer available', left(coalesce(r.title, ''), 60); end if;
        lines := lines || jsonb_build_object('Image', prod.image, 'title', prod.title, 'peice', prod.price, 'qty', r.qty);
        total := total + prod.price * r.qty;
    end loop;

    oid := 'MH-' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || floor(random() * 1000)::int;

    insert into public.orders (order_id, user_id, user_email, customer, email, phone, address, city, payment, total, items)
    values (oid, uid, (select email from public.profiles where id = uid), left(trim(p_customer), 60), left(trim(p_email), 80),
            trim(p_phone), left(trim(p_address), 250), left(trim(p_city), 40), p_payment, total, lines)
    returning * into rec;

    return jsonb_build_object('orderId', rec.order_id, 'customer', rec.customer, 'email', rec.email, 'phone', rec.phone,
        'address', rec.address, 'city', rec.city, 'payment', rec.payment, 'total', rec.total, 'cart', rec.items,
        'status', rec.status, 'startTime', (extract(epoch from rec.created_at) * 1000)::bigint);
end $$;

create or replace function public.cancel_my_order(p_order_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
    update public.orders set status = 'Cancelled'
    where order_id = p_order_id and user_id = auth.uid() and status <> 'Delivered';
    if not found then raise exception 'This order cannot be cancelled'; end if;
end $$;

create or replace function public.touch_login() returns void
language sql security definer set search_path = public as $$
    update public.profiles set last_login = now() where id = auth.uid();
$$;

-- ---------- who may do what (Row Level Security) ----------
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.profiles   enable row level security;
alter table public.admins     enable row level security;
alter table public.orders     enable row level security;
alter table public.messages   enable row level security;

drop policy if exists categories_read  on public.categories;
drop policy if exists categories_admin on public.categories;
create policy categories_read  on public.categories for select to anon, authenticated using (true);
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_read  on public.products;
drop policy if exists products_admin on public.products;
create policy products_read  on public.products for select to anon, authenticated using (available or public.is_admin());
create policy products_admin on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_admin  on public.profiles;
create policy profiles_read  on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin on public.profiles for delete to authenticated using (public.is_admin());

-- admins: no policy at all = nobody can read the list through the website API
drop policy if exists orders_read  on public.orders;
drop policy if exists orders_admin on public.orders;
drop policy if exists orders_del   on public.orders;
create policy orders_read  on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy orders_admin on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy orders_del   on public.orders for delete to authenticated using (public.is_admin());

drop policy if exists messages_send  on public.messages;
drop policy if exists messages_admin on public.messages;
create policy messages_send on public.messages for insert to anon, authenticated
    with check (char_length(name) between 1 and 60 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
                and char_length(message) between 1 and 1000 and char_length(subject) <= 80 and is_read = false);
create policy messages_admin on public.messages for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- table + function permissions ----------
revoke all on public.categories, public.products, public.profiles, public.admins, public.orders, public.messages from anon, authenticated;
grant select on public.categories, public.products to anon, authenticated;
grant insert, update, delete on public.categories, public.products to authenticated;
grant select, delete on public.profiles to authenticated;
grant select, update, delete on public.orders to authenticated;
grant insert on public.messages to anon, authenticated;
grant select, update, delete on public.messages to authenticated;

revoke execute on function public.is_admin(), public.place_order(text,text,text,text,text,text,jsonb),
    public.cancel_my_order(text), public.touch_login() from public, anon;
grant execute on function public.is_admin(), public.place_order(text,text,text,text,text,text,jsonb),
    public.cancel_my_order(text), public.touch_login() to authenticated;
grant execute on function public.is_admin() to anon;      -- anon simply gets "false"

-- ---------- starting menu (only inserted when the menu is empty) ----------
insert into public.categories (name, image)
select v.name, v.image from (values
    ('beef',    'beef c  image 2.jpeg'),
    ('Chicken', 'for c 1.jpeg'),
    ('kabab',   'kabab c image 3.jpeg')) as v(name, image)
where not exists (select 1 from public.categories);

insert into public.products (title, description, category, price, image, best_seller)
select v.* from (values
    ('Beef Behari Boti',     'Melt in mouth pieces of beef marinated in spices and barbecued to perfection on charcoal grill.',            'beef',    899, 'beef b boti.jpeg',    true),
    ('Chicken Behari Boti',  'Melt in mouth pieces of chicken marinated in spices and barbecued to perfection on charcoal grill.',         'Chicken', 899, 'chicken b boti.jpeg', true),
    ('Chicken Malai Boti',   'Boneless Chicken piece marinated in a creamy based marination, cooked to perfection.',                       'Chicken', 799, 'malai boti.jpeg',     true),
    ('Chicken Cheese Kabab', 'Minced chicken kabab with tinch of spices along with oozing cheese, cooked over live charcoals.',            'kabab',   699, 'kabab 1.jpeg',        false),
    ('Seekh Kabab (Beef)',   'Minced Beef kebabs marinated in green chilies, onion and coriander, cooked over live charcoals.',            'kabab',   699, 'kabab 2.jpeg',        false)
) as v(title, description, category, price, image, best_seller)
where not exists (select 1 from public.products);

-- ---------- picture storage (bucket for product / category pictures) ----------
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "product images read"         on storage.objects;
drop policy if exists "product images admin write"  on storage.objects;
drop policy if exists "product images admin update" on storage.objects;
drop policy if exists "product images admin delete" on storage.objects;
create policy "product images read"        on storage.objects for select using (bucket_id = 'product-images');
create policy "product images admin write" on storage.objects for insert to authenticated
    with check (bucket_id = 'product-images' and public.is_admin());
create policy "product images admin update" on storage.objects for update to authenticated
    using (bucket_id = 'product-images' and public.is_admin());
create policy "product images admin delete" on storage.objects for delete to authenticated
    using (bucket_id = 'product-images' and public.is_admin());

-- =====================================================================================
--  LAST STEP (after you created your admin user in Authentication > Users):
--  Edit the e-mail below to YOUR admin e-mail and run it as a separate query.
--
--      insert into public.admins (user_id)
--      select id from auth.users where email = 'YOUR-ADMIN-EMAIL@example.com'
--      on conflict do nothing;
-- =====================================================================================
