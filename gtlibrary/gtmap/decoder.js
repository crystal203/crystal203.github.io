// Strict KONG envelope reader. All offsets are checked; no scan/recovery paths.
const utf8 = new TextDecoder('utf-8', { fatal: true });
class Reader {
  constructor(bytes) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.pos = 0; }
  take(n) { if (!Number.isInteger(n) || n < 0 || this.pos + n > this.bytes.length) throw new Error(`文件截断：0x${this.pos.toString(16)}`); const b = this.bytes.subarray(this.pos, this.pos + n); this.pos += n; return b; }
  num(method, n) { this.take(n); return this.view[method](this.pos - n, true); }
  i32() { return this.num('getInt32', 4); }
  i16() { return this.num('getInt16', 2); }
  u8() { return this.num('getUint8', 1); }
  i8() { return this.num('getInt8', 1); }
  f32() { const v = this.num('getFloat32', 4); if (!Number.isFinite(v)) throw new Error('非法浮点坐标'); return v; }
  count(max = 1000000) { const n = this.i32(); if (n < 0 || n > max) throw new Error(`非法记录数量 ${n}`); return n; }
  bool() { const n = this.u8(); if (n > 1) throw new Error('非法布尔字段'); return !!n; }
  str() { let n = 0; for (let s = 0; s < 35; s += 7) { const b = this.u8(); n += (b & 127) * 2 ** s; if (!(b & 128)) return utf8.decode(this.take(n)); } throw new Error('非法字符串长度'); }
  floats(n) { return Array.from({ length: n }, () => this.f32()); }
}
function readComponent(name, bytes) {
  const r = new Reader(bytes), version = r.i32();
  const out = { version };
  const spec = () => { const s = r.str(); return s ? JSON.parse(s) : null; };
  if (name === 'Tilemaps.TileProp' && version === 5) {
    out.keyIndex = r.i32(); out.overrides = spec(); out.statUpdateType = r.u8(); out.deactivateOnStart = r.bool(); out.condition = r.i32();
    if (out.condition === 1) { out.conditionIndex = r.i32(); out.conditionName = r.str(); }
  } else if (name === 'Tilemaps.CharacterPlaceholder' && version === 9) {
    out.characterId = r.str(); const kind = out.kind = r.u8();
    out.field3c = r.i32(); out.fieldf0 = r.str(); out.fieldf8 = r.i32(); out.fieldfc = r.i32();
    out.tags = Array.from({ length: r.count() }, () => ({ tag: r.u8(), value: r.str() }));
    out.field38 = r.i32(); out.field40 = r.bool();
    if (kind === 1 || kind === 2) {
      for (const k of ['60', '68', '70', '78', '80']) out['field' + k] = r.str();
      out.fielda8 = r.bool(); out.fielda9 = r.bool(); out.field44 = r.i32(); out.field48 = r.bool(); out.field4c = r.i32(); out.field41 = r.bool();
      const mode = out.field50 = r.i32(); if (mode === 1) out.field54 = r.i32(); if (mode === 1 || mode === 2) out.field58 = r.str();
      out.hasAppearanceOverride = r.bool();
      if (out.hasAppearanceOverride) { out.appearanceName = r.str(); out.color32 = Array.from({ length: 4 }, () => r.u8()); out.appearanceValue = r.f32(); }
    }
    if (kind !== 1) {
      out.fieldb0 = r.str(); out.fieldb8 = r.str(); out.fieldc0 = r.i32(); out.fieldc8 = r.u8();
      out.fieldd0 = Array.from({ length: r.count() }, () => [r.i32(), r.i32(), r.i32(), r.f32()]);
    }
    out.overrides = spec();
  } else return { version, raw: bytes, decoded: false };
  if (r.pos !== bytes.length) throw new Error(`${name} 的载荷存在未解释字节`);
  return { ...out, decoded: true };
}
function properties(r, targets) {
  return Array.from({ length: r.count() }, () => {
    const index = r.i16(), component = r.str(), bytes = r.take(r.count(r.bytes.length));
    if (index < 0 || index >= targets) throw new Error('属性索引超出范围');
    return { index, component, byteLength: bytes.length, value: readComponent(component, bytes) };
  });
}
export function parseKong(bytes) {
  const r = new Reader(bytes);
  if (utf8.decode(r.take(4)) !== 'KONG') throw new Error('不是 KONG 地图容器');
  const version = r.i32(); if (![9, 11, 12, 13, 14, 15, 16].includes(version)) throw new Error(`暂不支持 KONG v${version}`);
  const partitionSize = r.i32(), unitSize = r.floats(3);
  const tilesets = Array.from({ length: r.count(100) }, () => ({ name: r.str(), names: Array.from({ length: r.count() }, () => r.str()) }));
  const difficulty = version >= 12 ? r.bool() : false, water = version >= 15 ? r.bool() : null, addons = version >= 16 ? r.str() : null;
  const handles = {};
  for (let i = version >= 11 ? r.count(256) : 0; i > 0; i--) { const k = r.u8(); if (k in handles) throw new Error('重复 handle 类别'); handles[k] = Array.from({ length: r.count() }, () => r.str()); }
  let tileCount = 0, eventCount = 0, propertyCount = 0;
  const layers = Array.from({ length: r.count(256) }, () => {
    const name = r.str(), type = r.i32(), options = r.i32(), count = r.count(100000);
    const layer = { name, type, options, tiles: [], events: [], properties: [] };
    if (type === 0) {
      for (let i = 0; i < count; i++) {
        const px = r.i16(), pz = r.i16(), tiles = Array.from({ length: r.count() }, () => {
          const ts = r.i16(), ti = r.i16(), x = r.u8(), y = r.i8(), z = r.u8(), rotation = r.u8();
          if (!tilesets[ts - 1] || (ti !== -1 && !tilesets[ts - 1].names[ti])) throw new Error(`非法图块索引 ${ts}:${ti}`);
          return { ts, ti, name: ti === -1 ? '[unresolved tile index -1]' : tilesets[ts - 1].names[ti], x: px * partitionSize + x / 10, y, z: pz * partitionSize + z / 10, rotation };
        });
        const props = properties(r, tiles.length);
        for (const p of props) tiles[p.index].properties = [...(tiles[p.index].properties || []), p];
        layer.tiles.push(...tiles); layer.properties.push(...props);
      }
    } else if (type === 1) {
      layer.events = Array.from({ length: count }, () => ({ name: r.str(), position: r.floats(3) }));
      layer.properties = properties(r, count);
      for (const p of layer.properties) layer.events[p.index].properties = [...(layer.events[p.index].properties || []), p];
    } else throw new Error(`未知图层类型 ${type}`);
    tileCount += layer.tiles.length; eventCount += layer.events.length; propertyCount += layer.properties.length;
    return layer;
  });
  const arrays = {};
  for (const [name, size] of [['floors', 8], ['upperFloors', 8], ['mergedWalls', 12], ['nonUnitSizedWalls', 20], ['mergedUpperWalls', 12], ['nonUnitSizedUpperWalls', 20]]) {
    // Native version gates: upperFloors >= 13, upper walls >= 14.
    if ((name === 'upperFloors' && version < 13) || (['mergedUpperWalls','nonUnitSizedUpperWalls'].includes(name) && version < 14)) { arrays[name] = {count:0, raw:new Uint8Array(), present:false}; continue; }
    const count = r.count(); arrays[name] = { count, raw: r.take(count * size) };
  }
  if (r.pos !== bytes.length) throw new Error(`文件末尾存在 ${bytes.length - r.pos} 个未解释字节`);
  return { version, partitionSize, unitSize, difficulty, water, addons, tilesets, handles, layers, arrays, tileCount, eventCount, propertyCount, bytesConsumed: r.pos };
}
export async function decodeMap(buffer, mapName) {
  let bytes = new Uint8Array(buffer);
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'KONG') {
    if (!bytes.length || bytes.length % 16) throw new Error('密文长度必须是 16 的倍数');
    if (!globalThis.crypto?.subtle) throw new Error('解密需要 HTTPS 或 localhost 安全环境');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kongstudios' + mapName));
    const key = await crypto.subtle.importKey('raw', digest, 'AES-CBC', false, ['decrypt']);
    const iv = Uint8Array.from('e0c6bf2f1ebdabf7d71032888878ecad'.match(/../g), h => parseInt(h, 16));
    let packed;
    try { packed = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, bytes); }
    catch { throw new Error('解密失败：请确认原地图名，或检查文件是否损坏'); }
    try { bytes = new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
    catch { throw new Error('解压失败；需要支持 deflate-raw 的现代浏览器，或文件已损坏'); }
  }
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  return { ...parseKong(bytes), sha256, mapName };
}
