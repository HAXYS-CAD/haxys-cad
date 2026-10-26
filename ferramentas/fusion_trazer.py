# Roda DENTRO do Fusion (porta 27185, modo só-leitura). Lê a linha do tempo do
# desenho aberto e a malha de cada face, marcando qual operação criou a face.
# Grava em SAIDA (JSON; pontos em mm, Float32 em base64; triângulos Uint32 em base64).
import adsk.core, adsk.fusion, json, struct, base64, os
# SAIDA vem na primeira linha, posta pelo servidor (app/vite.config.ts, servicoFusion).
def run(context):
    pass
app = adsk.core.Application.get()
d = adsk.fusion.Design.cast(app.activeProduct)
if not d:
    raise Exception("Abra um desenho no Fusion")
tl = d.timeline
passos, dona = [], {}
for i in range(tl.count):
    it = tl.item(i)
    e = it.entity
    passos.append({"nome": it.name, "tipo": e.objectType.split("::")[-1] if e else "", "suprimido": it.isSuppressed})
    try:
        for f in e.faces:
            dona[f.tempId] = i
    except Exception:
        pass
# Fusion com Z para cima: gira para Y para cima (a peça fica em pé como lá).
zCima = app.preferences.generalPreferences.defaultModelingOrientation == adsk.core.DefaultModelingOrientations.ZUpModelingOrientation
corpos = []
for b in d.rootComponent.bRepBodies:
    if not b.isVisible:
        continue
    grupos = {}
    for f in b.faces:
        calc = f.meshManager.createMeshCalculator()
        calc.setQuality(adsk.fusion.TriangleMeshQualityOptions.NormalQualityTriangleMesh)
        m = calc.calculate()
        g = grupos.setdefault(dona.get(f.tempId, -1), {"pos": [], "tri": []})
        base = len(g["pos"]) // 3
        p = m.nodeCoordinatesAsFloat
        for i in range(0, len(p), 3):  # cm -> mm; o HAXYS CAD tem Y para cima
            x, y, z = p[i] * 10, p[i + 1] * 10, p[i + 2] * 10
            g["pos"].extend((x, z, -y) if zCima else (x, y, z))
        g["tri"].extend(base + k for k in m.nodeIndices)
    corpos.append({"nome": b.name, "grupos": [
        {"passo": k, "pos": base64.b64encode(struct.pack("<%df" % len(g["pos"]), *g["pos"])).decode(),
         "tri": base64.b64encode(struct.pack("<%dI" % len(g["tri"]), *g["tri"])).decode()}
        for k, g in sorted(grupos.items())]})
with open(SAIDA, "w", encoding="utf-8") as arq:
    json.dump({"documento": app.activeDocument.name, "passos": passos, "corpos": corpos}, arq, ensure_ascii=False)
print(json.dumps({"ok": True, "passos": len(passos), "corpos": len(corpos)}))
