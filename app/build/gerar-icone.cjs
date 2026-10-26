// Gera build/icon.png (512 px) com o cervo da logo, centralizado (rodar: npx electron build/gerar-icone.cjs).
const { app, BrowserWindow } = require("electron");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
app.whenReady().then(async () => {
  const svg = readFileSync(join(__dirname, "icone-base.svg"), "utf8");
  const w = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg width="512" height="512" ')}</body>`));
  await w.webContents.executeJavaScript(`(() => { const g = document.getElementById("cervo"); const t = g.getBBox();
    // O desenho tem o cervo e as letras: o cervo é a parte da esquerda (30% da largura).
    const b = { x: t.x, y: t.y, width: t.width * 0.3, height: t.height }; const k = 360 / Math.max(b.width, b.height);
    const ns = "http://www.w3.org/2000/svg", clip = document.createElementNS(ns, "clipPath"), r = document.createElementNS(ns, "rect");
    clip.id = "so-cervo"; Object.entries({ x: b.x, y: b.y - 1, width: b.width, height: b.height + 2 }).forEach(([n, v]) => r.setAttribute(n, v)); clip.appendChild(r);
    document.querySelector("defs").appendChild(clip);
    g.innerHTML = '<g clip-path="url(#so-cervo)">' + g.innerHTML + "</g>";
    g.setAttribute("transform", "translate(" + (256 - (b.x + b.width / 2) * k) + "," + (256 - (b.y + b.height / 2) * k) + ") scale(" + k + ")"); })()`);
  await new Promise((ok) => setTimeout(ok, 300));
  writeFileSync(join(__dirname, "icon.png"), (await w.webContents.capturePage()).resize({ width: 512, height: 512 }).toPNG());
  app.quit();
});
