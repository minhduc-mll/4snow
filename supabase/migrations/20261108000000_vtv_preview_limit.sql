create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.vtv_preview_rate_limit (
  role_key text primary key,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0)
);
alter table private.vtv_preview_rate_limit enable row level security;
revoke all on private.vtv_preview_rate_limit from public, anon, authenticated;

create function public.vtv_consume_preview_limit()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row private.vtv_preview_rate_limit%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  insert into private.vtv_preview_rate_limit (role_key, window_start, request_count)
  values ('admin', v_now, 1)
  on conflict (role_key) do update
  set window_start = case when private.vtv_preview_rate_limit.window_start <= v_now - interval '1 minute' then v_now else private.vtv_preview_rate_limit.window_start end,
      request_count = case when private.vtv_preview_rate_limit.window_start <= v_now - interval '1 minute' then 1 else private.vtv_preview_rate_limit.request_count + 1 end
  returning * into current_row;
  if current_row.request_count <= 30 then return 0; end if;
  return greatest(1, ceil(extract(epoch from current_row.window_start + interval '1 minute' - v_now))::integer);
end;
$$;
revoke all on function public.vtv_consume_preview_limit() from public, anon, authenticated;
grant execute on function public.vtv_consume_preview_limit() to service_role;
