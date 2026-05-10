# نظام الأوامر المختصرة (Slash Commands) - توثيق متكامل

## نظرة عامة

نظام الأوامر المختصرة يسمح للمستخدم بكتابة أوامر مثل `/newtask` أو `/compact` داخل رسائله لتفعيل سلوكيات محددة. الأوامر تعالج في `parseSlashCommands()` قبل إرسال الرسالة إلى الـ AI.

## الأوامر الافتراضية المدعومة

| الأمر | الوظيفة | الاستجابة |
|-------|---------|-----------|
| `/newtask` | بدء مهمة جديدة | `newTaskToolResponse()` |
| `/smol` | تكثيف المحادثة | `condenseToolResponse()` |
| `/compact` | تكثيف المحادثة (نفس smol) | `condenseToolResponse()` |
| `/newrule` | إنشاء قاعدة جديدة | `newRuleToolResponse()` |
| `/reportbug` | الإبلاغ عن خطأ | `reportBugToolResponse()` |
| `/deep-planning` | تخطيط عميق | `deepPlanningToolResponse()` |
| `/explain-changes` | شرح التغييرات | `explainChangesToolResponse()` |
| `/mcp:server:prompt` | استدعاء MCP prompt | `formatMcpPromptResponse()` |

## هيكل الملفات

```
src/core/
├── slash-commands/
│   ├── index.ts              # المعالج الرئيسي parseSlashCommands()
│   └── __tests__/
│       └── index.test.ts     # اختبارات الأوامر و MCP prompts
└── prompts/
    └── commands.ts           # استجابات الأوامر (newTaskToolResponse, إلخ)

webview-ui/src/utils/
└── slash-commands.ts         # الإكمال التلقائي في واجهة المستخدم
```

## كيفية المعالجة

### 1. استخراج الأمر

يستخدم regex لاستخراج الأوامر من نص المستخدم:
```
/(^|\s)\/([a-zA-Z0-9_.:@-]+)(?=\s|$)/
```

- يدعم الأوامر في بداية النص أو بعد مسافة
- يمنع التطابق الخاطئ مع URLs ومسارات الملفات
- **أمر واحد فقط** يعالج لكل رسالة (أول تطابق)

### 2. البحث في XML tags

يبحث عن الأوامر داخل وسوم XML محددة:
- `<task>...</task>`
- `<feedback>...</feedback>`
- `<answer>...</answer>`
- `<user_message>...</user_message>`

### 3. استبدال الأمر

```typescript
const commandReplacements: Record<string, string> = {
  newtask: newTaskToolResponse(),
  smol: condenseToolResponse(focusChainSettings),
  compact: condenseToolResponse(focusChainSettings),
  newrule: newRuleToolResponse(),
  reportbug: reportBugToolResponse(),
  "deep-planning": deepPlanningToolResponse(...),
  "explain-changes": explainChangesToolResponse(),
}
```

### 4. إزالة الأمر من النص

يزيل `/command` من النص الأصلي ويضيف تعليمات الـ tool response.

### 5. MCP Prompts

للأوامر التي تبدأ بـ `mcp:`:
- التنسيق: `/mcp:<server>:<prompt>`
- مثال: `/mcp:github:create-issue`
- يستدعي `mcpPromptFetcher(serverName, promptName)`
- يمكن أن يحتوي prompt name على `:` (مثال: `/mcp:server:prompt:with:colons`)

## إضافة أمر جديد

يجب تحديث **ثلاثة أماكن**:

1. **`src/core/slash-commands/index.ts`** - إضافة الأمر إلى `SUPPORTED_DEFAULT_COMMANDS` و `commandReplacements`
2. **`src/core/prompts/commands.ts`** - إضافة دالة response جديدة
3. **`webview-ui/src/utils/slash-commands.ts`** - إضافة الإكمال التلقائي

## تتبع telemetry

يتم تتبع استخدام الأوامر المختصرة:
```typescript
telemetryService.captureSlashCommandUsed(ulid, commandName, "builtin")
```

## MCP Prompt Response Format

```typescript
type McpPromptFetcher = (serverName: string, promptName: string) => Promise<McpPromptResponse | null>

interface McpPromptResponse {
  description?: string
  messages: Array<{
    role: "user" | "assistant"
    content: {
      type: "text" | "image" | "audio" | "resource"
      // ... content-specific fields
    }
  }>
}
```

يدعم التنسيق:
- نصوص عادية
- صور (base64 + mimeType)
- صوت (base64 + mimeType)
- موارد (URI + نص اختياري)

## اختبار الأوامر

```bash
npm run test:unit -- --grep "slash-commands"
```

ملف الاختبار: `src/core/slash-commands/__tests__/index.test.ts`

## Related Files

- `src/core/slash-commands/index.ts` - المعالج الرئيسي
- `src/core/prompts/commands.ts` - استجابات الأوامر
- `webview-ui/src/utils/slash-commands.ts` - الإكمال التلقائي
- `.clinerules/general.md` - قسم "Modifying Default Slash Commands"