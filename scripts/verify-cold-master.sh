#!/usr/bin/env bash
#
# 校验冷母本资产副本完整性（检测丢失 / 位腐 / 损坏）。
# 用法: scripts/verify-cold-master.sh <资产目录>
# 示例: scripts/verify-cold-master.sh 维护者本地备份目录
#
# 校验基线: docs/cold-master.sha256（58 项 NBS+GB2260 sqlite，bare 文件名）。
# 退出码: 0 全部 OK；非 0 表示有缺失/不匹配条目。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUMFILE="$REPO_ROOT/docs/cold-master.sha256"

ASSET_DIR="${1:-}"
if [[ -z "$ASSET_DIR" ]]; then
  echo "用法: $0 <资产目录>" >&2
  exit 2
fi
if [[ ! -d "$ASSET_DIR" ]]; then
  echo "✗ 资产目录不存在: $ASSET_DIR" >&2
  exit 2
fi
if [[ ! -f "$SUMFILE" ]]; then
  echo "✗ 校验基线缺失: $SUMFILE" >&2
  exit 2
fi

echo "校验 $ASSET_DIR  (基线 $SUMFILE, $(wc -l < "$SUMFILE" | tr -d ' ') 项)"
cd "$ASSET_DIR"
if shasum -a 256 -c "$SUMFILE"; then
  echo "✓ 冷母本完整性校验通过"
else
  echo "✗ 校验失败：存在缺失或不匹配的资产（见上）" >&2
  exit 1
fi
