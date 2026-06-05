Leia o AGENTS.md e siga todas as regras do projeto ActiveEducacional.

Corrija o módulo financeiro: os boletos Mercado Pago estão sendo gerados, mas não estão dando baixa automática após o pagamento. Verifique webhook, consulta real na API Mercado Pago, vínculo da parcela via external_reference/metadata, status approved, prevenção de baixa duplicada e remoção de validade indevida dos boletos.

Também ajuste o painel ADM para acessar todos os usuários, incluindo coordenadores, com editar, excluir/desativar e redefinir senha.

Trabalhe pelo terminal, execute build/lint/testes disponíveis e informe arquivos alterados, comandos executados, testes feitos e pendências.
# AGENTS.md

## Objetivo
Você está trabalhando no sistema ActiveEducacional.
Sua função é fazer alterações com precisão, segurança e mínimo risco de regressão.
Priorize resultado funcional, operação escolar rápida, clareza administrativa, estabilidade financeira, segurança de usuários e preservação integral das regras de negócio.

O ActiveEducacional é um sistema escolar real, usado para gestão de alunos, professores, coordenadores, financeiro, mensalidades, boletos, correção de lições, portal do aluno e rotinas administrativas.

## Princípios obrigatórios
- Nunca altere regras de negócio sem necessidade explícita.
- Nunca altere lógica financeira, cobranças, parcelas, boletos, baixas, recibos, relatórios ou integrações sem necessidade explícita.
- Nunca faça refatoração ampla só por estética.
- Nunca remova funcionalidades existentes para “simplificar”.
- Nunca renomeie arquivos, funções, classes, variáveis críticas, chaves, rotas, tabelas ou campos sem necessidade real.
- Sempre preserve compatibilidade com o restante do sistema.
- Sempre prefira mudanças pequenas, controladas e reversíveis.
- Sempre revise impacto antes de editar.
- Sempre trabalhar pelo terminal quando precisar executar comandos, testes, build, lint ou migrations.
- Sempre tratar o sistema como software real de uso profissional, não como protótipo.

## Fluxo obrigatório antes de qualquer alteração
Antes de modificar código:

1. Localizar os arquivos diretamente envolvidos.
2. Entender a estrutura atual do projeto.
3. Identificar frontend, backend, rotas, controllers, services, models, banco de dados, migrations e variáveis de ambiente.
4. Identificar a causa exata do problema.
5. Listar rapidamente o que será alterado.
6. Editar somente o necessário.
7. Revisar impacto visual, funcional, financeiro e de permissões.
8. Executar comandos disponíveis de validação.
9. Informar exatamente o que mudou.

## Regras críticas do ActiveEducacional
- Nunca quebrar o cadastro de alunos.
- Nunca quebrar o vínculo entre aluno, responsável, professor, turma, contrato, parcela ou boleto.
- Nunca misturar dados financeiros de alunos diferentes.
- Nunca baixar parcela errada.
- Nunca duplicar cobrança, boleto, pagamento ou baixa.
- Nunca permitir que usuário sem permissão acesse área administrativa.
- Nunca permitir que aluno acesse funções administrativas.
- Nunca permitir que professor, comercial ou coordenador edite administrador.
- Nunca permitir exclusão do último administrador.
- Sempre preservar a integridade dos dados escolares e financeiros.
- Sempre manter rastreabilidade de ações importantes.
- Sempre validar permissões no backend, não apenas no frontend.

## Prioridades do produto
O ActiveEducacional deve transmitir:

- organização escolar;
- rapidez operacional;
- financeiro claro e confiável;
- gestão simples de alunos;
- controle administrativo profissional;
- boa experiência para coordenadores, professores e alunos;
- segurança de acesso;
- estabilidade no uso diário;
- interface limpa, objetiva e profissional.

## Regras para frontend
- Priorizar layout administrativo limpo, moderno, profissional e funcional.
- Não criar visual de landing page dentro do sistema.
- Não exagerar em gradientes, sombras ou efeitos.
- Priorizar contraste, legibilidade, espaçamento e hierarquia visual.
- Não deixar fontes invisíveis ou com contraste ruim.
- Não deixar texto branco sobre fundo claro ou texto escuro sobre fundo escuro.
- Não deixar campos, botões ou labels desalinhados.
- Não deixar grandes vazios desnecessários.
- Não deixar layout quebrar em smartphone ou tablet.
- Formulários devem usar grid consistente e agrupamento lógico.
- Cards, tabelas, seções e painéis devem seguir o mesmo padrão visual.
- Menu lateral deve ser estável, legível e funcional.
- Tabelas administrativas devem ser claras, filtráveis e fáceis de operar.
- Botões de ação crítica devem ter confirmação antes de executar.

