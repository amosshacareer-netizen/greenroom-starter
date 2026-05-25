# Greenroom Settlement — Thinking Framework / 思路框架

---

## 1. Problem Space / 问题全景

### What is Settlement / 结算是什么

Settlement is the post-show process where the venue and artist split revenue. Four stakeholders, four perspectives:

结算是演出结束后场地和艺人分钱的过程。四方参与者各有不同视角：

- **Mariana (Booker / 订票人)**：凌晨 2 点做结算的人，产品的主要用户。因为工具不支持大部分 deal type，她一直用 Google Sheet 手算。
- **Diego (Tour Manager / 巡演经理)**：代表艺人当面核对数字。当晚就要拿到结果，因为要连夜开车去下一个城市。
- **Marcus (GM / 总经理)**：最后签字批钱。半夜在沙发上看 Mariana 的截图。关心的是经纪人关系和场地的 lease renewal（2027 年 3 月）。
- **Sarah Kim (Agent / 经纪人)**：第二天早上看结算报告。她对场地的信任直接决定以后还给不给好演出。

### Four Core Problems / 四个核心问题

Through CEO memo, dispute thread, four stakeholder interviews, and direct database queries:

通过 CEO memo、dispute thread、四份 stakeholder interview、以及数据库查询，归纳出四个问题：

**A. Tool Capability Gap / 工具能力缺失**
- Only supports Flat and % of Gross / 只支持两种最简单的 deal type
- **337/537 shows (63%)** can't be settled in-app / 63% 的演出工具算不了
- 82% of customers bypass the tool / 82% 的客户绕过工具用 Google Sheet
- Blocker-level problem / 不是"不好用"，是"不能用"

**B. Untrustworthy Data / 数据不可信**
- Structured fields don't match freetext / 结构化字段跟自由文本经常对不上
- 118 deals missing key fields; 15 percentage mismatches (prose 85% vs struct 75%); 20 bonuses only in prose
- Root cause / 根因：Mariana 用 prose 记 deal 因为 structured fields 不够用，但系统只读 structured fields
- Even if the tool supported Vs deals, it would calculate from wrong inputs / 即使工具能算，输入也是错的

**C. Opaque Settlement / 结算不透明**
- Agent questions 25% of settlements; 10% escalate to multi-day threads / 25% 有疑问，10% 多天扯皮
- Diego: "If I can't see how you got to the number, I'm not signing" / "看不到怎么算的，我不签"
- Sarah Kim's three qualities / 好结算三要素：Itemization（逐行拆分）、Provenance（可追溯）、Tone（展示 vs 通知）

**D. Frequent Unresolved Disputes / 争议频发且不闭环**
- Vs deal dispute rate 6.9% — 6x higher than Flat (1.1%) / Vs deal 争议率是 Flat 的 6 倍
- Daniel Hwang/WME: 6 repeated marketing recoup disputes — systemic pattern / 同一经纪人 6 次同类争议——系统性问题
- 22 disputed settlements all have positive sign-off text / 22 个 disputed 结算全部有正面签字——数据自相矛盾

**Causal Chain / 因果链：**
```
A. Can't use the tool / 用不了
    ↓
B. Wrong inputs / 输入是错的
    ↓
C. Nobody trusts the output / 没人信
    ↓
D. Trust breaks → disputes → lost relationships ($80K/yr)
   信任破裂 → 争议 → 关系损失
```

### What We Queried and Found / 我们查了什么、发现了什么

Wrote SQL scripts, ran 20+ queries against the SQLite database:

