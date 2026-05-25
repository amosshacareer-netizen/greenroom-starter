# Build Session Log — Greenroom Settlement Case Study
# 构建过程记录 — Greenroom 结算案例研究

This is a record of my Claude Code session for the Greenroom settlement case study. I've condensed it to the key prompts and decisions — the full session ran approximately 7 hours across exploration, design, and implementation.

这是我做 Greenroom 结算案例研究时的 Claude Code 会话记录。提炼了关键的 prompt 和决策节点——整个过程大约 7 小时，覆盖探索、设计和实现三个阶段。

---

## Phase 0: Defining the Goal / 定义目标

Before exploring the codebase, I wanted to establish what success looks like.
/ 在探索代码之前，我先明确"成功是什么样的"。

The CEO's memo gave the clearest signal: **82% of customers bypass the in-app settlement tool and use Google Sheets.** That's not a UX issue — it's an existential product gap.
/ CEO 的 memo 给了最清晰的信号：82% 的客户绕过工具用 Google Sheet。这不是体验问题——是产品根本不能用。

**North star metric / 北极星指标: In-app settlement completion rate / 产品内结算完成率**
- Current / 现状: ~37% (only Flat + % of Gross supported — 200/537 shows) / 只有 37% 的 deal 工具能算
- Target / 目标: 90%+ (all standard deal types, complex variants flagged) / 所有标准 deal type 可计算

**Supporting metrics / 支撑指标:**

| Metric / 指标 | Current / 现状 | Target / 目标 | Why / 为什么 |
|---|---|---|---|
| Deal type coverage / Deal type 覆盖率 | 2 of 5 types | 5 of 5 | Direct driver of adoption / 直接驱动采用率 |
| Dispute rate (Vs deals) / Vs deal 争议率 | 6.9% | <3% | Transparency should reduce disputes / 透明度减少争议 |
| Agent inquiry rate / Agent 追问率 | ~25% | <10% | If agents can read without emailing, trust improves / Agent 能看懂就不用追问 |
| Settlement conversation time / 结算对话时长 | ~45 min | ~10 min | Diego: "10 min if I could pre-review" |

These metrics framed every design decision. When choosing between features, I asked: "Does this move the north star or a supporting metric?"
/ 这些指标框定了每个设计决策。选功能时我问自己："这个能推动北极星或支撑指标吗？"

---

## Phase 1: Exploration & Problem Discovery / 探索与问题发现

### Prompt 1: Initial orientation / 初始了解
> Set up the project. Run npm install, npm run db:reset, npm run dev. Then explore the codebase — give me a map of the key files, especially anything related to settlement.
> 
> 把项目跑起来，然后帮我梳理代码结构，特别是跟 settlement 相关的文件。

Claude Code set up the environment and mapped the repo structure. I learned:
/ Claude Code 搭好环境后梳理了代码结构。我了解到：

- `lib/dealMath.ts` — calculation engine, only handles flat + % of gross / 计算引擎，只支持 flat 和 % of gross
- `app/shows/[id]/settle/page.tsx` — settlement UI, shows "not supported" for 63% of deals / 结算页面，63% 的 deal 显示"不支持"
- `db/schema.ts` — full data model with `dealNotesFreetext` as the key field / 数据模型，dealNotesFreetext 是关键字段
- `data/` — CEO memo, dispute thread, four stakeholder transcripts / CEO 备忘录、纠纷邮件链、四份 stakeholder 访谈

### Prompt 2: Read all context materials / 阅读所有上下文材料
> Read the CEO memo, dispute thread, and all four transcripts. Summarize each one's key points and what they tell us about the settlement problem.
> 
> 读 CEO memo、dispute thread 和四份访谈。总结每份的要点。

Key takeaways / 关键发现：
- **CEO memo:** "We are winning on completeness and losing on craft." 82% bypass settlement tool. Q1 bet is settlement. / 82% 的客户绕过工具。Q1 战略赌注是 settlement。
- **Dispute thread:** Coastal Spell — $720 concession caused by ambiguous deal email. "No canonical version of the deal." / $720 的让步源于模糊的合同邮件。"deal 没有权威版本。"
- **Mariana (booker):** Uses Google Sheet because tool can't handle Vs deals. "Settlement is a conversation, not a calculation." / 用 Google Sheet 因为工具不支持 Vs deal。"结算是对话，不是计算。"
- **Diego (TM):** "If I can't see how you got to the number, I'm not signing." Wants to pre-review on phone. / "看不到怎么算的，我不签。" 想在手机上提前预览。
- **Marcus (GM):** Lost $80K/year when one agent routed away after bad settlement. Lease renewal in 2027. / 一个经纪人跑了导致年损失 $80K。2027 年要续租。
- **Sarah Kim (agent):** Good settlement = Itemization + Provenance + Tone. "The deal was a ghost." / 好的结算 = 逐行拆分 + 可追溯 + 展示态度。"那个 deal 像幽灵一样。"

