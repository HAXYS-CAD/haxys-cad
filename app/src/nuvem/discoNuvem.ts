// Peças na nuvem (caminho B): mesmas funções do arquivo/disco.ts, sem o servidor do PC.
// Grava primeiro no aparelho (IndexedDB "haxys-cad", store "pecas") e depois sobe para
// /api/nuvem/pecas (nuvem/functions). Sem internet a peça fica marcada "a enviar" e sobe
// em enviarPendentes() (ao abrir a página e quando a internet volta; ver main.ts).
import { LIMITES_PECA, TEXTOS, nomeSeguro } from "../../../nuvem/logica.mjs";
import type { ProjetoNaPasta } from "../arquivo/disco";

interface PecaLocal {
  nome: string;
  texto: string;
  salvoEm: string; // ISO
  enviado: boolean;
  imagem?: Blob;
  marca: number; // muda a cada gravação: o envio só marca "enviado" se a peça não mudou no meio
}

const ROTA = "/api/nuvem/pecas";
const ESPERA = 15_000; // sem resposta em 15 s = sem internet

// Mesmo nome que a nuvem e o PC dão (nomeSeguro recebe o nome como vem no endereço).
const nomeFinal = (nome: string) => nomeSeguro(encodeURIComponent(nome));
const enderecoDe = (nome: string) => `${ROTA}/${encodeURIComponent(nome)}`;