## Regras específicas de usabilidade
- O sistema deve exigir o menor número possível de passos para ações frequentes.
- Informações importantes devem aparecer com destaque claro.
- Elementos secundários não devem competir visualmente com os principais.
- A navegação deve ser intuitiva e consistente.
- O menu não deve quebrar ao abrir, fechar, atualizar ou trocar de página.
- A experiência em celular e tablet deve ser preservada.
- Telas de cadastro devem ser objetivas, organizadas e fáceis de preencher.
- Telas financeiras devem priorizar leitura rápida de status, vencimento, valor e aluno.

## Regras específicas para cadastro de alunos
- O cadastro de aluno é uma área central do ActiveEducacional.
- Nunca quebrar criação, edição, visualização ou vínculo do aluno.
- Sempre preservar CPF, data de nascimento, telefone, e-mail, responsável, turma e status.
- Se houver login automático do aluno, preservar a regra existente.
- Quando aplicável, login do aluno deve seguir a regra definida no sistema:
  - login: data de nascimento;
  - senha inicial: 6 últimos dígitos do CPF.
- Não permitir duplicidade de aluno por CPF sem regra explícita.
- Não misturar dados de alunos com nomes semelhantes.
- Sempre validar campos obrigatórios antes de salvar.

## Regras específicas para usuários e permissões
O administrador deve ter acesso total ao sistema.

O ADM deve conseguir:

- visualizar todos os usuários;
- buscar usuários por nome, CPF, e-mail ou telefone;
- filtrar usuários por perfil;
- abrir detalhes do cadastro;
- editar usuários;
- excluir ou desativar usuários;
- redefinir senha de usuários;
- alterar perfil/permissão quando permitido pela estrutura atual;
- acessar alunos, professores, coordenadores, comercial, responsáveis e administradores.

Perfis previstos:

- Administrador;
- Coordenador;
- Professor;
- Comercial;
- Aluno;
- Responsável, se existir;
- Fornecedor, se existir.

Regras obrigatórias:

- Apenas ADM pode editar ou excluir usuários de qualquer perfil.
- Coordenador não pode editar ADM.
- Comercial não pode editar ADM.
- Professor não pode editar ADM.
- Aluno não pode acessar área de usuários.
- Responsável não pode acessar área administrativa.
- Impedir exclusão do último administrador.
- Preferir soft delete em vez de exclusão definitiva.
- Validação de permissão deve existir no backend.
- O frontend não deve apenas esconder botões; o backend também precisa bloquear acesso indevido.

## Regras específicas para coordenadores
- Coordenador deve ser tratado como usuário real do sistema.
- ADM deve conseguir visualizar coordenadores.
- ADM deve conseguir editar coordenadores.
- ADM deve conseguir excluir ou desativar coordenadores.
- ADM deve conseguir redefinir senha de coordenadores.
- Coordenador não pode ter privilégio de administrador sem permissão explícita.
- Coordenador não pode excluir ou alterar administrador.
- Coordenador não pode acessar funções financeiras críticas se isso não estiver previsto na regra atual.

## Regras específicas para redefinição de senha
Criar ou preservar botão no painel ADM:

**Redefinir senha**

Fluxo obrigatório:

1. ADM acessa cadastro do usuário.
2. ADM clica em “Redefinir senha”.
3. Sistema exibe confirmação.
4. Sistema gera senha temporária segura.
5. Sistema salva a senha criptografada/hash no banco.
6. Sistema nunca salva senha em texto puro.
7. Sistema exibe a senha temporária para o ADM copiar.
8. Se existir estrutura, marcar `must_change_password` para troca obrigatória no próximo login.
9. Registrar log da redefinição.
10. Se existir envio de e-mail ou WhatsApp, enviar a senha temporária ou instruções.

Senha temporária:

