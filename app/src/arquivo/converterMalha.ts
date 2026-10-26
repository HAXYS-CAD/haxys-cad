// 3MF, FBX e USDZ (formatos de malha que o Fusion exporta): lidos com os
// leitores do three.js e entregues como STL binário para o Inserir malha.
// Os leitores só carregam quando alguém abre um arquivo desses.
import * as THREE from "three";

export const FORMATOS_MALHA_CONVERTIDOS = ["3mf", "fbx", "usdz"];

export async function malhaParaStl(arquivo: File, ext: string): Promise<Uint8Array> {
  const dados = await arquivo.arrayBuffer();
  let cena: THREE.Object3D;
  if (ext === "3mf") cena = new (await import("three/examples/jsm/loaders/3MFLoader.js")).ThreeMFLoader().parse(dados);
  else if (ext === "fbx") cena = new (await import("three/examples/jsm/loaders/FBXLoader.js")).FBXLoader().parse(dados, "");
  else cena = await new (await import("three/examples/jsm/loaders/USDZLoader.js")).USDZLoader().parse(dados);
  cena.updateMatrixWorld(true);
  let triangulos = 0;
  cena.traverse((o) => {
    if (o instanceof THREE.Mesh) triangulos += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  if (!triangulos) throw new Error("o arquivo não tem nenhuma peça (malha) dentro");
  const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
  const stl = new STLExporter().parse(cena, { binary: true }) as DataView;
  return new Uint8Array(stl.buffer, stl.byteOffset, stl.byteLength);
}
