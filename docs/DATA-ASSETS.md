# 数据资产清单与完整性校验（china-administrative-division）

> 基准：维护者本地备份目录（约 3.9G 完整资产，未纳入 git，属单点资产）。
> 用途：异地备份前的完整性基线。恢复后用 `shasum -a 256 -c` 校验。

## 一、SQLite 成品库（核心不可再生资产）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `GB2260.1980.sqlite` | 0.2MB | `52241905acd45960db81b5db5ab13ceabcaae2d50a3c357f8e6481570c572175` |
| `GB2260.1981.sqlite` | 0.2MB | `6fdec3ec8bb3ccacf3973af00c0c10e137a2c2661b5f0df3f7f44c33f09596d0` |
| `GB2260.1982.sqlite` | 0.2MB | `7a981ed834e047a5c602074374229839e01fef0b90abb589d41449d6dcf2780e` |
| `GB2260.1983.sqlite` | 0.2MB | `c089a66017d342e942bc8a1f279d8229376ce16c00e0f0ef5558f698c6d1cf15` |
| `GB2260.1984.sqlite` | 0.2MB | `b1457596f2f7d828b9837ab802165fca2a366cc4e154276cf0937bf603fb56ba` |
| `GB2260.1985.sqlite` | 0.2MB | `76a899f331c59310c0018ee9dd02e7ea81e051b74b90ca42bb0173a4b057f6bd` |
| `GB2260.1986.sqlite` | 0.2MB | `b60756d5d51ba9789688ab2accb951cbce5b45cf5c3f8c1a71251c4402743996` |
| `GB2260.1987.sqlite` | 0.2MB | `543eb07d44c50cc3618e3ece516a15ccaf5e5a57671790cba2d9ba6acbe7f9c4` |
| `GB2260.1988.sqlite` | 0.2MB | `7c018b95cd2064630157425692d4a7b56298a129c95177bf16d422255cc6d56c` |
| `GB2260.1989.sqlite` | 0.2MB | `302a62cd0bcd0e31a5e74ecb8641f523f1b846fb69eecc73fe509979e3e1cbce` |
| `GB2260.1990.sqlite` | 0.2MB | `ec0e8b73588866fa173b20dd537534058b9d47663b87a688e40ddd885a555817` |
| `GB2260.1991.sqlite` | 0.2MB | `bd2938d9ce34670d3d328c2357ca00f9c7efa760d273fb903100306db9b11788` |
| `GB2260.1992.sqlite` | 0.2MB | `d7f7e9888789935e546169d2cdbeeacd7b201fb76ccb00715b81574fafaecd8f` |
| `GB2260.1993.sqlite` | 0.2MB | `a5fe5659308f541eb9b64374f17f0a0be2b214839c8c86476bbcf6c2b33919a7` |
| `GB2260.1994.sqlite` | 0.2MB | `b47ac42ba323ced49bace253ed404c794c54f46f07ccf832c455b766294ec476` |
| `GB2260.1995.sqlite` | 0.2MB | `590f3fdf22260441d70d30e7d832e3f8970fe0b20cbf5a00ddd76c66a7bf46c9` |
| `GB2260.1996.sqlite` | 0.2MB | `57a55db976bd4c51c77435d0b0d0743330c2bf4167e637776f68232d455ddadd` |
| `GB2260.1997.sqlite` | 0.2MB | `5f95e452cfeb680dcae62162782f002ae2cef2913b27018e19262866bd1c7eb7` |
| `GB2260.1998.sqlite` | 0.2MB | `fe0d55e6c4885b02f13f326e01ee0eaec3ed52fb6c7ce834c9de4a81bea40659` |
| `GB2260.1999.sqlite` | 0.2MB | `a17a183f9d730fe51f6e58f40b68fbde8773deca2c9fde3df2626a5db26a872d` |
| `GB2260.2000.sqlite` | 0.2MB | `a18ec9a9f1be58aa448b15110d9dda54c369b08b749c607274cb6b3abb8d288d` |
| `GB2260.2001.sqlite` | 0.2MB | `8cf9bc8a21226ee00626a33424566e8052a6afa07c67d991258e254f78b8da76` |
| `GB2260.2002.sqlite` | 0.2MB | `e2e6379c9fc7fc78a8de67fa0a652d54878e69b7bf133082b4a3a3301f722de0` |
| `GB2260.2003.sqlite` | 0.2MB | `7059fe33a0b8347263e2fdd6ba60e72f78c8fe7df4c235e83188d9fa75baaa76` |
| `GB2260.2004.sqlite` | 0.2MB | `84200a6c81b23545af8d53dd0e3bff1af0782b779a334e68be84efd695f9f0b7` |
| `GB2260.2005.sqlite` | 0.2MB | `a45dba982bfb65ad3694ed485bec332119e7d37a42000666d2a3827c30a73605` |
| `GB2260.2006.sqlite` | 0.2MB | `94ce0d9b0ab248f6c5ee749ce0f0038d4b7d9d9bfd8bfe8063749c26c38b610a` |
| `GB2260.2007.sqlite` | 0.2MB | `fabc20c94d8758220cbf84fd0d10924fc3946472c2b7c9c8be802f2eab44ee89` |
| `GB2260.2008.sqlite` | 0.2MB | `fabc20c94d8758220cbf84fd0d10924fc3946472c2b7c9c8be802f2eab44ee89` |
| `GB2260.2009.sqlite` | 0.2MB | `b80931c890b005f5f559faa04385702a41846f933e3b9080f5fe72d66532e2f8` |
| `GB2260.2010.sqlite` | 0.2MB | `bf91c0203ef64fe793fa8954e429fc25e8344b0289049d22b357d4d22e89b42b` |
| `GB2260.2011.sqlite` | 0.2MB | `1560e98b416cb6cf9d8dfec4b91a39ac42f412bca10b47df1048e32167c3e2cf` |
| `GB2260.2012.sqlite` | 0.2MB | `b3f5a67c976bb41106d477ea1634480b29653bfb80d6c111f37bc637e264dc8a` |
| `GB2260.2013.sqlite` | 0.2MB | `8867b3ba71cd6c25cc56dff1dff18df89c79390c9c4c053eb5ef1af80d134bbf` |
| `GB2260.2014.sqlite` | 0.2MB | `3c88efd46afe6af92d06c6c45b26e31e3b6de0b254222d70a1715eecd22efe8d` |
| `GB2260.2015.sqlite` | 0.2MB | `ed4b556bceee90fe850df235276369b57273c421d0d3655b9028fa3c6e1d5ec4` |
| `GB2260.2016.sqlite` | 0.2MB | `8b72b6b83b3eed0f96fd57f2026996592c1a75659cef7eb3c10482ced607bb7a` |
| `GB2260.2017.sqlite` | 0.2MB | `6854ea94930914e6ce277a518beff5cf3ea78ab42f497bc940ed9be89d2e2fbd` |
| `GB2260.2018.sqlite` | 0.2MB | `3429fce81abb2781775125cdbfe24d26f031bc319e80f3441c80658100cf1e4e` |
| `GB2260.2019.sqlite` | 0.2MB | `878ae77143ae9b924ae1db055d447f658b76af7e7baf103e7039dd5d638dba8c` |
| `GB2260.2020.sqlite` | 0.2MB | `8cbb85d6bb579289ec1b7f8f2540b4ccef9091290efed4514409764ba5ba4c33` |
| `GB2260.2021.sqlite` | 0.2MB | `fe56f18ccbe3b2c95299ef38e315496fbbad1dfdd63183c7cabc8cfd8656aa43` |
| `GB2260.2022.sqlite` | 0.2MB | `fe56f18ccbe3b2c95299ef38e315496fbbad1dfdd63183c7cabc8cfd8656aa43` |
| `GB2260.2023.sqlite` | 0.2MB | `da8bd578e875b1e3236ebfcf355c2dae58ba742cb7baa77c0be748df27fca196` |
| `NBS.2009.sqlite` | 61.8MB | `bbcd0614a02830d7d0ecd4041e4355baed37a7d507350b03ef5c7d85d2e61b80` |
| `NBS.2010.sqlite` | 61.6MB | `e56ce7a55df2616b7cbaffdd1096cbada446c24d036371661fe2428edd31e838` |
| `NBS.2011.sqlite` | 61.4MB | `529b0b4880073e898d9966cc3c8f0f24dd9f8455790c8477ae752434bfe7e2e2` |
| `NBS.2012.sqlite` | 61.5MB | `45404aebf989f14dfcef1a075f5efe9bf1222953175114cca39cf7a272e0fa08` |
| `NBS.2013.sqlite` | 61.5MB | `6acfad61c77696956504976b80079e1d1299f0109f8153ce4521eb75e1e79dfd` |
| `NBS.2014.sqlite` | 59.2MB | `757b5961c9622c54ffc904aa7e9edc0772ae4577de91fe01d5c353f3f645e9aa` |
| `NBS.2015.sqlite` | 59.0MB | `9b3b1ede7c41bb2072040f1566c161aad1ab25aebb207c1a779b2a3546406f83` ⟵ 已重建，见 §八 |
| `NBS.2016.sqlite` | 59.4MB | `2737e30e712a9ef9c6613d0b31d1a48165cda2c0e593f39e05e5df289b7aa6f6` |
| `NBS.2017.sqlite` | 60.0MB | `20cdf6f88cb3fbd1aae6135e2027dab8fcf14485ace6f465121b65e5cfb1b056` |
| `NBS.2018.sqlite` | 59.5MB | `90c56b1b4a49b0a96570c52313402811d98d797e1df63b0a07aa55496e0fbc2c` |
| `NBS.2019.sqlite` | 59.0MB | `b115a9cc7598befffe1832d2650394d218f0e68ef7a5be86f0c06af8ed6aff3d` |
| `NBS.2020.sqlite` | 57.0MB | `9f485fc09091242226b83a6070ed041506996a0aa013dbde32f7dec62eb7796d` |
| `NBS.2021.sqlite` | 55.9MB | `3d33c5f7f43f1374b239961c8977d337b6ce0545604c2c18e87027b4b0a612b0` |
| `NBS.2022.sqlite` | 56.2MB | `2727e38d17bb191e80b71ac6421bb2fbff3fbc1918ed57a1bf99479406237478` |
| `NBS.2023.sqlite` | 56.4MB | `02b89aab3e4e08daf1395ffa06cec9f372001dc0cd3fef1e462ce471f0ce8de3` |

