# Minha Farmácia — versão com contas e listas

Aplicativo web para organização pessoal de medicamentos, com login por e-mail ou Google, listas separadas por pessoa, cards navegáveis, histórico e lembretes Telegram identificados pela lista. Não é ferramenta de orientação clínica: mantenha o tratamento conforme a orientação profissional.

## Antes de começar

- Faça uma cópia/backup do repositório e do banco antes de atualizar.
- Use o projeto Supabase `nzfjrqhhxbpjjuusvzja` já configurado em `config.js`; esta é somente a chave pública anon, nunca a `service_role`.
- O banco guarda informação pessoal de saúde. Mantenha o repositório privado e não envie tokens ou chaves privadas para o GitHub.

## Atualização do banco (primeiro)

1. Entre no painel Supabase do projeto.
2. Abra **SQL Editor → New query**.
3. No projeto, abra `supabase/schema.sql`, copie o conteúdo completo e cole na consulta.
4. Clique **Run** e confirme que a execução terminou sem erro. A migração cria as listas e o histórico e associa os medicamentos/compras existentes à lista padrão; não apaga seus cadastros.
5. Se aparecer erro, pare antes de atualizar/publicar o site e guarde a mensagem de erro.

## Configuração de login por e-mail e Google

### E-mail

1. Supabase → **Authentication → URL Configuration**: cadastre o endereço publicado do site em **Site URL** e em **Redirect URLs**. Para desenvolvimento, adicione também o endereço local usado para testar.
2. Supabase → **Authentication → Providers → Email**: mantenha e-mail habilitado. A confirmação e o envio de redefinição dependem dos templates/configurações de e-mail do projeto.
3. No app, escolha **Entrar / criar conta**. Para recuperar acesso, use **Esqueci minha senha** e abra o link enviado ao e-mail.

### Google OAuth

1. Crie/seleciona um projeto no Google Cloud Console e configure a tela de consentimento OAuth.
2. Crie credenciais do tipo **OAuth client ID → Web application**.
3. Copie o **Callback URL / Redirect URL** exibido em Supabase → **Authentication → Providers → Google** e cadastre-o como **Authorized redirect URI** no Google Cloud. Não use o endereço do app como callback do provedor; use exatamente o callback do Supabase mostrado ali.
4. Cole o **Client ID** e o **Client Secret** do Google na configuração do provedor Google no Supabase e habilite o provedor. Guarde o Client Secret só no painel Supabase.
5. Em Supabase **URL Configuration → Redirect URLs**, autorize também o domínio publicado do app.
6. Teste **Continuar com Google** em janela privada e confirme que volta ao app com a conta certa. Se deseja vincular Google a uma conta por e-mail existente, entre primeiro nessa conta e use **Configurações → Vincular Google**; não crie contas paralelas sem conferir qual guarda seus dados.

> O código não contém credenciais Google. O OAuth só funcionará depois de cadastrar Client ID/Secret no Supabase e URLs de retorno corretas.

## Atualizar o site pelo Codespaces/GitHub

1. Abra o Codespace **`farmacia`** (não `medica`) e confirme a pasta principal do repositório.
2. Baixe e extraia esta versão atualizada no computador.
3. No Codespaces, substitua os arquivos `app.js`, `index.html`, `styles.css`, `README.md`, `supabase/schema.sql` e `supabase/functions/telegram-reminders/index.ts` pelos correspondentes desta atualização. Preserve o `config.js` existente no Codespace se ele já aponta para o projeto correto. Não envie arquivos temporários de `supabase/.temp`.
4. Em **Source Control**, confira que aparecem somente os arquivos esperados acima. Escreva `Adiciona login e listas por pessoa`, clique **Commit** e depois **Sync Changes**.
5. Aguarde a publicação automática na Vercel. Atualize o site com recarga forçada; no celular, feche e reabra a página.

## Telegram (a conexão existente é preservada)

O bot e o chat configurados continuam os mesmos. Os lembretes passam a mostrar o nome da lista, por exemplo `[Mãe] Comprar ...`. O Cron continua usando o dono definido em `TELEGRAM_OWNER_USER_ID`; assim, esta versão notifica as listas pertencentes a essa conta, no chat pessoal atualmente configurado. Ainda não há vinculação Telegram individual por conta nem compartilhamento entre usuários.

1. Se a Edge Function atual ainda é a anterior, no Codespace `farmacia`, abra o terminal e publique **apenas depois de concluir a migração do banco**: `npx supabase functions deploy telegram-reminders --use-api`. Se já publicou os arquivos novos, não é necessário publicar de novo.
2. Preserve `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_OWNER_USER_ID` e `CRON_SECRET` nos secrets do Supabase. Não os cole no site, SQL, GitHub ou conversa.
3. O UUID em `TELEGRAM_OWNER_USER_ID` precisa ser o ID da conta que administra as listas; login Google e e-mail devem ser vinculados à mesma conta Supabase se quiserem usar o mesmo conjunto de listas.
4. Mantenha o Cron diário existente. Para 9h em Brasília, expressão UTC: `0 12 * * *`. Teste em **Configurações → Configurar Telegram → Testar envio** e valide uma execução agendada.

## Conferência após publicar

- Entrar com e-mail; testar recuperação da senha.
- Entrar com Google e confirmar que abre a conta esperada.
- Criar listas de teste, trocar entre elas e confirmar que medicamentos, compras e lembretes não se misturam.
- Conferir que os quatro cards do resumo abrem as áreas relacionadas.
- Fazer uma compra de teste com medicamento de demonstração e confirmar que o saldo e o histórico mudam; não altere tratamentos/dados reais só para testar.
- Confirmar que a mensagem Telegram identifica a lista.

## Limites e privacidade

- Listas pertencem à conta que entrou; não dão acesso à própria pessoa listada nem a outras contas. Compartilhamento entre logins fica para outra versão.
- A integração Telegram envia avisos das listas do proprietário configurado para um único chat já cadastrado; criar mais contas não cria destinos Telegram automaticamente.
- Não há exclusão de conta nesta versão. Excluir lista apaga medicamentos, compras e histórico dessa lista e pede confirmação.
- Dados existentes na conta são migrados para a lista padrão `Minha lista`. Revise após a atualização.
- A previsão de estoque depende dos valores inseridos pelo usuário e não confirma tomada de doses.