- mínimo de 8 caracteres;
- letras maiúsculas;
- letras minúsculas;
- números;
- caractere especial, se o sistema aceitar.

Também verificar possibilidade de fluxo:

- “Esqueci minha senha”;
- recuperação por e-mail ou CPF;
- token seguro de redefinição;
- tela para criação de nova senha.

Caso envio de e-mail ainda não esteja configurado, deixar backend preparado e informar pendência.

## Regras específicas para financeiro
O financeiro é uma área crítica do ActiveEducacional.

Nunca alterar lógica de cobrança, baixa, boletos, parcelas, recebimentos, contas a pagar, contas a receber, recibos ou relatórios sem pedido explícito.

O financeiro deve permitir clareza sobre:

- aluno;
- mensalidade;
- material;
- aulas avulsas;
- vencimento;
- valor da parcela;
- status da parcela;
- atrasos;
- pagamentos realizados;
- boletos gerados;
- baixa manual;
- baixa automática;
- cancelamentos;
- exclusões;
- relatórios.

Telas financeiras devem ser:

- legíveis;
- operacionais;
- rápidas;
- com tabelas bem organizadas;
- com filtros úteis;
- com status claros;
- com ações protegidas por confirmação.

## Regras específicas para contas a receber
Contas a receber deve exibir:

- nome do aluno;
- vencimento;
- valor da parcela;
- status;
- se está em dia;
- se está em atraso;
- tipo de cobrança;
- boleto vinculado, quando existir;
- data de pagamento, quando pago.

Ao clicar no aluno ou na parcela, o sistema deve exibir:

- todas as informações da cobrança;
- histórico financeiro do aluno;
- opção de editar;
- opção de baixar;
- opção de cancelar;
- opção de excluir parcela;
- opção de excluir todas as parcelas, com confirmação forte;
- opção de lançar novo valor;
- opção de anexar boleto em PDF, se existir essa função;
- opção de enviar boleto por e-mail ou WhatsApp, se existir integração.

Tipos de lançamento:

- Mensalidade;
- Material;
- Aulas avulsas;
- Outros, se já existir no sistema.

## Regras específicas para contas a pagar
Contas a pagar deve separar:

- Professores;
- Fornecedores.

Para professores, o sistema deve permitir:

- listar todos os professores;
- abrir detalhes do professor;
- visualizar valores a pagar;
- visualizar aulas dadas;
- visualizar dias das aulas;
- visualizar horário de abertura e fechamento da aula;
- visualizar turma;
- visualizar valor;
- gerar relatório detalhado;
- gerar recibo, se existir;
- exportar PDF, se existir;
- enviar por e-mail ou WhatsApp, se existir integração.

Para fornecedores, preservar:

- cadastro;
- valores;
- vencimentos;
- status;
- pagamento;
- relatórios.

## Regras específicas para Mercado Pago
A integração com Mercado Pago é crítica.

Problema principal a corrigir quando solicitado:

- boleto é gerado;
- aluno acessa boleto;
- pagamento é feito;
- sistema não dá baixa automática;
- parcela continua pendente ou em atraso.

Regras obrigatórias:

- Verificar se já existe endpoint de webhook.
- Se existir, corrigir.
- Se não existir, criar endpoint de webhook.
- Webhook deve receber notificações do Mercado Pago.
- Ao receber webhook, consultar o pagamento real na API do Mercado Pago usando o ID recebido.
- Nunca confiar apenas no payload inicial do webhook.
- Confirmar status real consultando a API.
- Usar `external_reference`, `metadata`, `student_id`, `installment_id`, `invoice_id` ou identificador equivalente para localizar a parcela correta.
- Nunca baixar parcela sem identificar com segurança o aluno e a cobrança.
- Nunca baixar duas vezes a mesma parcela.
- Nunca criar pagamento duplicado.
- Nunca alterar parcela errada.

Mapeamento de status:

- `approved`: marcar parcela como PAGA.
- `pending`: manter como PENDENTE.
- `in_process`: manter como EM PROCESSAMENTO.
- `rejected`: marcar como RECUSADA ou FALHOU.
- `cancelled`: marcar como CANCELADA.
- `refunded`: marcar como ESTORNADA.
- `charged_back`: marcar como CONTESTADA.

Quando status for `approved`, o sistema deve:

- atualizar parcela no banco;
- alterar status para PAGO;
- salvar data de pagamento;
- salvar valor pago;
- salvar ID do pagamento Mercado Pago;
- salvar método de pagamento;
- salvar status retornado pela API;
- remover parcela da inadimplência;
- atualizar financeiro do aluno;
- atualizar dashboard financeiro, se existir;
- registrar log da baixa;
- impedir duplicidade de baixa se webhook chegar mais de uma vez.

## Regras específicas para boletos Mercado Pago
- Remover validade indevida dos boletos.
- Não definir `expiration_date`, `date_of_expiration` ou campo equivalente se isso estiver causando expiração antecipada.
- O boleto deve respeitar o vencimento financeiro da parcela dentro do ActiveEducacional.
- O vencimento da mensalidade deve continuar aparecendo no sistema.
- Não alterar vencimento real da parcela sem solicitação explícita.
- Se o Mercado Pago exigir vencimento técnico, usar apenas o mínimo necessário.
- Evitar qualquer configuração que impeça o pagamento do boleto antes da baixa correta.
- Salvar dados retornados pelo Mercado Pago de forma rastreável.

## Regras específicas para botão “Verificar pagamento”
Quando solicitado ou quando fizer sentido, adicionar botão:

**Verificar pagamento**

Esse botão deve:

- consultar o pagamento no Mercado Pago;
- atualizar o status da parcela;
- dar baixa se o status for `approved`;
- não duplicar pagamento;
- exibir mensagem clara para ADM;
- registrar log da consulta;
- servir como plano B caso webhook falhe.

## Regras específicas para logs
Criar ou preservar logs para ações críticas:

Financeiro:

- boleto gerado;
- webhook recebido;
- payment_id recebido;
- consulta feita na API Mercado Pago;
- status retornado;
- parcela localizada;
- baixa realizada;
- baixa ignorada por duplicidade;
- erro de identificação;
- erro de comunicação com Mercado Pago.

Usuários:

- criação;
- edição;
- exclusão;
- desativação;
- alteração de perfil;
- redefinição de senha;
- tentativa de acesso sem permissão.

Logs devem conter, quando possível:

- usuário responsável;
- usuário afetado;
- aluno afetado;
- parcela afetada;
- data e hora;
- ação realizada;
- resultado;
- detalhes técnicos relevantes.

## Regras para banco de dados
Antes de alterar banco:

- verificar schema atual;
- verificar ORM ou camada de acesso;
- verificar migrations existentes;
- verificar nomes reais de tabelas e campos;
- verificar relações entre usuários, alunos, parcelas, boletos e pagamentos.

Se o projeto usa migrations:

- criar migration;
- não alterar banco manualmente;
- não apagar dados reais;
- não quebrar compatibilidade com dados existentes.

Campos úteis para financeiro, se necessário:

- `mercado_pago_payment_id`;
- `mercado_pago_preference_id`;
- `external_reference`;
- `payment_status`;
- `paid_at`;
- `paid_amount`;
- `payment_method`;
- `webhook_received_at`;
- `last_payment_check_at`.

Campos úteis para usuários, se necessário:

- `role`;
- `perfil`;
- `password_hash`;
- `must_change_password`;
- `is_active`;
- `deleted_at`;
- `last_login_at`.

Nunca criar campos duplicados se já existir equivalente.

## Regras para backend
- Validar permissões no backend.
- Proteger rotas administrativas.
- Proteger rotas financeiras.
- Não confiar apenas no frontend.
- Validar payloads recebidos.
- Tratar erros de forma clara.
- Não expor stack trace para usuário final.
- Não expor tokens, chaves, senhas ou dados sensíveis.
- Usar variáveis de ambiente para credenciais.
- Não commitar credenciais.
- Não criar endpoints inseguros.
- Não permitir alteração financeira sem usuário autorizado.
- Não permitir redefinição de senha sem permissão ADM.

## Regras para frontend administrativo
Criar ou preservar tela:

**Usuários**

Com filtros ou abas:

- Todos;
- Alunos;
- Professores;
- Coordenadores;
- Comercial;
- Administradores;
- Responsáveis, se existir.

Cada linha deve ter ações:

- Visualizar;
- Editar;
- Redefinir senha;
- Ativar/Desativar;
- Excluir.