## 二、原始 JSON（stats.gov.cn / NBS 嵌套树，可作 SQLite 溯源）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `2009.json` | 125.2MB | `17cd707d89368c2ff37b5a2e80e82ada58b6e839889f36074af5d7b2d86f0b55` |
| `2010.json` | 124.6MB | `76805ef160110ab28daf4182f91133172afb6839c78067cf0671bfa2cf8b32c1` |
| `2011.json` | 124.3MB | `109c355cdb6f2f7693af0b4477599dc83696b723e17488ef64023e7831338149` |
| `2012.json` | 124.4MB | `738faeccfc38ca05b1722018db29d1e7a8b8705bc5341ace9f2674ca557eb6f9` |
| `2013.json` | 124.4MB | `012dcd41d56ce54ddd91088b2817f5d5bfb1340b8545f36fa66587a6f581b315` |
| `2014.json` | 119.7MB | `a4392b0813d8a1814135e78f91a91d83522d5dc1144211aa7fcc2ff5fcf81a70` |
| `2015.json` | 119.2MB | `464b3b554e01e36f31bbdb45ad9c3011b5aa4ef64438c82596a3d2f3e6403719` |
| `2016.json` | 228.3MB | `762a9a6d92717aa493d34fb40e28d2ce67215568f0b0ff182aabc1ca174aa377` |
| `2017.json` | 230.4MB | `51764965526ded2e6e1839348b150293fd41de6d2e8ee5d1448d4f98f4a82196` |
| `2018.json` | 228.1MB | `f0c31ba26e4a4b7c68bc2ffc4de51acdda9ff30bb275c65963f85d6fd4a965f0` |
| `2019.json` | 225.3MB | `4ffa9e4c33632c657ace1753aed095203d0deaf93468827bee6fbbd40d4897cb` |
| `2020.json` | 217.3MB | `a7cf5b0c445ec23f22ac8ab20a7fc20a3adbd53fde0e996f50c381e8527b8060` |
| `2021.json` | 212.2MB | `a82fa7bb6e97078ddc4a9b39da6222ed87c23501ce5fbca3d53bd9a90e01bbff` |
| `categoryCodes.2009.json` | 16.7MB | `296b8008656fc54ac239d5dc8ea741ae3161fe48f40234d3f459d5e5dde18b8b` |
| `categoryCodes.2010.json` | 16.6MB | `72461ca51f302b1e7eac9262c2ca353f51d4f628a4b66ca66483396ad3d46cf7` |
| `categoryCodes.2011.json` | 16.6MB | `b68d2ea4e47877c6b76bf139f24e686d0de5cce346bb5b1734f6f907d433bd36` |
| `categoryCodes.2012.json` | 16.6MB | `8d15282004bd862f8a7beeddb4a3000f641dc73720e9beed5bda0d32fd28a076` |
| `categoryCodes.2013.json` | 16.6MB | `36ef51d7cd9cc6ab18bd033832d75f468b3fd98eaaae003c2faaf2abfe82d7ae` |
| `categoryCodes.2014.json` | 16.0MB | `6d70740e43bab8c31484a8b42b29414e15d4937aa6eaec1d6a89bff8ec681219` |

