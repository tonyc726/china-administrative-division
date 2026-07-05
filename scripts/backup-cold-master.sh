#!/usr/bin/env bash
#
# 创建/刷新冷母本资产的异地副本（rsync 增量 + 完成后自动校验）。
# 用法: scripts/backup-cold-master.sh <源目录> <目标目录>
# 示例: scripts/backup-cold-master.sh \
#         维护者本地备份目录 \
#         /Volumes/Backup/cndiv-cold-master
#
# 仅同步不可再生资产：NBS/GB2260 sqlite 与 data/ 原始 JSON。
# 显式排除 node_modules / pageCacheDB / logs 等可再生或体积噪音。
set -euo pipefail

SRC="${1:-}"
DEST="${2:-}"
if [[ -z "$SRC" || -z "$DEST" ]]; then
  echo "用法: $0 <源目录> <目标目录>" >&2
  exit 2
fi
if [[ ! -d "$SRC" ]]; then
  echo "✗ 源目录不存在: $SRC" >&2
  exit 2
fi
mkdir -p "$DEST"

echo "==> rsync 冷母本资产  $SRC  →  $DEST"
rsync -ah --info=progress2 \
  --include='NBS.*.sqlite' \
  --include='GB2260.*.sqlite' \
  --include='data/***' \
  --exclude='node_modules/***' \
  --exclude='pageCacheDB/***' \
  --exclude='logs/***' \
  --exclude='*' \
  "$SRC"/ "$DEST"/

echo "==> 校验目标副本完整性"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$REPO_ROOT/scripts/verify-cold-master.sh" "$DEST"

echo "✓ 备份完成并校验通过: $DEST"
