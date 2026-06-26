# 诗云 · Poetry Cloud

可漫游的三维诗云星图：32,657 位真实诗人化为星团，星团之间的虚空是一切可能的诗——点击即可从编号引擎中拉出一首，编号即诗、诗即编号。

> Forked from [Cohenjikan/shiyun](https://github.com/Cohenjikan/shiyun).  
> 前端保留原项目 Three.js 星系渲染，后端以 Go + SQLite 重写，提供全文搜索、API 数据服务和可扩展基础。

## 架构

```
┌─ 前端 (Vite + React + Three.js)
│   src/three/  3D 星系 / 诗人星团 / 赠诗网络 / GPU 拾取
│   src/ui/     HUD / 搜索 / 诗面板 / 设置
│   src/engine/ 编号引擎 (rank/unrank 纯 BigInt 数学)
│   src/data/   数据加载 (fetch → Go API)
└──────────────────────────────────────────
┌─ Go 后端 (api + db + engine)
│   cmd/server/ REST API 服务
│   cmd/import/  JSON → SQLite 数据导入
│   internal/api/   路由 & handler (Phase 2)
│   internal/db/    SQLite + FTS5 (32k 诗人 / 853k 诗)
│   internal/engine/ 编号引擎 Go 移植 (Phase 3)
└──────────────────────────────────────────
```

## 快速开始

### 环境要求

- **Node.js** ≥ 18 (前端构建)
- **Go** ≥ 1.23 (后端)
- **corpus** — 语料仓库 `corpus/Werneror-Poetry` 需自行 clone

### 前端

```bash
npm install
npm run dev          # Vite dev server → http://localhost:5199
```

### 后端

```bash
cd backend
go mod tidy
go run ./cmd/import/              # 数据导入 (需先跑 pipeline)
go run ./cmd/server/              # API server → http://localhost:8080
```

### Pipeline (构建数据分片)

> **前置条件:** 需手动 clone 语料库到项目根目录:
> ```bash
> git clone https://github.com/Werneror/Poetry.git corpus/Werneror-Poetry
> ```

```bash
npm run build:lines    # poems shard + 搜索索引
npm run build:fuzzy    # 模糊搜索索引 (可选, 耗时)
```

之后运行 `cd backend && go run ./cmd/import/` 将 shard 数据灌入 SQLite。

## 项目结构

```
├── src/                    # 前端源码
│   ├── engine/             #   编号引擎 (rank/unrank/scatter)
│   ├── data/               #   数据契约 & 加载层
│   ├── three/              #   Three.js 3D 场景组件
│   ├── ui/                 #   React UI 组件
│   └── state/              #   Zustand 状态管理
├── public/                 # 静态资源 (数据分片 / favicon)
├── pipeline/               # 数据构建脚本 (Node.js)
├── corpus/                 # 语料 (git-ignored, 需手动 clone)
├── backend/                # Go 后端
│   ├── cmd/
│   │   ├── server/         #   API 服务入口
│   │   └── import/         #   数据导入工具
│   └── internal/
│       ├── db/             #   数据库层 (SQLite + FTS5)
│       ├── api/            #   HTTP handler (Phase 2)
│       └── engine/         #   编号引擎 Go 移植 (Phase 3)
├── docs/                   # 原项目文档 (ARCHITECTURE / ENGINE_API / DATA_CONTRACT 等)
└── TODO/                   # 重构工作跟踪
```

## 数据库

SQLite (WAL 模式), ~50 MB (含全量诗作文本 + FTS5 全文索引).

| 表 | 行数 | 说明 |
|:---|:---|:---|
| `poets` | 32,657 | 诗人元信息 |
| `poems` | 853,383 | 诗作全文 + JSON lines |
| `poems_fts` | 853,383 | FTS5 全文搜索 |
| `charset` | 12,877 | 字库 (频率排序) |
| `lexicon_*` | — | 平水韵声调/韵部表 |
| `gift_edges` | 4,980 | 赠诗网络有向边 |

## 技术栈

| 层 | 技术 |
|:---|:---|
| 前端框架 | Vite 8 + React 18 + TypeScript |
| 3D 渲染 | Three.js 0.169 + @react-three/fiber 8 |
| 状态管理 | Zustand 5 |
| 后端 | Go 1.26 + net/http |
| 数据库 | SQLite (modernc.org/sqlite, 纯 Go / 无 CGO) |
| 搜索 | SQLite FTS5 |
| 编号引擎 | BigInt (TS `bigint` / Go `math/big`) |

## 核心概念

诗云有两个目录：

- **真实诗** — 从开放语料导入的 85 万首诗人作品，每位诗人化为一个星团，诗句可全文搜索。
- **所有可能的诗** — 通过可逆的 rank/unrank 数学映射（灵感来自博尔赫斯《巴别图书馆》和刘慈欣《诗云》）凭空计算生成——给定一个超长编号即可精确生成一首诗，反之亦然。**不存储、仅计算**。

两种诗的编号来自同一套 anyRank 全目录，因此 32,657 位真实诗人的每一首作品在"所有可能诗"的虚空中都有一个唯一的编号坐标。

## License

MIT — 详见原项目 [Cohenjikan/shiyun](https://github.com/Cohenjikan/shiyun).
