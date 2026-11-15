-- The owner confirmed that no Quiz database or data exists. A pre-existing
-- relation must cause this migration to fail rather than being silently adopted.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  join_code text not null unique,
  status text not null check (status in ('draft', 'lobby', 'active', 'paused', 'completed')),
  current_question_id uuid,
  current_question_started_at timestamptz,
  question_index integer not null default 0,
  total_questions integer not null default 0,
  started_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table private.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id),
  prompt text not null,
  type text not null check (type in ('single_choice', 'multiple_choice', 'true_false')),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  correct_option_ids text[] not null,
  time_limit_seconds integer not null check (time_limit_seconds between 1 and 3600),
  base_points integer not null check (base_points between 1 and 1000000),
  order_index integer not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (session_id, id),
  unique (session_id, order_index)
);

alter table public.quiz_sessions add constraint quiz_current_question_fk
  foreign key (id, current_question_id) references private.quiz_questions(session_id, id);
alter table public.quiz_sessions enable row level security;
alter table private.quiz_questions enable row level security;
revoke all on public.quiz_sessions from public, anon, authenticated;
revoke all on private.quiz_questions from public, anon, authenticated;
create policy quiz_session_read on public.quiz_sessions for select to anon, authenticated using (true);
grant select on public.quiz_sessions to anon, authenticated;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.quiz_sessions;
  end if;
end $$;

-- Only the current active question is player-readable, without its answer key.
create view public.quiz_player_questions as
select q.id, q.session_id, q.prompt, q.type,
       (select jsonb_agg(jsonb_build_object('id', o->>'id', 'label', o->>'label', 'value', o->>'value') order by ord)
        from jsonb_array_elements(q.options) with ordinality as items(o, ord)) as options, q.time_limit_seconds,
       q.base_points, q.order_index, q.created_at, q.updated_at
from private.quiz_questions q join public.quiz_sessions s on s.id = q.session_id
where s.status = 'active' and s.current_question_id = q.id;
revoke all on public.quiz_player_questions from public;
grant select on public.quiz_player_questions to anon, authenticated;

create table private.quiz_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id),
  display_name text not null check (length(display_name) between 1 and 80),
  credential_hash bytea not null unique,
  created_at timestamptz not null default clock_timestamp(),
  credential_expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
  credential_revoked_at timestamptz,
  unique (session_id, id)
);
create table private.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  participant_id uuid not null,
  question_id uuid not null,
  request_id uuid not null,
  selected_option_ids text[] not null,
  question_correct_option_ids text[] not null,
  question_type text not null,
  question_options jsonb not null,
  is_correct boolean not null,
  time_remaining_ms integer not null,
  score integer not null,
  base_points integer not null,
  duration_seconds integer not null,
  started_at timestamptz not null,
  submitted_at timestamptz not null,
  foreign key (session_id, participant_id) references private.quiz_participants(session_id, id),
  foreign key (session_id, question_id) references private.quiz_questions(session_id, id),
  unique (session_id, participant_id, question_id),
  unique (request_id)
);
create table private.quiz_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  count integer not null
);
create table private.quiz_submission_audit (
  submission_id uuid primary key references private.quiz_submissions(id),
  recorded_at timestamptz not null default clock_timestamp(),
  event text not null check (event = 'accepted')
);
alter table private.quiz_participants enable row level security;
alter table private.quiz_submissions enable row level security;
alter table private.quiz_rate_limits enable row level security;
alter table private.quiz_submission_audit enable row level security;
revoke all on private.quiz_participants, private.quiz_submissions, private.quiz_rate_limits, private.quiz_submission_audit from public, anon, authenticated;

create view public.quiz_leaderboard as
select p.id, p.session_id, p.display_name, coalesce(sum(s.score), 0)::bigint as score,
       count(s.id) filter (where s.is_correct)::integer as correct_answers,
       coalesce(sum(s.duration_seconds * 1000 - s.time_remaining_ms), 0)::bigint as response_time_ms,
       p.created_at
from private.quiz_participants p left join private.quiz_submissions s on s.participant_id = p.id
group by p.id;
revoke all on public.quiz_leaderboard from public;
grant select on public.quiz_leaderboard to anon, authenticated;

