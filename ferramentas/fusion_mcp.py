"""Cliente minimo do Fusion MCP (porta 27185).

Uso:
  python fusion_mcp.py health
  python fusion_mcp.py script arquivo.py [saida.txt]   (roda em modo so-leitura)
"""
import json
import sys
import urllib.request

URL = "http://127.0.0.1:27185"
HEAD = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}


def _post(body, sid=None, timeout=120):
    h = dict(HEAD)
    if sid:
        h["Mcp-Session-Id"] = sid
    req = urllib.request.Request(URL + "/mcp", json.dumps(body).encode(), h, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8")
        return r.headers.get("Mcp-Session-Id"), (json.loads(raw) if raw.strip() else None)


def session():
    sid, _ = _post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-06-18", "capabilities": {},
        "clientInfo": {"name": "haxys-cad", "version": "0.1"}}})
    _post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    return sid


def call(sid, name, args, timeout=300):
    _, res = _post({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                    "params": {"name": name, "arguments": args}}, sid, timeout)
    return res


def run_script(code, read_only=True):
    sid = session()
    res = call(sid, "fusion_mcp_execute", {"featureType": "script",
                                          "object": {"script": code, "readOnly": read_only}})
    if "error" in res:
        raise RuntimeError(res["error"])
    return "\n".join(c.get("text", "") for c in res["result"].get("content", []))


if __name__ == "__main__":
    if sys.argv[1] == "health":
        print(urllib.request.urlopen(URL + "/health", timeout=5).read().decode())
    elif sys.argv[1] == "script":
        out = run_script(open(sys.argv[2], encoding="utf-8").read())
        if len(sys.argv) > 3:
            open(sys.argv[3], "w", encoding="utf-8").write(out)
            print(f"{len(out)} caracteres salvos em {sys.argv[3]}")
        else:
            print(out)
