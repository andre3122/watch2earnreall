// api/setup/migrate.js — run once to create tables in the *actual* DATABASE_URL used by the app
const { sql } = require("../_lib/db");

const MIGRATION = `
create extension if not exists "uuid-ossp";

create table if not exists users (
  id           bigint primary key,
  username     text,
  first_name   text,
  last_name    text,
  balance      numeric not null default 0,
  streak       int not null default 0,
  last_checkin timestamptz,
  address      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_users_updated_at on users(updated_at);

create table if not exists ledger (
  id         bigserial primary key,
  user_id    bigint not null references users(id) on delete cascade,
  amount     numeric not null,
  reason     text not null,
  ref_id     text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ledger_user on ledger(user_id);

create table if not exists ad_sessions (
  id           bigserial primary key,
  user_id      bigint not null references users(id) on delete cascade,
  task_id      text not null,
  token        text not null unique,
  reward       numeric not null default 0,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_ad_sessions_user on ad_sessions(user_id);
create index if not exists idx_ad_sessions_status on ad_sessions(status);

create table if not exists withdrawals (
  id         bigserial primary key,
  user_id    bigint not null references users(id) on delete cascade,
  amount     numeric not null,
  address    text not null,
  status     text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists idx_withdrawals_user on withdrawals(user_id);

create or replace function touch_users_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated on users;
create trigger trg_users_updated before update on users
for each row execute function touch_users_updated_at();
`;

module.exports = async (req, res) => {
  try {
    await sql.raw ? sql.raw(MIGRATION) : sql([MIGRATION], []); // support helper apapun
    res.json({ ok: true });
  } catch (e) {
    console.error("migrate error:", e);
    res.status(500).json({ ok:false, error: String(e) });
  }
};
