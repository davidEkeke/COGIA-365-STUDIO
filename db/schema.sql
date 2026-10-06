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
create table if not exists workspaces(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 name text not null,
 status text not null default 'active' check(status in ('active','paused','archived')),
 mode text not null default 'local-first',
 created_at timestamptz not null default now()
);
create table if not exists project_decisions(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 title text not null,
 scope text,
 status text not null default 'validated' check(status in ('draft','validated','superseded')),
 created_by uuid references users(id),
 created_at timestamptz not null default now()
);
create table if not exists project_members(
 project_id uuid not null references projects(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade,
 role text not null default 'member',
 created_at timestamptz not null default now(),
 primary key(project_id,user_id)
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

create index if not exists idx_workspaces_project on workspaces(project_id);
create index if not exists idx_decisions_project on project_decisions(project_id);
create index if not exists idx_members_project on project_members(project_id);

create table if not exists password_reset_tokens(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 token_hash text not null,
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists idx_password_reset_user on password_reset_tokens(user_id);
create index if not exists idx_password_reset_expiry on password_reset_tokens(expires_at);

create table if not exists studio_jobs(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references organizations(id) on delete cascade,
 project_id uuid references projects(id) on delete cascade,
 job_type text not null check(job_type in ('mission','design','build','test','codex','preview')),
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed','cancelled')),
 instruction text,
 result jsonb not null default '{}'::jsonb,
 created_by uuid references users(id),
 created_at timestamptz not null default now(),
 started_at timestamptz,
 finished_at timestamptz
);
create index if not exists idx_studio_jobs_org on studio_jobs(organization_id,created_at desc);
create index if not exists idx_studio_jobs_project on studio_jobs(project_id,created_at desc);

create table if not exists studio_artifacts(
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references studio_jobs(id) on delete cascade,
 artifact_type text not null,
 name text not null,
 path text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_studio_artifacts_job on studio_artifacts(job_id);
