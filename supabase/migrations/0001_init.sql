-- Pegou, Pagou — schema inicial
-- Rodar no SQL Editor do Supabase (ou via `supabase db push`).

create extension if not exists pgcrypto;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists consumption_logs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null, -- snapshot do nome no momento (produto pode mudar/sumir depois)
  price numeric(10,2) not null, -- snapshot do preço no momento
  created_at timestamptz not null default now()
);

create index if not exists consumption_logs_person_created_idx
  on consumption_logs (person_id, created_at);

-- RLS fica desligado de propósito: o app não usa Supabase Auth nesta versão
-- (kiosk sem login). Todo acesso ao banco passa pelo backend do Next.js com
-- a service role key (nunca exposta ao browser) — ver src/lib/supabase/server.ts.
