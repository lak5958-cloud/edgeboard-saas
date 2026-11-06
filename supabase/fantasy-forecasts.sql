create table if not exists public.fantasy_forecasts (
 user_id uuid not null references auth.users(id) on delete cascade,
 forecast_key text not null check (forecast_key ~ '^[0-9a-f]{64}$'),
 captured_at timestamptz not null,
 forecast jsonb not null,
 primary key (user_id, forecast_key)
);
alter table public.fantasy_forecasts enable row level security;
revoke all on public.fantasy_forecasts from public, anon, authenticated;
grant select, insert on public.fantasy_forecasts to service_role;
create index if not exists fantasy_forecasts_user_capture
 on public.fantasy_forecasts(user_id, captured_at desc);
