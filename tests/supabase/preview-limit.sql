-- Run only against a disposable database with the preview migration applied.
begin;
do $$
begin
  if has_function_privilege('anon', 'public.vtv_consume_preview_limit()', 'execute')
     or has_function_privilege('authenticated', 'public.vtv_consume_preview_limit()', 'execute') then
    raise exception 'Browser role can execute preview limiter';
  end if;
  if has_schema_privilege('anon', 'private', 'usage')
     or has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'Browser role can access private schema';
  end if;
  if not has_function_privilege('service_role', 'public.vtv_consume_preview_limit()', 'execute') then
    raise exception 'Trusted role cannot execute preview limiter';
  end if;
end;
$$;
set local role service_role;
do $$
declare
  result integer;
begin
  for counter in 1..30 loop
    select public.vtv_consume_preview_limit() into result;
    if result <> 0 then raise exception 'Premature rate limit'; end if;
  end loop;
  select public.vtv_consume_preview_limit() into result;
  if result <= 0 then raise exception '31st request was not limited'; end if;
end;
$$;
rollback;
