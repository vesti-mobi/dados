# Imagem dos paineis estaticos que estavam na Vercel (painel-tribo,
# GambiarraUemtel, GambiarraAtta). nginx sem root ouvindo na 8080 (Cloud Run).
#
# Build (o workflow deploy-gcp.yml faz isto):
#   docker build -f deploy/gcp/static.Dockerfile \
#     --build-context conf=deploy/gcp/<servico> \
#     <pasta-do-painel>
#
# O contexto principal e a pasta do painel (vira a raiz do site); o contexto
# "conf" traz o nginx.conf daquele servico, que reproduz o vercel.json dele.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=conf nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx . /usr/share/nginx/html

# A Vercel nao publicava estes arquivos; aqui tambem nao.
USER root
RUN cd /usr/share/nginx/html && rm -rf .vercel .gitignore .env* vercel.json README.md
USER nginx

EXPOSE 8080
