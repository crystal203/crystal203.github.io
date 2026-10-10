"""Component readers for versions present in the afterworld samples.

Character v9 comes from native Deserialize at RVA 0x81fba74 and IsNpc
at 0x81fafcc. Unknown names remain field_<native object offset>, not guesses.
TileProp v5 is corroborated by its native reader and all sampled payloads.
The other small layouts are data-derived; their semantic names are tentative.
"""
from strict_kong import Reader
import json


def read_component(component, data):
    r = Reader(data)
    version = r.unpack('i')
    out = {'version': version}
    if component == 'Tilemaps.TileProp' and version == 5:
        out['keyIndex'] = r.unpack('i')
        spec = r.string()
        out['overriddenComponentSpec'] = json.loads(spec) if spec else None
        out['statUpdateType'] = r.unpack('B')
        out['deactivateOnStart'] = r.boolean()
        condition = r.unpack('i')
        out['activationConditionType'] = condition
        if condition == 1:
            out['field_0x34'] = r.unpack('i')
            out['field_0x38'] = r.string()
        out['evidence'] = 'native reader + complete payload consumption'
    elif component == 'Tilemaps.CharacterPlaceholder' and version == 9:
        out['characterId'] = r.string()
        kind = r.unpack('B')
        out['kind'] = kind
        out['field_0x3c'] = r.unpack('i')
        out['field_0xf0'] = r.string()
        out['field_0xf8'] = r.unpack('i')
        out['field_0xfc'] = r.unpack('i')
        out['field_0x30'] = [{'tag': r.unpack('B'), 'value': r.string()}
                             for _ in range(r.count())]
        out['field_0x38'] = r.unpack('i')
        out['field_0x40'] = r.boolean()
        if kind in (1, 2):  # Native IsNpc: unsigned(kind - 1) < 2.
            for key in ('0x60', '0x68', '0x70', '0x78', '0x80'):
                out['field_' + key] = r.string()
            out['field_0xa8'] = r.boolean()
            out['field_0xa9'] = r.boolean()
            out['field_0x44'] = r.unpack('i')
            out['field_0x48'] = r.boolean()
            out['field_0x4c'] = r.unpack('i')
            out['field_0x41'] = r.boolean()
            mode = r.unpack('i')
            out['field_0x50'] = mode
            if mode == 1:
                out['field_0x54'] = r.unpack('i')
            if mode in (1, 2):
                out['field_0x58'] = r.string()
            out['hasAppearanceOverride'] = r.boolean()
            if out['hasAppearanceOverride']:
                out['field_0x88'] = r.string()
                out['field_0x90_color32'] = r.unpack('4B')
                out['field_0xa0'] = r.unpack('f')
        if kind != 1:
            out['field_0xb0'] = r.string()
            out['field_0xb8'] = r.string()
            out['field_0xc0'] = r.unpack('i')
            out['field_0xc8'] = r.unpack('B')
            out['field_0xd0'] = [r.unpack('iiif') for _ in range(r.count())]
        spec = r.string()
        out['overriddenComponentSpec'] = json.loads(spec) if spec else None
        out['evidence'] = 'native reader + complete payload consumption'
    elif component == 'Oak.ShearController' and version == 0:
        out['shearCandidate'] = r.unpack('f')
        out['evidence'] = 'data-derived; native semantics pending'
    elif component == 'Tilemaps.Marker' and version == 1:
        out['values'] = r.unpack('2i')
        out['evidence'] = 'data-derived; field semantics pending'
    elif component in ('Tilemaps.Region', 'Tilemaps.MinimapLayerRegion') and version == 4:
        out['centerCandidate'] = r.unpack('3f')
        out['sizeCandidate'] = r.unpack('3f')
        if component == 'Tilemaps.MinimapLayerRegion':
            out['layerCandidate'] = r.unpack('i')
            out['assetName'] = r.string()
            out['flagA'] = r.boolean()
            if out['flagA']:
                out['color32Candidate'] = r.unpack('4B')
            out['flagB'] = r.boolean()
            out['hasOffsetCandidate'] = r.boolean()
            if out['hasOffsetCandidate']:
                out['offsetCandidate'] = r.unpack('2f')
            out['flagC'] = r.boolean()
        out['evidence'] = 'data-derived; bounds semantics pending native confirmation'
    else:
        return None
    if r.pos != len(data):
        raise ValueError(f'{component} v{version}: {len(data)-r.pos} unexplained bytes')
    out['bytesConsumed'] = r.pos
    return out
