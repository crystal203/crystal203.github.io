"""Strict KONG v9/v11-v16 reader reconstructed from the native ReadFromStream.

Research tool only: reads already decrypted containers, never scans ahead to
recover a layer, and rejects truncation or unexplained bytes. Python stdlib only.
Native evidence: E:/GTFiles/dump/_disasm/TilemapBinary_ReadFromStream.txt.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import struct


class Reader:
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def take(self, size):
        if size < 0 or self.pos + size > len(self.data):
            raise ValueError(f"out of bounds at 0x{self.pos:x}, requested {size}")
        result = self.data[self.pos:self.pos + size]
        self.pos += size
        return result

    def unpack(self, fmt):
        result = struct.unpack('<' + fmt, self.take(struct.calcsize('<' + fmt)))
        return result[0] if len(result) == 1 else result

    def count(self, maximum=1000000):
        result = self.unpack('i')
        if not 0 <= result <= maximum:
            raise ValueError(f"invalid count {result} at 0x{self.pos - 4:x}")
        return result

    def string(self):
        size = 0
        for shift in range(0, 35, 7):
            value = self.unpack('B')
            size |= (value & 127) << shift
            if not value & 128:
                return self.take(size).decode('utf-8')
        raise ValueError('invalid 7-bit string length')

    def boolean(self):
        value = self.unpack('B')
        if value not in (0, 1):
            raise ValueError(f"invalid boolean {value} at 0x{self.pos - 1:x}")
        return bool(value)


def payload_summary(component, data):
    # The component serializer is separate from the KONG record envelope.
    # Keep every byte even when this component's payload format is not known.
    result = {'bytes': len(data), 'hex': data.hex()}
    from component_payloads import read_component
    decoded = read_component(component, data)
    if decoded is not None:
        result.update(format='structured', value=decoded)
        return result
    try:
        text = data.decode('utf-8')
        value = json.loads(text)
        result['format'] = 'json'
        result['value'] = value
    except (UnicodeDecodeError, json.JSONDecodeError):
        result['format'] = 'binary'
    return result


def props(reader, target_count):
    result = []
    for _ in range(reader.count()):
        start = reader.pos
        index = reader.unpack('h')
        component = reader.string()
        # Native d7e4/d7ec and db14/db1c: ReadInt32, then Read(buffer,0,n).
        # There are no A/B/C fields and no six-byte trailer in the stream.
        size = reader.count(len(reader.data))
        data = reader.take(size)
        if not 0 <= index < target_count:
            raise ValueError(f"property index {index}/{target_count} at 0x{start:x}")
        result.append({'offset': start, 'end': reader.pos, 'index': index,
                       'component': component, 'payload': payload_summary(component, data)})
    return result


def parse(data):
    r = Reader(data)
    if r.take(4) != b'KONG':
        raise ValueError('expected decrypted KONG container')
    version = r.unpack('i')
    if version not in (9, 11, 12, 13, 14, 15, 16):
        raise ValueError(f"research reader supports v9/v11-v16, got {version}")
    partition_size = r.unpack('i')
    unit = r.unpack('3f')
    sets = []
    for _ in range(r.count(100)):
        name = r.string()
        names = [r.string() for _ in range(r.count())]
        sets.append({'name': name, 'names': names})
    flags_offset = r.pos
    difficulty = r.boolean() if version >= 12 else False
    water = r.boolean() if version >= 15 else None
    addons = r.string() if version >= 16 else None
    handles = {}
    for _ in range(r.count(256) if version >= 11 else 0):
        key = r.unpack('B')
        if key in handles:
            raise ValueError(f'duplicate handle category {key}')
        handles[key] = [r.string() for _ in range(r.count())]
    layers = []
    for _ in range(r.count(256)):
        start = r.pos
        name = r.string()
        kind, options, count = r.unpack('3i')
        if count < 0 or count > 100000:
            raise ValueError(f'invalid layer count {count}')
        layer = {'offset': start, 'name': name, 'type': kind, 'options': options,
                 'declaredCount': count}
        if kind == 0:
            partitions = []
            for _ in range(count):
                part_start = r.pos
                px, pz = r.unpack('2h')
                tiles = []
                for _ in range(r.count()):
                    ts, ti, x, y, z, rot = r.unpack('hhBbBB')
                    if not 1 <= ts <= len(sets) or not -1 <= ti < len(sets[ts-1]['names']):
                        raise ValueError(f'invalid tile ({ts},{ti}) at 0x{r.pos - 8:x}')
                    tiles.append({'ts': ts, 'ti': ti, 'name': sets[ts-1]['names'][ti] if ti >= 0 else '[unresolved tile index -1]',
                                  'x': px * partition_size + x / 10,
                                  'y': y, 'z': pz * partition_size + z / 10,
                                  'rotation': rot, 'localBytes': [x, y, z]})
                properties = props(r, len(tiles))
                partitions.append({'offset': part_start, 'end': r.pos,
                                   'x': px, 'z': pz, 'tiles': tiles,
                                   'properties': properties})
            layer['partitions'] = partitions
        elif kind == 1:
            events = []
            for _ in range(count):
                event_name = r.string()
                pos = r.unpack('3f')
                if not all(math.isfinite(v) for v in pos):
                    raise ValueError('nonfinite event position')
                events.append({'name': event_name, 'position': pos})
            layer['events'] = events
            layer['properties'] = props(r, len(events))
        else:
            raise ValueError(f'unknown layer type {kind} at 0x{start:x}')
        layer['end'] = r.pos
        layers.append(layer)
    arrays_offset = r.pos
    arrays = {}
    # Native field order: floors, upperFloors, mergedWalls, nonUnitSizedWalls,
    # mergedUpperWalls, nonUnitSizedUpperWalls. v14 has all six.
    for name, fmt in [('floors', 'hhhBB'), ('upperFloors', 'hhhBB'),
                      ('mergedWalls', 'hhhBBhh'), ('nonUnitSizedWalls', 'ffhBBff'),
                      ('mergedUpperWalls', 'hhhBBhh'), ('nonUnitSizedUpperWalls', 'ffhBBff')]:
        # Native ReadFromStream: upperFloors >= 13; upper walls >= 14.
        if (name == 'upperFloors' and version < 13) or (name in ('mergedUpperWalls','nonUnitSizedUpperWalls') and version < 14):
            arrays[name] = {'offset':r.pos,'end':r.pos,'count':0,'recordSize':struct.calcsize('<'+fmt),'records':[],'present':False}
            continue
        start = r.pos
        count = r.count()
        records = [r.unpack(fmt) for _ in range(count)]
        arrays[name] = {'offset': start, 'end': r.pos, 'count': count,
                        'recordSize': struct.calcsize('<' + fmt), 'records': records}
    if r.pos != len(data):
        raise ValueError(f"unexplained {len(data)-r.pos} bytes at 0x{r.pos:x}")
    return {'version': version, 'partitionSize': partition_size, 'unitSize': unit,
            'flagsOffset': flags_offset, 'hasDifficultyLevels': difficulty,
            'useWaterFoam': water, 'addonsJsonData': addons,
            'tilesets': sets, 'handleNames': handles, 'layers': layers,
            'arraysOffset': arrays_offset, 'arrays': arrays,
            'bytesConsumed': r.pos, 'sha256': hashlib.sha256(data).hexdigest()}


def summary(doc):
    layer_stats = []
    allprops = []
    for layer in doc['layers']:
        partitions = layer.get('partitions', [])
        properties = layer.get('properties', []) + [p for part in partitions for p in part['properties']]
        allprops.extend(properties)
        layer_stats.append({'name': layer['name'], 'type': layer['type'],
                            'offset': hex(layer['offset']), 'end': hex(layer['end']),
                            'tiles': sum(len(p['tiles']) for p in partitions),
                            'events': len(layer.get('events', [])),
                            'properties': len(properties),
                            'payloadBytes': sum(p['payload']['bytes'] for p in properties)})
    return {'version': doc['version'], 'unitSize': doc['unitSize'],
            'hasDifficultyLevels': doc['hasDifficultyLevels'],
            'useWaterFoam': doc['useWaterFoam'], 'addonsJsonData': doc['addonsJsonData'],
            'bytesConsumed': doc['bytesConsumed'], 'sha256': doc['sha256'],
            'layers': layer_stats, 'totalProperties': len(allprops),
            'componentCounts': dict(collections.Counter(p['component'] for p in allprops)),
            'payloadFormats': dict(collections.Counter(p['payload']['format'] for p in allprops)),
            'arrays': {name: {k: a[k] for k in ('offset','end','count','recordSize')}
                       for name, a in doc['arrays'].items()}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', type=Path)
    ap.add_argument('--output', type=Path)
    ap.add_argument('--summary', type=Path)
    args = ap.parse_args()
    doc = parse(args.input.read_bytes())
    result = summary(doc)
    if args.output:
        args.output.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding='utf-8')
    if args.summary:
        args.summary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
