# Pegou, Pagou

Kiosk de auto-atendimento para escritório: a câmera fica sempre ligada
escaneando, o sistema identifica o produto via IA de visão e monta um
carrinho da sessão; só ao concluir é que se pergunta quem é a pessoa
(toque ou voz), pra atribuir o consumo daquele mês a ela.

Ver `pegou-pagou-spec.md` (compartilhado fora do repo) para o desenho
original do produto — o fluxo de identificação foi invertido em relação à
primeira versão do spec (ver "Decisões de fluxo" abaixo).

## Estado atual

Backend real plugado: Supabase (schema em `supabase/migrations/0001_init.sql`)
e a API route `/api/identify-product` como proxy pro Gemini
(`GEMINI_MODEL=gemini-3.5-flash` por padrão, configurável via env var). Não
há mais dados mock no código.

Este ambiente de desenvolvimento remoto tem uma política de rede que
bloqueia acesso a domínios externos (Supabase, Google), então o
backend não pôde ser testado ao vivo aqui — só validado por
build/typecheck/lint limpos. Precisa ser testado localmente ou em
deploy (Vercel) antes de considerar pronto.

## Rotas

- `/` — câmera contínua + carrinho da sessão editável (sem pessoa definida)
- `/resumo` — consumo do mês corrente agrupado por pessoa
- `/config` — cadastro de pessoas e produtos (CRUD real via Server Actions)

## Decisões de fluxo (diferem do spec original)

- A tela de identificação da pessoa não vem mais primeiro. A câmera abre
  direto na home; o carrinho fica "anônimo" enquanto escaneia.
- O botão **Concluir** abre um modal "Quem é você?" (toque ou voz) — só
  nesse momento a pessoa é escolhida.
- Consequência pro banco: os `consumption_logs` são gravados **todos de
  uma vez** no Concluir (`finalizeSession`, em `src/lib/actions/sessions.ts`),
  não item a item durante o escaneamento como o spec original sugeria.
  Remover um item do carrinho antes de concluir é só estado local — nada
  chega a ser gravado.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

Ver `.env.example`. Preencha um `.env.local` (nunca commitado) com:

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API no
  painel do Supabase. A service role key só é usada em código server-only
  (`src/lib/supabase/server.ts`, protegido pelo pacote `server-only`).
- `GEMINI_API_KEY` — aistudio.google.com/app/apikey. Usada só dentro de
  `src/app/api/identify-product/route.ts`, nunca enviada ao client nem logada.
- `GEMINI_MODEL` — default `gemini-3.5-flash`; troque aqui se o Google
  mudar o modelo Flash disponível no tier gratuito.

Antes de rodar pela primeira vez, execute `supabase/migrations/0001_init.sql`
no SQL Editor do Supabase (schema ainda não é aplicado automaticamente).
