-- Chat app schema: users, chat_rooms, chat_room_members, messages
-- users.id is linked 1:1 to auth.users.id (Supabase auth integration).
-- 何度でも安全に再実行できます（先に既存テーブルを削除します）。

-- ============================================================
-- 0. クリーンアップ（再実行しても大丈夫にする）
-- ============================================================
drop table if exists public.messages cascade;
drop table if exists public.chat_room_members cascade;
drop table if exists public.chat_rooms cascade;
drop table if exists public.users cascade;

-- ============================================================
-- 1. テーブルを全部先に作る（依存順）
-- ============================================================
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text,
  type text not null check (type in ('direct', 'group')),
  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_room_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (room_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

-- インデックス
create index chat_room_members_user_id_idx on public.chat_room_members (user_id);
create index messages_room_id_created_at_idx on public.messages (room_id, created_at);

-- コメント
comment on table public.users is 'Chat app user profiles, 1:1 with auth.users.';
comment on table public.chat_rooms is 'Chat rooms, either 1:1 direct chats or group chats.';
comment on table public.chat_room_members is 'Membership of users in chat rooms.';
comment on table public.messages is 'Chat messages posted in a room.';

-- ============================================================
-- 2. RLS を全テーブルで有効化
-- ============================================================
alter table public.users enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.messages enable row level security;

-- ============================================================
-- 3. ポリシー（全テーブル作成後にまとめて設定）
-- ============================================================

-- users
create policy "Users are viewable by authenticated users"
  on public.users for select to authenticated using (true);
create policy "Users can insert their own profile"
  on public.users for insert to authenticated with check (id = (select auth.uid()));
create policy "Users can update their own profile"
  on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- chat_room_members（自己参照を避け、自分の参加行だけ見えるようにする）
create policy "Users can view their own memberships"
  on public.chat_room_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can join a room by adding themselves"
  on public.chat_room_members for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users can leave a room they belong to"
  on public.chat_room_members for delete to authenticated
  using (user_id = (select auth.uid()));

-- chat_rooms
create policy "Members can view their chat rooms"
  on public.chat_rooms for select to authenticated
  using (
    exists (
      select 1 from public.chat_room_members m
      where m.room_id = chat_rooms.id
        and m.user_id = (select auth.uid())
    )
  );
create policy "Authenticated users can create chat rooms"
  on public.chat_rooms for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "Room creator can update the room"
  on public.chat_rooms for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "Room creator can delete the room"
  on public.chat_rooms for delete to authenticated
  using (created_by = (select auth.uid()));

-- messages
create policy "Members can view messages in their rooms"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.chat_room_members m
      where m.room_id = messages.room_id
        and m.user_id = (select auth.uid())
    )
  );
create policy "Members can send messages to their rooms"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.chat_room_members m
      where m.room_id = messages.room_id
        and m.user_id = (select auth.uid())
    )
  );
create policy "Senders can edit or soft-delete their own messages"
  on public.messages for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));
