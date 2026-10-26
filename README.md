# Minha Farmácia — controle pessoal de medicamentos

Aplicativo web responsivo para organizar medicamentos, estimar o saldo pelo consumo diário, registrar reposições e definir limites para receita e estoque baixo. O cálculo é **uma previsão organizacional**, não confirma a tomada de doses nem substitui orientação profissional.

## Testar

Abra `index.html` no navegador ou publique o projeto como site estático. Para sincronizar em vários dispositivos, configure um projeto Supabase conforme abaixo. Sem Supabase, os dados ficam somente no armazenamento local deste navegador. A primeira abertura inicia sem cadastros e mostra uma tela para adicionar o primeiro medicamento.

## Configurar o Supabase

1. Crie um projeto Supabase e mantenha o acesso restrito à sua conta.
2. No SQL Editor, execute `supabase/schema.sql`.
3. Copie `config.js.example` para `config.js` e informe o Project URL e a chave **anon/public** do Supabase. `config.js` é ignorado pelo Git.
4. Publique o projeto e use a tela **Configurações → Conectar Supabase** para criar/acessar a conta. A chave `service_role` nunca deve ser colocada no navegador.
5. Configure confirmação de e-mail e políticas de senha no Supabase conforme preferir. A tabela usa Row Level Security e associa os dados ao usuário autenticado.

> A conexão com o banco requer acesso à internet para carregar a biblioteca cliente do Supabase pelo CDN. Os segredos não são necessários para testar o modo local.

## Telegram (requer configuração do servidor)

O token do bot e o chat ID **não** podem ficar no navegador, neste repositório público ou na configuração da Vercel. A função de exemplo fica em `supabase/functions/telegram-reminders/index.ts`.

Para ativar, crie um bot no Telegram, obtenha o chat ID e publique a Edge Function. Cadastre `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e `CRON_SECRET` como secrets da função. Configure o agendamento do Supabase Cron para chamar a função periodicamente usando o cabeçalho `x-cron-secret` com o valor de `CRON_SECRET`. A chave `SUPABASE_SERVICE_ROLE_KEY` é usada só no runtime seguro do Supabase; jamais a exponha no navegador.

A função envia a cada execução os medicamentos que cruzaram seus limites. **Ainda falta implementar deduplicação/registro dos alertas enviados**, portanto agende com cuidado para evitar mensagens repetidas. O endpoint rejeita chamadas sem o segredo do Cron. Não coloque credenciais reais no repositório.

## Publicar no GitHub e Vercel

1. Crie um repositório GitHub **privado**, pois este aplicativo pode guardar informação relacionada à saúde.
2. Envie o conteúdo desta pasta. Não adicione credenciais, `config.js` configurado, token Telegram ou chave `service_role` ao repositório.
3. Importe o repositório privado na Vercel. A configuração incluída publica a página estática; não é necessário build.
4. Depois da primeira publicação, configure o domínio autorizado de autenticação no painel Supabase.

## Funcionalidades desta versão

- Cadastro, edição e remoção de medicamentos; quantidade/unidade, consumo diário e data-base.
- Desconto de estoque por tempo decorrido, pausa do desconto e limites personalizados para receita/estoque baixo.
- Registro de compras: data, quantidade, valor e observação; soma ao saldo e mostra histórico.
- Visão geral, filtros, responsividade, exportação e remoção dos dados locais.
- Login Supabase opcional e armazenamento local para uso/demonstração.

## Observações

- A sincronização Supabase é habilitada após preencher a configuração e entrar com uma conta.
- Alertas dentro do app são calculados ao abrir/atualizar a página; alertas Telegram exigem agendamento no servidor para chegar mesmo quando o site estiver fechado.
- O usuário confirma quantidades e consumo com as orientações recebidas do profissional de saúde.
