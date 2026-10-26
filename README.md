# Minha Farmácia — controle pessoal de medicamentos

Aplicativo web responsivo para organizar medicamentos, estimar o saldo pelo consumo diário, registrar reposições e definir limites para receita e estoque baixo. O cálculo é **uma previsão organizacional**, não confirma a tomada de doses nem substitui orientação profissional.

## Testar

Abra `index.html` no navegador ou publique o projeto como site estático. Para sincronizar em vários dispositivos, configure um projeto Supabase conforme abaixo. Sem Supabase, os dados ficam somente no armazenamento local deste navegador. A primeira abertura inicia sem cadastros e mostra uma tela para adicionar o primeiro medicamento.

## Configurar o Supabase

A URL e a chave `anon/public` informadas já estão aplicadas em `config.js`. Essa chave foi feita para uso no navegador; a proteção dos dados depende de RLS e nunca substitui as políticas de acesso.

1. No SQL Editor do projeto informado, execute `supabase/schema.sql`.
2. Publique o site e abra **Configurações → Conectar Supabase** para criar sua conta ou entrar. Pode ser preciso confirmar seu e-mail.
3. Autorize o domínio publicado na configuração de autenticação do Supabase.
4. Para desenvolvimento local, use a configuração já preenchida, mas não acrescente chaves `service_role` nem outros segredos ao site.

> A primeira sessão pode sincronizar os medicamentos e compras já salvos localmente. Revise os dados depois do login.

## Telegram (configuração única no Supabase)

O token do bot e o chat ID permanecem somente nos secrets do servidor — nunca no navegador, GitHub ou Vercel. A função está em `supabase/functions/telegram-reminders/index.ts`.

1. No Telegram, crie um bot com `@BotFather`, abra a conversa com ele e envie `/start`. Obtenha seu chat ID (por exemplo, com `@userinfobot`).
2. Faça deploy da função `telegram-reminders` no projeto Supabase.
3. Cadastre `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` nos secrets da Edge Function. Para executar também o job agendado, configure `CRON_SECRET`.
4. No app, entre na sua conta e use **Configurações → Configurar Telegram → Testar envio**. O teste é autenticado e só envia uma mensagem fixa de verificação.
5. Para lembretes automáticos com o site fechado, configure Supabase Cron para chamar a função via POST com o cabeçalho `x-cron-secret` igual ao `CRON_SECRET`. Defina uma frequência apropriada.

O teste manual usa a sessão autenticada; o job de lembretes exige o segredo do Cron. A chave `SUPABASE_SERVICE_ROLE_KEY` só pode ser usada no ambiente seguro da função. Alertas automáticos são enviados a cada execução enquanto permanecerem dentro do limite; evite agendamento muito frequente para não receber repetições.

## Publicar no GitHub e Vercel

1. Crie um repositório GitHub **privado**, pois o app pode guardar informação relacionada à saúde.
2. Envie os arquivos do projeto. Nunca adicione o token Telegram ou a chave `service_role` ao repositório.
3. Importe o repositório privado na Vercel. O site estático não exige etapa de build.
4. Configure o domínio da publicação na autenticação do Supabase.

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
- Login Supabase, dados privados com RLS e sincronização entre dispositivos após executar o schema.
- Teste autenticado de entrega Telegram e lembretes automáticos via Supabase Cron após configurar os secrets.

## Observações

- A sincronização Supabase é habilitada após preencher a configuração e entrar com uma conta.
- Alertas dentro do app são calculados ao abrir/atualizar a página; alertas Telegram exigem agendamento no servidor para chegar mesmo quando o site estiver fechado.
- O usuário confirma quantidades e consumo com as orientações recebidas do profissional de saúde.
