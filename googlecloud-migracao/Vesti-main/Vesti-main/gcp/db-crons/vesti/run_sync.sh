#!/bin/bash

# Executa o primeiro script
/home/diego/venv/bin/python3 /home/diego/crons/domains-sync.py >> /home/diego/crons/sync_domains.log 2>&1

# Executa o segundo script independentemente do resultado do primeiro
/home/diego/venv/bin/python3 /home/diego/crons/companies-sync.py >> /home/diego/crons/sync_companies.log 2>&1

# Executa script angels após companies
/home/diego/venv/bin/python3 /home/diego/crons/angels-sync.py >> /home/diego/crons/sync_angels.log 2>&1

# Executa script customers após angels
/home/diego/venv/bin/python3 /home/diego/crons/customers-sync.py >> /home/diego/crons/sync_customers.log 2>&1

# Executa script users após customers
/home/diego/venv/bin/python3 /home/diego/crons/users-sync.py >> /home/diego/crons/sync_users.log 2>&1

# Executa script integrations após users
/home/diego/venv/bin/python3 /home/diego/crons/integrations-sync.py >> /home/diego/crons/sync_integrations.log 2>&1

# Executa script partners após integrations
/home/diego/venv/bin/python3 /home/diego/crons/partners-sync.py >> /home/diego/crons/sync_partners.log 2>&1

# Executa script products após partners (novo, 08/10/2026 -- antes nao tinha
# cron nenhum pra essa tabela)
/home/diego/venv/bin/python3 /home/diego/crons/products-sync.py >> /home/diego/crons/sync_products.log 2>&1

# Executa script product_details após products
/home/diego/venv/bin/python3 /home/diego/crons/product_details-sync.py >> /home/diego/crons/sync_product_details.log 2>&1

# Executa script quotes após product_details
/home/diego/venv/bin/python3 /home/diego/crons/quotes-sync.py >> /home/diego/crons/sync_quotes.log 2>&1

# Executa script states após quotes
/home/diego/venv/bin/python3 /home/diego/crons/states-sync.py >> /home/diego/crons/sync_states.log 2>&1

# Executa script tags após states
/home/diego/venv/bin/python3 /home/diego/crons/tags-sync.py >> /home/diego/crons/sync_tags.log 2>&1

# Executa script company_tags após tags
/home/diego/venv/bin/python3 /home/diego/crons/company_tags-sync.py >> /home/diego/crons/sync_company_tags.log 2>&1

# Executa script cities após company_tags
/home/diego/venv/bin/python3 /home/diego/crons/cities-sync.py >> /home/diego/crons/sync_cities.log 2>&1

# Executa script sucessodocliente (products/rankings = Links e Cliques do painel CS) apos cities
/home/diego/venv/bin/python3 /home/diego/crons/sucessodocliente-sync.py >> /home/diego/crons/sync_sucessodocliente.log 2>&1
