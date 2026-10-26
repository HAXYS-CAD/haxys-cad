// Referência de medidas (painel HAXYS): o marcador HAXYS de 40 mm e a régua
// para fotografar ao lado da peça (ver public/referencia/):
// - Tutorial: como tirar as fotos;
// - Folha para imprimir (SVG A4 em tamanho real, com linha de 100 mm para conferir);
// - Imprimir o bloco: 3MF de duas cores (moldura preta + miolo branco), aberto
//   no Bambu Studio (no Bambu Studio, aceite carregar como um objeto de várias partes).
import { abrirDialogo } from "../ui/dialogo";

export const COMANDO_REFERENCIA = "HaxysReferenciaCommand";

export function comandoReferencia(raiz: HTMLElement, avisar: (t: string) => void) {
  abrirDialogo(raiz, {
    titulo: "Referência de medidas",
    campos: [],
    escolhas: [
      {
        chave: "o",
        rotulo: "O que abrir",
        opcoes: [
          ["tutorial", "Tutorial: como tirar as fotos"],
          ["folha", "Folha para imprimir em papel (marcador + régua)"],
          ["bloco", "Bloco de referência na impressora 3D (Bambu Studio, 2 cores)"],
        ],
        valor: "tutorial",
      },
    ],
    modo: "novo",
    semModo: true,
    aoMudar: () => {},
    aoCancelar: () => {},
    aoOK: async (_v, _m, esc) => {
      if (esc.o === "tutorial") return void window.open("/referencia/tutorial.html", "_blank");
      if (esc.o === "folha") return void window.open("/referencia/folha-referencia.svg", "_blank");
      try {
        const dados = await (await fetch("/referencia/bloco-referencia-haxys.3mf")).arrayBuffer();
        const r = await fetch("/api/bambu", { method: "POST", headers: { "x-nome": encodeURIComponent("bloco-referencia-haxys") }, body: dados });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `erro ${r.status}`);
        avisar(j.aberto ? `Bloco aberto no Bambu Studio (${j.arquivo}). Use preto na moldura e branco no miolo.` : `Gravado em ${j.arquivo}.`);
      } catch (e) {
        avisar(`Não foi possível: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  });
}
