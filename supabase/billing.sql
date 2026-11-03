-- Private webhook audit and owner-review queue. No card details or raw webhook bodies.
create table if not exists public.billing_events (
 id text primary key,
 type text not null,
 livemode boolean not null,
 created_at timestamptz not null,
 object_id text,
 subscription_ids text[] not null default '{}',
 review_required boolean not null default false,
 result text not null
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from public,anon,authenticated;
grant select,insert,update on public.billing_events to service_role;
