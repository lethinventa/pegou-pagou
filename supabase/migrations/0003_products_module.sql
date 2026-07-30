-- Pegou, Pagou — módulo Produtos: categoria, contadores de reconhecimento e
-- catálogo de imagens de referência (câmera/upload).
-- Rodar no SQL Editor do Supabase, depois de 0002_product_catalog.sql.

alter table products
  add column if not exists category text,
  add column if not exists correct_recognitions integer not null default 0,
  add column if not exists incorrect_recognitions integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists product_reference_images (
  id uuid primary key default gen_random_uuid(),
  -- null = imagem capturada pelo sistema que ainda não foi vinculada a nenhum
  -- produto (fica visível na tela Dataset/Aprendizado até alguém revisar).
  product_id uuid references products(id) on delete cascade,
  image_path text not null, -- URL pública no bucket "product-references" do Supabase Storage
  origem text not null check (origem in ('camera', 'upload')),
  created_at timestamptz not null default now()
);

create index if not exists product_reference_images_product_idx
  on product_reference_images (product_id);

-- Storage: crie manualmente um bucket público chamado "product-references"
-- no painel do Supabase (Storage → New bucket → marcar "Public bucket").
-- RLS do Storage fica igual ao resto do projeto: todo acesso passa pelo
-- backend do Next.js com a service role key, nunca direto do browser.
