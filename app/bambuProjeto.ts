// Projeto do Bambu Studio com várias mesas, montado pelo próprio Bambu Studio.
// O Bambu Studio só lê as mesas de um 3MF que traga também as configurações
// do projeto (impressora, perfil, filamento); sem elas junta tudo numa mesa.
// Então: o HAXYS CAD decide que peça vai em que mesa (Metadata/model_settings.config
// do 3MF dele), aqui cada peça vira um STL e a linha de comando do Bambu Studio
// ("lista de montagem") cria o projeto com os perfis do sistema da impressora,
// arruma cada mesa e grava o 3MF que a janela do Bambu Studio abre.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Lê o ZIP sem compressão que o HAXYS CAD grava (app/src/nucleo/tresmf.ts).
function lerZip(zip: Buffer): Map<string, Buffer> {
  const arquivos = new Map<string, Buffer>();
  let p = 0;
  while (p + 30 <= zip.length && zip.readUInt32LE(p) === 0x04034b50) {
    if (zip.readUInt16LE(p + 8) !== 0) throw new Error("3MF comprimido: não é do HAXYS CAD");
    const tam = zip.readUInt32LE(p + 18), n = zip.readUInt16LE(p + 26), extra = zip.readUInt16LE(p + 28);
    const nome = zip.toString("utf8", p + 30, p + 30 + n);
    const ini = p + 30 + n + extra;
    arquivos.set(nome, zip.subarray(ini, ini + tam));
    p = ini + tam;
  }
  return arquivos;
}

// Peças do 3MF com a mesa de cada uma; vazio se o arquivo não tem mesas.
export function pecasPorMesa(zip: Buffer): { nome: string; mesa: number; stl: Buffer }[] {
  const arq = lerZip(zip);
  const config = arq.get("Metadata/model_settings.config")?.toString("utf8");
  const modelo = arq.get("3D/3dmodel.model")?.toString("utf8");
  if (!config || !modelo) return [];
  const mesaDe = new Map<string, number>();
  for (const [, bloco] of config.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const m = Number(/plater_id" value="(\d+)"/.exec(bloco)?.[1]);
    for (const [, id] of bloco.matchAll(/object_id" value="(\d+)"/g)) mesaDe.set(id, m);
  }
  const pecas: { nome: string; mesa: number; stl: Buffer }[] = [];
  for (const [, id, nome, corpo] of modelo.matchAll(/<object id="(\d+)" name="([^"]*)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const v = [...corpo.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((q) => [+q[1], +q[2], +q[3]]);
    const t = [...corpo.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map((q) => [+q[1], +q[2], +q[3]]);
    // STL binário: 80 bytes de cabeçalho, contagem e 50 bytes por triângulo (normal zero: o Bambu recalcula).
    const stl = Buffer.alloc(84 + 50 * t.length);
    stl.writeUInt32LE(t.length, 80);
    t.forEach((tri, i) => tri.forEach((k, j) => v[k].forEach((c, e) => stl.writeFloatLE(c, 84 + 50 * i + 12 + 12 * j + 4 * e))));
    pecas.push({ nome: nome.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&quot;/g, '"'), mesa: mesaDe.get(id) ?? 1, stl });
  }
  return pecas;
}

// Perfis do sistema que o Bambu Studio usa por padrão para a impressora (bico 0,4).
function perfis(bambu: string, impressora: string): string[] | null {
  const base = join(dirname(bambu), "resources", "profiles", "BBL");
  const ler = (pasta: string, n: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(readFileSync(join(base, pasta, `${n}.json`), "utf8"));
    } catch {
      return null;
    }
  };
  const nomeMaquina = `${impressora} 0.4 nozzle`;
  let d = ler("machine", nomeMaquina);
  let processo: unknown, filamento: unknown;
  for (let i = 0; d && i < 10 && (processo === undefined || filamento === undefined); i++) {
    processo ??= d.default_print_profile;
    filamento ??= (d.default_filament_profile as string[] | undefined)?.[0];
    d = typeof d.inherits === "string" ? ler("machine", d.inherits) : null;
  }
  const arquivos = [join(base, "machine", `${nomeMaquina}.json`), join(base, "process", `${processo}.json`), join(base, "filament", `${filamento}.json`)];
  return typeof processo === "string" && typeof filamento === "string" && arquivos.every((a) => existsSync(a)) ? arquivos : null;
}

// Monta o projeto em "destino". Devolve null se deu certo, ou o motivo.
export async function montarProjeto(bambu: string, zip: Buffer, impressora: string, destino: string): Promise<string | null> {
  const pecas = pecasPorMesa(zip);
  if (!pecas.length) return "o 3MF não tem mesas";
  const arquivosPerfis = perfis(bambu, impressora);
  if (!arquivosPerfis) return `perfis do Bambu Studio para ${impressora} não encontrados`;
  const pasta = join(dirname(destino), ".montagem");
  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(pasta, { recursive: true });
  const mesas = Math.max(...pecas.map((p) => p.mesa));
  const plates = Array.from({ length: mesas }, () => ({ plate_name: "", need_arrange: true, objects: [] as { path: string; count: number; filaments: number[] }[] }));
  pecas.forEach((p, i) => {
    const caminho = join(pasta, `${p.nome.replace(/[^\p{L}\p{N} _.-]/gu, "_") || "peca"}_${i + 1}.stl`);
    writeFileSync(caminho, p.stl);
    plates[p.mesa - 1].objects.push({ path: caminho, count: 1, filaments: [1] });
  });
  const lista = join(pasta, "montagem.json");
  writeFileSync(lista, JSON.stringify({ plates: plates.filter((m) => m.objects.length) }));
  const [maquina, processo, filamento] = arquivosPerfis;
  const args = ["--load-settings", `${maquina};${processo}`, "--load-filaments", filamento, "--load-assemble-list", lista, "--export-3mf", "projeto.3mf", "--outputdir", pasta];
  const codigo = await new Promise<number | null>((ok) => {
    const p = spawn(bambu, args, { windowsHide: true, stdio: "ignore" });
    const limite = setTimeout(() => p.kill(), 180_000);
    p.on("exit", (c) => (clearTimeout(limite), ok(c)));
    p.on("error", () => (clearTimeout(limite), ok(null)));
  });
  const saida = join(pasta, "projeto.3mf");
  if (codigo !== 0 || !existsSync(saida)) {
    let motivo = `código ${codigo}`;
    try {
      motivo = JSON.parse(readFileSync(join(pasta, "result.json"), "utf8")).error_string ?? motivo;
    } catch {
      /* sem result.json */
    }
    return `o Bambu Studio não montou o projeto (${motivo})`;
  }
  writeFileSync(destino, readFileSync(saida));
  return null;
}
