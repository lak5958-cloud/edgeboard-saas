-- Server-only refresh leases. Run in the project SQL editor once.
create table if not exists public.refresh_jobs (
 id text primary key check (id='main'), token uuid, lease_until timestamptz not null default '-infinity',
 started_at timestamptz, last_result jsonb not null default '{}'::jsonb
);
alter table public.refresh_jobs enable row level security;
revoke all on public.refresh_jobs from anon, authenticated;
grant select,insert,update on public.refresh_jobs to service_role;
create or replace function public.acquire_refresh(lease_token uuid) returns boolean
language plpgsql security invoker set search_path=public as $$
declare acquired boolean;
begin
 insert into public.refresh_jobs(id,token,lease_until,started_at) values('main',lease_token,now()+interval '5 minutes',now())
 on conflict(id) do update set token=excluded.token,lease_until=excluded.lease_until,started_at=excluded.started_at where refresh_jobs.lease_until<now()
 returning true into acquired;
 return coalesce(acquired,false);
end $$;
create or replace function public.finish_refresh(lease_token uuid,job_result jsonb) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 update public.refresh_jobs set lease_until='-infinity',last_result=job_result where id='main' and token=lease_token;
 return found;
end $$;
revoke all on function public.acquire_refresh(uuid),public.finish_refresh(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.acquire_refresh(uuid),public.finish_refresh(uuid,jsonb) to service_role;
-- The scheduler is installed separately after CRON_SECRET is stored in Vault.
-- Never paste the secret into tracked SQL. See docs/AUTOMATIC-DATA.md.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function public.queue_refresh(bearer_token text default null) returns bigint
language plpgsql security invoker set search_path='' as $$
declare request_id bigint;
begin
 if bearer_token is null then
  select decrypted_secret into bearer_token from vault.decrypted_secrets where name='edgeboard_refresh_token';
 end if;
 if bearer_token is null or length(bearer_token)<32 then raise exception 'Refresh credential is not configured'; end if;
 select net.http_get(url:='https://edgeboard-saas.vercel.app/api/internal/refresh',headers:=jsonb_build_object('Authorization','Bearer '||bearer_token),timeout_milliseconds:=240000) into request_id;
 return request_id;
end $$;
revoke all on function public.queue_refresh(text) from public,anon,authenticated;
grant execute on function public.queue_refresh(text) to service_role;
grant usage on schema net to service_role;
grant execute on function net.http_get(text,jsonb,jsonb,integer) to service_role;
-- Once the worker is deployed and Vault is configured, enable the schedule:
-- select cron.schedule('edgeboard-refresh','*/10 * * * *','select public.queue_refresh();');
