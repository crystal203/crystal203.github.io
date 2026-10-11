"""Native component readers, including CharacterPlaceholder versions 1–11.

Character v1–v11 come from native Deserialize at RVA 0x81fba74 and IsNpc
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
    elif component == 'Tilemaps.CharacterPlaceholder' and 1 <= version <= 11:
        from character_payload import read_character
        out.update(read_character(data), bytesConsumed=len(data), evidence='native Deserialize 0x76386911fa74 + complete payload consumption')
        return out
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
