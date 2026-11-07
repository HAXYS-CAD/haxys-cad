// IA na nuvem (caminho B): o laço das ferramentas roda aqui na página. A Function /api/ia-nuvem
// só repassa cada pedido ao Gemini (com a chave do dono) e conta o uso. As ferramentas, as descrições
// e o texto de cada resposta são os mesmos da ponte (ponte/ferramentas.mjs); cada chamada vira o
// "atender" da tela (app/src/ui/ponte.ts), o mesmo que a ponte usa no PC.
import { FERRAMENTAS, textoDaFerramenta } from "../../../ponte/ferramentas.mjs";
import { TEXTOS } from "../../../nuvem/logica.mjs";

export type Atender = (
  p: { tipo: "passos"; passos: unknown[] } | { tipo: "estado" } | { tipo: "captura"; enquadrar?: boolean },
) => Promise<Record<string, unknown>>;

interface Mensagem {
  role: string;
  content?: string | null | unknown[];
  tool_calls?: { id: string; function: { name: string; arguments?: string } }[];
  [k: string]: unknown;
}

const FERRAMENTAS_IA = FERRAMENTAS.filter((t) => t.name !== "abrir_haxys").map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.inputSchema },
}));

async function chamarFerramenta(nome: string, argumentos: string | undefined, atender: Atender) {
  if (nome !== "construir" && nome !== "estado_do_projeto" && nome !== "ver_tela") return { texto: `ERRO: Ferramenta "${nome}" não existe.` };
  try {
    const args = JSON.parse(argumentos || "{}") as { passos?: unknown; enquadrar?: boolean };
    if (nome === "construir" && (!Array.isArray(args.passos) || !args.passos.length)) return { texto: 'ERRO: Mande "passos": uma lista de ações.' };
    const r = await atender(
      nome === "construir" ? { tipo: "passos", passos: args.passos as unknown[] } : nome === "estado_do_projeto" ? { tipo: "estado" } : { tipo: "captura", enquadrar: args.enquadrar !== false },
    );
    const t = textoDaFerramenta(nome, r);
    return { texto: t.erro ? `ERRO: ${t.texto}` : t.texto || "(feito)", imagem: t.imagem };
  } catch (e) {
    return { texto: `ERRO: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Mesmo laço de conversarComChave (app/vite.config.ts): até 20 voltas.
export async function conversarNaNuvem(pedido: string, imagens: { tipo: string; base64: string }[], atender: Atender, aviso: (t: string) => void): Promise<string> {
  const conteudo = imagens.length ? [{ type: "text", text: pedido }, ...imagens.map((im) => ({ type: "image_url", image_url: { url: `data:${im.tipo};base64,${im.base64}` } }))] : pedido;
  const msgs: Mensagem[] = [{ role: "user", content: conteudo }];
  const fotosDaTela: Mensagem[] = [];
  let avisouLeve = false;
  for (let volta = 0; volta < 20; volta++) {
    let r: Response;
    try {
      r = await fetch("/api/ia-nuvem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: msgs, tools: FERRAMENTAS_IA }) });
    } catch {
      throw new Error("Sem internet: a IA não respondeu. Tente de novo.");
    }
    const j = (await r.json().catch(() => null)) as { erro?: string; choices?: { message?: Mensagem }[] } | null;
    if (!r.ok) throw new Error(j?.erro ?? `A IA respondeu com erro ${r.status}.`);
    if (r.headers.get("x-haxys-modelo") === "lite" && !avisouLeve) (avisouLeve = true), aviso(TEXTOS.leve);
    const m = j?.choices?.[0]?.message;
    if (!m) throw new Error("A IA mandou uma resposta vazia.");
    msgs.push(m);
    if (!m.tool_calls?.length) return String(m.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "(a IA não escreveu resposta)";
    const novas: string[] = [];
    for (const t of m.tool_calls) {
      const res = await chamarFerramenta(t.function.name, t.function.arguments, atender);
      msgs.push({ role: "tool", tool_call_id: t.id, content: res.texto });
      if (res.imagem) novas.push(res.imagem);
    }
    // A foto do ver_tela vai logo depois, como mensagem da pessoa (a resposta de ferramenta só leva texto).
    // Só a foto mais nova fica: as antigas viram texto, para cada pedido não crescer (cota e tamanho).
    if (novas.length) {
      for (const f of fotosDaTela) f.content = "(foto antiga da tela)";
      const foto: Mensagem = { role: "user", content: [{ type: "text", text: "Foto da tela do HAXYS CAD (ver_tela):" }, { type: "image_url", image_url: { url: `data:image/png;base64,${novas.at(-1)}` } }] };
      fotosDaTela.push(foto);
      msgs.push(foto);
    }
  }
  return "Parei depois de 20 passos sem terminar. Veja a peça e peça para continuar.";
}
