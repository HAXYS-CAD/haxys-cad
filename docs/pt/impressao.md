# Impressão 3D e laser

[← Voltar](../../README.md) · [🇺🇸 English](../en/impressao.md)

## Bambu Lab (um clique)

1. Instale o [Bambu Studio](https://bambulab.com/download/studio) no PC.
2. No HAXYS CAD, clique em **🖨 Imprimir** (painel HAXYS).
3. A peça abre no Bambu Studio como 3MF, **um objeto por corpo**, já com Z para cima. Fatie e mande para a impressora como sempre.

A IA também pode fazer isso: *"confira se cabe na minha impressora e mande imprimir"*. Se a peça for grande demais, ela corta em partes com encaixes (pinos).

## Outras impressoras

**Arquivo → Exportar → 3MF ou STL**, escolha a qualidade e "Z para cima (impressoras)". Abra o arquivo no fatiador da sua impressora (PrusaSlicer, Cura, OrcaSlicer...). Os arquivos ficam em `Documentos\HAXYS CAD\saida`.

## Corte a laser

Ferramenta **✂ Laser** (painel HAXYS): gera um SVG com o contorno da peça para máquinas de corte e gravação a laser.

## Dicas

- Peças com menos de 1 mm de parede podem não sair bem.
- Furos impressos costumam sair um pouco menores: some 0,2 a 0,3 mm no diâmetro.
- Use **Inspecionar → Medir** e **Propriedades** para conferir medidas e volume antes de imprimir.
