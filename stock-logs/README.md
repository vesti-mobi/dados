# Movimentações de Estoque

Painel de busca sob demanda do log de movimentação de estoque (`StockLog`),
por produto + empresa + período. Publica em
**https://vesti-mobi.github.io/dados/stock-logs/** — senha `Mudar123`.

```
stock-logs.py         extrai o log do Loki, enriquece com nome de usuário e
                       número do pedido (APIs Vesti), gera .log + .csv
merge_para_painel.py   converte o .csv de uma rodada numa "busca" e soma ao
                       historico em dados.js (nao substitui, acumula)
index.html             o painel (login "Mudar123", seletor de busca, tabela
                       filtravel)
dados.js               gerado pelo workflow — window.STOCK_LOGS_DADOS
```

## Por que é "sob demanda" e não um painel automático

A consulta ao Loki é `|= product_code |= company_id` — por produto, por
empresa, sempre. Não existe "trazer tudo": diferente dos outros painéis deste
repositório (Gambiarra, CS…), que rodam sozinhos todo dia e mostram a carteira
inteira, este exige que alguém diga qual produto e qual empresa quer ver.

## Como pedir uma busca

Aba **Actions** → **Stock Logs (busca)** → **Run workflow**, preenche:

| Campo | Exemplo |
|---|---|
| `company_id` | `9d42510e-9776-4fe1-87d7-8fe0dec1c58c` |
| `product_code` | `KR9182625229` |
| `start` | `2026-08-01T00:00:00` |
| `end` | `2026-09-01T00:00:00` |

Espera ~1-2 min (o Loki é consultado em janelas de 1 dia, com pausa entre
cada uma) e recarrega o painel — a busca aparece no topo do seletor.

## Fontes

- **Loki** (`loki.meuvesti.com`, container `app_core_stock_logs`) — o log
  bruto de movimentação. Não autenticado.
- **APIs Vesti** (`apivesti.vesti.mobi`) — `appvendas/v1/users/{id}` (nome de
  quem fez a ação) e `order/v1/orders` (número do pedido a partir do
  `stockReserveId`). Autenticado com Bearer token.

### Este NÃO é o mesmo `stock_logs` que `CS/ingerir_stock_logs.js` espelha

Existe outro pipeline neste repo (`CS/ingerir_stock_logs.js`) que espelha uma
tabela `stock_logs` do **Postgres de produção** para o BigQuery. Aquela tabela
parou de receber gravação em **21/08/2026** (confirmado ao vivo, 14/09/2026).
A suspeita — não confirmada, é leitura de fora dos dois sistemas — é que o log
de movimentação **migrou do Postgres pra cá (Loki)** por essa época: `stocks`
(o saldo, também no Postgres) continua sendo atualizado normalmente o tempo
todo, só o *registro* da movimentação mudou de lugar. Se um dia alguém
confirmar isso com o time de backend, vale anotar aqui.

## Token (`VESTI_ORDER_TOKEN`)

O workflow usa o secret `VESTI_ORDER_TOKEN` — um JWT de serviço sem expiração,
já usado por outros scripts deste repo contra `apivesti.vesti.mobi/order/v1/…`
(`relatoriostarkbank/fetch_data.py`). **Testado em produção em 14/09/2026**
(run `34879787173`): resolve tanto `/order/v1/orders` quanto
`/appvendas/v1/users/{id}` (`[users] 1/1 resolvidos`, `[orders] 1/1
resolvidos`) — não precisou de um token novo.

Se um dia parar de funcionar (token revogado/trocado), o sintoma no log do
workflow é `[erro] 401 em .../appvendas/...` ou `.../order/...`; troque o
secret `VESTI_ORDER_TOKEN` (ou aponte a env `VESTI_TOKEN` do passo "Rodar
stock-logs.py" para um secret novo).

## ⚠️ A senha é uma tranca, não um cofre

Mesmo modelo do Painel de Clientes CS: a checagem roda no navegador, e
`stock-logs/dados.js` fica acessível por URL direta, sem senha nenhuma. O
`dados.js` tem **nome de usuário e IP** de quem mexeu no estoque — decisão da
Laura (14/09/2026) publicar mesmo assim, no mesmo padrão de risco que o
`CS/dados.js` já assume para dados de CS/negócio. O `.log`/`.csv` brutos de
cada busca **não** vão para o `dados.js` nem são commitados — ficam só como
artefato do run do workflow (baixável por quem tem acesso ao repositório,
expira em 90 dias).

## Histórico do painel

`merge_para_painel.py` **acumula** buscas em vez de substituir — cada rodada
do workflow soma uma entrada nova em `dados.js` (ou atualiza, se alguém
repetir exatamente a mesma empresa+produto+período). Guarda as últimas 200
buscas; mais antigas que isso saem do painel, mas o `.csv` original de cada
uma continua no artefato do run (se ainda não expirou).

## Rodar localmente

```bash
pip install requests
export VESTI_TOKEN='...'   # Bearer token das APIs Vesti
python3 stock-logs.py \
  --start=2026-08-01T00:00:00 --end=2026-09-01T00:00:00 \
  --product-code=KR9182625229 \
  --company-id=9d42510e-9776-4fe1-87d7-8fe0dec1c58c
```

Detalhes de parâmetros, formato do CSV e troubleshooting (rate limit, janela
que bate no teto do Loki etc.) estão nos comentários de `stock-logs.py`.
