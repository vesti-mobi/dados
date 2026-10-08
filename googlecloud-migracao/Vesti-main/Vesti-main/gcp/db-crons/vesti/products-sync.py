import os
import logging
import pandas as pd
from sshtunnel import SSHTunnelForwarder
from sqlalchemy import create_engine
from google.cloud import bigquery

# NOVO (08/10/2026, pedido da Laura). Ate' entao `odbc_products` nao tinha
# nenhum cron -- so' existia por causa de UMA carga manual feita em 28/08, que
# nunca mais rodou de novo (e' por isso que o painel Gambiarra tinha fallback
# pra "Produtos" preservando o valor antigo: ver _aplicar_produtos_fallback em
# build_data.py). Esse script e' a versao incremental diaria, nos mesmos
# moldes de product_details-sync.py (mesma tabela-irma, so' sem company_id) --
# ja' nasce com o DELETE em lotes (esse bug so' foi descoberto DEPOIS, no
# product_details-sync.py, rodando ha mais tempo com tabela maior).
LOG_FILE = "/home/diego/crons/sync_products.log"
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

BASTION_IP = "b.meuvesti.com"
BASTION_USER = "diego"
BASTION_PASS = "Tobi17092013#"
DB_HOST = "vesti-db-rds-prd.cc6sxzxxktuf.us-east-1.rds.amazonaws.com"
DB_PORT = 5432
DB_USER = "root"
DB_PASS = "3eroep3KLwDaDLm"
DB_NAME = "erp_prod"

PROJECT_ID = "vesti-data-499015"
BQ_DATASET = "vestilake_BI"
BQ_TABLE = "odbc_products"
CSV_FILE = "/tmp/spooling_temp_products.csv"

# Puxa o DIA ANTERIOR COMPLETO via updated_at. A fronteira usa CURRENT_DATE do
# próprio Postgres, então segue o relógio do banco (independe do fuso do cron).
#   [ontem 00:00 , hoje 00:00 )
QUERY = """
SELECT
    id, domain_id, active, created_at, updated_at
FROM products
WHERE updated_at >= CURRENT_DATE - INTERVAL '1 day'
  AND updated_at <  CURRENT_DATE
ORDER BY id
"""

# MESMO schema hibrido do odbc_products ja existente no BQ (carga manual de
# 28/08) -- precisa ser identico ao que ja esta na tabela, senao o APPEND
# falha com "Field has changed type".
SCHEMA_FORNECIDO = [
    bigquery.SchemaField("id", "STRING"),
    bigquery.SchemaField("domain_id", "INT64"),
    bigquery.SchemaField("active", "BOOL"),
    bigquery.SchemaField("created_at", "DATETIME"),
    bigquery.SchemaField("updated_at", "DATETIME"),
]

# id é STRING -> os ids levam aspas no DELETE.
ID_IS_STRING = True

INT_COLUMNS = [f.name for f in SCHEMA_FORNECIDO if f.field_type == "INT64"]


def run_sync():
    logging.info("--- Iniciando sincronização de products (diária) ---")

    try:
        logging.info("Conectando ao Bastion e ao PostgreSQL...")
        with SSHTunnelForwarder(
            (BASTION_IP, 22),
            ssh_username=BASTION_USER,
            ssh_password=BASTION_PASS,
            remote_bind_address=(DB_HOST, DB_PORT),
        ) as tunnel:
            engine = create_engine(
                f"postgresql://{DB_USER}:{DB_PASS}@127.0.0.1:{tunnel.local_bind_port}/{DB_NAME}"
            )

            extracted_ids = []
            first_chunk = True
            lote = 1

            logging.info("Iniciando extração de dados em lotes...")
            for chunk in pd.read_sql_query(QUERY, engine, chunksize=100000):
                linhas = len(chunk)
                logging.info(f"Processando lote {lote} com {linhas} linhas.")

                extracted_ids.extend(chunk["id"].astype(str).tolist())

                for col in INT_COLUMNS:
                    if col in chunk.columns:
                        chunk[col] = (
                            pd.to_numeric(chunk[col], errors="coerce").astype("Int64")
                        )

                mode = "w" if first_chunk else "a"
                header = first_chunk
                chunk.to_csv(CSV_FILE, index=False, mode=mode, header=header)

                first_chunk = False
                lote += 1

        total_ids = len(extracted_ids)
        if total_ids == 0:
            logging.info("Nenhum dado novo encontrado. Sincronização finalizada.")
            return

        logging.info(f"Extração concluída. Total de {total_ids} registros baixados.")

        logging.info("Conectando ao BigQuery e removendo registros antigos...")
        client = bigquery.Client(project=PROJECT_ID)

        # DELETE em lotes de ids, nao numa query so' -- ver nota no topo do
        # arquivo e o mesmo fix em product_details-sync.py (08/10/2026): uma
        # lista de IDs so' no WHERE IN (...) pode estourar o limite de 1MB de
        # texto de query do BigQuery em dias com delta grande.
        DELETE_CHUNK = 5000
        for inicio in range(0, len(extracted_ids), DELETE_CHUNK):
            lote_ids = extracted_ids[inicio:inicio + DELETE_CHUNK]
            if ID_IS_STRING:
                ids_string = ",".join([f"'{str(i)}'" for i in lote_ids])
            else:
                ids_string = ",".join([str(i) for i in lote_ids])
            delete_query = f"""
                DELETE FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}`
                WHERE id IN ({ids_string})
            """
            client.query(delete_query).result()
        logging.info("Registros antigos removidos do BigQuery.")

        logging.info("Iniciando upload (Append) do CSV para o BigQuery...")
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.CSV,
            skip_leading_rows=1,
            autodetect=False,
            schema=SCHEMA_FORNECIDO,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
            allow_quoted_newlines=True,
        )

        with open(CSV_FILE, "rb") as source_file:
            job = client.load_table_from_file(
                source_file,
                f"{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}",
                job_config=job_config,
            )
        job.result()
        logging.info("Upload concluído com sucesso.")

        if os.path.exists(CSV_FILE):
            os.remove(CSV_FILE)
            logging.info("Arquivo temporário removido.")

        logging.info("--- Sincronização finalizada com sucesso ---")

    except Exception as e:
        logging.error(f"Erro durante a execução: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    run_sync()
