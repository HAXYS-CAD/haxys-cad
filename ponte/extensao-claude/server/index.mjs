// Extensão do Claude Desktop: só chama a ponte de verdade, que vem com o HAXYS CAD instalado
// (assim ela acha a pasta do programa e o segredo). HAXYS_PONTE troca o caminho (quem programa).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// O instalador põe o programa só para o usuário (LOCALAPPDATA) ou para todos (Program Files).
const LUGARES = process.env.HAXYS_PONTE
  ? [process.env.HAXYS_PONTE]
  : [join(process.env.LOCALAPPDATA ?? "", "Programs"), process.env.ProgramFiles ?? "C:\\Program Files"]
      .map((base) => join(base, "HAXYS CAD", "resources", "ponte", "haxys-ponte.mjs"));
const PONTE = LUGARES.find((lugar) => existsSync(lugar));
if (!PONTE) {
  console.error(`Não achei a ponte do HAXYS CAD em ${LUGARES.join(" nem em ")}. Instale o HAXYS CAD ou defina HAXYS_PONTE.`);
  process.exit(1);
}
if (!process.argv.includes("--stdio")) process.argv.push("--stdio");
await import(pathToFileURL(PONTE).href);
