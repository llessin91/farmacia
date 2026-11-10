# Minha Farmácia

Aplicação web para organizar medicamentos, estimar saldo, registrar compras e acompanhar lembretes. Esta versão preserva os recursos do app enviado e atualiza a identidade visual com o logo fornecido.

## Como abrir

- Abra `index.html` em um navegador moderno ou publique a pasta em um serviço de hospedagem estática.
- Para autenticação e sincronização, configure `config.js` com a URL do projeto Supabase e a chave pública `anon` correspondente.
- Mantenha as políticas de segurança (RLS) ativadas no Supabase. Não coloque chaves de serviço ou tokens privados no navegador.
- Sem o SDK/configuração do Supabase, o app abre em **modo local** e salva os dados neste navegador. A seleção e o gerenciamento de listas remotas ficam indisponíveis nesse modo.

## Arquivos principais

- `index.html`: interface de entrada e estrutura do aplicativo.
- `styles.css`: identidade visual responsiva.
- `app.js`: recursos e lógica existente, com fallback para modo local quando o Supabase não está disponível.
- `config.js`: configuração Supabase fornecida.
- `assets/logo.png` e `assets/favicon.png`: logo da página e ícone da aba.

## Observação sobre credenciais

A chave `anon` do Supabase é destinada a uso no cliente, mas o acesso aos dados precisa ser protegido por políticas RLS. Nunca use uma chave `service_role` neste projeto.