Cadastro do usuário deve exibir:

- nome;
- CPF;
- e-mail;
- telefone;
- perfil;
- status;
- data de cadastro;
- último acesso, se existir.

Ações críticas devem ter confirmação:

- excluir;
- desativar;
- redefinir senha;
- alterar perfil;
- cancelar cobrança;
- baixar pagamento manualmente.

## Regras para menu e navegação
- Nunca quebrar o menu lateral.
- Nunca sumir com botão de abrir ou fechar menu.
- Nunca deixar scroll do menu inconsistente.
- Sempre revisar comportamento do menu após mudanças.
- O menu deve continuar funcional após refresh, troca de aba e uso em telas menores.
- O ADM deve enxergar os menus compatíveis com seu acesso total.
- Usuários comuns devem enxergar apenas menus compatíveis com seu perfil.

## Regras para portal do aluno
- Nunca expor funções administrativas para alunos.
- Aluno deve acessar apenas seus próprios dados.
- Aluno não pode acessar financeiro de outros alunos.
- Aluno não pode acessar cadastro de usuários.
- Aluno não pode editar permissões.
- Aluno não pode redefinir senha de outro usuário.
- Dados financeiros do aluno devem estar claros e seguros.
- Boletos devem aparecer apenas para o aluno correto.
- Histórico de pagamentos deve ser vinculado corretamente ao aluno.

## Regras para professores
- Professor deve acessar apenas funções compatíveis com seu perfil.
- Professor não deve acessar painel ADM.
- Professor não deve editar dados financeiros críticos, salvo se regra explícita permitir.
- Professor não deve acessar dados de todos os usuários.
- Professor não deve excluir alunos, coordenadores ou administradores.

## Regras para correção de lições
- Não quebrar módulo de correção de lições.
- Preservar status existentes.
- Preservar vínculo entre aluno, lição, turma, professor e correção.
- Não alterar critérios de correção sem pedido explícito.
- Se houver IA de apoio, não alterar prompt, lógica ou fluxo sem solicitação.
- Status devem continuar claros, por exemplo:
  - A corrigir;
  - Na fila;
  - Aguardando avaliação;
  - Corrigidas;
  - Notas lançadas.

## Regras para consistência visual
- O sistema deve manter identidade profissional e administrativa.
- Botões devem seguir o mesmo padrão visual.
- Inputs devem ter altura, borda e espaçamento padronizados.
- Labels devem ser sempre legíveis.
- Seções devem ter alinhamento consistente.
- Evitar mistura de estilos antigos e novos na mesma tela.
- Toda melhoria visual deve parecer parte nativa do sistema.
- Tabelas devem ser proporcionais e fáceis de ler.
- Status financeiros devem ter cor e texto claros.
- Ações perigosas devem ter destaque controlado, sem poluir a tela.

## Responsividade obrigatória
- Toda alteração precisa funcionar bem em desktop, notebook, tablet e celular.
- Em telas menores, blocos devem reorganizar sem quebrar leitura.
- Tabelas podem ter rolagem horizontal controlada quando necessário.
- Nenhum campo pode ficar inutilizável em smartphone.
- Nenhum texto pode ficar escondido, cortado ou invisível.
- Botões principais devem continuar acessíveis em telas menores.
- Modais devem caber na tela ou ter rolagem adequada.

## Restrições críticas
- Não mexer em backend se o pedido for apenas visual.
- Não mexer em frontend se o problema for apenas backend.
- Não criar dependências novas sem necessidade real.
- Não duplicar CSS desnecessariamente.
- Não usar inline style quando houver alternativa estrutural melhor.
- Não deixar remendos visuais difíceis de manter.
- Não quebrar comportamento já validado do sistema.
- Não apagar arquivos sem confirmar impacto.
- Não substituir módulos inteiros se uma correção pontual resolver.
- Não criar código morto.
- Não deixar função incompleta.
- Não deixar TODO como solução final.

## Comandos e validação
Sempre verificar quais comandos existem no projeto antes de executar.

Procurar em:

- `package.json`;
- scripts de backend;
- scripts de frontend;
- arquivos de configuração;
- documentação do projeto;
- README, se existir.

Executar quando disponível:

