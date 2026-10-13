# vesti-cs-tier — o servidor do tier fixado à mão

Cópia local do que está publicado em **https://vesti-cs-tier.vercel.app**
(projeto `vesti-cs-tier` na conta Vercel da Vesti). Mora aqui para o código não
existir só dentro da Vercel — como aconteceu com o `vesti-contas`, cujo fonte
não está em lugar nenhum que este repositório alcance.

O Painel de Clientes CS chama `/api/tier` quando alguém arrasta o chip da
coluna **Tier**. Ver a seção *Tier* do `../README.md` para a régua e o
comportamento; o cabeçalho do `api/tier.js` explica as decisões do servidor.

## Variáveis que o projeto precisa

| Variável | De onde vem |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | criada sozinha ao ligar o armazenamento de arquivos ao projeto |
| `SENHA_PAINEL` | a mesma senha do painel — autoriza o POST |

## Publicar uma mudança

O projeto não está ligado a este repositório no Git (foi criado por deploy
direto). Para publicar, use a CLI da Vercel de dentro desta pasta:

    npx vercel --prod

