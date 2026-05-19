// Chaves PIX das marcas. FONTE PRIMARIA: aba "Contas" da planilha Google.
// FALLBACK: planilha "PIX Starkbank (1).xlsx". Atualize re-rodando _gen_pix_contas.py.
// Match feito pelo nomeFantasia (lowercase, trim, sem acento) ou CNPJ.
window.PIX_MARCAS = (function(){
    var raw = {
        "alcance jeans":          "pessoal@alcancejeans.com",
        "alcance jeans nova":     "pessoal@alcancejeans.com",
        "alcance jeans pr":       "pessoal@alcancejeans.com",
        "anne blanc":             "43865993000177",
        "arary":                  "13495868000151",
        "barraca do willinha":    "35322340000113",
        "be free":                "09121974000106",
        "begkids":                "44870711000192",
        "bella donna":            "+5511933990994",
        "bella donna varejo":     "+5511933990994",
        "carmila":                "08482963000180",
        "caronly":                "+5508127619442",
        "coinage":                "54493334000173",
        "erilluz jeans":          "32796225000192",
        "evian":                  "+5511995671787",
        "ezee":                   "moda.ezee4@gmail.com",
        "gissary":                "52337840000148",
        "gissary modas":          "52337840000148",
        "groovy":                 "financeiro@groovyforever.com.br",
        "groovy forever":         "financeiro@groovyforever.com.br",
        "imporio fitness":        "38280852000152",
        "incentive moda":         "29780242000127",
        "izzat jeans":            "+5511999768315",
        "jilem modas":            "45860676000193",
        "kaessi":                 "24091573000136",
        "kalli":                  "49345891000107",
        "kauly":                  "fabriciopais@yahoo.com.br",
        "kelly rodrigues":        "54697378000115",
        "life activewear":        "52602995000164",
        "mafia fitness":          "41549988000120",
        "maria lima":             "21721042000434",
        "maria lima santa cruz":  "21721042000434",
        "maria lima varejo":      "21721042000434",
        "missmel":                "17974887000111",
        "nasmah":                 "42339602000118",
        "nicky atacado":          "44839916000105",
        "nono modas":             "34329403000109",
        "nova versao":            "10808886000158",
        "nova versao roupas":     "10808886000158",
        "off store":              "pessoal@alcancejeans.com",
        "ohvely":                 "23103066000102",
        "oxigenio modas":         "54911296000121",
        "patacho":                "38544161000119",
        "patachosn":              "38544161000119",
        "petit enfant":           "60741324000102",
        "planet charm":           "45676252000173",
        "rcr clothing original":  "22924965000103",
        "sedanbi":                "39922297000188",
        "tee fashion":            "24459412000152",
        "vistamy":                "24680354000192",
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
