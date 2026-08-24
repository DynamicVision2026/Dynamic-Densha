alter table children add column if not exists rollover_dismissed_sy integer;

alter table grade_routes add column if not exists archived_at timestamptz;
alter table grade_routes add column if not exists superseded_by text;
