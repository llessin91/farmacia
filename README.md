# Minha Farmácia — controle pessoal de medicamentos

Aplicativo web responsivo para organizar medicamentos, estimar o saldo pelo consumo diário, registrar reposições e definir limites para receita e estoque baixo. O cálculo é **uma previsão organizacional**, não confirma a tomada de doses nem substitui orientação profissional.

## Testar

Abra `index.html` no navegador ou publique o projeto como site estático. O app exige uma conta para entrar; sem sessão, qualquer acesso direto mostra a tela de login. Para sincronizar em vários dispositivos, configure o projeto Supabase conforme abaixo.

## Configurar o Supabase

A URL e a chave `anon/public` informadas já estão aplicadas em `config.js`. Essa chave foi feita para uso no navegador; a proteção dos dados depende de RLS e nunca substitui as políticas de acesso.

1. No SQL Editor do projeto informado, execute o conteúdo atualizado de `supabase/schema.sql`. Ele cria/atualiza as tabelas de medicamentos, compras, listas por pessoa e lembretes pendentes com RLS. Cadastros existentes recebem a lista padrão “Minha lista”.
2. Publique o site e use a tela inicial para entrar, criar uma conta com nome completo, recuperar senha ou continuar com Google. A opção “Manter conectado neste dispositivo” controla a duração da sessão.
3. Autorize o domínio publicado na configuração de autenticação do Supabase.
4. Para desenvolvimento local, use a configuração já preenchida, mas não acrescente chaves `service_role` nem outros segredos ao site.

> A primeira sessão pode sincronizar os medicamentos e compras já salvos localmente. Revise os dados depois do login.

## Telegram (configuração única no Supabase)

O token do bot e o chat ID permanecem somente nos secrets do servidor — nunca no navegador, GitHub ou Vercel. A função está em `supabase/functions/telegram-reminders/index.ts`.

1. No Telegram, crie um bot com `@BotFather`, abra a conversa com ele e envie `/start`. Obtenha seu chat ID (por exemplo, com `@userinfobot`).
2. Faça deploy da função `telegram-reminders` no projeto Supabase.
3. Cadastre `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_OWNER_USER_ID` (UUID do usuário Supabase que receberá os avisos) e `CRON_SECRET` nos secrets da Edge Function. O identificador do dono evita que dados de outras contas sejam enviados ao chat pessoal.
4. No app, entre na sua conta e use **Configurações → Configurar Telegram → Testar envio**. O teste é autenticado e só envia uma mensagem fixa de verificação.
5. Publique novamente a Edge Function `telegram-reminders` e configure Supabase Cron para chamá-la via POST com `x-cron-secret` igual ao `CRON_SECRET`, uma vez por dia no horário desejado. O Cron usa UTC; 9h de Brasília corresponde a `0 12 * * *`.

O teste manual usa a sessão autenticada; o job de lembretes exige o segredo do Cron e o UUID configurado em `TELEGRAM_OWNER_USER_ID`. Cada pendência tem estado independente e é reenviada no máximo uma vez por dia enquanto estiver aberta. A chave `SUPABASE_SERVICE_ROLE_KEY` só pode ser usada no ambiente seguro da função.

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

- Cadastro, edição e remoção de medicamentos; clicar no nome na visão geral ou na lista abre a edição.
- Opção individual para indicar se o medicamento precisa de receita; somente itens marcados recebem alertas de renovação.
- Quantidade/unidade, consumo diário e data-base; desconto de estoque por tempo decorrido, pausa e limites personalizados para receita/estoque baixo.
- Registro de compras: data, quantidade, valor e observação; soma ao saldo e mostra histórico.
- Visão geral, filtros, responsividade, exportação e remoção dos dados locais.
- Login obrigatório por e-mail/senha ou Google, cadastro com nome, recuperação de senha e sessão opcionalmente persistente.
- Listas nomeadas por pessoa com troca, criação, renomeação e arquivamento na barra superior; cada lista mantém dados separados.
- Teste autenticado de entrega Telegram; pendências separadas para pedir receita e comprar; compra confirmada atualiza o estoque e o histórico.
- Reenvio diário no Telegram até confirmação no app, com controle de envio por pendência e proteção de destinatário via `TELEGRAM_OWNER_USER_ID`.

## Observações

- A sincronização Supabase é habilitada após preencher a configuração e entrar com uma conta. Execute o SQL atualizado antes de abrir a nova área de lembretes.
- Alertas dentro do app são calculados ao abrir/atualizar a página; alertas Telegram exigem agendamento no servidor para chegar mesmo quando o site estiver fechado.
- O usuário confirma quantidades e consumo com as orientações recebidas do profissional de saúde.
