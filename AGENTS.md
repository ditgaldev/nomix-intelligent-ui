# Working agreements

- 默认用中文，简洁直接；交付时说明结果、验证和未解决的问题。

## 先调研与复用

- 先读相关规则、文档、实际源码与调用链，确认现状和问题，再提出修改方案；只读调研可以直接开展。
- 涉及架构、设计模式或技术方案时，必须主动检索当前官方文档、行业最佳实践和成熟开源实现，在方案中说明来源、可复用方案及选择理由。本机参考代码在 `D:/zyjpro/github_pro`。
- 明确假设和不确定项；多种合理解释或方案要说明取舍，影响目标的重要歧义先澄清，不暗自替用户决定。

## 先方案，再代码

- 编写或修改任何代码前，先给出最终实施方案，并等待用户明确批准后再动代码；此要求适用于所有代码修改，不限于架构或重大变更。
- 方案按任务规模简明说明目标、假设、拟改文件、影响范围、实现步骤、关键取舍和验收方式。
- 当前方案已获批准，或用户明确要求跳过方案确认时，按已授权范围执行，不重复询问；实施中出现实质范围变化时，先更新方案并确认。
- 用户要求“先分析、别改代码”时保持只读，不把分析请求当作实现授权。

## 实施与验收

- 只实现当前需求所需的最小改动，优先复用现有模式；不增加未要求的功能、抽象或配置。
- 沿用现有风格，保留用户和并行任务的修改；不顺手重构或清理旧代码，只清理本次改动造成的无用内容。
- 实施前明确可验证的成功标准。缺陷先复现并按风险补充回归测试；重构验证原行为保持。
- 按影响范围执行必要检查，从聚焦测试逐步扩大；满足验收后停止重复检查。交付区分已验证、未验证和原有失败。

## Skills

- 分析、评估、设计或修改 Agent Skill 前，完整阅读 `~/.codex/docs/agent-skills-definition.md`。
- Skills 保留可复用的专门知识和必要操作约束；说明触发条件，按需读取参考文件，避免重复通用编码原则。
- 用户当前要求优先于 Skill 的默认流程；不要由 Skill 推导额外任务或重复请求已经获得的许可。
- 精简 AGENTS.md 或 Skills 时保留规则的适用范围和强制程度；不得静默削弱调研、方案确认、职责边界或验收要求。

## Delegation

- 主 agent 负责范围、架构判断、协调、集成和最终验收。
- 子 agent 默认使用 `gpt-6.1-sol`、`high`，优先使用内置 `worker` 处理查源码、梳理调用链、独立模块实现和聚焦测试；`sol_worker` 使用相同模型和推理档位。
- 复杂故障、并发与恢复机制、跨模块诊断和关键设计审查使用 `astra_worker`（`gpt-6-astra`、`medium`）。确需更深推理时，使用内置角色并显式指定 `gpt-6-astra`、`high`；仅对特别困难且已受阻的任务按需升至 `xhigh` 或 `max`。自定义角色文件中的固定模型和推理档位不能通过启动参数覆盖。
- 不使用 Luna；主 agent 继续负责架构判断、协调、集成和最终验收。
- 仅在子任务边界清楚、可独立完成且确有收益时委派，按任务职责选择可用角色；不为简单任务拆分工作。
- 使用 `fork_turns = "none"`，提供目标、必要上下文、文件所有权和验收标准；子 agent 保留他人修改并返回简短证据。

# Project boundaries

- This is an independent SDK, not a fork of OpenUI. The original repository is preserved at `D:/zyjpro/github_pro/open-intelligent-ui` and `ditgaldev/open-intelligent-ui-reference`.
- Reuse the published json-render parser, renderer, state and action runtime. Do not create a competing UI language or interpreter.
- `packages/core` contains shared definitions and validation, with no React/Vue/DOM/provider dependencies. `packages/theme` owns CSS and tokens. Framework adapters live in `packages/react` and `packages/vue`.
- Business data, authorization, agent execution, persistence and action implementations belong to the consuming application. Business-specific components belong in examples or consuming projects.
- React and Vue must consume the same supported Spec fixtures. Matching dependency versions alone do not establish behavioral parity.
- Keep source provenance and licenses for copied open-source definitions/components. Verify packed packages through external consumers; workspace aliases alone are insufficient.
