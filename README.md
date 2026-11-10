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

O token do bot, o chat ID e os segredos ficam somente no servidor ou em um terminal privado — nunca no navegador, repositório público ou chat. A função `supabase/functions/telegram-reminders/index.ts` recebe o Cron e as respostas dos botões.

1. No SQL Editor do Supabase, execute o `supabase/schema.sql` atualizado. Ele faz a migração dos lembretes para suas listas e cria o estado temporário da pergunta de quantidade e a rotina transacional de registro de compra.
2. No Telegram, crie/abra o bot com `@BotFather`, envie `/start` na conversa privada e obtenha o chat ID. Os botões são restritos ao chat privado configurado.
3. Cadastre `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_OWNER_USER_ID` (UUID da conta Supabase), `CRON_SECRET` e `TELEGRAM_WEBHOOK_SECRET` nos secrets da Edge Function. Use um segredo webhook aleatório com 1–256 caracteres, somente letras, números, `_` ou `-`.
4. A configuração `supabase/config.toml` desativa a validação JWT automática somente para esta função; as três rotas continuam validadas no código (webhook por secret token, Cron por `CRON_SECRET` e teste pelo login Supabase). Publique a função a partir da raiz deste projeto com `npx supabase functions deploy telegram-reminders --use-api --project-ref nzfjrqhhxbpjjuusvzja`. Configure o webhook do Telegram para `https://nzfjrqhhxbpjjuusvzja.supabase.co/functions/v1/telegram-reminders`, enviando o mesmo `TELEGRAM_WEBHOOK_SECRET` no campo `secret_token` do método `setWebhook`. O Telegram deve encaminhar `callback_query` e `message`; não configure outra função como webhook do mesmo bot.
5. Para registrar o webhook em um terminal privado, defina localmente `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` e execute:

   ```sh
   curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     --data-urlencode "url=https://nzfjrqhhxbpjjuusvzja.supabase.co/functions/v1/telegram-reminders" \
     --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
   ```

   Não cole o token em um site, repositório, chamado de suporte ou chat.
6. Configure o Supabase Cron para chamar a função via POST com `x-cron-secret` igual a `CRON_SECRET`, uma vez por dia no horário desejado. O Cron usa UTC; 9h de Brasília corresponde a `0 12 * * *`.
7. No app atualizado, entre na conta e use **Configurações → Configurar Telegram → Testar envio** para validar a entrega.

Ao tocar **Confirmado** no lembrete de receita, o estado passa a concluído. Em **Aguardar**, o envio fica adiado até o próximo horário do Cron. Em **Confirmar compra**, o bot pergunta a quantidade; uma resposta numérica atualiza o estoque e o histórico no Supabase em uma única transação e encerra o lembrete. A quantidade expira após 24 horas se não houver resposta. A chave `SUPABASE_SERVICE_ROLE_KEY` só pode ser usada no ambiente seguro da função.

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
- Telegram com botões Confirmado/Aguardar para receita e Confirmar compra/Aguardar para reposição; a quantidade é perguntada no chat e salva no histórico e no estoque.
- Reenvio no horário diário programado; confirmação no app ou no Telegram encerra o lembrete e sincroniza seu estado com a lista correta.

## Observações

- A sincronização Supabase é habilitada após preencher a configuração e entrar com uma conta. Execute o SQL atualizado antes de abrir a nova área de lembretes.
- Alertas dentro do app são calculados ao abrir/atualizar a página; alertas Telegram exigem agendamento no servidor para chegar mesmo quando o site estiver fechado.
- O usuário confirma quantidades e consumo com as orientações recebidas do profissional de saúde.