### Prompt 3: Explore the data for quality issues / 探索数据质量问题
> Query the database and help me understand: What's the deal type distribution? What's the dispute rate for each type? Do the structured fields actually match what's in the freetext? Are there any data quality issues I should know about?
> 
> 帮我查数据库：deal type 分布是什么？每种类型的争议率？structured fields 跟 freetext 对得上吗？有什么数据质量问题？

This was the most important step. Claude ran 20+ queries and surfaced:
/ 这是最重要的一步。Claude 跑了 20 多个查询，发现了：

**Scale of the problem / 问题规模：**
- 337/537 shows (63%) use unsupported deal types / 63% 的演出用了不支持的 deal type
- Vs deal dispute rate: 6.9% — 6x higher than Flat (1.1%) / Vs deal 争议率是 Flat 的 6 倍
- 42% of shows have expenses exceeding their cap / 42% 的演出费用超 cap

**Data contradictions (intentional breadcrumbs) / 数据矛盾（故意埋的线索）：**
- 22 disputed settlements all have positive sign-off text ("Looks good," "👍") / 22 个 disputed 结算全有正面签字
- 22 paid settlements still carry disputed recoups / 22 个已付款结算仍有未解决的 recoup 争议
- 15 deals where freetext percentage ≠ structured field (e.g., prose 85%, struct 75%) / 15 个百分比不一致
- 1 deal type mislabeled (Wet Cement: prose=Vs, struct=pct_of_net) / 1 个 deal type 标错
- Daniel Hwang/WME: 6 marketing recoup disputes — systemic pattern / 同一经纪人 6 次同类争议——系统性问题
- 102 shows where hospitality expenses exceed the cap / 102 场 hospitality 超 cap

**Key insight / 关键洞察:** The `deal_notes_freetext` field is the source of truth. Structured fields are unreliable. / `deal_notes_freetext` 才是真实来源，structured fields 不可信。

### Prompt 4: Map all problems and prioritize / 整理问题并排优先级
> Consolidate everything into a problem list. Group related issues. For each, give me: severity, frequency, data evidence.
> 
> 把所有发现归类整理。每个问题给我：严重程度、频率、数据证据。

I consolidated 14 individual findings into 4 core problems:
/ 将 14 个散点问题归纳为 4 个核心问题：

1. **Tool capability gap / 工具能力缺失** — 63% unsupported (blocker) / 63% 不支持（拦路虎）
2. **Untrustworthy data / 数据不可信** — structured fields ≠ freetext (foundation) / 结构化字段跟文本不符
3. **Opaque settlement / 结算不透明** — no transparency, no traceability (trust) / 没有透明度和可追溯性
4. **Disputes unresolved / 争议不闭环** — high rate on complex deals (downstream) / 复杂 deal 争议率高

Causal chain / 因果链: A → B → C → D.

---

## Phase 2: Slice Selection & Design / 切片选择与设计

### Prompt 5: What does the assignment actually want? / 题目到底想要什么？
> Re-read the evaluation criteria carefully. What are the hints about which direction to take?
> 
> 重新仔细读评分标准。有哪些暗示？

Observations / 观察：
- "the 2am walkthrough conversation" is the only scene-based slice name / 唯一一个场景化命名的 slice
- "Design for humans, not screens" — "Does it feel like something Mariana would use at 2am?" / 明确问了 Mariana 凌晨 2 点会不会用
- "We're not evaluating whether you can build a clean settlement calculator" / 明确说不考 calculator
- "Use AI like a senior teammate" — AI must be meaningfully present / AI 要有意义地参与
- "designs a solution that prevents such messiness" / 方案要能预防混乱

