import adsk.core
import json
import os

# Grava em pasta sem acento: o Fusion corrompe caminhos com "Ã".
SAIDA = os.path.join(os.environ["TEMP"], "haxys_fusion_ui_inventario.json")


def _get(obj, attr, default=None):
    """Le um atributo da API; alguns controles internos falham ao serem lidos."""
    try:
        return getattr(obj, attr)
    except (RuntimeError, AttributeError):
        return default


def _controls(ctrls):
    out = []
    for i in range(ctrls.count):
        c = ctrls.item(i)
        kind = c.objectType.split("::")[-1]
        item = {"id": _get(c, "id"), "type": kind, "visible": _get(c, "isVisible")}
        promoted = _get(c, "isPromoted")
        if promoted is not None:
            item["promoted"] = promoted
        cd = _get(c, "commandDefinition")
        if cd:
            item["name"] = _get(cd, "name")
            item["tooltip"] = (_get(cd, "tooltip") or "")[:200]
        if kind == "DropDownControl":
            item["name"] = _get(c, "name", "")
            sub = _get(c, "controls")
            item["children"] = _controls(sub) if sub else []
        out.append(item)
    return out


def run(_context: str):
    app = adsk.core.Application.get()
    ui = app.userInterface
    active = _get(ui, "activeWorkspace")
    data = {"version": app.version, "activeWorkspace": active.id if active else None,
            "documents": app.documents.count, "workspaces": []}
    for i in range(ui.workspaces.count):
        ws = ui.workspaces.item(i)
        w = {"id": ws.id, "name": _get(ws, "name"), "productType": _get(ws, "productType"), "tabs": []}
        tabs = _get(ws, "toolbarTabs")
        if tabs:
            for t in range(tabs.count):
                tab = tabs.item(t)
                tb = {"id": tab.id, "name": _get(tab, "name"), "panels": []}
                for p in range(tab.toolbarPanels.count):
                    pn = tab.toolbarPanels.item(p)
                    tb["panels"].append({"id": pn.id, "name": _get(pn, "name"),
                                         "visible": _get(pn, "isVisible"),
                                         "controls": _controls(pn.controls)})
                w["tabs"].append(tb)
        data["workspaces"].append(w)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    for w in data["workspaces"]:
        n = sum(len(p["controls"]) for t in w["tabs"] for p in t["panels"])
        print(w["id"], "|", w["name"], "| abas:", len(w["tabs"]), "| controles:", n)
