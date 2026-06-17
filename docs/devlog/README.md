# 开发日志归档 · Devlog Archive

本目录保存「诗云」开发过程中的**会话交接文档**与**单次变更运维单**。它们记录了某次具体改动的
根因、方案与部署步骤，是这个 vibecoding 项目迭代历程的原始档案，保留以供追溯。

> 想读可读性更强的迭代编年史，请看 [../DEVLOG.md](../DEVLOG.md)（按时间倒序的开发日记）。
> 想了解架构与接口，请看顶层的 [../ARCHITECTURE.md](../ARCHITECTURE.md)、[../ENGINE_API.md](../ENGINE_API.md) 等文档。

| 文档 | 内容 |
|---|---|
| [HANDOFF.md](HANDOFF.md) | 历任开发者之间的完整交接说明 +「已实现功能」总表（最权威的功能清单）。 |
| [HANDOFF-2026-06-13-loading-progress.md](HANDOFF-2026-06-13-loading-progress.md) | 作品载入动画 + 大诗人首屏下载进度反馈的交接说明。 |
| [DEV-2026-06-13-poem-hit-area.md](DEV-2026-06-13-poem-hit-area.md) | 增大「诗·光点」点击面积 —— 开发文档（策略 / 根因 / 方案）。 |
| [DEPLOY-2026-06-13-poem-hit-area.md](DEPLOY-2026-06-13-poem-hit-area.md) | 上述改动的运维部署交接手册。 |
| [DEPLOY-2026-06-13-search-fix.md](DEPLOY-2026-06-13-search-fix.md) | 整联搜索修复（lines/ 名家优先重建 + 前端多句重排）的发布 runbook。 |

> 文中出现的本机路径已统一替换为占位符：`<repo>`（仓库根目录）、`<corpus>`（外部语料克隆目录）、
> `<backup-dir>`（本地备份目录）。这些是历史文档，请按你自己的环境替换为真实路径。
