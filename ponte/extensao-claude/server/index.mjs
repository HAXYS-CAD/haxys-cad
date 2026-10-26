// Extensão do Claude Desktop: só chama a ponte de verdade, que vem com o HAXYS CAD instalado
// (assim ela acha a pasta do programa e o segredo). HAXYS_PONTE troca o caminho (quem programa).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PONTE = process.env.HAXYS_PONTE ?? join(process.env.LOCALAPPDATA ?? "", "Programs", "HAXYS CAD", "resources", "ponte", "haxys-ponte.mjs");
if (!existsSync(PONTE)) {
  console.error(`Não achei a ponte do HAXYS CAD em ${PONTE}. Instale o HAXYS CAD ou defina HAXYS_PONTE.`);
  process.exit(1);
}
if (!process.argv.includes("--stdio")) process.argv.push("--stdio");
await import(pathToFileURL(PONTE).href);
