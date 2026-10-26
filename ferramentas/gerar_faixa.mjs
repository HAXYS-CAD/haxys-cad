// Lê referencias/mapa_projeto_resumo.txt e grava app/src/dados/faixa.json.
// Recuo do arquivo: 4 espaços = ferramenta do painel, 8 = item de submenu.
// "*" marca a ferramenta que fica visível na faixa sem abrir o menu.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "referencias", "mapa_projeto_resumo.txt");
const destino = join(raiz, "app", "src", "dados", "faixa.json");

const abas = [];
let aba = null;
let painel = null;
let submenu = null;

for (const linha of readFileSync(origem, "utf8").split(/\r?\n/)) {
  const mAba = linha.match(/^## ABA (.+?)\s+\[(\w+)\]/);
  if (mAba) {
    aba = { nome: mAba[1], id: mAba[2], paineis: [] };
    abas.push(aba);
    continue;
  }
  const mPainel = linha.match(/^  # PAINEL (.+?)\s+\[(\w+)\]/);
  if (mPainel && aba) {
    painel = { nome: mPainel[1], id: mPainel[2], ferramentas: [] };
    aba.paineis.push(painel);
    submenu = null;
    continue;
  }
  const mItem = linha.match(/^( +)(\* )?(.+?)\s+\[([^\]]+)\]\s*$/);
  if (!mItem || !painel) continue;
  const recuo = mItem[1].length + (mItem[2] ? 0 : -2);
  const item = { nome: mItem[3], id: mItem[4], destaque: Boolean(mItem[2]) };
  if (recuo >= 8 && submenu) {
    submenu.itens.push(item);
  } else if (item.nome === "?") {
    submenu = { ...item, itens: [] };
    painel.ferramentas.push(submenu);
  } else {
    submenu = null;
    painel.ferramentas.push(item);
  }
}

for (const a of abas) a.paineis = a.paineis.filter((p) => p.ferramentas.length > 0);

mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, JSON.stringify(abas, null, 1), "utf8");
console.log(`${abas.length} abas gravadas em ${destino}`);
