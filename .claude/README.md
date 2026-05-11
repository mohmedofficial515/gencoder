# `.claude/` — Custom Agents & Commands for GenCoder

This folder configures the Claude Code harness for this repository. Anything here applies only when working *inside* the GenCoder repo with Claude Code — it doesn't ship to end users of the VS Code extension.

```
.claude/
├── agents/
│   └── research-feature-analyst.md   ← subagent definition
├── commands/
│   ├── research.md                   ← /research slash command
│   ├── release.md                    ← (symlink to .clinerules)
│   └── hotfix-release.md             ← (symlink to .clinerules)
├── hooks/
│   └── claude-code-for-web-setup.sh
├── settings.json                     ← permissions + hooks
└── README.md                         ← this file
```

---

## Research Mode — التوثيق الكامل

### ما المشكلة التي يحلّها

GenCoder هو فورك من Cline يتنافس مع Cursor / Windsurf / Copilot / Cline / Continue / Aider / Roo Code / Kilo Code / Augment / Zed-AI. للبقاء تنافسياً نحتاج إلى **ذاكرة منظمة** عن:
- ماذا نملك (entry points، wiring، test coverage)
- نقاط قوتنا الحقيقية vs الادعاءات
- ثغراتنا الفعلية مقارنة بكل منافس
- ما الذي يجب إضافته بأولوية P0/P1/P2

هذه الذاكرة تعيش في `.gencoder/research/`. الوكيل + الكوماند معاً يجعلان تحديثها عملية متكررة منضبطة بدل كتابة عشوائية.

### المكوّنات

| المكوّن | الملف | الدور |
|---|---|---|
| **الوكيل** | [`agents/research-feature-analyst.md`](agents/research-feature-analyst.md) | الكاتب الوحيد المسموح له بالكتابة في `.gencoder/research/`. يطبّق قالب 8 أقسام، يستشهد بمراجع كود، ويقارن مع المنافسين. |
| **الكوماند** | [`commands/research.md`](commands/research.md) | واجهة المستخدم. يفسّر الـ argument ويُطلق الوكيل بمهمة محدّدة. لا يكتب بنفسه. |
| **مجلد الإخراج** | `.gencoder/research/*.md` | المنتج النهائي — ملف Markdown لكل ميزة. |

### تدفّق الاستدعاء

```
المستخدم يكتب: /research deepseek
        ↓
الكوماند يفسّر "deepseek" → DEEPSEEK_INTEGRATION.md
        ↓
يطلق Task(subagent_type=research-feature-analyst)
        ↓
الوكيل يقوم بـ:
  1. Glob/Grep على .gencoder/research/ + الكود المصدري
  2. يقرأ entry points الفعلية (مع أرقام أسطر)
  3. WebSearch/WebFetch لتحديث معلومات المنافسين
  4. يكتب/يحرّر الملف وفق قالب 8 أقسام
  5. يحدّث قسم "Curated Feature Analyses" في INDEX.md
  6. يعيد ملخصاً <200 كلمة + أهم 3 توصيات P0
        ↓
الكوماند يعرض ملخص الوكيل verbatim
```

### استخدام الكوماند

```bash
/research              # افتراضي: حدّث الأقدم/الأكثر قِدَماً
/research stale        # صريحاً: ملف واحد >14 يوماً، الأقدم أولاً
/research all          # كنس شامل، ملف واحد لكل دورة، مع ملخصات بين الدورات
/research new          # أنشئ فقط الملفات الناقصة من خريطة التغطية
/research <feature>    # substring match — مثلاً: mcp / browser / deepseek / cli
```

أمثلة عملية:

```
/research deepseek       → DEEPSEEK_INTEGRATION.md
/research mcp            → MCP_INTEGRATION.md
/research auth           → AUTH_ACCOUNT.md
/research browser bridge → BROWSER_BRIDGE.md
```

إذا كان المطابق غامضاً (مثلاً `/research test` يطابق `TESTING_SETUP.md` و`TOOL_EXECUTION.md`)، الكوماند سيعرض أعلى 3 خيارات ويسأل قبل التنفيذ.

### قالب الإخراج (8 أقسام إلزامية)

كل ملف ينتجه الوكيل يلتزم بهذا الهيكل:

1. **Overview / نظرة عامة** — 2-4 أسطر تعريف
2. **Current State in GenCoder / الوضع الحالي** — مع مراجع `file:Lx-Ly` ملموسة
3. **Advantages / المميزات الحالية** — مع *Evidence* لكل بند
4. **Disadvantages & Gaps / العيوب والثغرات** — مع *Impact* المرئي للمستخدم
5. **Competitor Landscape / المقارنة** — جدول يشمل Cline + Cursor + اثنين على الأقل
6. **Recommended Additions / مقترحات الإضافة** — مقسّمة P0/P1/P2 مع المسار، الجهد، المخاطر
7. **Open Questions / أسئلة مفتوحة** — قرارات تحتاج المستخدم
8. **Change Log** — جدول تواريخ + ملخص كل تنقيح

إذا قسم ليس له محتوى، يكتب الوكيل `_(none — verified YYYY-MM-DD)_` بدلاً من حذفه.

### خريطة التغطية (Feature Coverage Map)

24 ملفاً مستهدفاً — 14 موجود + 10 يجب إنشاؤها:

