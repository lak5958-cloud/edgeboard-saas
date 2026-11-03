-- Adds a server-granted free Pro entitlement; does not grant client table access.
alter table public.entitlements drop constraint if exists entitlements_kind_check;
alter table public.entitlements add constraint entitlements_kind_check
 check(kind in ('subscription','grader','owner','complimentary'));
