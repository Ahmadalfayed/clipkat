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

-- =====================================================================
--  المرحلة 1 (خصوصية/إعدادات/حظر/تبليغ/ردود) — إضافات فقط، آمنة للتثبيتات الحالية
-- =====================================================================
alter table profiles add column if not exists is_private boolean not null default false;
alter table profiles add column if not exists comment_policy text not null default 'everyone';
do $$ begin
  alter table profiles add constraint profiles_comment_policy_chk check (comment_policy in ('everyone','followers','nobody'));
exception when duplicate_object then null; end $$;

create table if not exists follow_requests (
  requester_id uuid not null references profiles(id) on delete cascade,
  target_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
create index if not exists follow_requests_target_idx on follow_requests (target_id, created_at desc);

create table if not exists blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on blocks (blocked_id);

alter table comments add column if not exists parent_id uuid references comments(id) on delete cascade;
create index if not exists comments_parent_idx on comments (parent_id);

alter table reports add column if not exists target_type text not null default 'video';
alter table reports add column if not exists target_user_id uuid references profiles(id) on delete cascade;
alter table reports add column if not exists comment_id uuid references comments(id) on delete set null;
alter table reports add column if not exists details text not null default '';
alter table reports add column if not exists status text not null default 'open';
alter table reports add column if not exists action text;
alter table reports add column if not exists reviewed_by uuid references profiles(id) on delete set null;
alter table reports add column if not exists reviewed_at timestamptz;
do $$ begin
  alter table reports add constraint reports_target_type_chk check (target_type in ('video','user','comment'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table reports add constraint reports_status_chk check (status in ('open','dismissed','actioned'));
exception when duplicate_object then null; end $$;
create index if not exists reports_status_idx on reports (status, created_at desc);

-- توسيع أنواع الإشعارات (إعادة تعريف القيد فقط — لا تُحذف بيانات)
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in ('like','comment','follow','system','follow_request','follow_accept','reply'));

create or replace view trending_tags as
  select tag, count(*)::int as count
  from videos v, unnest(v.hashtags) as tag
  where not v.is_hidden
    and exists (select 1 from profiles tp where tp.id = v.user_id and not tp.is_private and not tp.is_banned)
  group by tag order by count(*) desc, tag;

-- =====================================================================
--  سياسة تأجير المتاجر: تسجيل قبول التاجر لإصدار محدد (إضافة فقط)
-- =====================================================================
create table if not exists policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  policy text not null check (policy in ('store-rental')),
  version text not null check (char_length(version) between 1 and 60),
  store_id uuid references stores(id) on delete set null,
  rental_id uuid references rentals(id) on delete set null,
  accepted_at timestamptz not null default now()
);
create index if not exists policy_acceptances_user_idx on policy_acceptances (user_id, accepted_at desc);
alter table rentals add column if not exists policy_version text;

-- =====================================================================
--  المرحلة 2 (الاستوديو ومكتبة الأصوات) — إضافات فقط، آمنة للتثبيتات الحالية
-- =====================================================================
create table if not exists sounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  audio_url text not null,
  duration_ms int not null check (duration_ms > 0),
  source_video_id uuid references videos(id) on delete set null,
  uses_count int not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sounds_created_idx on sounds (created_at desc);
create index if not exists sounds_user_idx on sounds (user_id, created_at desc);
create unique index if not exists sounds_source_video_uidx on sounds (source_video_id) where source_video_id is not null;

alter table videos add column if not exists sound_id uuid references sounds(id) on delete set null;
create index if not exists videos_sound_idx on videos (sound_id) where sound_id is not null;

alter table reports add column if not exists sound_id uuid references sounds(id) on delete set null;
alter table reports drop constraint if exists reports_target_type_chk;
alter table reports add constraint reports_target_type_chk check (target_type in ('video','user','comment','sound'));

-- =====================================================================
--  المرحلة 3 (الرسائل، فيد أذكى، المسودات والجدولة) — إضافات فقط
-- =====================================================================
alter table profiles add column if not exists message_policy text not null default 'everyone';
do $$ begin
  alter table profiles add constraint profiles_message_policy_chk check (message_policy in ('everyone','followers','mutual','nobody'));
exception when duplicate_object then null; end $$;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  last_at timestamptz not null default now(),
  last_preview text not null default '',
  created_at timestamptz not null default now(),
  check (user_a < user_b)
);
create unique index if not exists conversations_pair_uidx on conversations (user_a, user_b);
create index if not exists conversations_last_idx on conversations (last_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  type text not null default 'text' check (type in ('text','clip')),
  text text not null default '' check (char_length(text) <= 500),
  video_id uuid references videos(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists messages_conv_idx on messages (conversation_id, created_at desc);

create table if not exists conversation_reads (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- أحداث المشاهدة: حد أدنى من البيانات (بدون مدة تفصيلية أو مشاركة مع الآخرين)
create table if not exists watch_events (
  user_id uuid not null references profiles(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  watched_at timestamptz not null default now(),
  completed boolean not null default false,
  primary key (user_id, video_id)
);
create index if not exists watch_events_video_idx on watch_events (video_id);

alter table videos add column if not exists status text not null default 'published';
alter table videos add column if not exists scheduled_at timestamptz;
do $$ begin
  alter table videos add constraint videos_status_chk check (status in ('draft','scheduled','published'));
exception when duplicate_object then null; end $$;
create index if not exists videos_scheduled_idx on videos (scheduled_at) where status = 'scheduled';
create index if not exists videos_status_idx on videos (status, created_at desc);

alter table reports add column if not exists message_id uuid references messages(id) on delete set null;
alter table reports drop constraint if exists reports_target_type_chk;
alter table reports add constraint reports_target_type_chk check (target_type in ('video','user','comment','sound','message'));

-- =====================================================================
--  المرحلة 4 (ديويتو وستيتش) — إضافات فقط
-- =====================================================================
alter table profiles add column if not exists allow_duet boolean not null default true;
alter table profiles add column if not exists allow_stitch boolean not null default true;

alter table videos add column if not exists source_clip_id uuid references videos(id) on delete set null;
alter table videos add column if not exists remix_type text;
do $$ begin
  alter table videos add constraint videos_remix_type_chk check (remix_type is null or remix_type in ('duet','stitch'));
exception when duplicate_object then null; end $$;
create index if not exists videos_source_clip_idx on videos (source_clip_id, created_at desc) where source_clip_id is not null;

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in ('like','comment','follow','system','follow_request','follow_accept','reply','remix'));
