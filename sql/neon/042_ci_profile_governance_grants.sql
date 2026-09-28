-- Keep the isolated CI role able to exercise profile-governance writes.
-- Production does not have this role, so the migration is a no-op there.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mf_pulse_ci_20260908') then
    execute 'GRANT USAGE ON SCHEMA public TO mf_pulse_ci_20260908';
    execute 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profile_change_requests, public.audit_log TO mf_pulse_ci_20260908';
  end if;
end $$;
