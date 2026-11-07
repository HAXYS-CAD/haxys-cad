// Service worker do HAXYS CAD na nuvem (só a nuvem registra; o PC não usa). Abre rápido e sem internet.
// - /api/ e /instalar: nunca passam por aqui (sempre a rede, nunca guardados).
// - Página (/): rede primeiro; sem rede, a última guardada. Resposta da rede sempre vale, até o 403 do portão.
// - /assets/ (nome com hash) e .wasm: do cache; senão da rede, e guarda.
// - Nunca guarda resposta que não seja ok (o 403 do portão não pode ficar guardado).
// Um cache por build ("?v=" = nome do JS principal, posto pelo main.ts): o build novo apaga os caches velhos
// (e, com a página da rede primeiro, a página nova já pede os arquivos novos).
const CACHE = `haxys-${new URL(location.href).searchParams.get("v") || "v1"}`;

// Ao instalar: guarda a página e todos os arquivos do build (sw-lista.json, feito pelo vite.config.ts).
// Na 1ª visita a página carrega antes do service worker ligar: sem isso, nada ficaria guardado.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(async (c) => {
        const r = await fetch("/sw-lista.json", { cache: "no-store" });
        const lista = r.ok ? await r.json() : [];
        await Promise.all(["/", ...lista.map((f) => `/${f}`)].map((u) => c.add(u).catch(() => {})));
      })
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("haxys-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function guardar(pedido, resposta) {
  if (resposta.ok && resposta.type === "basic") await (await caches.open(CACHE)).put(pedido, resposta.clone());
  return resposta;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/instalar")) return;
  if (e.request.mode === "navigate") {
    if (url.searchParams.has("c")) return; // link do convite: o portão troca por cookie (302)
    if (url.pathname !== "/" && url.pathname !== "/index.html") return; // outras páginas: só a rede
    e.respondWith(
      fetch(e.request).then(
        (r) => guardar("/", r),
        () => caches.open(CACHE).then((c) => c.match("/")).then((r) => r ?? Response.error()),
      ),
    );
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".wasm")) {
    e.respondWith(
      caches
        .open(CACHE)
        .then((c) => c.match(e.request))
        .then((r) => r ?? fetch(e.request).then((resposta) => guardar(e.request, resposta))),
    );
  }
});
