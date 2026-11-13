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
alter table notifications add constraint notifications_type_check check (type in ('like','comment','follow','system','follow_request','follow_accept','reply','remix','live','call'));

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
alter table notifications add constraint notifications_type_check check (type in ('like','comment','follow','system','follow_request','follow_accept','reply','remix','live','call'));

-- =====================================================================
--  الدخول بحساب Google — إضافات فقط
-- =====================================================================
alter table profiles add column if not exists google_sub text;
create unique index if not exists profiles_google_sub_uidx on profiles (google_sub) where google_sub is not null;

-- =====================================================================
--  تجهيز المقاطع لكل المتصفحات (تحويل إلى MP4 H.264) — إضافات فقط
--  processing = قيد التحويل ومخفي عن العامة | reprocess = قيد التحويل لكنه ظاهر (مقاطع قديمة)
--  ready = جاهز | failed = فشل التحويل ويُعرض الأصل
-- =====================================================================
alter table videos add column if not exists media_status text not null default 'ready';
alter table videos add column if not exists media_error text;
alter table videos add column if not exists poster_auto boolean not null default false;
do $$ begin
  alter table videos add constraint videos_media_status_chk check (media_status in ('processing','reprocess','ready','failed'));
exception when duplicate_object then null; end $$;
create index if not exists videos_media_queue_idx on videos (created_at) where media_status in ('processing','reprocess');

