// Imprimir 3D (Bambu): gera o 3MF dos corpos (um objeto por corpo, Z para
// cima, cada um apoiado na mesa), grava em HAXYS_CAD\saida e abre no Bambu
// Studio, onde a pessoa escolhe filamento, fatia e manda imprimir.
// A impressora vem da lista do próprio Bambu Studio (perfis instalados): o
// conjunto vai para o meio da área do bico escolhido e o HAXYS CAD avisa se não
// couber. "Deitar" apoia cada sólido na sua maior face plana. A escolha fica
// guardada neste navegador (padrão: Bambu Lab H2C, bico esquerdo).
// Precisa do serviço local do Vite (app/vite.config.ts); sem ele, o arquivo
// é baixado para a pasta Downloads (na mesa padrão 256 × 256).
// Diferença do Fusion: o Fusion manda pelo "Imprimir 3D" para o fatiador
// escolhido; aqui é sempre o Bambu Studio. Mandar direto para a impressora
// (sem abrir o Bambu Studio) precisaria do código de acesso dela: fica para
// a pessoa fazer no Bambu Studio.
import { abrirDialogo } from "../ui/dialogo";
import type { Projeto } from "../nucleo/projeto";
import type { OpcoesExportar } from "../nucleo/tipos";

export const COMANDO_IMPRIMIR = "Print3DCommand";

type Area = [number, number, number, number];
export interface Impressora {
  nome: string;
  area: Area;
  altura: number;
  bicos?: { area: Area; altura: number }[];
}
interface InfoBambu {
  instalado: boolean;
  suite: boolean;
  impressoras: Impressora[];
}

export async function infoBambu(): Promise<InfoBambu | null> {
  try {
    const r = await fetch("/api/bambu");
    if (!r.ok) return null;
    const j = await r.json();
    return { instalado: j.instalado === true, suite: j.suite === true, impressoras: Array.isArray(j.impressoras) ? j.impressoras : [] };
  } catch {
    return null; // sem o serviço local
  }
}

