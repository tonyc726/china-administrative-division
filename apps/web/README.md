# cndiv 时光机展示站

基于 React + Vite 的纯静态行政区划时光机（零后端），包含时间轴、区划下钻、村级坐标等功能。

## 快速开始

```bash
pnpm install

# 快速开发（无坐标功能，够用）
pnpm dev

# 完整功能（含村级坐标，需先抓取数据）
pnpm --filter @cndiv/crawler crawl:stname -- --concurrency=2 --cache-dir=.cache/stname --out=coords.json
pnpm dev
```

## 坐标数据获取指南

村级坐标功能默认**不随 CI 构建启用**（GitHub Pages 降级模式），需本地抓取后构建。

### 步骤

1. **抓取坐标数据**（约 2 小时，需中国大陆 IP）

```bash
# 从仓库根目录运行
pnpm --filter @cndiv/crawler crawl:stname -- --concurrency=2 --cache-dir=.cache/stname --out=coords.json
```

| 参数 | 说明 |
|------|------|
| `--concurrency=2` | 并发请求数，建议 2–4，避免触发 WAF |
| `--cache-dir=.cache/stname` | 断点续爬缓存目录，中断后可续跑 |
| `--out=coords.json` | 输出路径，产物 ~256MB |

> **样本测试**（先跑 50 个县，验证网络与并发）：
> ```bash
> pnpm --filter @cndiv/crawler crawl:stname -- --limit=50 --concurrency=2 --cache-dir=.cache/stname --out=coords-sample.json
> ```

2. **重新构建 web 应用**

```bash
cd apps/web
pnpm build
```

### 数据说明

- **来源**：国家地名信息库 [dmfw.mca.gov.cn](https://dmfw.mca.gov.cn/) `stname/listPub` 接口
- **覆盖范围**：2846 个县 × 604,754 条村级记录（行政村 21610 + 社区 21620）
- **坐标系**：CGCS2000（国家法定大地坐标系，≈ WGS84）
- **Join 率**：约 93.7%（按 12 位村级码与 NBS 2023 基线匹配）

### 法律声明

坐标数据仅用于**个人研究与学习用途**。请遵守《中华人民共和国测绘法》及相关法律法规，不得：
- 大规模公开分发原始坐标数据
- 用于商业目的
- 转制为其他地图产品

本项目仅提供抓取工具，数据的使用责任由使用者自行承担。

## 构建产物

```
apps/web/dist/
├── data/
│   ├── timeline.json      # 42 年县级构成曲线
│   ├── tree.json          # 省/市/县三级树
│   ├── shards/*.json      # 每县下的乡镇+村分片
│   ├── search/*.txt       # 倒排索引桶
│   └── coords/            # 坐标分片（抓取后构建才有）
│       ├── shards/*.json  # 每县村级坐标
│       ├── upper.json     # 省/市级坐标占位
│       └── join-report.json  # join 损耗统计
└── index.html
```

## CI 降级模式

GitHub Pages CI 构建时，由于 `coords.json` 不在仓库中，会自动降级构建：
- 所有坐标分片输出空数组
- 前端 `InfoPanel` 检测到无坐标时自动隐藏
- 时光机、下钻、搜索等核心功能不受影响

## 技术栈

- React 19
- Vite 8
- Tailwind CSS 4
- 纯静态零后端（所有数据预构建为 JSON 分片）
