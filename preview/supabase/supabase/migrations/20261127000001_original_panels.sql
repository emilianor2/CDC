create table public.club_preview_state (
  id text primary key check (id = 'demo'),
  revision integer not null default 0 check (revision >= 0),
  document jsonb not null check (jsonb_typeof(document) = 'object')
);

alter table public.club_preview_state enable row level security;
revoke all on public.club_preview_state from public, anon, authenticated;
grant select, insert, update on public.club_preview_state to service_role;
