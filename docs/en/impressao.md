# 3D printing and laser

[← Back](../../README.en.md) · [🇧🇷 Português](../pt/impressao.md)

## Bambu Lab (one click)

1. Install [Bambu Studio](https://bambulab.com/download/studio) on your PC.
2. In HAXYS CAD, click **🖨 Imprimir** (Print, HAXYS panel).
3. The part opens in Bambu Studio as 3MF, **one object per body**, already Z-up. Slice and send to the printer as usual.

The AI can do this too: *"check that it fits my printer and send it to print"*. If the part is too big, it splits it into pieces with pin joints.

## Other printers

**Arquivo → Exportar → 3MF or STL** (File → Export), pick the quality and "Z para cima" (Z up). Open the file in your printer's slicer (PrusaSlicer, Cura, OrcaSlicer...). Files are saved to `Documents\HAXYS CAD\saida`.

## Laser cutting

The **✂ Laser** tool (HAXYS panel) creates an SVG with the part outline for laser cutting and engraving machines.

## Tips

- Walls thinner than 1 mm may not print well.
- Printed holes usually come out a bit small: add 0.2 to 0.3 mm to the diameter.
- Use **Inspecionar → Medir** (Inspect → Measure) and **Propriedades** (Properties) to check sizes and volume before printing.
