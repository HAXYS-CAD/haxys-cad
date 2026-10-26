// Cadastra o conector HAXYS no Claude Desktop (arquivo claude_desktop_config.json).
// Precisa do Claude Desktop FECHADO: aberto, ele regrava o arquivo ao sair e
// apaga o cadastro. Faz cópia de segurança antes de mexer.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "haxys-ponte.mjs");
const ENTRADA = { command: process.execPath, args: [SCRIPT, "--stdio"] };

const lista = execSync("tasklist /FI \"IMAGENAME eq claude.exe\" /NH", { encoding: "utf8" });
if (/claude\.exe/i.test(lista)) {
  console.log("O Claude Desktop ainda está aberto.");
  console.log("Feche pelo ícone do Claude perto do relógio (canto de baixo da tela):");
  console.log("botão direito → Sair (Quit). Depois rode este atalho de novo.");
  process.exit(1);
}

// Versão normal e versão da Microsoft Store (pasta Packages).
const caminhos = [join(process.env.APPDATA ?? "", "Claude", "claude_desktop_config.json")];
const pacotes = join(process.env.LOCALAPPDATA ?? "", "Packages");
try {
  for (const nome of execSync(`dir /b "${pacotes}"`, { encoding: "utf8" }).split(/\r?\n/))
    if (/^Claude_/.test(nome)) caminhos.push(join(pacotes, nome, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"));
} catch {
  /* sem pasta de pacotes */
}

const hora = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
let feitos = 0;
for (const arq of caminhos) {
  if (!existsSync(arq)) continue;
  const texto = readFileSync(arq, "utf8");
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    console.log(`Não mexi em ${arq}: o arquivo não é JSON válido.`);
    continue;
  }
  copyFileSync(arq, `${arq}.bak_haxys_${hora}`);
  dados.mcpServers = { ...(dados.mcpServers ?? {}), haxys: ENTRADA };
  writeFileSync(arq, JSON.stringify(dados, null, 2));
  const conferido = JSON.parse(readFileSync(arq, "utf8")).mcpServers?.haxys?.args?.[0] === SCRIPT;
  console.log(`${conferido ? "OK" : "FALHOU"}: ${arq}`);
  if (conferido) feitos++;
}
console.log(feitos ? "\nPronto. Abra o Claude Desktop de novo e peça: \"Abra o HAXYS e faça uma placa...\"" : "\nNão achei o arquivo de configuração do Claude Desktop.");
