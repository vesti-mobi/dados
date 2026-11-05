/**
 * explorar_reunioes.js — que campos o HubSpot guarda numa reunião?
 *
 * Pedido da Laura em 05/11/2026: "sempre que tivesse reuniões mostrasse o
 * tipo da reunião; quantas delas foram presenciais". O fetch pede hoje só
 * título, data, dono, resultado e corpo — o tipo não vem.
 *
 * Este script só OLHA: lista as propriedades do objeto `meetings` e, para as
 * que são de enumeração, os valores possíveis. É assim que se descobre qual
 * campo guarda "Presencial" sem adivinhar nome de propriedade.
 *
 * O LOG DO ACTIONS É PÚBLICO. Aqui saem nomes de campo e opções de
 * configuração do CRM — nunca o conteúdo de uma reunião, nem nome de marca.
 *
 * Roda no workflow "Conferir BigQuery" com modo=reunioes.
 */

const TOKEN = process.env.HUBSPOT_TOKEN;

async function hs(url) {
  const r = await fetch('https://api.hubapi.com' + url, {
    headers: { Authorization: 'Bearer ' + TOKEN },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + url);
  return r.json();
}

(async () => {
  if (!TOKEN) { console.log('sem HUBSPOT_TOKEN'); return; }

  const { results } = await hs('/crm/v3/properties/meetings');
  console.log('PROPRIEDADES DE MEETINGS: ' + results.length + '\n');

  /* Primeiro as que têm cara de tipo/local, que é o que a pergunta pede. */
  const interessa = results.filter(p =>
    /type|tipo|local|location|presenc|modalidade|format/i.test(p.name + ' ' + (p.label || '')));
  console.log('--- com cara de TIPO ou LOCAL ---');
  for (const p of interessa) {
    console.log('  ' + p.name + '  [' + p.type + ']  "' + (p.label || '') + '"');
    if (p.options && p.options.length) {
      console.log('      opções: ' + p.options.map(o => o.label + ' (' + o.value + ')').join(' · '));
    }
  }

  console.log('\n--- todas as outras, só nome e tipo ---');
  for (const p of results) {
    if (interessa.includes(p)) continue;
    console.log('  ' + p.name + '  [' + p.type + ']');
  }
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
