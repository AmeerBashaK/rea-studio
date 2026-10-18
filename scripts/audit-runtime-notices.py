# SPDX-License-Identifier: AGPL-3.0-only
"""Check installed npm package/version coverage, not legal sufficiency."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('engine', type=Path)
args = parser.parse_args()
root = args.engine.resolve()
notices = (root / 'licenses/npm-runtime-notices.txt').read_text(encoding='utf-8')
known = set(re.findall(r'^===== (.+) =====$', notices, re.M))
items = []

def scan(nm):
    if not nm.exists():
        return
    for child in sorted(nm.iterdir()):
        if child.name.startswith('.'):
            continue
        packages = sorted(child.iterdir()) if child.name.startswith('@') and child.is_dir() else [child]
        for package in packages:
            manifest = package / 'package.json'
            if not manifest.is_file():
                continue
            data = json.loads(manifest.read_text(encoding='utf-8'))
            key = data['name'] + '@' + data['version']
            items.append({'package': key, 'path': package.relative_to(root).as_posix(), 'noticeListed': key in known})
            scan(package / 'node_modules')

scan(root / 'node_modules')
missing = [item for item in items if not item['noticeListed']]
print(json.dumps({'scope': 'Installed npm manifests only; does not verify license completeness, binaries, or source obligations.', 'count': len(items), 'missing': missing, 'items': items}, indent=2))
raise SystemExit(1 if missing or not items else 0)