## 三、GB2260 原始 JSON 目录（1980-2023, 扁平 [{code,name}]）

- 目录 `data/GB2260/` 共 44 个文件，合计 7.6M
- 目录 sha256（合并哈希）：`9a3b5dd53b61825e38fa1053119b4400786bd6aebcff3a77a7ff839b8db07166`

## 四、汇总

| 类别 | 数量 | 体量 |
|---|---|---|
| NBS SQLite | 15 (全部有效，NBS.2015 已重建) | 891M |
| GB2260 SQLite | 44 | 8.6M |
| stats.gov.cn 原始 JSON | 19 | 2.2G |
| 备份目录总计 | — | 3.9G |

## 五、已知数据质量问题（实测）与处置

| # | 问题 | 状态 | 处置 |
|---|---|---|---|
| 1 | `NBS.2015.sqlite` = 0 字节损坏 | ✅ 已修复 | 由幸存的 `data/stats.gov.cn/2015.json` 经 `scripts/rebuild-nbs-sqlite.ts` 忠实重建（schema 与兄弟库逐字一致，`integrity_check=ok`）。详见 §八。 |
| 2 | `NBS.2022/2023.sqlite` 无对应原始 JSON（`stats.gov.cn/*.json` 止于 2021），溯源链缺失 | ✅ 已闭合 | 确认原始年度 JSON 止于 2021；2022/2023 sqlite 为直采成品、无中间 JSON。已由 `scripts/export-nbs-json.ts` 反导出 `data/stats.gov.cn/derived/{2022,2023}.json`（往返重建村数与源一致：619,503 / 620,573），闭合 sqlite↔JSON 往返。**派生声明**：反导出产物非独立源采集、无 `categoryCode`，溯源仍以 sqlite 为准（见 `derived/README.md`）。 |
| 3 | 数据字典称「NBS village 含台港澳」 | ✅ 已证伪并订正 | 硬核验：`NBS.2023.sqlite` village 表 71/81/82 前缀 **0 条**（省级亦无）。NBS 五级全量**完全不含台港澳**。已订正 `SQLITE_DATA_README.md` 两处误述（L154/L255）。注：GB2260 历史自 2013 起收录台港澳省级（710000/810000/820000），是另一数据源，勿混。 |
| 4 | categoryCodes 城乡分类码覆盖 | ✅ 已厘清 | 独立 `categoryCodes.*.json` 文件仅 2009–2014（6 个）；但城乡分类码在**年度嵌套 JSON 内联** `categoryCode` 字段中覆盖 2009–2021（实测 2016/2020/2021 均含）。**NBS sqlite 成品未保留城乡分类码列**（village 表无 categoryCode）。已在数据字典厘清。 |

