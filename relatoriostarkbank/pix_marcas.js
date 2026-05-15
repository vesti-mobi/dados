// Chaves PIX das marcas (fonte: planilha "PIX Starkbank.xlsx" — aba Página1).
// Gerado casando o CNPJ da planilha com cnpj_marcas.js (nomeFantasia do dashboard).
// Atualize re-rodando o gerador quando a planilha mudar.
// Match feito pelo nomeFantasia (lowercase, trim, sem acento).
window.PIX_MARCAS = (function(){
    var raw = {
        "alcance jeans":        "pessoal@alcancejeans.com",
        "kelly rodrigues":      "54697378000115",
        "anne blanc":           "43865993000177",
        "bella donna":          "+5511933990994",
        "petit enfant":         "60741324000102",
        "barraca do willinha":  "35322340000113",
        "kalli":                "49345891000107",
        "groovy forever":       "financeiro@groovyforever.com.br",
        "yunire":               "e.yunire@gmail.com",
        "nova versao roupas":   "10808886000158",
        "ezee":                 "28314192000120",
        "incentive":            "29780242000127",
        "naos sport":           "41549988000120",
        "tee fashion":          "24459412000152",
        "zeros confeccoes":     "45180025000152",
        "sedanbi":              "39922297000188",
        "missmel":              "17974887000111",
        "oxigenio modas":       "54911296000121",
        "vistamy jeans":        "24680354000192",
        "nicky atacado":        "44839916000105",
        "nono modas":           "34329403000109",
        "erilluz jeans":        "32796225000192",
        "patacho":              "38544161000119",
        "maria lima":           "21721042000434",
        "imporio fitness":      "38280852000152",
        "kauly":                "fabriciopais@yahoo.com.br",
        "evian":                "+5511995671787",
        "coinage":              "54493334000173",
        "lesto":                "58418377000145",
        "ohvely":               "23103066000102",
        "elice":                "38147272000191",
        "jilem modas":          "45860676000193",
        "gissary modas":        "52337840000148",
        "life activewear":      "52602995000164",
        "carmila":              "08482963000180",
        "izzat jeans":          "+5511999768315",
        "desativo":             "54211529000183"
    };
    function norm(s){
        return String(s||"").toLowerCase().trim()
            .normalize("NFD").replace(/[̀-ͯ]/g,"");
    }
    var map = {};
    for (var k in raw) map[norm(k)] = raw[k];
    return {
        get: function(nome){ return map[norm(nome)] || ""; },
        norm: norm
    };
})();
