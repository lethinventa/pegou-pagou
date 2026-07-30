-- Pegou, Pagou — campos de catálogo (Open Food Facts) em products
-- Rodar no SQL Editor do Supabase, depois de 0001_init.sql.

alter table products
  add column if not exists brand text,
  add column if not exists quantity text, -- texto livre (ex.: "355 ml", "200 g") — Open Food Facts não padroniza isso como número
  add column if not exists image_url text, -- imagem de referência (Open Food Facts), usada só pro reconhecimento visual local
  add column if not exists external_id text; -- código/barcode do Open Food Facts, só como referência — nunca usado pra leitura de código de barras no fluxo de compra