> **重建 NBS.2015 的口径说明**：幸存 `2015.json` 遍历得 省31/市346/县3172/乡40480/村667519，去重入库后 **省31/市346/县3138/乡39959/村667519**。低于本文旧版 NBS 逐年表记录的 2015 口径（县3218/乡41127/村673804）——原始 sqlite 已丢失无从比对，此为**唯一可用源的忠实结果**，不追旧数、不臆造完整性。

## 六、可复现性证明（build-source 确定性）

> **不变量**：`packages/cli/src/scripts/build-source.ts`（代码，已在 git）+ 冷母本
> `NBS.<year>.sqlite`（数据，在 git 外）⟹ **确定性**产出 `source-<year>/divisions.csv`。
> 即数据包可随时从冷母本无损重建，**无需信任工作树里那份 50MB CSV**（它本就 .gitignore）。

实测验证记录（2026-06-26）：

| 输入 sqlite | 输入 SHA-256（前16） | 输出 CSV | 输出 SHA-256 | 行数 |
|---|---|---|---|---|
| `NBS.2023.sqlite` | `02b89aab3e4e08da` | `divisions.csv` | `243d8035b004a7f0c02d88ce0e756ec6d21434a10437594612b11c5fb0e06f5e` | 665,272 |

复现命令：

```bash
cd packages/cli
tsx src/scripts/build-source.ts \
  --input=/path/to/NBS.2023.sqlite --year=2023 \
  --output=../source-2023/data/divisions.csv
# 期望输出: Wrote 665271 divisions for 2023 (5 self-referential placeholders skipped)
```