create function private.quiz_limit(p_bucket text, p_max integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_now timestamptz := clock_timestamp();
begin
  insert into private.quiz_rate_limits values (p_bucket, v_now, 1)
  on conflict (bucket) do update set
    window_started_at = case when private.quiz_rate_limits.window_started_at <= v_now - interval '1 minute' then v_now else private.quiz_rate_limits.window_started_at end,
    count = case when private.quiz_rate_limits.window_started_at <= v_now - interval '1 minute' then 1 else private.quiz_rate_limits.count + 1 end
  returning count into v_count;
  return v_count <= p_max;
end $$;

create function public.quiz_join(p_session_id uuid, p_name text, p_credential text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_session_id is null or p_name is null or length(trim(p_name)) not between 1 and 80
     or p_credential is null or p_credential !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('error','INVALID_INPUT');
  end if;
  perform 1 from public.quiz_sessions where id = p_session_id and status = 'lobby' for share;
  if not found then
    if not private.quiz_limit('join:invalid', 120) then return jsonb_build_object('error','RATE_LIMIT'); end if;
    return jsonb_build_object('error','SESSION_UNAVAILABLE');
  end if;
  if not private.quiz_limit('join:' || p_session_id::text, 120) then return jsonb_build_object('error','RATE_LIMIT'); end if;
  insert into private.quiz_participants(session_id,display_name,credential_hash)
  values (p_session_id,trim(p_name),extensions.digest(p_credential,'sha256')) returning id into v_id;
  return jsonb_build_object('participantId',v_id,'sessionId',p_session_id);
end $$;

create function public.quiz_submit(p_session_id uuid, p_question_id uuid, p_request_id uuid,
  p_selected_option_ids text[], p_credential text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_participant private.quiz_participants%rowtype; v_question private.quiz_questions%rowtype;
  v_session public.quiz_sessions%rowtype; v_existing private.quiz_submissions%rowtype;
  v_result private.quiz_submissions%rowtype; v_now timestamptz; v_remaining integer;
  v_correct boolean; v_score integer;
begin
  if p_credential is null or p_credential !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','UNAUTHORIZED'); end if;
  select * into v_participant from private.quiz_participants where credential_hash = extensions.digest(p_credential,'sha256')
    and session_id = p_session_id and credential_revoked_at is null and credential_expires_at > clock_timestamp() for share;
  if not found then
    if not private.quiz_limit('submit:invalid', 600) then return jsonb_build_object('error','RATE_LIMIT'); end if;
    return jsonb_build_object('error','UNAUTHORIZED');
  end if;
  if not private.quiz_limit('submit:' || v_participant.id::text, 60) then return jsonb_build_object('error','RATE_LIMIT'); end if;
  if p_question_id is null or p_request_id is null or p_selected_option_ids is null
    or cardinality(p_selected_option_ids) not between 1 and 4
    or exists (select 1 from unnest(p_selected_option_ids) x where x is null or length(x) not between 1 and 100)
    or (select count(distinct x) from unnest(p_selected_option_ids) x) <> cardinality(p_selected_option_ids)
  then return jsonb_build_object('error','INVALID_INPUT'); end if;
  perform pg_advisory_xact_lock(hashtextextended('request:' || p_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('participant:' || v_participant.id::text, 0));
  select * into v_existing from private.quiz_submissions where request_id = p_request_id;
  if found then
    if v_existing.participant_id <> v_participant.id or v_existing.session_id <> p_session_id or v_existing.question_id <> p_question_id or v_existing.selected_option_ids <> p_selected_option_ids then
      return jsonb_build_object('error','RETRY_CONFLICT');
    end if;
    return to_jsonb(v_existing) - 'participant_id' - 'question_correct_option_ids' - 'question_type' - 'question_options';
  end if;
  if exists (select 1 from private.quiz_submissions where participant_id = v_participant.id and question_id = p_question_id) then
    return jsonb_build_object('error','ALREADY_SUBMITTED');
  end if;
  select * into v_session from public.quiz_sessions where id = p_session_id for share;
  if not found or v_session.status <> 'active' or v_session.current_question_id is distinct from p_question_id or v_session.current_question_started_at is null then
    return jsonb_build_object('error','QUESTION_INACTIVE');
  end if;
  select * into v_question from private.quiz_questions where id = p_question_id and session_id = p_session_id;
  if not found then return jsonb_build_object('error','QUESTION_INACTIVE'); end if;
  if (v_question.type <> 'multiple_choice' and cardinality(p_selected_option_ids) <> 1)
    or exists (select 1 from unnest(p_selected_option_ids) x where not exists (select 1 from jsonb_array_elements(v_question.options) o where o->>'id' = x)) then
    return jsonb_build_object('error','INVALID_OPTION');
  end if;
  v_now := clock_timestamp();
  if v_now < v_session.current_question_started_at or v_now >= v_session.current_question_started_at + make_interval(secs => v_question.time_limit_seconds) then
    return jsonb_build_object('error','QUESTION_EXPIRED');
  end if;
  v_remaining := greatest(0, floor(extract(epoch from (v_session.current_question_started_at + make_interval(secs => v_question.time_limit_seconds) - v_now)) * 1000)::integer);
  v_correct := p_selected_option_ids @> v_question.correct_option_ids and p_selected_option_ids <@ v_question.correct_option_ids;
  v_score := case when v_correct then round(v_question.base_points * v_remaining::numeric / (v_question.time_limit_seconds * 1000))::integer else 0 end;
  insert into private.quiz_submissions(session_id,participant_id,question_id,request_id,selected_option_ids,question_correct_option_ids,question_type,question_options,is_correct,time_remaining_ms,score,base_points,duration_seconds,started_at,submitted_at)
  values (p_session_id,v_participant.id,p_question_id,p_request_id,p_selected_option_ids,v_question.correct_option_ids,v_question.type,v_question.options,v_correct,v_remaining,v_score,v_question.base_points,v_question.time_limit_seconds,v_session.current_question_started_at,v_now)
  returning * into v_result;
  insert into private.quiz_submission_audit(submission_id, event) values (v_result.id, 'accepted');
  return to_jsonb(v_result) - 'participant_id' - 'question_correct_option_ids' - 'question_type' - 'question_options';
end $$;
revoke all on function private.quiz_limit(text,integer) from public, anon, authenticated;
revoke all on function public.quiz_join(uuid,text,text) from public, anon, authenticated;
revoke all on function public.quiz_submit(uuid,uuid,uuid,text[],text) from public, anon, authenticated;
grant execute on function public.quiz_join(uuid,text,text) to service_role;
grant execute on function public.quiz_submit(uuid,uuid,uuid,text[],text) to service_role;