| Queried / 查了什么 | Found / 发现了什么 | Means / 意味着什么 |
|---|---|---|
| Deal type distribution | 63% unsupported / 63% 不支持 | Tool is useless for majority / 工具对大部分人是废的 |
| Freetext vs structured | 15 pct mismatches, 1 type mislabel, 118 missing fields | Structured data untrustworthy / 结构化数据不可信 |
| Dispute rate by type | Vs 6.9% vs Flat 1.1% | Complex deals = high disputes / 复杂 deal = 高争议 |
| Disputed + signoff | All 22 have positive sign-offs / 全部有正面签字 | System state ≠ reality / 系统状态不反映现实 |
| Paid + disputed recoups | 22 cases | Disputes unresolved before payment / 钱打了争议没解决 |
| Hwang pattern | 6 marketing recoup disputes from same agent | Systemic, not anecdotal / 系统性的，不是个案 |
| Expenses vs caps | 42% exceed cap / 42% 超 cap | Overruns are the norm / 超支是常态 |

---

## 2. Prioritization / 优先级选择

### Core Insight / 核心洞察

**The problem isn't "settling at 2am." It's that all prep work gets pushed to 2am.**

**问题不在"凌晨 2 点要结算"，而在"所有准备工作都被推到了 2am 才做"。**

| Task / 事情 | Must wait? / 必须等演出后？ |
|---|---|
| Interpret deal terms / 解读合同条款 | ❌ Wednesday / 周三就能做 |
| Flag ambiguities / 发现模糊点 | ❌ Wednesday / 周三就能发现 |
| Gather expenses / 归集费用 | ❌ Most pre-loadable / 大部分可提前 |
| Final box office / 最终票房 | ✅ Must wait / 必须等演出结束 |
| Run calculation / 计算 | Instant once terms + expenses ready / 瞬间完成 |
| TM walkthrough / TM 核对 | Preview on phone → 10 min confirm / 手机预览后只需确认 |

Ideal timeline / 理想时间线：
```
Wednesday:   AI parses deal → flags ambiguities → Mariana confirms with agent
             AI 解析条款 → 标记模糊点 → Mariana 跟 agent 确认
Friday day:  Expenses pre-loaded / 费用提前录入
After show:  Box office auto-captured → settlement preview generated
             票房自动入库 → 结算预览自动生成
2am:         TM previewed on phone → sits down → confirms → 10 min done
             TM 已在手机上预览 → 坐下确认 → 10 分钟搞定
```

Diego 原话验证 / Validated by Diego: "If I could pre-review, conversation would be 10 minutes instead of 45."

### Chosen Slice / 选择的切片

**AI-powered transparent settlement worksheet**

**AI 驱动的透明结算工作表** — 把 Mariana 在 Google Sheet 里手动做的事，变成产品里智能、透明、可信的体验。

Four components / 四个组成部分：
1. **AI parses freetext → structured terms + ambiguity flags** / AI 读 freetext → 提取条款 + 标记模糊点 (solves B, prevents D)
2. **Auto-aggregates all data → supports all deal types** / 自动汇总数据 → 支持所有 deal type 包括 Vs (solves A)
3. **Line-by-line "show your work"** / 逐行展示计算，每个数字标注来源 (solves C)
4. **Shifts work upstream from 2am** / 把工作从 2am 前移到周三 (core insight)

### What We Cut and Why / 砍掉了什么，为什么

| Cut / 砍掉的 | Why / 为什么 |
|---|---|
| Full pre-show prediction / 完整预警系统 | Too large. Ambiguity flags are the MVP version / scope 太大，模糊点标记就是最小版本 |
| Dispute resolution workflow / 争议处理流程 | Downstream — transparent settlement prevents most disputes / 下游问题，透明结算能预防大部分争议 |
| Agent-side interface / 经纪人端界面 | Doubles scope. Venue-side first / scope 翻倍，先做场地端 |
| Expense auto-collection / 费用自动归集 | Data integration problem, not settlement experience / 数据集成问题，不是结算体验核心 |
| Lifecycle redesign / 状态机改造 | Core experience first, plumbing second / 先做核心体验，再修管道 |

---

## 3. Design / 设计方案

### Technical Approach / 技术方案

**AI Parsing Layer / AI 解析层：**
- New API route, calls Claude API / 新建 API route，调用 Claude API
- Input: `deal_notes_freetext`
- Output: structured terms (type, guarantee, pct, basis, caps, bonuses) + `ambiguities[]`
- Human-in-the-loop: Mariana reviews and confirms before calculation / Mariana 确认后才用于计算