// ---- IndexedDB ----
let banco: Promise<IDBDatabase> | null = null;
function abrirBanco() {
  banco ??= new Promise((ok, falha) => {
    const r = indexedDB.open("haxys-cad", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("pecas", { keyPath: "nome" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ((banco = null), falha(new Error("o navegador não deixou guardar no aparelho")));
  });
  return banco;
}
async function loja<T>(modo: IDBTransactionMode, fazer: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const t = (await abrirBanco()).transaction("pecas", modo);
  const pedido = fazer(t.objectStore("pecas"));
  return new Promise((ok, falha) => {
    t.oncomplete = () => ok(pedido?.result as T);
    t.onerror = t.onabort = () => falha(t.error ?? new Error("não deu para guardar no aparelho"));
  });
}
const lerLocal = (nome: string) => loja<PecaLocal | undefined>("readonly", (s) => s.get(nome));
const todasLocais = () => loja<PecaLocal[]>("readonly", (s) => s.getAll());
const gravarLocal = (p: PecaLocal) => loja<void>("readwrite", (s) => void s.put(p));

// ---- Envio para a nuvem ----
// true = subiu; false = sem internet (tenta de novo depois). Erro = a nuvem recusou (não adianta repetir).
async function enviarJa(nome: string): Promise<boolean> {
  const p = await lerLocal(nome);
  if (!p || p.enviado) return true;
  const sinal = AbortSignal.timeout(ESPERA);
  try {
    const r = await fetch(enderecoDe(nome), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto: p.texto, salvoEm: p.salvoEm }), signal: sinal });
    if (r.status >= 500) return false;
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? `a nuvem respondeu ${r.status}`);
    // Imagem que a nuvem recusa (grande demais) não impede a peça de subir.
    if (p.imagem) await fetch(`${enderecoDe(nome)}/imagem`, { method: "PUT", body: p.imagem, signal: sinal });
  } catch (e) {
    if (e instanceof TypeError || (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError"))) return false;
    throw e;
  }
  const agora = await lerLocal(nome);
  if (agora && agora.marca === p.marca) await gravarLocal({ ...agora, enviado: true });
  return true;
}
// Um envio por peça de cada vez (salvar e a imagem logo depois não se atropelam).
const filas = new Map<string, Promise<unknown>>();
function enviar(nome: string): Promise<boolean> {
  const r = (filas.get(nome) ?? Promise.resolve()).catch(() => {}).then(() => enviarJa(nome));
  filas.set(nome, r);
  return r;
}

// Sobe as peças "a enviar"; devolve quantas subiram.
export async function enviarPendentes(): Promise<number> {
  let n = 0;
  for (const p of await todasLocais().catch(() => [])) {
    if (p.enviado) continue;
    if (await enviar(p.nome).catch(() => false)) n++;
  }
  return n;
}

// ---- Mesmas funções do disco.ts ----

export async function gravarNaPasta(nome: string, texto: string): Promise<{ arquivo: string; nome: string }> {
  const n = nomeFinal(nome);
  if (!n) throw new Error("Nome inválido");
  const antes = await lerLocal(n);
  await gravarLocal({ nome: n, texto, salvoEm: new Date().toISOString(), enviado: false, imagem: antes?.imagem, marca: Math.random() });
  let subiu: boolean;
  try {
    subiu = await enviar(n);
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)} (ficou só no celular)`, { cause: e });
  }
  return { arquivo: subiu ? TEXTOS.salvo : TEXTOS.semInternet, nome: n };
}

// Imagens do aparelho viram endereços blob: (a janela Abrir mostra antes de subir).
const imagensLocais = new Map<string, string>();
function lembrarImagem(nome: string, png?: Blob) {
  const velha = imagensLocais.get(nome);
  if (velha) URL.revokeObjectURL(velha);
  if (png) imagensLocais.set(nome, URL.createObjectURL(png));
  else imagensLocais.delete(nome);
}

// A nuvem aceita imagem até LIMITES_PECA.imagem: diminui a foto até caber (360 px dá ~100 KB).
async function caber(png: Blob): Promise<Blob> {
  const img = await createImageBitmap(png);
  for (let k = 0.8; png.size > LIMITES_PECA.imagem && k > 0.2; k -= 0.2) {
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    png = (await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"))) ?? png;
  }
  img.close();
  return png;
}

export async function gravarImagemProjeto(nome: string, png: Blob) {
  const n = nomeFinal(nome);
  const p = await lerLocal(n);
  if (!p) return;
  png = await caber(png);
  await gravarLocal({ ...p, imagem: png, enviado: false, marca: Math.random() });
  lembrarImagem(n, png);
  await enviar(n);
}

export const urlImagemProjeto = (nome: string, versao = "") => imagensLocais.get(nome) ?? `${enderecoDe(nome)}/imagem?v=${encodeURIComponent(versao)}`;

// Junta as peças do aparelho com as da nuvem (a nuvem traz as de outro aparelho do mesmo convite).
export async function listarProjetos(): Promise<{ pasta: string; projetos: ProjetoNaPasta[] }> {
  const locais = await todasLocais().catch(() => []);
  let daNuvem: ProjetoNaPasta[] = [];
  try {
    const r = await fetch(ROTA, { cache: "no-store", signal: AbortSignal.timeout(ESPERA) });
    if (r.ok) daNuvem = ((await r.json()) as { pecas: ProjetoNaPasta[] }).pecas;
  } catch {
    /* sem internet: só as do aparelho */
  }
  const todas = new Map<string, ProjetoNaPasta>();
  for (const p of [...locais, ...daNuvem]) {
    const ja = todas.get(p.nome);
    if (!ja || p.salvoEm > ja.salvoEm) todas.set(p.nome, { nome: p.nome, salvoEm: p.salvoEm });
  }
  for (const p of locais) lembrarImagem(p.nome, p.imagem);
  return { pasta: "neste aparelho e na nuvem", projetos: [...todas.values()].sort((a, b) => b.salvoEm.localeCompare(a.salvoEm)) };
}

// Peça ainda não enviada: a do aparelho. Senão a da nuvem (pode ser mais nova, de outro aparelho);
// sem internet, a cópia do aparelho.
export async function lerDaPasta(nome: string): Promise<string> {
  const p = await lerLocal(nome).catch(() => undefined);
  if (p && !p.enviado) return p.texto;
  try {
    const r = await fetch(enderecoDe(nome), { cache: "no-store", signal: AbortSignal.timeout(ESPERA) });
    if (r.ok) {
      const texto = await r.text();
      if (!p || p.texto !== texto) await gravarLocal({ nome, texto, salvoEm: new Date().toISOString(), enviado: true, imagem: p?.imagem, marca: Math.random() }).catch(() => {});
      return texto;
    }
  } catch {
    /* sem internet */
  }
  if (p) return p.texto;
  throw new Error(`o projeto "${nome}" não abriu`);
}

// Na nuvem a exportação não grava em pasta: o arquivo já é baixado (baixarNoCelular).
export async function gravarExportacao(_dados: ArrayBuffer, nome: string, extensao: string): Promise<string> {
  return nome + extensao;
}