### Prompt 6: Core insight / 核心洞察
> The 2am problem isn't about settling at 2am. It's about all prep work getting pushed to 2am. Break this down.
> 
> 2am 的问题不在于要在 2am 结算，而在于所有准备工作都被推到了 2am。帮我拆解。

| Task / 事情 | Must wait? / 必须等演出后？ |
|---|---|
| Interpret deal terms / 解读合同条款 | ❌ Wednesday / 周三就能做 |
| Flag ambiguous terms / 标记模糊条款 | ❌ Wednesday / 周三就能做 |
| Gather expenses / 归集费用 | ❌ Most pre-loadable / 大部分可提前 |
| Final box office / 最终票房 | ✅ Must wait / 必须等 |
| Run calculation / 计算 | Instant once inputs ready / 输入 ready 就瞬间完成 |
| TM walkthrough / TM 核对 | If pre-reviewed, just confirmation / 预览过了只需确认 |

Diego validated / Diego 验证了: "If I could pre-review, conversation would be 10 minutes instead of 45."

### Prompt 7: Define the slice / 定义切片
> Based on all of this, here's my slice: a transparent settlement worksheet that reads freetext, handles all deal types, shows its work line-by-line, and flags data contradictions. Write me an implementation spec.
> 
> 综合以上，我的 slice：透明结算工作表，读 freetext，支持所有 deal type，逐行展示计算，标记数据矛盾。写一份实现 spec。

**Chosen slice / 选择的切片:** Transparent settlement worksheet with freetext parsing.

**What I cut and why / 砍掉了什么，为什么：**
- Dispute resolution workflow — downstream; transparent settlement prevents most disputes / 下游问题；透明结算能预防大部分争议
- Agent-side collaboration interface — doubles scope; venue-side first / scope 翻倍；先做场地端
- Full pre-show prediction system — too large; parser warnings are the MVP version / 太大；parser 的 warning 就是最小版本
- Expense auto-collection — data integration problem, not settlement experience / 数据集成问题，不是结算体验
- Settlement lifecycle redesign — plumbing, not experience / 管道工程，不是核心体验

### Prompt 8: Simplify the approach / 简化方案
> Do we actually need an API call to Claude for parsing? The freetext patterns look pretty regular. Can we use regex?
> 
> 我们真的需要调 API 来解析吗？freetext 的格式看起来挺规律的，能不能用正则？

I sampled 35 random freetext entries. Findings:
/ 随机抽了 35 条 freetext，发现：
- Flat, Door, simple Pct of Net: perfectly templated — regex handles 100% / 完全模板化，正则 100% 搞定
- Standard Vs deals: very consistent — regex handles ~95% / 很一致，正则覆盖 ~95%
- Walkout pot + ratchet: identifiable by keywords, base fields extractable / 关键词可识别，基础字段可提取

Decision / 决策: **Regex parser, no API dependency.** Zero setup for evaluators. Memo notes production would use LLM.
/ **正则解析，不依赖 API。** 评审零配置。Memo 里说明生产版本会用 LLM。

For warnings / 关于预警: detect **data contradictions** (parser vs structured fields) instead of semantic ambiguity. More reliable. / 检测**数据矛盾**而非语义模糊。更可靠。

---

## Phase 3: Implementation / 实现

### Prompt 9: Build the freetext parser / 构建文本解析器
> Implement lib/parseDeal.ts following the spec. Parse deal_notes_freetext into structured terms using regex. Generate warnings by comparing against structured fields and expense data.
> 
> 按 spec 实现 lib/parseDeal.ts。用正则从 freetext 提取结构化条款。对比 structured fields 生成 warnings。

Built `parseDeal()` covering / 构建了 parseDeal() 覆盖：
- Flat, Vs, Percentage of Net, Percentage of Gross, Door detection / 五种 deal type 检测
- Guarantee, percentage, expense cap, hospitality cap extraction / 关键字段提取
- Walkout pot and ratchet keyword detection / 复杂条款检测
- Warning generation for data mismatches / 数据矛盾预警生成

### Prompt 10: Extend the calculation engine / 扩展计算引擎
> Add Vs deal, percentage_of_net, and door deal support to dealMath.ts. Accept parsedTerms from the freetext parser as the primary data source, falling back to structured fields. Every step should include its data source.
> 
> 在 dealMath.ts 里加 Vs、% of Net 和 Door 的支持。用 parser 的输出作为主数据源，structured fields 作为 fallback。每步标注数据来源。

