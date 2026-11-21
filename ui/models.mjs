// Generate dimensioned block models for fit previews. These are illustrative, not vendor CAD.
import { mkdir, writeFile } from "node:fs/promises";
export async function buildModels(dir) {
  await mkdir(dir, { recursive: true });
  const points = [],
    normals = [];
  for (const [normal, u, v] of [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ],
    [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    [
      [0, -1, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [-1, 0, 0],
      [0, 1, 0],
    ],
  ]) {
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      points.push(...normal.map((n, i) => (n + a * u[i] + b * v[i]) / 2));
      normals.push(...normal);
    }
  }
  const bin = Buffer.from(new Float32Array([...points, ...normals]).buffer);
  for (const [sku, style, w, d, h, color] of [
    ["SF-101", "seat", 2.08, 0.88, 0.84, [0.17, 0.34, 0.22]],
    ["CH-202", "seat", 0.74, 0.78, 0.82, [0.54, 0.42, 0.27]],
    ["CH-505", "seat", 0.8, 0.82, 0.78, [0.69, 0.61, 0.5]],
    ["BD-404", "bed", 1.65, 2.05, 0.95, [0.47, 0.31, 0.2]],
    ["TB-303", "table", 1.8, 0.9, 0.75, [0.35, 0.22, 0.14]],
  ]) {
    const nodes = [];
    function block(x, y, z, a, b, c) {
      nodes.push({ mesh: 0, translation: [x, y, z], scale: [a, b, c] });
    }
    let top = style === "table" ? h - 0.04 : style === "bed" ? 0.33 : 0.4;
    for (let x of [-1, 1])
      for (let z of [-1, 1])
        block(
          x * (w / 2 - 0.055),
          top / 2,
          z * (d / 2 - 0.055),
          0.07,
          top,
          0.07,
        );
    block(0, top, 0, w, style === "table" ? 0.08 : 0.16, d);
    if (style !== "table")
      block(0, (h + top) / 2, -d / 2 + 0.06, w, h - top, 0.12);
    if (style === "seat")
      for (let x of [-1, 1])
        block(x * (w / 2 - 0.055), top + 0.1, 0, 0.11, 0.24, d);
    const bytes = points.length * 4,
      doc = {
        asset: { version: "2.0" },
        scene: 0,
        scenes: [{ nodes: nodes.map((_, i) => i) }],
        nodes,
        meshes: [
          {
            primitives: [
              { attributes: { POSITION: 0, NORMAL: 1 }, material: 0 },
            ],
          },
        ],
        materials: [
          {
            pbrMetallicRoughness: {
              baseColorFactor: [...color, 1],
              metallicFactor: 0,
              roughnessFactor: 0.8,
            },
          },
        ],
        buffers: [{ byteLength: bin.length }],
        bufferViews: [
          { buffer: 0, byteLength: bytes },
          { buffer: 0, byteOffset: bytes, byteLength: bytes },
        ],
        accessors: [
          {
            bufferView: 0,
            componentType: 5126,
            count: 36,
            type: "VEC3",
            min: [-0.5, -0.5, -0.5],
            max: [0.5, 0.5, 0.5],
          },
          { bufferView: 1, componentType: 5126, count: 36, type: "VEC3" },
        ],
      };
    let json = Buffer.from(JSON.stringify(doc)),
      pad = Buffer.alloc((4 - (json.length % 4)) % 4, 32);
    json = Buffer.concat([json, pad]);
    const header = Buffer.alloc(20),
      chunk = Buffer.alloc(8);
    header.writeUInt32LE(0x46546c67);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + json.length + bin.length, 8);
    header.writeUInt32LE(json.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    chunk.writeUInt32LE(bin.length);
    chunk.writeUInt32LE(0x004e4942, 4);
    await writeFile(
      dir + "/" + sku + ".glb",
      Buffer.concat([header, json, chunk, bin]),
    );
  }
}