**موجود ويحتاج تحديثات دورية:**
- `API_PROVIDERS.md`, `AUTH_ACCOUNT.md`, `BUILD_AND_DEPLOYMENT.md`
- `CLI_ARCHITECTURE.md`, `EVALUATION_SYSTEM.md`, `I18N_LOCALIZATION.md`
- `INTEGRATIONS.md`, `MCP_INTEGRATION.md`, `SLASH_COMMANDS.md`
- `STATE_MANAGEMENT.md`, `SYSTEM_PROMPT.md`, `TESTING_SETUP.md`
- `TOOL_EXECUTION.md`, `WEBVIEW_UI.md`

**يجب إنشاؤها (priority order):**
1. `DEEPSEEK_INTEGRATION.md` — الميزة الأكثر تمييزاً (PoW solver + web vs API)
2. `BROWSER_BRIDGE.md` — `extension/` Chrome bridge
3. `RESEARCH_MODE.md` — هذه الميزة نفسها (meta)
4. `CONTEXT_MANAGEMENT.md` — context window، truncation
5. `DIFF_AND_FILE_EDITS.md` — file edits، diff view
6. `FOCUS_CHAIN_AND_PLANS.md` — plan mode، focus chain
7. `PERMISSIONS_AND_AUTOAPPROVE.md` — approval flow
8. `TELEMETRY_AND_OBSERVABILITY.md` — logging، telemetry
9. `TERMINAL_EXECUTION.md` — shell integration

**ملف مُدار آلياً (لا تلمس):**
- `INDEX.md` — يُولَّد من امتداد VS Code's Research Mode indexer كل 30 ثانية. الوكيل يحدّث فقط قسم "Curated Feature Analyses" في النهاية.
- `.cache/` — كاش الـ indexer، لا تلمسه.

### الحدود الصارمة (Hard Constraints)

مدمجة في system prompt للوكيل ولا يمكن تجاوزها بطلب من المستخدم:

| القيد | السبب |
|---|---|
| الكتابة فقط داخل `.gencoder/research/` | حماية الكود المصدري من التعديل العَرَضي |
| لا تعديل `INDEX.md` (إلا قسم Curated) أو `.cache/` | تجنّب التعارض مع الـ indexer المدمج |
| كل ادعاء عن GenCoder يحتاج `file:Lx-Ly` فعلي | يمنع الهلوسة عن ميزات غير موجودة |
| ادعاءات المنافسين تحتاج URL أو وَسم `⚠ unverified` | يحمي مصداقية التحليل |
| تفضيل `Edit` على `Write` | حماية المحتوى اليدوي من المسح |
| ملف واحد لكل turn في وضع `all` | يسمح للمستخدم بالاعتراض/إعادة التوجيه |

### كيف تضيف ميزة جديدة لخريطة التغطية

إذا ظهرت ميزة جديدة في GenCoder ليست في الخريطة:

1. حدّث الجدول داخل [`agents/research-feature-analyst.md`](agents/research-feature-analyst.md) قسم "Feature Coverage Map".
2. شغّل `/research <feature-name>` — الوكيل سيكتشف أنه غير موجود وينشئه باستخدام القالب القياسي.

### كيف تعدّل قالب 8 الأقسام

عدّل قسم "Output Structure" داخل [`agents/research-feature-analyst.md`](agents/research-feature-analyst.md). أي تغيير في القالب يجب تطبيقه على الملفات الموجودة بدورة `/research all` لاحقة لإعادة المحاذاة.

### الإيقاع المُقترح (Suggested Cadence)

- بعد كل ميزة جديدة مدمجة في `main` → `/research <feature-name>` لتسجيل الميزة في ذاكرة المشروع.
- أسبوعياً → `/research stale` مرتين أو ثلاث للحفاظ على المعلومات حديثة.
- قبل كل release → `/research all` كنزس شامل، خصوصاً للتحقق من المقارنات التنافسية.

يمكن أتمتته بـ `/schedule` أو `/loop` لكن الإعداد اليدوي مناسب الآن.

### استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| `/research` لا يظهر في autocomplete | تأكد من وجود [`commands/research.md`](commands/research.md) وأعد تشغيل Claude Code. |
| الوكيل لا يُستدعى | تحقق من frontmatter في [`agents/research-feature-analyst.md`](agents/research-feature-analyst.md) — `name` يجب أن يطابق `research-feature-analyst` بالضبط. |
| الوكيل يكتب خارج المجلد | لا يجب أن يحدث — لكن إذا حدث، أوقفه فوراً وأبلغ. القيود في system prompt. |
| ادعاءات المنافسين قديمة | مرّر للوكيل تاريخ ISO صريحاً، وهو سيستخدم `WebSearch` لتحديث المعلومات تلقائياً. |
| `INDEX.md` تعرض ملفات غير موجودة | إنه يُولَّد آلياً من الـ indexer داخل الـ extension — أعد فهرسته من زر "Refresh Index" في GenCoder UI. |

---

## ملفات أخرى في `.claude/`

- **`settings.json`** — أذونات `Bash`/`PowerShell` المسموح بها بدون مطالبة المستخدم، و`SessionStart` hooks. عدّله بـ skill `/update-config` أو يدوياً.
- **`hooks/claude-code-for-web-setup.sh`** — يعمل في بداية كل جلسة لتهيئة Claude Code for Web (إن لزم).
- **`commands/release.md` + `commands/hotfix-release.md`** — symlinks إلى `.clinerules/workflows/`، تستدعي workflows الإصدار الموروثة من upstream Cline.