Extended `calculateSettlement()` with / 扩展了 calculateSettlement()：
- Vs: `max(guarantee, percentage × net)` with expense cap logic / 含 expense cap 逻辑
- Pct of Net: `percentage × net` with expense cap
- Door: `gross - fees - expenses`
- Enhanced steps with source annotation / 每步标注来源（ticket_sales, expenses, deal_terms, calculated）
- Expense breakdown by category / 费用按类别拆分

### Prompt 11: Update the settlement page / 更新结算页面
> Replace the "not supported" card with a transparent worksheet. Show parsed deal terms vs original freetext, warnings, line-by-line calculation with sources, and expense breakdown.
> 
> 把"不支持"的卡片换成透明的结算工作表。展示解析条款 vs 原文、warnings、逐行计算带来源、费用明细。

Updated the settle page with / 更新了结算页面：
- Deal terms comparison (parsed vs freetext) / 条款对比（解析 vs 原文）
- Warning cards for data contradictions / 数据矛盾预警卡片
- Line-by-line worksheet with source annotations / 逐行计算带来源标注
- Expense category breakdown / 费用分类明细
- Prominent "Artist Takes" final number / 突出显示最终金额

### Prompt 12: Test and verify / 测试验证
> Test across deal types: flat (regression), standard Vs, a deal with percentage mismatch, a deal with type mismatch, door deal, and a show with expenses over cap.
> 
> 跨 deal type 测试：flat（回归）、标准 Vs、百分比不一致、type 标错、door deal、费用超 cap。

Verified / 验证通过：
- Flat deals: no regression / 无回归
- Vs deals: correct calculation, line-by-line breakdown / 计算正确，逐行展示
- Wet Cement: deal_type_mismatch warning fires (struct=pct_of_net, freetext=vs) / type 不一致预警触发
- Winter Circle: percentage_mismatch warning fires (struct=75%, freetext=85%) / 百分比不一致预警触发
- Door deals: calculation correct / 计算正确
- Expense overruns: warning displays with exact amounts / 超支预警显示具体金额

### Prompt 13: Self-audit / 自检
> Run through the post-implementation checklist against the five evaluation criteria.
> 
> 对照五个评分标准跑一遍自检清单。

All checks passed. See self-audit section in the submission memo.
/ 全部通过。详见 memo 的自检部分。

---

## Key Decisions & Trade-offs / 关键决策与权衡

| Decision / 决策 | Why / 为什么 |
|---|---|
| Regex parser over LLM API / 正则而非 LLM API | Zero dependency for evaluators; 90%+ coverage; production would use LLM / 零依赖；90%+ 覆盖；生产用 LLM |
| Parser overrides structured fields / Parser 输出覆盖 structured fields | Structured fields unreliable (15 pct mismatches, 1 type mislabel) / 结构化字段不可信 |
| Data contradiction warnings over semantic ambiguity / 数据矛盾检测而非语义模糊检测 | More reliable, surfaces planted breadcrumbs, provably correct / 更可靠，能发现埋的线索 |
| Only modify settle page / 只改 settle 页面 | Tight scope; deepest treatment of one surface / 紧凑 scope；一个页面做到最深 |
| Flag walkout/ratchet as "complex" / 标记 walkout/ratchet 为"复杂" | Honest about limitations; base terms still shown / 诚实面对局限；基础条款仍展示 |

## AI Usage Summary / AI 使用总结

I used Claude Code throughout for / 全程使用 Claude Code：
- **Exploration / 探索:** Mapping codebase, reading transcripts, running queries / 梳理代码、读访谈、跑查询
- **Analysis / 分析:** Consolidating findings, quantifying problems, prioritizing / 归纳发现、量化问题、排优先级
- **Implementation / 实现:** Writing parser, extending calculator, updating UI / 写 parser、扩展计算引擎、改 UI
- **Verification / 验证:** Testing across deal types, self-auditing / 跨类型测试、自检

My judgment drove / 我的判断主导了: which slice to pick, what to cut, design principles (2am context, scannable layout), the decision to use regex over API, which breadcrumbs to surface in UI vs reference in memo.
/ 选哪个 slice、砍什么、设计原则（2am 场景、可扫描布局）、用正则还是 API、哪些 breadcrumb 在 UI 展示 vs 在 memo 引用。
