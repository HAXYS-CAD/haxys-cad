// Comandos falados (ou digitados) em português, sem internet: a frase vira um
// script da API "haxys". Ex.: "faça uma caixa de 40 por 30 por 20",
// "cilindro de diâmetro 10 e altura 25", "fure com 6 milímetros",
// "arredonde as arestas com raio 2", "mude a altura para 30", "desfazer",
// "qual o volume", "mande para a impressora".
// Para pedidos livres ("faça um suporte de prateleira") use o modo Claude.

export interface Interpretacao {
  script: string;
  resposta: string; // o que falar (se o script devolver texto, fala o texto)
}

const PALAVRAS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100,
  duzentos: 200, trezentos: 300, meio: 0.5, meia: 0.5,
};

// Minúsculas, sem acento, números por extenso viram dígitos ("vinte e cinco" → 25).
export function normalizar(frase: string): string {
  let t = frase.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  t = t.replace(/(\d),(\d)/g, "$1.$2").replace(/[!?;:]/g, " ");
  const palavras = t.split(/\s+/).filter(Boolean);
  const saida: string[] = [];
  for (let i = 0; i < palavras.length; i++) {
    const w = palavras[i];
    if (PALAVRAS[w] !== undefined && !(w === "um" || w === "uma") ) {
      let v = PALAVRAS[w];
      // "vinte e cinco", "cento e vinte e dois"
      while (palavras[i + 1] === "e" && PALAVRAS[palavras[i + 2]] !== undefined && PALAVRAS[palavras[i + 2]] < v) {
        v += PALAVRAS[palavras[i + 2]];
        i += 2;
      }
      saida.push(String(v));
    } else if ((w === "um" || w === "uma") && /^(mm|milimetros?|centimetros?|cm|por)$/.test(palavras[i + 1] ?? "")) saida.push("1");
    else saida.push(w);
  }
  return saida.join(" ");
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const numeros = (t: string) => [...t.matchAll(new RegExp(NUM, "g"))].map((m) => +m[1]);
// "altura de 20", "altura 20", "20 de altura"
function medida(t: string, nomes: string): number | undefined {
  const a = new RegExp(String.raw`(?:${nomes})\s*(?:de|com|=|igual a|para)?\s*${NUM}`).exec(t);
  if (a) return +a[1];
  const b = new RegExp(String.raw`${NUM}\s*(?:mm|milimetros?)?\s*(?:de\s+)?(?:${nomes})`).exec(t);
  return b ? +b[1] : undefined;
}
const escala = (t: string) => (/\b(cm|centimetros?)\b/.test(t) ? 10 : /\b(metros?)\b/.test(t) && !/milimetro/.test(t) ? 1000 : 1);
function posicao(t: string): string {
  const p: string[] = [];
  for (const e of ["x", "y", "z"]) {
    const m = new RegExp(String.raw`\b${e}\s*(?:=|de|em)?\s*${NUM}`).exec(t);
    if (m) p.push(`${e}: ${+m[1]}`);
  }
  return p.length ? ", " + p.join(", ") : "";
}
const ehOperacao = (t: string) => /\b(cort|subtra|tir|remov)/.test(t) ? `, modo: "cortar"` : /\b(junt|un[ae]|some|soma)/.test(t) ? `, modo: "unir"` : "";

export function interpretar(frase: string): Interpretacao | null {
  const t = normalizar(frase);
  if (!t.trim()) return null;
  const k = escala(t);
  const n = numeros(t).map((v) => v * k);

  if (/\bdesfa[zcç]|\bvolt[ae] (atras|um passo)/.test(t)) return { script: "haxys.desfazer();", resposta: "Desfeito." };
  if (/\brefa[zcç]/.test(t)) return { script: "haxys.refazer();", resposta: "Refeito." };
  if (/(imprim|impressora|bambu)/.test(t))
    return { script: "return await haxys.imprimir();", resposta: "Mandei para o Bambu Studio." };
  if (/(apag|remov|exclu|delet).*(ultim|isso)/.test(t))
    return {
      script: "const o = haxys.operacoes().filter((x) => x.tipo !== 'parametros').at(-1); if (!o) return 'Não há o que apagar.'; await haxys.remover(o.nome); return `Apaguei ${o.nome}.`;",
      resposta: "Apagado.",
    };
  if (/(volume|peso|massa|propriedad|tamanho|medidas? d[ao])/.test(t))
    return {
      script:
        "const c = haxys.ultimoCorpo(); if (!c) return 'Não há corpo.'; const p = await haxys.propriedades(c); const v = p.find((l) => l.startsWith('Volume')); const m = p.find((l) => l.startsWith('Massa')); const t = haxys.caixaDe(c).tamanho.map((x) => x.toLocaleString('pt-BR')).join(' por '); return `${c}: ${t} milímetros. ${v ?? ''}. ${m ?? ''}.`;",
      resposta: "",
    };
  // Mudar uma medida da última operação que tem essa medida.
  const mudar = /(mud|alter|troqu|troca|aument|diminu|coloc|deix)/.test(t) && /(altura|largura|comprimento|diametro|raio|distancia)/.exec(t);
  if (mudar && n.length) {
    const chave = mudar[1];
    const valor = chave === "raio" && !/arredond|filete/.test(t) ? null : n[n.length - 1];
    const ch = valor === null ? "diametro" : chave;
    const v = valor === null ? n[n.length - 1] * 2 : valor;
    return {
      script: `const o = haxys.operacoes().filter((x) => '${ch}' in x.params && x.modo !== 'cortar').at(-1) ?? haxys.operacoes().filter((x) => '${ch}' in x.params).at(-1); if (!o) return 'Não achei uma operação com ${ch}.'; await haxys.mudar(o.nome, '${ch}', ${v}); return \`\${o.nome}: ${ch} = ${v.toLocaleString("pt-BR")}.\`;`,
      resposta: "",
    };
  }
  if (/(arredond|filete|bord(a|as) redond)/.test(t)) {
    const r = medida(t, "raio") ?? n[0] ?? 2;
    return { script: `await haxys.arredondar(${r});`, resposta: `Arredondei as arestas com raio ${r.toLocaleString("pt-BR")}.` };
  }
  if (/chanfr/.test(t)) {
    const d = medida(t, "distancia|tamanho") ?? n[0] ?? 1;
    return { script: `await haxys.chanfrar(${d});`, resposta: `Chanfrei as arestas com ${d.toLocaleString("pt-BR")} milímetros.` };
  }
  if (/\b(fur[eoa]|furar|buraco)/.test(t)) {
    const d = medida(t, "diametro") ?? (medida(t, "raio") !== undefined ? medida(t, "raio")! * 2 : n[0]);
    if (!d) return { script: "", resposta: "Qual o diâmetro do furo?" };
    const prof = medida(t, "profundidade|fundo");
    return {
      script: `await haxys.furo({ diametro: ${d}${prof ? `, profundidade: ${prof}` : ""}${posicao(t).replace(/^, /, ", ").replace(/y: [^,]+,? ?/, "")} });`,
      resposta: `Furo de ${d.toLocaleString("pt-BR")} milímetros feito.`,
    };
  }
  if (/\bcubo\b/.test(t)) {
    const l = n[0] ?? 20;
    return { script: `await haxys.caixa({ comprimento: ${l}, largura: ${l}, altura: ${l}${posicao(t)}${ehOperacao(t)} });`, resposta: `Cubo de ${l.toLocaleString("pt-BR")} criado.` };
  }
  if (/\b(caixa|bloco|placa|paralelepipedo|retangulo|chapa)\b/.test(t)) {
    const c = medida(t, "comprimento") , l = medida(t, "largura"), a = medida(t, "altura|espessura");
    const resto = n.filter((x) => ![c, l, a].includes(x));
    const [c2, l2, a2] = [c ?? resto.shift(), l ?? resto.shift(), a ?? resto.shift() ?? (/placa|chapa/.test(t) ? 3 : undefined)];
    const C = c2 ?? 20, L = l2 ?? C, A = a2 ?? L;
    return {
      script: `await haxys.caixa({ comprimento: ${C}, largura: ${L}, altura: ${A}${posicao(t)}${ehOperacao(t)} });`,
      resposta: `Caixa de ${C.toLocaleString("pt-BR")} por ${L.toLocaleString("pt-BR")} por ${A.toLocaleString("pt-BR")} criada.`,
    };
  }
  if (/\b(cilindro|pino|tubo|haste|disco)\b/.test(t)) {
    const r = medida(t, "raio");
    const d = medida(t, "diametro") ?? (r !== undefined ? r * 2 : undefined);
    const a = medida(t, "altura|comprimento|espessura");
    const resto = n.filter((x) => x !== d && x !== r && x !== a);
    const D = d ?? resto.shift() ?? 20, A = a ?? resto.shift() ?? (/disco/.test(t) ? 3 : 20);
    return {
      script: `await haxys.cilindro({ diametro: ${D}, altura: ${A}${posicao(t)}${ehOperacao(t)} });`,
      resposta: `Cilindro de diâmetro ${D.toLocaleString("pt-BR")} e altura ${A.toLocaleString("pt-BR")} criado.`,
    };
  }
  if (/\b(esfera|bola)\b/.test(t)) {
    const r = medida(t, "raio");
    const D = medida(t, "diametro") ?? (r !== undefined ? r * 2 : n[0] ?? 20);
    return { script: `await haxys.esfera({ diametro: ${D}${posicao(t)}${ehOperacao(t)} });`, resposta: `Esfera de diâmetro ${D.toLocaleString("pt-BR")} criada.` };
  }
  return null;
}

export const EXEMPLOS_VOZ = [
  "faça uma caixa de 40 por 30 por 20",
  "cilindro de diâmetro 10 e altura 25",
  "fure com 6 milímetros",
  "arredonde as arestas com raio 2",
  "mude a altura para 30",
  "qual o volume",
  "desfazer",
  "mande para a impressora",
];
