-- PI-6: server-attested evidence that a guest's echo successes were actually
-- spaced across real elapsed time, independent of the guest device's own
-- (forgeable) clock. Rows are written by attestGuestEcho() the instant each
-- echo succeeds; read once at guest-import time, then no longer needed.
create table if not exists guest_echo_attempts (
  guest_session_id text not null,
  kanji text not null,
  attempt_no integer not null,
  attested_at timestamptz not null default now(),
  primary key (guest_session_id, kanji, attempt_no)
);
create index if not exists guest_echo_attempts_lookup_idx
  on guest_echo_attempts (guest_session_id, kanji);
