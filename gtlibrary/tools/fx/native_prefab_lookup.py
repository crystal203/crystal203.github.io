"""Build the export-prefab lookup without scanning each directory twice.

This is only a source archive lookup. AssetBundle conversion and dependency
selection continue to use the original ObjectPoolSpec and PPtr contracts.
"""
import os
from pathlib import Path
import sys


def prefab_index(root):
    """Return exactly the legacy ``{p.stem: p for p in root.rglob(...)}`` map.

    Python 3.12 rglob scans every directory for traversal, then again for the
    filename pattern. Its order is root, immediate children, then each child's
    children in walk order. Keep that order: duplicate stems use the last path,
    and changing it would silently change archived source identity. Cache only
    directory entries within this call, so edits are visible on the next import.
    Other Python versions retain their own pathlib behavior without assumptions.
    """
    root = Path(root)
    if sys.version_info[:2] != (3, 12):
        return {path.stem: path for path in root.rglob('*.prefab')}

    result = {}

    def scan(directory):
        children = []
        try:
            with os.scandir(directory) as entries:
                entries = list(entries)
            for entry in entries:
                # pathlib's final wildcard also matches directories and
                # symlinks; do not introduce an is_file() filter here.
                if os.path.normcase(entry.name).endswith('.prefab'):
                    path = Path(entry.path)
                    result[path.stem] = path
                try:
                    if entry.is_dir(follow_symlinks=False):
                        children.append(entry.path)
                except OSError:
                    pass
        except OSError:
            pass
        return children

    pending = [scan(root)]
    while pending:
        # Match Path.walk's order without repeating its scandir calls.
        siblings = pending.pop()
        descendants = [scan(directory) for directory in siblings]
        pending.extend(reversed(descendants))
    return result