-- ---------------- البث المباشر والمكالمات (LiveKit) ----------------
create table if not exists lives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  status text not null default 'live' check (status in ('live','ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references profiles(id) on delete set null,
  end_reason text,
  peak_viewers int not null default 0,
  hearts_count int not null default 0,
  saved_video_id uuid references videos(id) on delete set null
);
create unique index if not exists lives_one_active_uidx on lives (user_id) where status = 'live';
create index if not exists lives_active_idx on lives (started_at desc) where status = 'live';

create table if not exists live_comments (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references lives(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists live_comments_live_idx on live_comments (live_id, created_at desc);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references profiles(id) on delete cascade,
  callee_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'audio' check (kind in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','active','ended','declined','missed','cancelled')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  check (caller_id <> callee_id)
);
create index if not exists calls_callee_idx on calls (callee_id, created_at desc);
create index if not exists calls_caller_idx on calls (caller_id, created_at desc);
create index if not exists calls_open_idx on calls (created_at) where status in ('ringing','active');

-- (أنواع الإشعارات 'live' و'call' أُضيفت إلى notifications_type_check أعلاه — قيد واحد فقط حتى يبقى الترحيل قابلاً للتكرار)

-- =====================================================================
--  العملات والهدايا في البث المباشر (© 2026 وطن النهار)
--  الربح الوحيد للمنصة من هدايا البث. مبيعات المتاجر بين التاجر والمشتري لا تمر هنا ولا عمولة عليها.
--  كل الأرصدة تتغير داخل معاملة واحدة مع سطر في سجل الحركات (coin_ledger). لا أرصدة سالبة.
-- =====================================================================
create table if not exists coin_packages (
  id text primary key,
  coins int not null check (coins > 0),
  bonus int not null default 0 check (bonus >= 0),
  price numeric(10,3) not null check (price > 0),     -- بالدينار الكويتي
  sort int not null default 0,
  active boolean not null default true
);
-- عدّل الباقات والأسعار هنا ثم أعد تشغيل التطبيق
insert into coin_packages (id, coins, bonus, price, sort) values
  ('small', 100, 0, 0.300, 1),
  ('medium', 500, 50, 1.500, 2),
  ('large', 1000, 200, 3.000, 3)
on conflict (id) do update set coins = excluded.coins, bonus = excluded.bonus, price = excluded.price, sort = excluded.sort;

create table if not exists gifts (
  id text primary key check (id ~ '^[a-z0-9_]{2,24}$'),
  name_ar text not null,
  name_en text not null,
  emoji text not null,
  coins int not null check (coins > 0),
  tier int not null default 1 check (tier between 1 and 3),   -- 1 صغيرة، 2 متوسطة، 3 كبيرة (حركة ملء الشاشة)
  sort int not null default 0,
  active boolean not null default true
);
insert into gifts (id, name_ar, name_en, emoji, coins, tier, sort) values
  ('rose', 'وردة', 'Rose', '🌹', 1, 1, 1),
  ('heart', 'قلب', 'Heart', '💖', 5, 1, 2),
  ('coffee', 'فنجان قهوة', 'Coffee', '☕', 10, 1, 3),
  ('palm', 'نخلة', 'Palm', '🌴', 30, 2, 4),
  ('crown', 'تاج', 'Crown', '👑', 99, 2, 5),
  ('falcon', 'صقر', 'Falcon', '🦅', 199, 2, 6),
  ('car', 'سيارة', 'Sports car', '🏎️', 499, 3, 7),
  ('rocket', 'صاروخ', 'Rocket', '🚀', 999, 3, 8)
on conflict (id) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, emoji = excluded.emoji, coins = excluded.coins, tier = excluded.tier, sort = excluded.sort;

create table if not exists wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  coins bigint not null default 0 check (coins >= 0),        -- رصيد العملات للشراء والإهداء
  diamonds bigint not null default 0 check (diamonds >= 0),  -- أرباح صانع المحتوى من الهدايا
  updated_at timestamptz not null default now()
);

create table if not exists coin_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  package_id text not null references coin_packages(id),
  coins int not null check (coins > 0),
  price numeric(10,3) not null check (price >= 0),
  currency text not null default 'KWD',
  provider text not null check (provider in ('demo','myfatoorah','tap')),
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled')),
  provider_ref text,
  idem_key text check (char_length(idem_key) <= 64),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create unique index if not exists coin_purchases_idem_uidx on coin_purchases (user_id, idem_key) where idem_key is not null;
create index if not exists coin_purchases_user_idx on coin_purchases (user_id, created_at desc);

alter table lives add column if not exists gift_coins bigint not null default 0;
alter table lives add column if not exists gift_diamonds bigint not null default 0;

create table if not exists live_gifts (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references lives(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  host_id uuid not null references profiles(id) on delete cascade,
  gift_id text not null references gifts(id),
  qty int not null check (qty between 1 and 99),
  coins int not null check (coins > 0),               -- إجمالي ما دفعه المرسل
  diamonds int not null check (diamonds >= 0),        -- نصيب المضيف
  platform_coins int not null check (platform_coins >= 0),
  client_key text not null check (char_length(client_key) between 8 and 64),   -- يمنع الخصم المزدوج عند إعادة الإرسال
  created_at timestamptz not null default now(),
  check (sender_id <> host_id),
  check (diamonds + platform_coins = coins)
);
create unique index if not exists live_gifts_client_uidx on live_gifts (sender_id, client_key);
create index if not exists live_gifts_live_idx on live_gifts (live_id, created_at desc);
create index if not exists live_gifts_host_idx on live_gifts (host_id, created_at desc);

create table if not exists payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  diamonds bigint not null check (diamonds > 0),
  amount numeric(10,3) not null check (amount >= 0),          -- القيمة التقديرية بالدينار وقت الطلب
  method text not null check (method in ('bank','other')),
  account_name text not null check (char_length(account_name) between 2 and 80),
  account text not null check (char_length(account) between 4 and 60),   -- IBAN أو رقم الحساب
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  demo boolean not null default false,                         -- طُلب أثناء الوضع التجريبي: لا تُحوَّل أموال حقيقية
  admin_note text not null default '' check (char_length(admin_note) <= 300),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists payout_one_pending_uidx on payout_requests (user_id) where status = 'pending';
create index if not exists payout_status_idx on payout_requests (status, created_at desc);

create table if not exists coin_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  currency text not null check (currency in ('coins','diamonds')),
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  kind text not null check (kind in ('purchase','grant','gift_sent','gift_received','payout_hold','payout_refund')),
  ref_id uuid,
  actor_id uuid references profiles(id) on delete set null,
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists coin_ledger_user_idx on coin_ledger (user_id, created_at desc);

-- =====================================================================
--  تنزيل الفيديو + اشتراك «كليب كات بلس» (© 2026 وطن النهار)
--  التنزيل المجاني بشعار كليب كات للجميع (المسجّلين). التنزيل بدون شعار لمشتركي بلس، ولصاحب الفيديو مجاناً.
-- =====================================================================
alter table profiles add column if not exists allow_download boolean not null default true;
alter table videos add column if not exists downloads_count int not null default 0;

create table if not exists plus_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan text not null default 'monthly',
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  method text not null check (method in ('money','coins','admin')),
  provider text not null check (provider in ('demo','myfatoorah','tap','coins','admin')),
  price numeric(10,3) not null default 0 check (price >= 0),
  currency text not null default 'KWD',
  coins int not null default 0 check (coins >= 0),
  status text not null default 'active' check (status in ('pending','active','revoked','failed')),
  provider_ref text,
  idem_key text check (char_length(idem_key) <= 64),
  granted_by uuid references profiles(id) on delete set null,
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create unique index if not exists plus_idem_uidx on plus_subscriptions (user_id, idem_key) where idem_key is not null;
create index if not exists plus_user_idx on plus_subscriptions (user_id, expires_at desc);

create table if not exists video_downloads (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  kind text not null check (kind in ('wm','nowm')),
  via text not null check (via in ('free','owner','plus')),
  created_at timestamptz not null default now()
);
create index if not exists video_downloads_video_idx on video_downloads (video_id, created_at desc);
create index if not exists video_downloads_user_idx on video_downloads (user_id, created_at desc);

-- نوع حركة جديد في سجل العملات: دفع اشتراك بلس بالعملات (قيد واحد قابل لإعادة التطبيق)
alter table coin_ledger drop constraint if exists coin_ledger_kind_check;
alter table coin_ledger add constraint coin_ledger_kind_check check (kind in ('purchase','grant','gift_sent','gift_received','payout_hold','payout_refund','subscription'));

-- استعادة كلمة المرور بالبريد: رمز عشوائي يُخزَّن مُجزّأً (sha256) فقط، صالح 30 دقيقة، لمرة واحدة.
-- kind='google' = رسالة «سجّل الدخول بـ Google» لحساب بلا كلمة مرور (بدون رمز) — تُحسب ضمن حد الطلبات لكل بريد.
create table if not exists password_resets (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'reset' check (kind in ('reset','google')),
  token_hash text unique check (token_hash is null or char_length(token_hash) = 64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (kind = 'google' or token_hash is not null)
);
create index if not exists password_resets_user_idx on password_resets (user_id, created_at desc);

-- ===== رابط دفع يدوي لإيجار المتجر (يضعه المشرف، يراه صاحب المتجر فقط) =====
alter table rentals add column if not exists payment_url text;
alter table rentals add column if not exists payment_note text;
alter table rentals add column if not exists payment_link_sent_at timestamptz;
alter table rentals drop constraint if exists rentals_payment_url_check;
alter table rentals add constraint rentals_payment_url_check check (payment_url is null or (payment_url ~* '^https?://' and char_length(payment_url) <= 300));
alter table rentals drop constraint if exists rentals_payment_note_check;
alter table rentals add constraint rentals_payment_note_check check (payment_note is null or char_length(payment_note) <= 200);
