# Pegou, Pagou

Kiosk de auto-atendimento para escritório: a pessoa se identifica (toque ou
voz), mostra o produto para a câmera, o sistema identifica via IA de visão e
adiciona automaticamente numa conta mensal por pessoa.

Ver `pegou-pagou-spec.md` (compartilhado fora do repo) para o desenho
completo do produto.

## Estado atual

Fase de frontend: todas as telas estão construídas e navegáveis, mas
rodando com **dados mock em memória** (`src/lib/mock-data.ts`) no lugar do
Supabase, e uma identificação de produto **simulada**
(`src/lib/mock-identify.ts`) no lugar da chamada real ao Gemini. A câmera e
a captura de frame já são reais — só a "IA" ainda é fake.

Próximos passos (backend): schema do Supabase (`supabase/migrations/`) →
API route `/api/identify-product` como proxy para o Gemini → trocar
`mock-data`/`mock-identify` por chamadas reais.

## Rotas

- `/` — identificação da pessoa (grid de toque + voz em pt-BR)
- `/escanear/[personId]` — câmera contínua + carrinho da sessão editável
- `/resumo` — consumo do mês corrente agrupado por pessoa
- `/config` — cadastro de pessoas e produtos

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

Ver `.env.example`. Nenhuma é necessária ainda para rodar o frontend com
dados mock — só entram em uso quando o backend (Supabase + Gemini) for
plugado. A `GEMINI_API_KEY` e a `SUPABASE_SERVICE_ROLE_KEY` nunca devem ser
expostas ao client (sem prefixo `NEXT_PUBLIC_`, usadas só em Route
Handlers/Server Actions).