**Calculation Engine / 计算引擎扩展：**
- Extend `dealMath.ts` for Vs and % of Net / 在现有基础上加 Vs 和 % of Net
- Vs formula: `max(guarantee, percentage × (gross - fees - min(expenses, cap)))`
- Output: step-by-step process, not just final number / 输出每一步，不只是最终数字

**Settlement Page / 结算页面重做：**
- Top: parsed terms (editable) + original freetext side by side / 解析条款 + 原文对照
- Middle: line-by-line worksheet with data sources / 逐行计算，标注来源
- Bottom: final number + ambiguity warnings / 最终数字 + 模糊点预警
- Design for 2am: scannable, not readable / 设计给凌晨 2 点的人：扫一眼就懂

### Scenario 1: Standard Vs Deal / 正常 case

Freetext: "$1,405 guarantee vs 90% of net after expenses. Expenses capped $700. Hospitality cap $400."

```
Gross box office:              $8,240   ← ticket_sales
Less fees:                      -$824   ← ticket_sales.fees
Less expenses (capped $700):    -$700   ← expenses total $1,717, capped at $700
Net:                           $6,716

90% of net:                    $6,044
Guarantee:                     $1,405

→ Artist takes: $6,044 (percentage is higher / 百分比更高)
```

### Scenario 2: Ambiguous Deal / 模糊 case

Freetext: "$5,000 vs 80% of net, expenses capped at $2,500, marketing recoup of $900 against gross"

```
⚠️ "Marketing recoup of $900": inside or outside the $2,500 cap?
   在 $2,500 上限里面还是外面？

   → Interpretation A (outside / 外面): artist gets $11,565
   → Interpretation B (inside / 里面):  artist gets $12,285
   → Difference / 差额: $720
   → Action: confirm with agent before show day / 演出前跟 agent 确认
```

### Data Breadcrumbs / 数据发现

These findings directly informed design decisions / 这些发现直接影响了设计决策：

- **Disputed + positive sign-off** (22 cases) → lifecycle can't distinguish TM-signed vs agent-disputed / 系统不能区分"当晚签了"和"第二天反悔"
- **Paid + disputed recoups** → disputes unresolved before payment / 钱打了争议没解决
- **Percentage drift** (85% vs 75%) → structured fields untrustworthy → must parse freetext / 必须从 freetext 解析
- **Deal type mislabeled** (Wet Cement) → further validates AI parsing / 进一步说明 AI 解析的必要性
- **Hwang pattern** (6 disputes) → systemic, not anecdotal → pattern detection has value / 模式识别有价值

---

## 4. Deliverables / 交付物

- [ ] Forked GitHub repo with changes on a branch
- [ ] 1-2 page memo
- [ ] 5-10 minute Loom walkthrough
- [ ] Bonus: Claude Code session log

## 5. Loom Outline / 视频提纲

1. **Opening / 开场 (1 min)**: "I built an AI-powered transparent settlement worksheet. Goal: turn the 2am settlement from a 45-minute black box into a 10-minute transparent confirmation."
2. **Problem Space (2 min)**: Four problems, causal chain, key data / 四个问题 + 因果链 + 关键数据
3. **Core Insight / 核心洞察 (1 min)**: The pain isn't settling at 2am — it's that all prep gets pushed to 2am / 痛点不在 2am 结算，而在所有准备工作被推到了 2am
4. **Demo (3 min)**: Standard Vs deal → Ambiguous deal with warning / 正常 case → 模糊 case
5. **What I Cut (1.5 min)**: Five directions, one sentence each / 五个方向各一句话
6. **Data Findings (0.5 min)**: 2-3 breadcrumbs / 2-3 个数据发现
7. **What's Next (1 min)**: Agent collaboration, full pre-show prediction, expense auto-collection / 经纪人协作、完整预警、费用自动归集