## 七、完整性校验与备份（runbook）

- **可机检校验文件**：`docs/cold-master.sha256`（59 项 = NBS 15 + GB2260 44；`NBS.2015.sqlite`
  已重建并纳入校验）。
- **校验某副本完整性**：`scripts/verify-cold-master.sh <资产目录>`（内部 `shasum -a 256 -c`，
  检测丢失/位腐）。
- **创建/刷新异地副本**：`scripts/backup-cold-master.sh <源目录> <目标目录>`（rsync + 自动校验）。
- 🔴 **P0 提醒**：冷母本目前**仅维护者本地单点持有**。务必至少执行一次异地副本（外置盘 / 对象存储），
  否则一次磁盘故障即永久丢失（上游 stats.gov.cn 已死，不可再生）。源数据包发布到 npm（M4）后将获得第二重持久化。

## 八、NBS.2015 重建记录（✅ 已完成）

`NBS.2015.sqlite` 曾 0 字节损坏，已由幸存的 `data/stats.gov.cn/2015.json`（119.2MB，见 §二）重建：

```bash
bun scripts/rebuild-nbs-sqlite.ts \
  <冷母本>/data/stats.gov.cn/2015.json <冷母本>/NBS.2015.sqlite
# 产物: 省31 市346 县3138 乡39959 村667519；integrity_check=ok；59.0MB
```

- **脚本** `scripts/rebuild-nbs-sqlite.ts`（Bun 内置 `bun:sqlite`，零外部依赖）取代了旧 `legacy/scripts/utils/exportSqlite.js`（Sequelize），并修正其一处不一致：兄弟库 village 表**无 `categoryCode` 列**，脚本据实对齐。
- **schema 保真**：`diff` 与 `NBS.2023.sqlite .schema` 逐字一致（含外键与列顺序）。
- **口径**：见 §五末尾说明（幸存 JSON 口径略小于旧记录，为唯一可用源的忠实结果）。
- **待办**：将重建后的 `NBS.2015.sqlite` 与更新后的 `docs/cold-master.sha256` 一并同步进 GitHub Release（`data-snapshot-2023`）。
