-- ============================================================
--  BRIDGE OR BRICKS — Supabase schema
--
--  Run this once, in the Supabase dashboard:
--    SQL Editor -> New query -> paste -> Run
--
--  The whole game is an append-only event log. This table IS the
--  game state: every device replays the same rows through the same
--  reducer and lands on the same board. That is why it survives a
--  refresh, a closed laptop, or a facilitator swapping devices
--  mid-session — none of which the in-memory relay could do.
-- ============================================================

create table if not exists public.bob_events (
  id            uuid primary key,
  session_code  text        not null,
  seq           integer     not null,
  at            timestamptz not null default now(),
  type          text        not null,
  actor_team_id text,
  actor_role    text,
  visibility    text        not null default 'public',
  group_id      text,
  payload       jsonb       not null default '{}'::jsonb,
  note          text,
  created_at    timestamptz not null default now()
);

-- replay order, and the main query: "everything for this session"
create index if not exists bob_events_session_seq_idx
  on public.bob_events (session_code, seq);

-- ------------------------------------------------------------
--  Realtime: every device gets new rows pushed as they land
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.bob_events;

-- deletes need the old row echoed, or undo cannot be broadcast
alter table public.bob_events replica identity full;

-- ------------------------------------------------------------
--  Access
--
--  Players join by scanning a QR at the table; there are no
--  accounts. So anon may read and write, and the session_code
--  is what separates one table's game from another's.
--
--  Be clear-eyed about what this does and does not protect:
--  anyone who knows a session code can read or change that game.
--  For a facilitated training exercise in one room that is the
--  right trade. It is NOT suitable for anything confidential.
-- ------------------------------------------------------------
alter table public.bob_events enable row level security;

drop policy if exists "read events" on public.bob_events;
create policy "read events"   on public.bob_events for select using (true);

drop policy if exists "append events" on public.bob_events;
create policy "append events" on public.bob_events for insert with check (true);

drop policy if exists "undo events" on public.bob_events;
create policy "undo events"   on public.bob_events for delete using (true);

-- ------------------------------------------------------------
--  Housekeeping: sessions are disposable. Drop anything older
--  than a fortnight so the table does not grow without bound.
-- ------------------------------------------------------------
create or replace function public.bob_prune_old_sessions()
returns void language sql as $$
  delete from public.bob_events where created_at < now() - interval '14 days';
$$;

-- ============================================================
--  ARCHIVE
--
--  Ending a session takes a fresh code rather than deleting rows,
--  so the events survive. This table is the index over them: what
--  each past session was, so a facilitator can find and download
--  a debrief report weeks later without knowing the code by heart.
-- ============================================================

create table if not exists public.bob_sessions (
  session_code text primary key,
  title        text,
  mode         text,
  team_names   text[],
  rounds       integer,
  outcome      text,
  event_count  integer,
  started_at   timestamptz,
  ended_at     timestamptz not null default now()
);

create index if not exists bob_sessions_ended_idx
  on public.bob_sessions (ended_at desc);

alter table public.bob_sessions enable row level security;

drop policy if exists "read sessions" on public.bob_sessions;
create policy "read sessions"  on public.bob_sessions for select using (true);

drop policy if exists "write sessions" on public.bob_sessions;
create policy "write sessions" on public.bob_sessions for insert with check (true);

drop policy if exists "amend sessions" on public.bob_sessions;
create policy "amend sessions" on public.bob_sessions for update using (true);
