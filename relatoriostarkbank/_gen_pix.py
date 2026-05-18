# -*- coding: utf-8 -*-
# Gera pix_marcas.js a partir da planilha "PIX Starkbank (1).xlsx".
# Casa o CNPJ da planilha com cnpj_marcas.js (nomeFantasia do dashboard);
# tambem casa pelo nome da planilha p/ resolver divergencias (ex.: "Gissary").
# Uso:  py -3 _gen_pix.py
import pandas as pd, re, json, unicodedata

BASE = r"C:/Users/Laura/Projetos/Ideia-vesti/relatoriostarkbank"
XL   = r"C:/Users/Laura/Downloads/PIX Starkbank (1).xlsx"

def norm(s):
    s = str(s or "").lower().strip()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def digits(s):
    return re.sub(r"\D", "", str(s or ""))

# ---- 1) cnpj_marcas.js: nomeFantasia(norm) -> cnpj(digits) ----
txt = open(BASE + "/cnpj_marcas.js", encoding="utf-8").read()
raw = txt[txt.index("{")+1: txt.index("};")]
cnpj_by_name = {}
names_by_cnpj = {}
for m in re.finditer(r'"([^"]+)"\s*:\s*"([^"]+)"', raw):
    nm, cj = norm(m.group(1)), digits(m.group(2))
    cnpj_by_name[nm] = cj
    names_by_cnpj.setdefault(cj, []).append(nm)

# ---- 2) Excel ----
df = pd.read_excel(XL, header=0, dtype=str)
df.columns = [str(c).strip() for c in df.columns]

excel_cnpjs = set()
chave_by_cnpj = {}
chave_by_marca = {}
sem_chave_planilha = []
pix_rows = []
for _, r in df.iterrows():
    marca = str(r.get("Marca", "")).strip()
    cj = digits(r.get("CNPJ"))
    if cj and "." not in str(r.get("CNPJ")) and 11 < len(cj) < 14:
        cj = cj.zfill(14)
    if not cj:
        continue
    excel_cnpjs.add(cj)
    chave = r.get("Chave PIX")
    chave = "" if (chave is None or (isinstance(chave, float) and pd.isna(chave)) or str(chave).strip().lower() == "nan") else str(chave).strip()
    if not chave:
        sem_chave_planilha.append((marca, cj))   # planilha sem Chave PIX -> NAO entra
        continue
    if re.fullmatch(r"\d+", chave):
        if len(chave) in (10, 11):
            chave = "+55" + chave
        elif len(chave) == 13:
            chave = chave.zfill(14)
    chave_by_cnpj[cj] = chave
    chave_by_marca[norm(marca)] = chave
    targets = names_by_cnpj.get(cj, []) or [norm(marca)]
    for t in targets:
        pix_rows.append((t, chave, marca))

seen = {}
for name, chave, marca in pix_rows:
    seen.setdefault(name, (chave, marca))

# ---- 2b) nomeFantasia de antecipacao no dados.js ----
dtxt = open(BASE + "/dados.js", encoding="utf-8").read()
dtxt = dtxt[dtxt.index("{"):].strip()
DADOS, _ = json.JSONDecoder().raw_decode(dtxt)

def is_test(n):
    n = norm(n)
    return n.startswith("andressa - teste") or n == "andressa vesti" or "teste" in n

antec = {}
for p in DADOS.get("pedidos", []):
    if p.get("antecipacaoEnabled"):
        nf = p.get("nomeFantasia", "")
        antec.setdefault(norm(nf), nf)

for nm in antec:
    if nm in seen:
        continue
    cj = cnpj_by_name.get(nm, "")
    if cj and cj in chave_by_cnpj:
        seen[nm] = (chave_by_cnpj[cj], antec[nm])
    elif nm in chave_by_marca:
        seen[nm] = (chave_by_marca[nm], antec[nm])

# ---- 3) escreve pix_marcas.js ----
items = sorted(seen.items())
w = max(len(n) for n, _ in items) + 2
body = "\n".join('        "%s":%s"%s",' % (n, " " * (w - len(n)), c) for n, (c, _) in items)
if body.endswith(","):
    body = body[:-1]

out = '''// Chaves PIX das marcas (fonte: planilha "PIX Starkbank (1).xlsx").
// Gerado casando o CNPJ da planilha com cnpj_marcas.js (nomeFantasia do dashboard).
// Sem "Chave PIX" na planilha => marca NAO entra (chave em branco). Atualize re-rodando _gen_pix.py.
// Match feito pelo nomeFantasia (lowercase, trim, sem acento).
window.PIX_MARCAS = (function(){
    var raw = {
%s
    };
    function norm(s){
        return String(s||"").toLowerCase().trim()
            .normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");
    }
    var map = {};
    for (var k in raw) map[norm(k)] = raw[k];
    return {
        get: function(nome){ return map[norm(nome)] || ""; },
        norm: norm
    };
})();
''' % body
open(BASE + "/pix_marcas.js", "w", encoding="utf-8").write(out)

faltando = []
for nm, original in sorted(antec.items(), key=lambda x: x[1]):
    if nm in seen or is_test(original):
        continue
    cj = cnpj_by_name.get(nm, "")
    if not (cj and cj in excel_cnpjs):
        faltando.append((original, cj or "(sem cnpj no cnpj_marcas.js)"))

print("Marcas geradas no pix_marcas.js:", len(items))
print("\n=== Marcas NA planilha mas SEM Chave PIX preenchida (pedir a chave) ===")
for nome, cj in sorted(sem_chave_planilha):
    print(" - %-25s CNPJ: %s" % (nome, cj))
print("Total:", len(sem_chave_planilha))
print("\n=== Marcas com ANTECIPACAO, SEM chave PIX e FORA do Excel ===")
for nome, cj in faltando:
    print(" - %-25s CNPJ: %s" % (nome, cj))
print("Total:", len(faltando))
