create extension if not exists pgcrypto;
create table if not exists organizations(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 created_at timestamptz not null default now()
);
create table if not exists users(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid references organizations(id),
 email text not null unique,
 password_hash text not null,
 display_name text not null,
 role text not null check(role in ('super_admin','admin','developer','auditor','user')),
 status text not null default 'active' check(status in ('active','disabled','pending')),
 must_change_password boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists projects(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references organizations(id),
 name text not null,
 status text not null default 'active',
 created_by uuid references users(id),
 created_at timestamptz not null default now()
);
create table if not exists audit_log(
 id bigserial primary key,
 actor_id uuid references users(id),
 action text not null,
 entity_type text,
 entity_id text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_users_org on users(organization_id);
create index if not exists idx_projects_org on projects(organization_id);
create index if not exists idx_audit_created on audit_log(created_at desc);
