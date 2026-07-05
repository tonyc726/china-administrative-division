# 发布指南（npm publish）

本仓库有**两类包、两条发布路径**——分流的根因是数据包的源数据不在 CI。

| 类型 | 包 | 路径 | 为什么 |
|---|---|---|---|
| 代码包 | `@cndiv/core` · `data-protocol` · `cli` · `crawler` · `extractor` · `reader` | **changesets 自动（CI）** | `dist` 由 CI `pnpm build` 重建 |
| 数据包 | `@cndiv/source-2023` · `source-history` · `source-postal` | **本地 `npm publish`** | CSV 源数据（NBS 冷母本 / `legacy/data`）不在 git、CI 无法重建 |

> ⚠️ 数据包被 `.changeset/config.json` 的 `ignore: ["@cndiv/source-*"]` **完全排除出 changesets**（版本与发布均手动管理）；
> CI 的 changesets/action 不会碰任何 `source-*`——避免 CI 无 CSV 时发出缺数据的坏包。

---

## 前置（一次性）

1. **npm org `@cndiv`** —— 在 npmjs.com 创建 organization（scope 包归属）。已确认官方 npm 上 `@cndiv/*` 均未占用。
2. **GitHub repo secret `NPM_TOKEN`** —— npmjs.com → Access Tokens → 生成 **Automation** token，加到 repo Settings → Secrets。
3. **GitHub Actions 允许创建 PR** —— repo Settings → Actions → General → Workflow permissions → 勾选 **"Allow GitHub Actions to create and approve pull requests"**。否则 changesets/action 开 "Version Packages" PR 会因权限被拒。
4. **把 v2 合并进 `master`** —— `release.yml` 只在 push `master` 时触发；master 仍是 v1 时自动发布不会启动。
5. **本地 `npm login`** —— 数据包本地发布需要。
6. 确认本机 **Node 22 LTS**（`nvm use` 读 `.nvmrc`）。

> ⚠️ **本机 registry 是淘宝镜像（只读）**：全局 `~/.npmrc` 设了 `registry=https://registry.npmmirror.com`，直接 `npm publish` 会失败。本仓库各包已在 `package.json` 的 `publishConfig.registry` 钉死 `https://registry.npmjs.org/`，故 `npm publish` / `changeset publish` 会走官方源、不受镜像影响。CI 侧由 `release.yml` 的 `setup-node registry-url` 保证。
>
> 🔒 **安全**：`~/.npmrc` 若存过明文 `_authToken`，务必用 Automation token 且定期轮换；token 一旦外泄立即在 npmjs.com Revoke。

---

## 代码包发布（changesets，自动）

1. 开发时，每个面向消费者的改动加 changeset：`pnpm changeset`（选包 + bump 级别 + 写 changelog）。
2. **push 到 `master`** → `release.yml` 自动建 **"Version Packages" PR**（聚合 changeset、bump 版本、生成 `CHANGELOG.md`）。
3. **合并该 PR** → workflow 自动 `pnpm release`（`pnpm build && changeset publish`）发到 npm。
4. 首发依赖顺序由 pnpm 按 workspace 拓扑自动处理（`core → data-protocol → cli/crawler/extractor/reader`）。

> 也可本地一次性首发：`pnpm changeset version && pnpm release`（需先 `npm login`）。

---

## 数据包发布（本地，需源数据）

> CI 无冷母本 / `legacy` 数据，**必须在有源数据的机器本地发布**。发布前务必重建 CSV，使 `manifest.json` 的 SHA-512 与 CSV 一致。

### `@cndiv/source-2023`（NBS 五级，~52.7MB）

```bash
pnpm --filter @cndiv/cli build
# 需冷母本 NBS.2023.sqlite（见 docs/DATA-ASSETS.md）
node packages/cli/dist/scripts/build-source.js \
  --input=<冷母本路径>/NBS.2023.sqlite --year=2023 \
  --output=packages/source-2023/data/divisions.csv
cd packages/source-2023 && npm publish --access public
```

### `@cndiv/source-history`（GB2260 历史 1980–2021，~9.2MB）

```bash
# 需 legacy/data/GB2260/*.json.gz（source-history 唯一重建源，请确保已冷母本备份）
pnpm --filter @cndiv/cli build
cndiv migrate --input=legacy/data/GB2260 --output=dist/h.db \
  --csv=packages/source-history/data/divisions.csv
cd packages/source-history && npm publish --access public
```

### `@cndiv/source-postal`（邮编/区号，~110kB）

```bash
# postal.csv 已入 git（无需重建）；如需刷新可重爬：pnpm --filter @cndiv/crawler crawl:postal
cd packages/source-postal && npm publish --access public
```

---

## 发布后验证

```bash
cndiv hydrate --year=2023      # 从 npm 拉取 → 注水到 ~/.cndiv/cache.db
cndiv hydrate --year=history   # @cndiv/source-history
```

注水日志出现 `Integrity: manifest SHA-512 verified ✅` 即闭环成功。

---

## 发布前 FMEA 清单

- [x] 代码包 `files: ["dist"]` 已设（不泄漏 `src/test`）—— 已 `npm pack --dry-run` 验证
- [x] 各包含 README（npm 页面说明）
- [ ] 数据包 CSV 已**重新生成**，`manifest.json` 的 SHA-512 与 CSV 实际一致
- [ ] `better-sqlite3` prebuilt 覆盖消费者平台（Node 22 darwin/linux/win）
- [ ] npm org `@cndiv` 已建、`NPM_TOKEN`（Automation）有效
- [ ] 版本号符合预期（`pnpm changeset status` 复查 release plan）
