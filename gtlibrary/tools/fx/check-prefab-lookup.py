"""Pure lookup equivalence check; never imports or rewrites a character."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import time

from native_prefab_lookup import prefab_index


def compare(root):
    start = time.perf_counter()
    legacy = {path.stem: path for path in root.rglob('*.prefab')}
    legacy_seconds = time.perf_counter() - start
    start = time.perf_counter()
    actual = prefab_index(root)
    lookup_seconds = time.perf_counter() - start
    assert actual == legacy, 'Source prefab identity changed'
    assert list(actual) == list(legacy), 'Lookup insertion order changed'
    digest = hashlib.sha256(json.dumps(
        [(key, str(path.relative_to(root))) for key, path in actual.items()],
        ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    return {'uniqueStems': len(actual), 'lookupSha256': digest,
            'legacySeconds': round(legacy_seconds, 6),
            'lookupSeconds': round(lookup_seconds, 6)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='gt-prefab-lookup-') as directory:
        root = Path(directory)
        # Duplicate stems in siblings and descendants make traversal order
        # observable. Include the original wildcard's case/directory behavior.
        for relative in ('same.prefab', 'a/same.prefab', 'b/same.prefab',
                         'a/deep/same.prefab', 'b/deep/same.prefab',
                         'a/deep/order.prefab', 'b/order.prefab',
                         'a/upper.PREFAB', 'a/ignore.prefab.meta'):
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(relative, encoding='utf8')
        (root / 'directory.prefab').mkdir()
        fixture = compare(root)
        lookup = prefab_index(root)
        assert lookup['same'] == root / 'b/deep/same.prefab'
        assert lookup['directory'] == root / 'directory.prefab'
        assert lookup['upper'] == root / 'a/upper.PREFAB'
        assert 'ignore' not in lookup
        assert prefab_index(root / 'missing') == {}
        print(json.dumps({'fixture': fixture, 'missingRoot': 'passed',
                          'duplicateLastWins': 'passed',
                          'directoryAndCase': 'passed'}, ensure_ascii=False))
    if args.root:
        print(json.dumps({'sourceRoot': str(args.root), **compare(args.root)},
                         ensure_ascii=False))


if __name__ == '__main__':
    main()
