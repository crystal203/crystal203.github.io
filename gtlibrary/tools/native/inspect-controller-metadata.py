"""Bounded type inspection for the inspected, protected IL2CPP metadata layout.

This recovers metadata names, not native function addresses. Old symbol labels
and neighboring type-registration indices must never be treated as identities.
"""
import argparse
import importlib.util
import json
import struct
from pathlib import Path

TABLES = ('stringLiteral stringLiteralData string events properties methods '
          'parameterDefaultValues fieldDefaultValues defaultValueData fieldMarshaledSizes '
          'parameters fields genericParameters genericParameterConstraints genericContainers '
          'nestedTypes interfaces vtableMethods interfaceOffsets typeDefinitions images '
          'assemblies fieldRefs referencedAssemblies attributeData attributeDataRange '
          'unresolvedVirtualCallParameterTypes unresolvedVirtualCallParameterRanges '
          'windowsRuntimeTypeNames windowsRuntimeStrings exportedTypeDefinitions').split()
XOR66 = bytes([v ^ 0x66 for v in range(256)])


class ControllerMetadata:
    """Accepts the header-decoded bytes from NativeImage, with bounded strings."""
    def __init__(self, data):
        self.data = bytes(data)
        if len(data) < 8 + len(TABLES) * 8:
            raise ValueError('Truncated metadata header')
        # This APK protects the magic/version too; NativeImage decodes bytes
        # 8..4095 only. Do not misreport the protected version word as v29.
        if struct.unpack_from('<II', data) != (0x12724394, 0xec9e4b18):
            raise ValueError('Only the inspected protected metadata signature is supported')
        self.tables = {}
        for i, name in enumerate(TABLES):
            offset, size = struct.unpack_from('<II', data, 8 + i * 8)
            if offset > len(data) or size > len(data) - offset:
                raise ValueError('Metadata table outside file: ' + name)
            self.tables[name] = (offset, size)
        self.types = []
        self.byval = {}
        for index, raw in enumerate(self.rows('typeDefinitions', '<16i8H2I')):
            name, namespace = self.string(raw[0]), self.string(raw[1])
            row = dict(index=index, name=name, namespace=namespace,
                       fullName=(namespace + '.' if namespace else '') + name,
                       byvalTypeIndex=raw[2], fieldStart=raw[8], methodStart=raw[9],
                       methodCount=raw[16], fieldCount=raw[18], token=hex(raw[-1]))
            self.types.append(row)
            self.byval.setdefault(raw[2], []).append(row)

    def rows(self, table, fmt):
        offset, size = self.tables[table]
        stride = struct.calcsize(fmt)
        if size % stride:
            raise ValueError('Unexpected table stride: ' + table)
        for i in range(offset, offset + size, stride):
            yield self.record(table, fmt, i)

    def record(self, table, fmt, offset):
        raw = self.data[offset:offset + struct.calcsize(fmt)]
        token_at, prefix = {'typeDefinitions':(-4, 0x02000000),
                            'fields':(8, 0x04000000), 'methods':(24, 0x06000000),
                            'parameters':(4, 0x08000000)}.get(table, (None, None))
        if token_at is not None:
            token = struct.unpack_from('<I', raw, token_at if token_at >= 0 else len(raw) + token_at)[0]
            if token & 0xff000000 != prefix and (token ^ 0x66666666) & 0xff000000 == prefix:
                raw = raw.translate(XOR66)
        return struct.unpack(fmt, raw)

    def row(self, table, fmt, index):
        offset, size = self.tables[table]
        stride = struct.calcsize(fmt)
        if index < 0 or index >= size // stride:
            raise ValueError('Metadata row outside table: ' + table)
        return self.record(table, fmt, offset + index * stride)

    def string(self, index):
        offset, size = self.tables['string']
        if index < 0 or index >= size:
            return '<unresolved-name:' + str(index) + '>'
        start = offset + index
        # Do not search/slice the rest of this large file when a terminator is
        # absent. Both encoded and plaintext terminators must be inside 512 B.
        end_limit = min(start + 512, offset + size)
        for terminator, xor in [(0, 0), (0x66, 0x66)]:
            end = self.data.find(bytes([terminator]), start, end_limit)
            if end < start:
                continue
            # XOR-encoded names beginning with 'f' begin with 0x00. They are
            # not empty strings. Index 8 is this inspected pool's empty name.
            if end == start and index != 8:
                continue
            try:
                raw = self.data[start:end]
                value = (raw.translate(XOR66) if xor else raw).decode('utf8')
            except UnicodeDecodeError:
                continue
            if value.isprintable() or not value:
                return value
        return '<unresolved-name:' + str(index) + '>'

    def describe(self, row):
        result = dict(row)
        result['fields'] = []
        result['methods'] = []
        result['membersTruncated'] = row['fieldCount'] > 256 or row['methodCount'] > 256
        for j in range(min(row['fieldCount'], 256)):
            name, typ, token = self.row('fields', '<3I', row['fieldStart'] + j)
            result['fields'].append(dict(index=row['fieldStart'] + j, name=self.string(name),
                                         typeIndex=typ, token=hex(token)))
        for j in range(min(row['methodCount'], 256)):
            raw = self.row('methods', '<7I4H', row['methodStart'] + j)
            if raw[1] != row['index']:
                result['methods'].append(dict(index=row['methodStart'] + j,
                                              status='unresolved-protected-record'))
                continue
            parameters=[]
            for k in range(raw[-1]):
                name,token,typ=self.row('parameters','<3I',raw[4]+k)
                parameters.append(dict(name=self.string(name),typeIndex=typ,token=hex(token)))
            result['methods'].append(dict(index=row['methodStart'] + j, name=self.string(raw[0]),
                                          token=hex(raw[6]), parameterCount=raw[-1],parameters=parameters))
        return result

    def usage(self, word):
        if not 0 <= word <= 0xffffffff:
            raise ValueError('Usage must be a uint32')
        kind, index = word >> 29, (word & 0x1fffffff) >> 1
        result = dict(word=hex(word), kind=kind, index=index)
        # TypeInfo usages index Il2CppType registrations. The by-value index in
        # TypeDefinition resolves only direct entries, never by-ref/generic ones.
        if kind == 1:
            matches = self.byval.get(index, [])
            result['directTypes'] = [r['fullName'] for r in matches]
            result['resolved'] = len(matches) == 1
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', type=Path, required=True)
    parser.add_argument('--type', action='append', default=[])
    parser.add_argument('--contains', action='append', default=[])
    parser.add_argument('--usage', type=lambda s: int(s, 0), action='append', default=[])
    parser.add_argument('--limit', type=int, default=32)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--list-only', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.limit <= 256:
        parser.error('--limit must be 1..256')
    if not (args.type or args.contains or args.usage):
        parser.error('Specify --type, --contains or --usage; unbounded dumps are disabled')
    spec = importlib.util.spec_from_file_location('native_workbench', Path(__file__).with_name('native-workbench.py'))
    workbench = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(workbench)
    native = workbench.NativeImage(args.profile)
    try:
        metadata = ControllerMetadata(native.metadata)
        selected = [r for r in metadata.types if r['name'] in args.type or r['fullName'] in args.type
                    or any(s in r['fullName'] for s in args.contains)]
        result = dict(schema=1, apkSha256=native.profile['apkSha256'],
                      elfSha256=native.profile['elfSha256'],
                      limitations=['Names/tokens only; this does not map tokens to native code addresses.',
                                   'Unresolved registrations need MetadataRegistration; no adjacent-index guessing.',
                                   'Protected metadata names remain explicitly unresolved.'],
                      matchedTypes=len(selected), truncated=len(selected) > args.limit,
                      types=[dict(r) if args.list_only else metadata.describe(r) for r in selected[:args.limit]],
                      usages=[metadata.usage(word) for word in args.usage])
        raw = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            temporary = args.output.with_name(args.output.name + '.tmp')
            temporary.write_text(raw, 'utf8')
            temporary.replace(args.output)
            print(json.dumps(dict(types=len(result['types']), usages=len(result['usages']),
                                  truncated=result['truncated'], output=str(args.output)), ensure_ascii=False))
        else:
            print(raw)
    finally:
        for mapped in native.maps:
            mapped.close()
        for file in native.files:
            file.close()


if __name__ == '__main__':
    main()
