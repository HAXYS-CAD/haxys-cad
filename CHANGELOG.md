# Novidades · Changelog

## 0.1.6 — ligar a IA em 3 passos · AI setup in 3 steps

- "Ligar IA" agora abre direto o Gemini grátis em 3 passos: abrir o Google e criar a chave, colar a chave, Ligar a IA
  (testa e salva de uma vez). Erros em palavras simples ("Chave errada", "Sem internet", "Acabou o limite grátis").
  GPT, Claude, IA no PC, Codex e conector MCP ficam em "Outras opções".
- O passo a passo da IA não aparece mais toda vez que o programa abre: só uma vez, e nunca com a IA já escolhida.
  Para trocar de IA: botão "Ligar IA".
- Mandar para a Bambu: 3MF feito por outro programa abre no Bambu Studio em vez de dar erro.

**English:** "Ligar IA" now opens free Gemini in 3 steps (open Google and create the key, paste it, connect — tested and
saved at once), with plain error messages; other AIs are under "Outras opções". The AI setup no longer shows up every
time the program opens (only once, never after an AI was chosen). Sending a 3MF made by another program to Bambu Studio
now opens it instead of failing.

## 0.1.5 — STEP com várias peças · multi-part STEP

- Abrir um STEP com várias peças (ex.: exportado do Fusion) agora cria **um corpo para cada peça**, como no Fusion.
  Na janela Inserir, "Peças do arquivo: Num corpo só" mantém o jeito antigo. Projetos já salvos não mudam.
- STEP vazio agora avisa "Esse STEP está vazio…" em vez de um erro sem sentido.

**English:** opening a STEP with several parts now creates one body per part, like Fusion ("Num corpo só" in the Insert
window keeps the old behavior; saved projects are unchanged). An empty STEP now shows a clear message instead of an
engine error.

## 0.1.4 — atualiza sozinho · auto-update

- A partir desta versão, o HAXYS CAD procura versão nova ao abrir, baixa sem atrapalhar e instala quando você fecha o
  programa. Quem tem a 0.1.3 ou mais antiga precisa instalar a 0.1.4 uma vez pelo link de sempre.

**English:** from this version on, HAXYS CAD checks for a new version when it opens, downloads it in the background and
installs it when you close the program. If you have 0.1.3 or older, install 0.1.4 once from the usual link.

## 0.1.3 — ícone do celular e código mais limpo · mobile icon and cleaner code

- Celular: o ícone do cervo (`/icone.png`) e o manifesto agora abrem antes do pareamento, para o celular poder
  buscá-los ao "Adicionar à Tela de Início". O resto continua fechado sem o QR.
- Código revisado com o ESLint: 140 avisos viraram 15 (só arquivos grandes). Sem mudança no uso.

**English:** the deer icon and the web manifest are now served before pairing, so phones can fetch them when adding to
the home screen; everything else still needs the QR. Code cleaned up with ESLint (140 warnings down to 15, no change in
use).

## 0.1.2 — celular mais limpo e ponte mais firme · cleaner mobile, sturdier bridge

- Celular: a tela mostra só a barra de cima (Arquivo, Salvar, Exportar…), a peça e o cubo de vistas. A caixa da IA tem
  só 🖼 imagem, texto e 🎤 (vira ➤ quando há texto). O — transforma a caixa num pontinho: tocar abre, arrastar muda de lugar.
- Ponte das IAs: não cai mais quando outro programa usa a porta 5173 e não confunde esse programa com o HAXYS CAD.

**English:** mobile now shows only the top bar, the part and the view cube; the AI box has just image, text and mic
(send appears when there is text) and minimizes to a small draggable dot. The AI bridge no longer crashes when another
program answers on port 5173, and no longer mistakes it for HAXYS CAD.

## 0.1.1 — conserto da ponte das IAs · AI bridge fix

- Com o programa instalado em `C:\Program Files\HAXYS CAD`, a ponte MCP caía ao ligar (não podia gravar a senha ali).
  Agora a senha fica em `%LOCALAPPDATA%\HAXYS CAD`. Quem instalou só para o próprio usuário não muda nada.
- Conector do Claude Desktop (`HAXYS_CAD.mcpb` 1.0.1) acha o HAXYS CAD nos dois lugares de instalação.

**English:** with HAXYS CAD installed in Program Files, the MCP bridge crashed on start (it could not write its secret
there); the secret now lives in `%LOCALAPPDATA%\HAXYS CAD`. The Claude Desktop connector (`HAXYS_CAD.mcpb` 1.0.1) finds
HAXYS CAD in both install locations.

## 0.1.0 — primeira versão pública · first public release

- Programa do PC com a organização de tela do Autodesk Fusion: esboço, sólido, superfície, malha, montagem, inspeção e anotações.
- Abrir STEP, STL, OBJ, 3MF e DXF; exportar STEP, STL e 3MF; mandar para o Bambu Studio; corte a laser em SVG.
- IA pela voz ou texto com a conta da pessoa (Gemini grátis, ChatGPT/Codex, Claude, Ollama/LM Studio) e réplica de peça por fotos.
- Ponte MCP para Claude Desktop, Codex e Gemini CLI construírem no HAXYS CAD.
- HAXYS CAD móvel pela Wi-Fi (QR code), com microfone e fotos.
- Instalador para Windows 10/11.

**English:** first public release — Fusion-style desktop CAD, STEP/STL/OBJ/3MF/DXF import, STEP/STL/3MF export, Bambu Studio and laser
output, voice/text AI with your own account, photo-to-part replication, MCP bridge, mobile over Wi-Fi, Windows installer.
