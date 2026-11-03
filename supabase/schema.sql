-- Run once in Supabase SQL editor. No client can grant itself an entitlement.
create table if not exists public.entitlements (
 user_id uuid references auth.users(id) on delete cascade,
 kind text check(kind in ('subscription','grader','owner','complimentary')) not null,
 expires_at timestamptz, customer_id text, subscription_id text,
 primary key(user_id,kind)
);
alter table public.entitlements drop constraint if exists entitlements_kind_check;
alter table public.entitlements add constraint entitlements_kind_check check(kind in ('subscription','grader','owner','complimentary'));
create unique index if not exists one_site_owner on public.entitlements(kind) where kind='owner';
alter table public.entitlements enable row level security;
revoke all on public.entitlements from public,anon,authenticated;
grant select,insert,update,delete on public.entitlements to service_role;
create table if not exists public.request_budgets (key text primary key, window_start bigint not null, used integer not null);
alter table public.request_budgets enable row level security;
revoke all on public.request_budgets from public,anon,authenticated;
grant select,insert,update,delete on public.request_budgets to service_role;
create or replace function public.consume_budget(budget_key text, max_uses integer, window_seconds integer)
returns boolean language plpgsql security invoker set search_path=public as $$
declare bucket bigint; n integer;
begin
 bucket:=floor(extract(epoch from now())/window_seconds);
 insert into request_budgets(key,window_start,used) values(budget_key,bucket,1)
 on conflict(key) do update set used=case when request_budgets.window_start=excluded.window_start then request_budgets.used+1 else 1 end,window_start=excluded.window_start returning used into n;
 return n<=max_uses;
end;$$;
revoke all on function public.consume_budget(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_budget(text,integer,integer) to service_role;
insert into storage.buckets(id,name,public) values('edgeboard','edgeboard',false) on conflict(id) do nothing;
-- No public storage policies. Import/read snapshots only through the server service role.
