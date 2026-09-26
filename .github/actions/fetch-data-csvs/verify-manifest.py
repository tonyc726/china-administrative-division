#!/usr/bin/env python3
"""复核物化 CSV 的内容完整性：sha512 必须与仓库内 manifest.json 的声明一致。

manifest.json 入 git（~400B），是内容锚点；CSV 本体来自 npm 包。两者对不上
说明包错发/被篡改/构建口径漂移——直接失败，不放进门禁与站点构建。
"""
import hashlib
import json
import pathlib
import sys

bad = False
for pkg_dir in sys.argv[1:]:
    data = pathlib.Path(pkg_dir) / 'data'
    csv = data / 'divisions.csv'
    declared = json.loads((data / 'manifest.json').read_text())['sha512']
    actual = hashlib.sha512(csv.read_bytes()).hexdigest()
    if actual != declared:
        print(f'✗ {csv}: SHA-512 不符（实测 {actual[:16]}…，manifest 声明 {declared[:16]}…）')
        bad = True
    else:
        print(f'✓ {csv}: SHA-512 与 manifest 一致')
sys.exit(1 if bad else 0)
