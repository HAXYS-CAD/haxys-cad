# Getting started

[← Back](../../README.en.md) · [🇧🇷 Português](../pt/primeiros-passos.md)

On first launch, HAXYS CAD shows a short 5-step tutorial. This guide does the same with a real part. The interface is in Brazilian Portuguese today; tool names below are given as they appear on screen, with the English meaning.

![HAXYS CAD](../imagens/pc.png)

## The screen

- **Top ribbon:** tabs (SÓLIDO = Solid, SUPERFÍCIE = Surface, MALHA = Mesh, MONTAGEM = Assembly, UTILIDADES = Utilities...) with the tools, like Fusion.
- **Browser (left, "Navegador"):** sketches, bodies and planes. The ◉ shows or hides them.
- **View cube (top right):** click a face to look from the front, top...
- **Timeline (bottom):** every operation you made. Double-click one to change a dimension.

## Moving the view

- **Orbit:** drag with the left mouse button.
- **Pan:** drag with the right mouse button.
- **Zoom:** mouse wheel.

## Your first part (plate with holes)

1. **SÓLIDO** tab → **Criar esboço** (Create sketch) → click the ground plane.
2. Pick **Retângulo** (Rectangle), click two corners and type the sizes (e.g. 60 and 60).
3. Click **Concluir esboço** (Finish sketch).
4. **Extrusão** (Extrude) → click the rectangle → type `6` → **OK**. You now have a 60 × 60 × 6 mm plate.
5. **Furo** (Hole) → click the top face where you want it → diameter `5` → **OK**.
6. **Arredondar** (Fillet) → click the edges → radius `2` → **OK**.

## Or ask the AI

Click 🎤 **Falar com a IA** (Talk to the AI — SÓLIDO tab, HAXYS panel) and say:
*"Make a 60 by 60 by 6 plate with four 5 mm holes in the corners."* See [AI and MCP bridge](ia.md).

## Save, export and print

- **Arquivo → Salvar** (File → Save, Ctrl+S): saves to `Documents\HAXYS CAD\projetos`.
- **Arquivo → Exportar** (File → Export): STEP (other CAD), STL or 3MF (printing).
- **Printing:** see [Printing](impressao.md).

## Help inside the app

The **?** button at the top: hover anything to see what it does. **Esc** leaves. Right-click **?** to replay the tutorial.
