# Suporte Formal - Active Educacional

## Escopo
Este documento vale somente para o projeto Active Educacional.

Nao misturar com DietHealth, Sponte, Mister Wiz Web, CondoJob, ActiveWiz ou outros projetos.

## Financeiro Mercado Pago
- Boleto MP deve ser gerado pelo botao `Gerar boleto MP`.
- PIX MP deve ser gerado pelo botao `Gerar Pix MP`.
- Boleto interno `AE-*` nao deve ser tratado como boleto Mercado Pago valido.
- Se Mercado Pago recusar e-mail, CPF/CNPJ, valor ou outro campo, corrigir o dado e gerar novamente. Nao criar boleto ou PIX fake.
- O webhook oficial deve ser:

```text
https://ativoeducacional.tech/api/financeiro/mercado-pago/webhook
```

- Evento Mercado Pago necessario: `Pagamentos`.
- Baixa automatica deve registrar `Boleto Mercado Pago` ou `Pix Mercado Pago`.

## Dados obrigatorios no cadastro
Para reduzir erro de pagamento, cada aluno ou responsavel deve ter:

- nome completo
- e-mail valido
- CPF/CNPJ valido
- WhatsApp
- endereco/CEP quando disponivel

## Relatorios prontos
No Financeiro, usar `Relatorios prontos` para:

- resumo executivo
- caixa mensal
- inadimplencia por aluno
- pagamentos Mercado Pago
- Pix/Boleto
- exportacao CSV

## Backup automatico
O Active gera backup automatico diario quando um administrador/coordenador acessa o Financeiro.

Endpoint manual/cron:

```text
/api/backup/auto
```

Com segredo de cron:

```text
/api/backup/auto?secret=CRON_SECRET
```

Os backups ficam em:

```text
data/backups/automaticos
```

Retencao atual: 30 backups automaticos.

## Limpeza de duplicados
- Sempre criar backup antes de limpar duplicados.
- Remover automaticamente apenas duplicados obvios em aberto.
- Nao remover lancamento pago sem confirmacao.
- Nao remover lancamento com `mercado_pago_payment_id`, `pix_qr_code`, `pix_ticket_url` ou `mercado_pago_ticket_url` sem analise.

## Procedimento de suporte
1. Confirmar que o ambiente e Active Educacional.
2. Confirmar branch/repo antes de alterar codigo.
3. Fazer backup ou conferir backup automatico recente.
4. Corrigir com mudanca pequena e rastreavel.
5. Rodar build quando alterar frontend/backend Next.js.
6. Publicar somente no stack Docker do Active:

```bash
cd /etc/easypanel/projects/ativo-educacional/github/code
git pull origin principal
docker compose -p ativo-educacional_github -f docker-compose.hostinger.yml -f docker-compose.override.yml up -d --build
```

7. Nao usar `--remove-orphans` sem confirmar, para nao remover banco ou servico necessario.
