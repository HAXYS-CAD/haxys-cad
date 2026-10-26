// Arquivo 3MF (o formato que o Bambu Studio e outros fatiadores abrem):
// um ZIP com o modelo em XML. Cada corpo vira um objeto separado (com nome e
// cor), em milímetros, Z para cima. O ZIP é gravado sem compressão (simples
// e aceito por todos os leitores).
import type { Malha } from "./malhas";

// ---- ZIP sem compressão ----

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABELA_CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipArmazenado(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint32(14, crc, true);
    local.setUint32(18, a.dados.length, true);
    local.setUint32(22, a.dados.length, true);
    local.setUint16(26, nome.length, true);
    partes.push(new Uint8Array(local.buffer), nome, a.dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.dados.length, true);
    c.setUint32(24, a.dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), nome);
    pos += 30 + nome.length + a.dados.length;
  }
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, pos, true);
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(tudo.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of tudo) saida.set(x, o), (o += x.length);
  return saida;
}

// ---- 3MF ----

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const num = (v: number) => (Math.abs(v) < 5e-7 ? "0" : String(+v.toFixed(6)));

// Com "mesa" (1, 2, …) em algum objeto, o arquivo leva em que mesa vai cada peça
// (Metadata/model_settings.config, no formato do Bambu Studio). A janela do Bambu
// Studio não lê essas mesas sozinha (falta a configuração do projeto): quem monta
// o projeto com as mesas é app/bambuProjeto.ts.
export function gerar3MF(objetos: { nome: string; malha: Malha; cor?: string; mesa?: number }[]): Uint8Array {
  if (!objetos.length) throw new Error("Nenhum corpo para o 3MF");
  const comMesas = objetos.some((o) => o.mesa);
  const linhas: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    ' <metadata name="Application">HAXYS CAD</metadata>',
    " <resources>",
    '  <basematerials id="1">',
    ...objetos.map((o) => `   <base name="${esc(o.nome)}" displaycolor="${(o.cor ?? "#B0B4BA").toUpperCase()}FF" />`),
    "  </basematerials>",
  ];
  objetos.forEach((o, i) => {
    const { pos, tri } = o.malha;
    linhas.push(`  <object id="${i + 2}" name="${esc(o.nome)}" type="model" pid="1" pindex="${i}">`, "   <mesh>", "    <vertices>");
    for (let k = 0; k < pos.length; k += 3) linhas.push(`     <vertex x="${num(pos[k])}" y="${num(pos[k + 1])}" z="${num(pos[k + 2])}" />`);
    linhas.push("    </vertices>", "    <triangles>");
    for (let k = 0; k < tri.length; k += 3) linhas.push(`     <triangle v1="${tri[k]}" v2="${tri[k + 1]}" v3="${tri[k + 2]}" />`);
    linhas.push("    </triangles>", "   </mesh>", "  </object>");
  });
  linhas.push(" </resources>", " <build>", ...objetos.map((_, i) => `  <item objectid="${i + 2}" />`), " </build>", "</model>");
  const enc = new TextEncoder();
  return zipArmazenado([
    {
      nome: "[Content_Types].xml",
      dados: enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />' +
          '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" /></Types>',
      ),
    },
    {
      nome: "_rels/.rels",
      dados: enc.encode(
        '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" /></Relationships>',
      ),
    },
    { nome: "3D/3dmodel.model", dados: enc.encode(linhas.join("\n")) },
    ...(comMesas ? [{ nome: "Metadata/model_settings.config", dados: enc.encode(configMesas(objetos)) }] : []),
  ]);
}

function configMesas(objetos: { nome: string; mesa?: number }[]): string {
  const id = (i: number) => i + 2; // mesmo id do <object> no modelo
  const total = Math.max(...objetos.map((o) => o.mesa ?? 1));
  const l = ['<?xml version="1.0" encoding="UTF-8"?>', "<config>"];
  objetos.forEach((o, i) => l.push(`  <object id="${id(i)}">`, `    <metadata key="name" value="${esc(o.nome)}"/>`, "  </object>"));
  for (let m = 1; m <= total; m++) {
    l.push("  <plate>", `    <metadata key="plater_id" value="${m}"/>`, `    <metadata key="plater_name" value=""/>`, `    <metadata key="locked" value="false"/>`);
    objetos.forEach((o, i) => {
      if ((o.mesa ?? 1) === m)
        l.push("    <model_instance>", `      <metadata key="object_id" value="${id(i)}"/>`, `      <metadata key="instance_id" value="0"/>`, `      <metadata key="identify_id" value="${id(i)}"/>`, "    </model_instance>");
    });
    l.push("  </plate>");
  }
  l.push("</config>");
  return l.join("\n");
}
