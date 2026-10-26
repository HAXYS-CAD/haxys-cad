// Ler e gravar arquivos, sempre pelo servidor local (funciona em qualquer navegador e no
// painel do chat, onde a janela de arquivos do Windows é bloqueada).
// Projetos: HAXYS_CAD/projetos (/api/projetos). Exportações: HAXYS_CAD/saida (/api/exportar).
// "Outro arquivo do computador": janela de escolher arquivo (só leitura).
import { EXTENSAO } from "./formato";

function nomeSemExtensao(nome: string) {
  return nome.endsWith(EXTENSAO) ? nome.slice(0, -EXTENSAO.length) : nome;
}

// Grava a exportação (stl, step, 3mf) em HAXYS_CAD/saida; devolve o caminho completo.
export async function gravarExportacao(dados: ArrayBuffer, nome: string, extensao: string): Promise<string> {
  const { arquivo } = await pedir<{ arquivo: string }>(`/api/exportar/${encodeURIComponent(nome + extensao)}`, { method: "POST", body: dados });
  return arquivo;
}

export interface ProjetoNaPasta {
  nome: string;
  salvoEm: string; // ISO
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `o servidor respondeu ${r.status}`);
  return j as T;
}

// Imagem do projeto (projetos/.miniaturas). "versao" evita mostrar a imagem antiga.
export const urlImagemProjeto = (nome: string, versao = "") => `/api/projetos/${encodeURIComponent(nome)}/imagem?v=${encodeURIComponent(versao)}`;
export async function gravarImagemProjeto(nome: string, png: Blob) {
  await pedir(`/api/projetos/${encodeURIComponent(nome)}/imagem`, { method: "POST", body: png });
}

export const listarProjetos =() => pedir<{ pasta: string; projetos: ProjetoNaPasta[] }>("/api/projetos");

export async function lerDaPasta(nome: string): Promise<string> {
  const r = await fetch(`/api/projetos/${encodeURIComponent(nome)}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? `o projeto "${nome}" não abriu`);
  return r.text();
}

// Grava em HAXYS_CAD/projetos; devolve o caminho e o nome final (o servidor troca caracteres proibidos).
export async function gravarNaPasta(nome: string, texto: string): Promise<{ arquivo: string; nome: string }> {
  const { arquivo } = await pedir<{ arquivo: string }>(`/api/projetos/${encodeURIComponent(nome)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: texto,
  });
  return { arquivo, nome: nomeSemExtensao(arquivo.split(/[\\/]/).pop() ?? nome) };
}

// Sem filtro: a janela do Windows mostra todos os arquivos (projetos do
// HAXYS CAD, STEP, STL, OBJ e também os do Fusion, para avisar o que fazer).
export function lerDoComputador(): Promise<File | null> {
  return new Promise((resolver) => {
    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.className = "entrada-arquivo";
    entrada.addEventListener("change", () => {
      const f = entrada.files?.[0];
      entrada.remove();
      resolver(f ?? null);
    });
    entrada.addEventListener("cancel", () => (entrada.remove(), resolver(null)));
    document.body.appendChild(entrada);
    entrada.click();
  });
}
