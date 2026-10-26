<p align="right"><a href="README.en.md">🇺🇸 English</a></p>

<p align="center">
  <img src="docs/imagens/abertura.png" alt="HAXYS CAD" width="100%">
</p>

<h3 align="center">CAD 3D grátis, em português, com IA que monta a peça pela sua voz.</h3>

<p align="center">
  Tela parecida com o Autodesk Fusion · imprime na Bambu Lab · também no celular
</p>

<p align="center">
  <a href="https://github.com/HAXYS-CAD/haxys-cad/releases/latest"><img src="https://img.shields.io/badge/⬇_Baixar-Windows_10%2F11-d4a94a?style=for-the-badge" alt="Baixar para Windows"></a>
  <a href="docs/pt/celular.md"><img src="https://img.shields.io/badge/📱_Usar-no_celular-30363d?style=for-the-badge" alt="Usar no celular"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Código-aberto_(MIT)-30363d?style=for-the-badge" alt="Código aberto"></a>
  <img src="https://img.shields.io/badge/Preço-grátis-238636?style=for-the-badge" alt="Grátis">
</p>

---

## O que tem aqui

<table>
<tr>
<td width="33%" valign="top">

### 🖥 HAXYS CAD
**O programa do PC.** Desenha peças 3D com esboço, extrusão, revolução, furo, arredondamento, malha, superfície e montagem, com as ferramentas organizadas como no Fusion. Abre STEP, STL, OBJ, 3MF e DXF, exporta STEP / STL / 3MF e manda direto para a impressora.

<img src="docs/imagens/pc.png" alt="HAXYS CAD no PC">

</td>
<td width="33%" valign="top">

### 📱 HAXYS CAD móvel
**O mesmo programa no celular.** Toque no 🎤, diga a peça que quer (ou mande fotos) e a IA monta. Abre pelo QR code, na mesma Wi-Fi do PC.<br>
<sub>🔜 Em breve: usar em qualquer lugar, sem o PC ligado.</sub>

<img src="docs/imagens/celular.png" alt="HAXYS CAD no celular" width="55%">

</td>
<td width="33%" valign="top">

### 🤖 IA que constrói
**Fale e a peça aparece.** A IA do HAXYS CAD usa a sua conta (Gemini grátis, ChatGPT/Codex, Claude, ou uma IA no próprio PC). Também replica peça a partir de fotos. Pela **ponte MCP**, o Claude, o Codex e o Gemini CLI abrem o HAXYS CAD e constroem sozinhos.

<img src="docs/imagens/ia.png" alt="IA do HAXYS CAD">

</td>
</tr>
</table>

## Por que o HAXYS CAD

- **Quem conhece o Fusion já sabe usar.** Mesmas abas, mesmos painéis, mesmos nomes de ferramentas, linha do tempo e navegador.
- **IA de verdade, grátis.** Fale "faça uma placa de 60 por 60 com quatro furos de 5 mm" e ela constrói, confere e mede. Mande fotos e ela replica a peça.
- **Da tela para a impressora.** Um clique manda a peça (3MF, um objeto por corpo) para o Bambu Studio. Funciona também com outras impressoras pelo STL/3MF, e com corte a laser (SVG).
- **Sem conta, sem assinatura.** Tudo roda no seu computador. Seus projetos ficam em `Documentos\HAXYS CAD`.
- **Código aberto.** Licença MIT: use, estude, mude e compartilhe.

## Instalar em 3 passos

<p align="center"><img src="docs/imagens/instalar.png" alt="Os 3 passos da instalação"></p>

1. Abra a página **[Releases](https://github.com/HAXYS-CAD/haxys-cad/releases/latest)** e baixe `HAXYS-CAD-Setup-<versão>.exe`.
2. Dê dois cliques no arquivo. Se aparecer **"O Windows protegeu o computador"**, clique em **Mais informações** → **Executar assim mesmo** (o instalador é grátis e por isso não tem assinatura paga).
3. Avance a instalação. O HAXYS CAD abre sozinho e cria um atalho na Área de Trabalho.

**Ou cole isto no PowerShell** (botão Iniciar → digite *PowerShell* → Enter). Ele baixa a versão mais nova e abre o instalador:

```powershell
irm https://github.com/HAXYS-CAD/haxys-cad/releases/latest/download/instalar.ps1 | iex
```

**Ou peça para a sua IA instalar.** Cole no Claude Code, no Codex ou no Gemini CLI:

```text
Instale o HAXYS CAD neste computador: rode no PowerShell
irm https://github.com/HAXYS-CAD/haxys-cad/releases/latest/download/instalar.ps1 | iex
e me avise quando o instalador abrir. Depois, ligue a ponte do HAXYS CAD em você
seguindo https://github.com/HAXYS-CAD/haxys-cad/blob/main/docs/pt/ia.md
```

Passo a passo completo, com imagens: **[docs/pt/instalar.md](docs/pt/instalar.md)**.

## Mais

| | |
|---|---|
| 🚀 [Primeiros passos](docs/pt/primeiros-passos.md) | Sua primeira peça em 5 minutos |
| 🛠 [Ferramentas](docs/pt/ferramentas.md) | Tudo o que o HAXYS CAD faz, aba por aba |
| 🤖 [IA e ponte MCP](docs/pt/ia.md) | Ligar a IA grátis, Claude, Codex e Gemini CLI (com prompts prontos) |
| 📱 [Celular](docs/pt/celular.md) | HAXYS CAD móvel pela Wi-Fi |
| 🖨 [Impressão](docs/pt/impressao.md) | Bambu Lab, outras impressoras e laser |
| ❓ [Perguntas comuns](docs/pt/perguntas.md) | Aviso do Windows, onde ficam os arquivos, problemas |
| 👩‍💻 [Para quem programa](docs/pt/para-quem-programa.md) | Rodar do código, estrutura e como contribuir |

🌎 Outros idiomas dentro do programa: em breve.

---

<sub>Inspirado no fluxo do Autodesk Fusion. O HAXYS CAD não é afiliado à Autodesk nem à Bambu Lab; os nomes são de seus donos.<br>
© 2026 HAXYS · [Licença MIT](LICENSE) · [Como contribuir](CONTRIBUTING.md) · [Segurança](SECURITY.md) · [Novidades](CHANGELOG.md)</sub>
