# LumiMate TODO

> 目标：从“可聊天的地图 App”演进为可记忆、可执行任务、可主动陪伴的个人 AI。
>
> 原则：继续以 `lumimate-service` 的 NestJS + PostgreSQL + Redis + BullMQ 为核心；借鉴 Mem0、ElizaOS、HDSI 的架构思想，不直接引入完整框架或复制 AGPL 代码。

## 参考项目与借鉴边界

项目 | 借鉴内容 | LumiMate 落地方式 | 不直接采用原因
--- | --- | --- | ---
[Mem0](https://github.com/mem0ai/mem0) | 事实提取、记忆去重、时间/实体/语义召回 | 自建 `Memory` 表、Embedding、混合检索和来源追溯 | 现有 NestJS 服务无需为记忆层再引入独立平台
[HDSI-AthenaBrain](https://github.com/YesWeAreBot/HDSI-AthenaBrain) | 活跃场景、关系、承诺、延迟回复、主动联系 | `ConversationState + Relationship + Intent + ProactivePolicy` | Koishi/QQ 强绑定；`AGPL-3.0`，不能复制代码进入 LumiMate
[ElizaOS](https://github.com/elizaOS/eliza) | Agent Runtime、插件化工具、位置/设备/日程能力 | `ToolDefinition + ToolExecutor + Permission` 接口 | 框架范围过大，替换现有服务会增加维护和升级成本
[LangGraph](https://github.com/langchain-ai/langgraph) | 多步骤状态机、检查点、人工确认 | 在 NestJS 中保存 `AgentRun` 状态；复杂任务可后续接 LangGraph.js | 普通聊天不需要图编排，避免所有请求进入 Agent 循环
[Dify](https://github.com/langgenius/dify) | 文件摄取、异步索引、知识库权限、引用 | `File → Document → Chunk → Embedding → Retrieval` | 作为独立产品过重，不应嵌入移动 App 后端
[OpenClaw](https://github.com/openclaw/openclaw) | 本地设备、技能、渠道、权限边界 | 设备注册、能力声明、短期命令和显式授权 | 设备控制 Gateway 不能暴露到公网或直接交给模型

## 总体数据流

```text
用户消息 / 图片 / 位置
  → Chat API
  → 最近消息 + 相关 Memory + 当前 Relationship + 未完成 Intent
  → 模型 / Agent 决策
  → SSE 文本、工具确认卡片或任务状态
  → 保存消息
  → 异步任务：Memory 抽取、Intent 创建、摘要/Embedding 更新
```

所有异步任务走 BullMQ。消息回复、数据库事务和任务投递用 Outbox 保证：消息已保存但任务未创建时，可安全补偿；Worker 重试时不得重复发消息或重复执行外部动作。

## P0：陪伴 Agent 基础

- [ ] 定义长期记忆模型：`Memory`、`MemorySource`、`MemoryEmbedding`。
  - 记录类型：用户偏好、人物关系、地点、承诺、重要事件、稳定事实。
  - 每条记录保存来源消息、置信度、创建/更新时间、失效时间和用户可见性。
  - 支持用户查看、编辑、删除和“不要记住此事”。
- [x] 在每次聊天后异步抽取候选记忆；不能阻塞 SSE 回复。
- [x] 聊天前按“最近上下文 + 相关长期记忆”组装模型上下文。
- [x] 增加 `Relationship` 状态：称呼、关系阶段、互动偏好、最近情绪摘要。
- [x] 增加 `Intent` 状态：提醒、延迟回复、待办、地点提醒、主动关怀。
- [x] 使用 BullMQ 处理到期 `Intent`；任务必须幂等、可取消、可重试。
- [x] 增加主动消息策略：用户显式授权、静默时间、每日上限、最短间隔、随时关闭。

### P0 实现逻辑

#### 1. Memory：长期记忆，不等于聊天记录

```text
assistant 回复完成
  → `memory-extraction` Job
  → 当前：规则提取候选事实；后续：低成本模型输出受 JSON Schema 限制的候选事实
  → 校验来源、敏感级别、置信度和类型
  → 相似记忆去重 / 更新 / 标记冲突
  → 写入 Memory 与 Embedding
```

- `Memory` 核心字段：`userId`、`agentId`、`category`、`content`、`sourceMessageId`、`confidence`、`visibility`、`expiresAt`、`status`。
- `category` 初期固定为：`preference`、`relationship`、`commitment`、`place`、`event`、`fact`，不允许模型自造类别。
- 聊天前先按 `userId + agentId` 限定范围，再以关键词、时间、向量相似度混合排序，取少量高相关记录注入提示词。
- 低置信度、敏感信息、冲突事实只能作为候选；用户在 App 中确认后才成为稳定记忆。
- 用户删除记忆时，删除原文、Embedding 和索引；后续抽取不得从已删除的来源复活该记忆。

#### 2. Relationship：把陪伴状态从 Prompt 中拆出来

- 一位用户与一个智能体对应一条 `Relationship`。
- 保存称呼、关系描述、沟通偏好、近期情绪摘要、最近互动时间；不得保存未经允许的推断性敏感画像。
- 主模型只读取压缩摘要，不读取全部历史；摘要由后台任务更新，不阻塞聊天。

#### 3. Intent：让“以后做”变成可执行事实

```text
用户：“明早 8 点提醒我开会”
  → 模型提出 `create_intent` 工具调用
  → App 展示确认卡片（时间、时区、内容、通知方式）
  → 用户确认
  → 写入 Intent + Outbox
  → BullMQ 创建唯一 jobId
  → 到期 Worker 再做策略检查
  → 推送 / 聊天消息 / 地点提醒
```

- `Intent` 字段：`type`、`status`、`payload`、`dueAt`、`timezone`、`idempotencyKey`、`sourceMessageId`、`confirmedAt`、`completedAt`。
- 状态固定为：`draft → awaiting_confirmation → scheduled → running → completed | failed | cancelled | expired`。
- 所有创建、修改、取消任务必须确认；模型不能直接安排推送。
- 到期处理用 `idempotencyKey` 防重；通知失败只重试通知，不重跑业务动作。

#### 4. Proactive Policy：AI 主动，但不打扰

```text
定时扫描 / Intent 到期 / 位置事件
  → 检查用户授权、静默时间、每日额度、最短间隔、任务优先级
  → 生成候选联系理由
  → 规则层允许后才调用模型生成文案
  → 保存 ProactiveMessage 审计记录
  → 推送或投递聊天消息
```

- 初期主动消息只允许：到期提醒、用户明确要求的跟进、重要承诺回访。
- “情绪关怀”“随机问候”默认关闭，后续必须独立开关和频率限制。
- 用户可在每条主动消息上关闭同类提醒、暂停智能体或反馈“不感兴趣”。

## P1：Agent 工具与工作流

- [ ] 建立工具协议：名称、JSON Schema、权限、超时、重试、审计日志、展示结果。
- [ ] 地图工具：当前位置、地点搜索、附近搜索、路线规划；路线/导航前向用户确认。
- [x] `task.create`：创建 `AgentRun`、SSE 确认卡片、确认后入队、执行审计与刷新恢复。
- [ ] 任务工具：查看、修改、取消定时任务；接入模型结构化 Tool Call。
- [ ] 图片工具：生图、编辑图片、生成任务状态与结果文件。
- [ ] 将复杂多步骤请求建模为状态机：`planned → awaiting_confirmation → running → completed | failed | cancelled`。
- [ ] 所有会改变外部状态的工具必须经用户确认；只读工具可自动调用。

### P1 实现逻辑：工具与 Agent

```text
模型请求 Tool Call
  → JSON Schema 参数校验
  → Permission Policy 判定
  → 只读：直接执行
  → 有副作用：创建 `AgentRun(awaiting_confirmation)` 并返回确认卡片
  → 用户确认
  → Worker 执行 ToolExecutor
  → 写入审计日志、更新 AgentRun、把结果交回模型总结
```

- 工具分级：`read`（附近搜索、知识库查询）、`write`（创建任务）、`sensitive`（设备控制、发送给第三方）。
- 每个工具必须声明：输入 Schema、输出 Schema、超时、重试策略、是否可并发、是否需要确认。
- `AgentRun` 保存请求、步骤、工具结果、错误和取消原因，客户端可恢复展示进度。
- 先提供 `map.searchNearby`、`map.planRoute`、`task.create`、`task.cancel`、`knowledge.search` 五个工具；不要一开始开放任意 HTTP 请求或 Shell 执行。

## P1：多技能插件

- [x] 插件目录：展示技能用途、版本、工具范围、知识范围、记忆授权和启用状态。
- [x] 会话级插件配置：同一智能体可开启多个技能；会话绑定固定插件版本。
- [x] 首版插件权限页：工具范围和记忆读取独立授权；图片、位置、知识库和主动消息授权待对应工具上线。
- [x] 插件执行状态：消息、`AgentRun` 写入 `pluginId` 与版本，用户可在技能中心关闭。
- [ ] 首个 `relationship-coach`：情绪承接、事实/推测/未知、可执行下一步、风险分流；不复制未审核资料，不将关系建议包装成诊断或法律意见。

## P1：知识库

- [ ] 文件上传：图片、PDF、Word、Markdown、文本；校验 MIME、大小、恶意文件。
- [ ] 异步处理链路：上传 → 文本/OCR 提取 → 分块 → Embedding → 索引 → 可查询。
- [ ] 按用户/智能体/知识库隔离权限，支持删除后彻底移除原文件和向量。
- [ ] 检索采用向量 + 关键词混合排序，回答中返回引用片段和源文件。
- [ ] 增加索引状态、失败原因、重试和文件版本。

### P1 实现逻辑：知识库

```text
上传文件
  → 文件安全扫描 + 对象存储
  → 创建 `Document(processing)`
  → Worker 提取文本 / OCR
  → 清洗、按标题和语义分块
  → 批量 Embedding
  → 写入 Chunk 与索引
  → `Document(ready)`
```

- 数据模型：`KnowledgeBase`、`Document`、`DocumentVersion`、`DocumentChunk`、`Embedding`、`KnowledgeBaseMember`。
- 检索范围必须由 `userId`、`agentId`、知识库成员权限共同限制；禁止跨用户召回。
- 回答返回 `documentId`、页码/段落、chunk 摘要，客户端可点击查看来源。
- 文档更新生成新版本；旧版本在确认无引用后异步清理，避免回答引用到已删除内容。

## P2：设备与推送

- [ ] 设备注册：设备 ID、类型、能力、最后在线时间、用户授权范围。
- [ ] 设备通道优先使用 MQTT/WebSocket；命令带签名、过期时间、幂等键和审计记录。
- [x] Expo Push：iOS/Android token 注册、通知开关、静默时间、BullMQ 重试、receipt 审计和退订。
- [ ] 将位置、相机、麦克风等敏感能力做成独立权限开关，默认关闭。

## P2：质量、安全与运营

- [ ] 模型调用记录：模型、耗时、输入/输出 token、成本、失败分类；不记录敏感原文。
- [ ] 为记忆召回、工具调用、主动消息建立离线评测集和回归测试。
- [ ] 加入 API 鉴权、速率限制、文件病毒扫描、内容审核和数据导出/删除。
- [ ] 加入分布式任务锁，避免多实例重复执行定时任务或主动消息。
- [ ] 增加监控：队列积压、任务失败、模型超时、推送失败、检索命中率。

## 实施顺序

1. `Memory + Intent` 数据模型与 BullMQ 调度。
2. 聊天上下文召回、候选记忆抽取、用户记忆管理页面。
3. 工具协议和地图/任务工具。
4. 知识库完整链路。
5. 推送、设备和硬件能力。

## 每阶段验收标准

阶段 | 验收
--- | ---
Memory | AI 能记住经确认的偏好；用户可查看、修改、删除；删除后不会再次被召回
Intent | 创建任务需确认；服务重启或 Worker 重试后只执行一次；可取消
Agent Tool | 每次工具调用可追溯；副作用操作均有确认记录；失败结果可解释
Knowledge Base | 文件异步处理可见；回答带来源；用户之间无法检索彼此资料
Proactive | 用户可授权/关闭；静默时间和频率上限生效；每条触发都有可解释原因

## 暂不做

- [ ] 不直接嵌入 HDSI、ElizaOS、Letta、Dify 等完整运行时。
- [ ] 不让模型无约束地主动发消息、调用设备或执行外部操作。
- [ ] 不把全部历史聊天记录直接注入模型上下文。