- `npm install`;
- `npm run build`;
- `npm run lint`;
- `npm test`;
- comandos de migration;
- comandos de typecheck;
- comandos de dev apenas quando necessário para validação.

Se algum comando falhar:

- identificar causa;
- corrigir se estiver no escopo;
- informar erro se depender de configuração externa.

## Testes obrigatórios para Mercado Pago
Após correção de boletos, validar:

1. Gerar boleto para aluno.
2. Conferir se parcela ficou pendente.
3. Conferir se boleto foi vinculado à parcela correta.
4. Simular webhook do Mercado Pago.
5. Confirmar se sistema consulta API Mercado Pago.
6. Confirmar baixa automática quando status for `approved`.
7. Confirmar que webhook duplicado não duplica pagamento.
8. Confirmar que parcela errada não é baixada.
9. Confirmar que pagamento rejeitado não baixa parcela.
10. Confirmar que boleto não está expirando por validade indevida.
11. Confirmar que financeiro do aluno atualiza.
12. Confirmar que dashboard financeiro atualiza, se existir.

## Testes obrigatórios para usuários
Após ajuste de usuários, validar:

1. ADM visualiza todos os usuários.
2. ADM filtra por perfil.
3. ADM busca por nome, CPF, e-mail ou telefone.
4. ADM edita aluno.
5. ADM edita professor.
6. ADM edita coordenador.
7. ADM edita comercial.
8. ADM exclui ou desativa usuário.
9. ADM redefine senha.
10. Coordenador não edita ADM.
11. Professor não acessa gestão de usuários.
12. Aluno não acessa gestão de usuários.
13. Sistema impede exclusão do último ADM.

## Padrão de qualidade
Toda entrega deve:

- manter a lógica existente;
- reduzir risco de regressão;
- melhorar clareza operacional;
- preservar regras financeiras;
- preservar vínculos entre aluno, turma, usuário e cobrança;
- melhorar produtividade administrativa;
- manter consistência com o restante do sistema;
- ser fácil de manter;
- evitar excesso de complexidade;
- ter segurança de permissões;
- ter validação no backend;
- ter interface legível;
- ter logs quando envolver ação crítica.

## Padrão de resposta do agente
Ao receber uma tarefa:

1. Explique rapidamente a causa provável do problema.
2. Diga quais arquivos pretende analisar.
3. Diga quais arquivos pretende alterar.
4. Faça a implementação.
5. Execute os comandos disponíveis de validação.
6. Revise visualmente e funcionalmente.
7. Informe exatamente o que mudou.

Ao finalizar, responder com:

- arquivos alterados;
- o que foi corrigido;
- comandos executados;
- testes realizados;
- pendências encontradas;
- pontos que dependem de credenciais, ambiente externo ou configuração do Mercado Pago.

## Quando houver dúvida
Se houver conflito entre “mais bonito” e “mais funcional”, escolha o mais funcional.

Se houver conflito entre “reescrever muito” e “corrigir com precisão”, escolha corrigir com precisão.

Se houver conflito entre “atalho visual” e “segurança de dados”, escolha segurança de dados.

Se houver risco de alterar regra financeira, preserve a regra financeira.

Se houver risco de baixar parcela errada, não faça a baixa sem identificação segura.

Se houver risco de quebrar fluxo do aluno, preserve o fluxo do aluno.

Se houver risco de quebrar fluxo do ADM, preserve o fluxo do ADM.

Se houver risco de expor dados financeiros ou pessoais, bloqueie e corrija a permissão.

Se houver dependência de credenciais do Mercado Pago, não invente credenciais. Use variáveis de ambiente existentes ou informe a pendência.

## Tarefa atual prioritária
Corrigir o módulo financeiro do ActiveEducacional:

- boletos Mercado Pago não estão dando baixa automática após pagamento;
- verificar webhook;
- consultar pagamento real na API Mercado Pago;
- vincular pagamento à parcela correta;
- remover validade indevida dos boletos;
- evitar baixa duplicada;
- adicionar botão “Verificar pagamento”, se necessário.

Também ajustar painel ADM:

- ADM deve acessar todos os usuários;
- incluir coordenadores;
- permitir editar;
- permitir excluir ou desativar;
- permitir redefinir senha;
- proteger permissões no backend;
- impedir exclusão do último ADM.