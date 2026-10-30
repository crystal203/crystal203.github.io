"""Resolve fully opened source special nodes at a Hero's actual rank.

AwakeningTree.Construct (0x88d3178) consumes SpecialNodes in tree order,
adding key*100000 to special-node IDs. Rank/LimitBreak are decimal fields
decoded by 0x88d3b44/0x88d3bc4; visibility rejects either field above the
requested rank/tier (0x88d36ec). No resource or character name selects behavior.
"""
import hashlib
import json
from pathlib import Path


class SourceAwakening:
    def __init__(self, source):
        source = Path(source)
        names = ('charactertreeconfig.json', 'awakeningtreenodes.json', 'awakeningnodedata.json')
        data = {name: json.loads((source/name).read_text(encoding='utf8')) for name in names}
        self.configs = {row['OriginId']: row for row in data[names[0]]}
        self.trees = data[names[1]]
        self.options = {(row.get('OriginId'), row['Id']): row for row in data[names[2]]['NodeOptions']}
        self.overrides = {(row.get('OriginId'), row['Id']): row for row in data[names[2]].get('OverrideOptions', [])}
        self.provenance = dict(files={name: hashlib.sha256((source/name).read_bytes()).hexdigest() for name in names},
                               methods='0x88d3178/0x88d18d4/0x88d3b44/0x88d3bc4/0x88d36ec/0x88d178c',
                               policy='full visible special nodes at Hero.Rank; maximum source limit-break tier')

    def for_hero(self, hero, limit_break=None, need_spec_override=False):
        origin = hero.get('OriginId')
        rank = hero.get('Rank', 0)
        config = self.configs.get(origin)
        if not config:
            return dict(rank=rank, limitBreak=0, optionIds=[], options=[], tree=None)
        tree = config['AwakeningTreeName']
        nodes = self.trees[tree]
        if limit_break is None:
            limit_break = max([0]+[node//1000 % 10 for node in nodes if node//10000 % 10 <= rank])
        special_keys = iter(config['SpecialNodes'])
        count = 0
        selected = []
        for raw in nodes:
            if raw//1000000000 != 2:
                continue
            try:
                key = next(special_keys)
            except StopIteration:
                raise ValueError('Source awakening special-node list is too short: '+tree) from None
            count += 1
            node = raw+key*100000
            node_rank, node_limit = node//10000 % 10, node//1000 % 10
            if node_rank > rank or node_limit > limit_break:
                continue
            # GetNodeOptionData passes OriginId only for special nodes. Source
            # override rows are selected only by the native spec-override flag.
            option = (self.overrides.get((origin, key)) if need_spec_override else None)
            option = option or self.options.get((origin, key)) or self.options.get((None, key))
            if not option:
                raise ValueError(f'Missing source awakening option {origin}/{key} in {tree}')
            selected.append(dict(option, nodeId=node, rawNodeId=raw,
                                 requiredRank=node_rank, requiredLimitBreak=node_limit))
        if count != len(config['SpecialNodes']):
            raise ValueError('Source awakening special-node count differs from native tree: '+tree)
        return dict(rank=rank, limitBreak=limit_break, tree=tree,
                    optionIds=sorted({row['OptionId'] for row in selected if row.get('OptionId')}),
                    options=selected, specOverride=bool(need_spec_override))
