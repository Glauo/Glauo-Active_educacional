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
