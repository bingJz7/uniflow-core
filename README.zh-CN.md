# 🪙 UniFlow Core（简体中文说明）

**免费、跨大学、无 AI 的大学生任务与截止时间看板。**

**技术应该适应学生，而不是要求学生适应技术。**

导入学校的 ICS 日历文件，立刻看到今天、本周和已逾期的任务。无需账号，无需 AI，无需服务器。你的日历数据永远不离开你的设备。

> 🌏 [English README](README.md)

---

## UniFlow 是什么

不同大学使用不同的教学系统（Canvas、Moodle、Blackboard、自建门户），截止时间分散在各处。但几乎所有系统都能把你的日程导出为 **ICS（iCalendar）文件**——一个开放标准（RFC 5545）。UniFlow 用**确定性规则（而非 AI）**把这份文件变成清晰、带优先级的看板。

## 解决什么问题

- 不知道哪些作业快截止了
- 截止时间分散在不同系统、不同界面里
- 无法（或不想）把学校账号授权给 AI 助手
- 不会编程、没有 API Key，也不应该需要

## 支持与不支持（v0.1.0）

| ✅ 支持 | ❌ 不支持 |
|---|---|
| 导入本地 `.ics` 文件（100% 在浏览器本地解析） | 浏览器直接抓取 ICS 订阅链接（跨域限制），见 [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md) |
| 多日历、重复事件、全天事件、时区（含阿德莱德夏令时） | 核实你在学校系统里的提交状态——UniFlow 不会声称知道你交没交作业 |
| 今天 / 未来 7 天 / 已逾期 / 全部 / 变化记录 视图 | 手机自动推送通知 |
| 手动分类（作业 / 测验 / 考试 / 课程 / 其他）与状态（未开始 / 进行中 / 已完成） | AI 功能——这是刻意设计。核心功能永远默认无 AI |
| 应用内每日摘要（可复制） | 托管同步服务器 |
| 数据导出（JSON）与一键清除 | |

## 无 AI 模式

UniFlow 的核心是**确定性规则引擎**：相同输入 + 相同设置 = 相同输出。优先级规则（可在设置中调整）：

- 已逾期：超过截止时间
- 🔴 紧急：24 小时内
- 🟠 高优先级：72 小时内
- 🔵 即将到期：7 天内

规则**只**作用于你标记为作业 / 测验 / 考试的事件。未分类的事件显示为“其他”——UniFlow 不猜测日历事件的含义，也不会擅自把事件的开始时间当成截止时间。

## 如何使用（三步，无需编程）

1. **拿到 ICS 文件。** 在学校系统（Canvas / Moodle / Blackboard → 日历）里找“导出日历 / 下载 iCal / 订阅”，下载 `.ics` 文件。
2. **打开 UniFlow，把文件拖进去。** 解析在你设备上完成，不上传任何数据。
3. **选择你的时区。** 完成——立刻看到截止时间。

没有 ICS 文件？点“试试演示日历”——一个虚构的“Riverbend University”课表，供你体验全部功能。

### 自己部署

UniFlow 是纯静态网页应用，任何静态托管都可以：

```bash
npm install
npm run dev      # 本地开发服务器
npm run build    # 输出 dist/
npm test         # 单元测试套件（91 个测试）
```

需要 Node.js `^22.12.0 || ^24.0.0 || >=26.0.0`（见 `package.json`）。可选的可重复浏览器 E2E 测试见 [CONTRIBUTING.md](CONTRIBUTING.md)。

把 `dist/` 部署到 GitHub Pages、Netlify、Cloudflare Pages 或任意网站服务器即可。

## 隐私

- **核心功能零网络请求。** ICS 文件在浏览器内解析，保存在浏览器的 `localStorage`。
- 无账号、无遥测、无第三方脚本。
- **导出：** 设置 → “导出我的数据（JSON）”。
- **删除：** 设置 → “清除我在本设备的全部数据”，立即生效。
- 本仓库永远不包含真实学生的日历数据；所有演示数据均为虚构。
- 显示的截止时间来自你导入的日历文件，**未经学校系统核实**。

详见 [SECURITY.md](SECURITY.md) 与 [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md)。

## 路线图

- **v0.1.0（本版本）** — 文件导入、看板、规则引擎、每日摘要、导出/清除。✅
- **v0.2** — 可选的用户自有自动化：在你自己的 fork 里用 GitHub Actions 定时抓取 ICS 并通过邮件/Telegram 发送摘要（自愿开启，Token 只存你自己仓库的 secrets）。
- **v0.3** — PWA 安装、深色模式、更多语言。
- **未来** — 可选托管同步后端，仅在有人维护的前提下考虑。

## 参与贡献

- [CONTRIBUTING.md](CONTRIBUTING.md) — 环境搭建、代码规范、PR 流程
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — 社区准则
- [SECURITY.md](SECURITY.md) — 如何私下报告安全问题
- 报告问题或提建议请到 [Issues](../../issues)。

## 项目分支

- **`uniflow-core`**（本仓库）— 可直接运行的开源应用，默认无 AI。
- **`uniflow-skills`**（未来独立仓库）— 跨 AI 平台的 Prompt / Skill 研究。刻意分开：UniFlow 核心永远不依赖 AI 订阅。

## 许可证

[MIT](LICENSE)。第三方依赖许可见 `docs/THIRD_PARTY_NOTICES.md`。
