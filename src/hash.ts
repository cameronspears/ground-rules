// A fast, repeatable pseudo-random number in 0..1 for three integers. Kept in a file of its own so the
// map's paint workers can use it without loading the 3D library that voxel.ts needs.
export function hash3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
