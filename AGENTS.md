# AGENTS.md - Active Educacional

## Escopo obrigatorio
Este workspace e exclusivamente do projeto Active Educacional.

Nunca altere arquivos fora de:

`c:\Users\Mister Wiz\Desktop\Active_educacional`

Nao use regras, contexto, dados, commits ou arquivos de DietHealth, Sponte, Mister Wiz Web, CondoJob, ActiveWiz ou qualquer outro projeto como se fossem deste sistema.

## Regras criticas
- Antes de editar, confirme que o caminho atual pertence a `Active_educacional`.
- Nao misture branches, remotos ou repositorios de outros projetos.
- Nao use tokens colados em conversa.
- Nao altere regras financeiras sem necessidade explicita.
- Boletos do financeiro devem priorizar Mercado Pago real.
- Nunca tratar boleto interno, codigo `AE-*` ou URL nao Mercado Pago como boleto MP valido.
- Dados de boleto devem vir do cadastro do aluno/responsavel quando disponiveis.
- Se o Mercado Pago rejeitar um campo, sanitize/valide o campo antes de enviar em vez de recriar boleto fake.

## Deploy
O deploy Hostinger documentado neste projeto usa:

```bash
git pull origin principal
docker compose -f docker-compose.hostinger.yml up -d --build
```

Se a producao mostrar codigo antigo, primeiro confirmar se o container foi rebuildado e se a Hostinger esta puxando este repositorio/branch.

## Qualidade
- Mudancas pequenas, rastreaveis e reversiveis.
- Conferir impacto no financeiro antes de publicar.
- Nao remover funcionalidades existentes para simplificar.
- Informar exatamente quais arquivos foram alterados.

## Cursor Cloud specific instructions

### Servico principal (desenvolvimento)
O app em producao e o **Next.js** em `frontend/` (porta `3000`). O Streamlit legado (`app.py`, porta `8501`) e opcional e nao faz parte do fluxo padrao de dev na nuvem.

### PostgreSQL (obrigatorio para gravacao)
O frontend usa a tabela `active_kv` no PostgreSQL. Sem banco, login pode funcionar com fallback, mas **escritas falham**.

Na VM da nuvem, o PostgreSQL local roda na porta `5432`. Se `pg_isready` falhar, iniciar com:

```bash
sudo pg_ctlcluster 16 main start
```

Banco e schema de dev (criar uma vez se nao existir):

```bash
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='ativo_educacional'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE ativo_educacional;"
sudo -u postgres psql -d ativo_educacional -c "CREATE TABLE IF NOT EXISTS active_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());"
```

### Variaveis de ambiente locais
Copiar `frontend/.env.local.example` para `frontend/.env.local` (nao versionar). Minimo para dev:

```bash
ACTIVE_DATABASE_URL=postgresql://postgres@localhost:5432/ativo_educacional?sslmode=disable
JWT_SECRET=<string-aleatoria-longa>
NODE_ENV=development
```

### Comandos uteis (em `frontend/`)
| Acao | Comando |
|------|---------|
| Dev server | `npm run dev` (porta 3000) |
| Lint / typecheck | `npm run lint` |
| Build | `npm run build` |
| Start (apos build) | `npm run start` |

Nao ha suite de testes automatizados (`npm test` nao existe). Validacao manual: login em `/login` com `admin` / `2523`, depois navegar modulos como `/alunos` e `/financeiro`.

### Servicos opcionais
- **Wizbot** (`deploy/wizbot/`, porta `8787`): WhatsApp webhook; `WIZBOT_PAUSED=1` por padrao no compose.
- **Docker compose de producao** (`docker-compose.hostinger.yml`): requer rede externa `easypanel` e Postgres `postgres_active_local`; nao e o caminho padrao para dev local na nuvem.
