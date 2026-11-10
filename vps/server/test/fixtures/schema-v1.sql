-- =====================================================================
--  كليب كات / ClipKat — مخطط قاعدة بيانات PostgreSQL (النسخة الذاتية)
--  يُطبَّق تلقائياً عند أول تشغيل، ويُعاد تطبيقه بأمان عند كل إقلاع (idempotent).
--  لا يحذف أي بيانات.
-- =====================================================================

create table if not exists plans (
  id text primary key,
  days int not null check (days > 0),
  price numeric(10,3) not null check (price >= 0),
  max_products int,                       -- null = غير محدود
  custom_banner boolean not null default false,
  featured boolean not null default false,
  verified boolean not null default false
);
-- بذور خطط التأجير (بالدينار الكويتي). عدّل الأسعار هنا ثم أعد تشغيل التطبيق.
insert into plans (id, days, price, max_products, custom_banner, featured, verified) values
  ('weekly', 7, 3.000, 10, false, false, false),
  ('monthly', 30, 9.000, 50, true, false, false),
  ('yearly', 365, 90.000, null, true, true, true)
on conflict (id) do update set days = excluded.days, price = excluded.price, max_products = excluded.max_products,
  custom_banner = excluded.custom_banner, featured = excluded.featured, verified = excluded.verified;

create table if not exists app_settings (
  id int primary key default 1 check (id = 1),
  store_slots int not null default 50,
  featured_slots int not null default 6
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  token_version int not null default 0,          -- رفعه يُبطل كل الجلسات
  username text not null unique check (username ~ '^[a-z0-9._]{3,24}$'),
  name text not null default '' check (char_length(name) <= 40),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_url text,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_email_uidx on profiles (lower(email));

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  video_path text not null,
  video_url text not null,
  poster_url text,
  caption text not null default '' check (char_length(caption) <= 300),
  hashtags text[] not null default '{}',
  sound text check (char_length(sound) <= 80),
  shares_count int not null default 0,
  views_count int not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists videos_created_idx on videos (created_at desc);
create index if not exists videos_user_idx on videos (user_id, created_at desc);
create index if not exists videos_hashtags_idx on videos using gin (hashtags);

create table if not exists likes (
  user_id uuid not null references profiles(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists likes_video_idx on likes (video_id);

create table if not exists saves (
  user_id uuid not null references profiles(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists saves_video_idx on saves (video_id);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists comments_video_idx on comments (video_id, created_at desc);

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on follows (followee_id);

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  category text not null default 'other' check (category in ('perfume','coffee','fashion','art','digital','food','beauty','other')),
  description text not null default '' check (char_length(description) <= 200),
  contact_url text check (contact_url is null or contact_url = '' or contact_url ~* '^https?://'),
  logo_url text,
  banner_url text,
  plan_id text not null references plans(id),
  featured boolean not null default false,
  verified boolean not null default false,
  expires_at timestamptz,                         -- null = لم يُفعَّل بعد
  created_at timestamptz not null default now()
);
create index if not exists stores_active_idx on stores (expires_at);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  price numeric(10,3) not null check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  image_url text,
  description text not null default '' check (char_length(description) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists products_store_idx on products (store_id);

create table if not exists video_products (
  video_id uuid not null references videos(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (video_id, product_id)
);
create index if not exists video_products_product_idx on video_products (product_id);

create table if not exists rentals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  plan_id text not null references plans(id),
  amount numeric(10,3) not null default 0,
  method text check (method in ('knet','card','applepay')),
  status text not null default 'pending' check (status in ('pending','active','cancelled','failed')),
  gateway text,
  gateway_ref text,
  start_at timestamptz,
  end_at timestamptz,
  activated_at timestamptz,
  activated_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists rentals_store_idx on rentals (store_id, created_at desc);
create index if not exists rentals_status_idx on rentals (status);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('like','comment','follow','system')),
  from_id uuid references profiles(id) on delete cascade,
  video_id uuid references videos(id) on delete cascade,
  text text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  video_id uuid references videos(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now()
);

create or replace view trending_tags as
  select tag, count(*)::int as count
  from videos v, unnest(v.hashtags) as tag
  where not v.is_hidden
  group by tag order by count(*) desc, tag;
