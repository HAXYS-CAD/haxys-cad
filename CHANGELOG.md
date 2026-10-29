# Novidades · Changelog

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
