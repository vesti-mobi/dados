// Chaves PIX das marcas (fonte: planilha "PIX Starkbank (1).xlsx").
// Gerado casando o CNPJ da planilha com cnpj_marcas.js (nomeFantasia do dashboard).
// Sem "Chave PIX" na planilha => marca NAO entra (chave em branco). Atualize re-rodando _gen_pix.py.
// Match feito pelo nomeFantasia (lowercase, trim, sem acento).
window.PIX_MARCAS = (function(){
    var raw = {
        "alcance jeans":          "pessoal@alcancejeans.com",
        "alcance jeans nova":     "pessoal@alcancejeans.com",
        "alcance jeans pr":       "pessoal@alcancejeans.com",
        "bella donna":            "+5511933990994",
        "bella donna varejo":     "+5511933990994",
        "carmila":                "08482963000180",
        "coinage":                "Hercha confecções",
        "evian":                  "+5511995671787",
        "gissary":                "52337840000148",
        "gissary modas":          "52337840000148",
        "groovy forever":         "financeiro@groovyforever.com.br",
        "izzat jeans":            "+5511999768315",
        "kalli":                  "49345891000107",
        "kauly":                  "fabriciopais@yahoo.com.br",
        "life activewear":        "52602995000164",
        "maria lima":             "21721042000434",
        "maria lima santa cruz":  "21721042000434",
        "maria lima varejo":      "21721042000434",
        "nova versao roupas":     "10808886000158",
        "off store":              "pessoal@alcancejeans.com",
        "patacho":                "38544161000119",
        "patachosn":              "38544161000119",
        "yunire":                 "e.yunire@gmail.com",
        "zeros confec":           "45180025000152",
        "zeros confeccoes":       "45180025000152"
    };
    function norm(s){
        return String(s||"").toLowerCase().trim()
            .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    }
    var map = {};
    for (var k in raw) map[norm(k)] = raw[k];
    return {
        get: function(nome){ return map[norm(nome)] || ""; },
        norm: norm
    };
})();