// ---- Preferências (impressora, bico, deitar) ----
interface Preferencias {
  impressora: string;
  bico: "esquerdo" | "direito" | "dois";
  deitar: boolean;
}
const PADRAO: Preferencias = { impressora: "Bambu Lab H2C", bico: "esquerdo", deitar: true };
export function preferencias(): Preferencias {
  try {
    return { ...PADRAO, ...JSON.parse(localStorage.getItem("haxys.impressao") ?? "{}") };
  } catch {
    return PADRAO;
  }
}
function guardar(p: Preferencias) {
  try {
    localStorage.setItem("haxys.impressao", JSON.stringify(p));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

// Área e altura onde o bico escolhido alcança. "dois" = onde os dois alcançam.
export function mesaDe(imp: Impressora, bico: Preferencias["bico"]): NonNullable<OpcoesExportar["mesa"]> {
  const b = imp.bicos;
  const cama: [number, number] = [imp.area[2] - imp.area[0], imp.area[3] - imp.area[1]];
  if (!b || b.length < 2) return { area: imp.area, altura: imp.altura, cama };
  if (bico === "esquerdo") return { area: b[0].area, altura: b[0].altura, cama };
  if (bico === "direito") return { area: b[1].area, altura: b[1].altura, cama };
  return {
    cama,
    area: [Math.max(b[0].area[0], b[1].area[0]), Math.max(b[0].area[1], b[1].area[1]), Math.min(b[0].area[2], b[1].area[2]), Math.min(b[0].area[3], b[1].area[3])],
    altura: Math.min(b[0].altura, b[1].altura),
  };
}

// Mesa das preferências guardadas (usada também pela IA e pelo console).
export async function mesaEscolhida(): Promise<{ mesa?: OpcoesExportar["mesa"]; deitar: boolean; nome?: string }> {
  const pref = preferencias();
  const imp = (await infoBambu())?.impressoras.find((i) => i.nome === pref.impressora);
  return { mesa: imp && mesaDe(imp, pref.bico), deitar: pref.deitar, nome: imp?.nome };
}

export async function enviarAoBambu(
  projeto: Projeto,
  corpos: string[],
  nome: string,
  qualidade: "baixa" | "media" | "alta" = "media",
  extra?: { mesa?: OpcoesExportar["mesa"]; deitar?: boolean; nome?: string },
): Promise<string> {
  const { mesa, deitar, nome: impressora } = extra ?? (await mesaEscolhida());
  const dados = await projeto.exportar({ formato: "3mf", corpos, qualidade, zParaCima: true, mesa, deitar });
  const aviso = projeto.avisoExportacao ? ` ${projeto.avisoExportacao}` : "";
  try {
    const r = await fetch("/api/bambu", { method: "POST", headers: { "x-nome": encodeURIComponent(nome), "x-impressora": encodeURIComponent(impressora ?? "") }, body: dados });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro ?? `erro ${r.status}`);
    const mesas = j.erroMesas && j.erroMesas !== "sem impressora" ? ` Mesas não montadas: ${j.erroMesas}.` : "";
    return (j.aberto ? `Aberto no Bambu Studio: ${j.arquivo}.` : `Gravado em ${j.arquivo} (${j.erro ?? "Bambu Studio não abriu"}).`) + aviso + mesas;
  } catch (e) {
    if (e instanceof TypeError || e instanceof SyntaxError) {
      // Sem o serviço local: baixa o arquivo.
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([dados], { type: "model/3mf" }));
      a.download = `${nome}.3mf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return `Baixado: ${nome}.3mf (abra no Bambu Studio).${aviso}`;
    }
    throw e;
  }
}

export async function comandoImprimir(raiz: HTMLElement, projeto: Projeto, visiveis: string[], nomeProjeto: string, avisar: (t: string) => void) {
  if (!visiveis.length) return avisar("Não há corpo visível para imprimir.");
  const info = await infoBambu();
  const pref = preferencias();
  const lista = info?.impressoras ?? [];
  const imp = lista.find((i) => i.nome === pref.impressora) ?? lista[0];
  abrirDialogo(raiz, {
    titulo: "Imprimir 3D (Bambu Studio)",
    campos: [],
    modo: "novo",
    semModo: true,
    selecao: info === null ? "Sem o serviço local: o 3MF será baixado" : info.instalado ? "Bambu Studio encontrado" : "Bambu Studio não encontrado: o 3MF fica na pasta saida",
    rotuloSelecao: "Destino",
    escolhas: [
      ...(lista.length
        ? [{ chave: "impressora", rotulo: "Impressora", opcoes: lista.map((i) => [i.nome, `${i.nome.replace("Bambu Lab ", "")} (${i.area[2] - i.area[0]} × ${i.area[3] - i.area[1]} × ${i.altura} mm)`] as [string, string]), valor: imp?.nome ?? "" }]
        : []),
      { chave: "bico", rotulo: "Bico (H2C/H2D)", opcoes: [["esquerdo", "Esquerdo"], ["direito", "Direito"], ["dois", "Os dois (várias cores/materiais)"]], valor: pref.bico },
      { chave: "deitar", rotulo: "Posição", opcoes: [["sim", "Deitar na maior face plana (recomendado)"], ["nao", "Como está na tela"]], valor: pref.deitar ? "sim" : "nao" },
      { chave: "corpos", rotulo: "Corpos", opcoes: [["*", `Todos visíveis (${visiveis.length})`], ...visiveis.map((n) => [n, n] as [string, string])], valor: "*" },
      { chave: "qualidade", rotulo: "Qualidade da malha", opcoes: [["media", "Média"], ["alta", "Alta"], ["baixa", "Baixa"]], valor: "media" },
    ],
    aoMudar: () => {},
    aoCancelar: () => {},
    aoOK: async (_v, _m, esc) => {
      const escolhida = lista.find((i) => i.nome === esc.impressora);
      const nova: Preferencias = { impressora: escolhida?.nome ?? pref.impressora, bico: esc.bico as Preferencias["bico"], deitar: esc.deitar === "sim" };
      guardar(nova);
      avisar("Gerando o 3MF…");
      try {
        const corpos = esc.corpos === "*" ? visiveis : [esc.corpos];
        const mesa = escolhida && mesaDe(escolhida, nova.bico);
        avisar(await enviarAoBambu(projeto, corpos, corpos.length === 1 ? `${nomeProjeto} - ${corpos[0]}` : nomeProjeto, esc.qualidade as "media", { mesa, deitar: nova.deitar, nome: escolhida?.nome }));
      } catch (e) {
        avisar(`Não foi possível: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  });
}
