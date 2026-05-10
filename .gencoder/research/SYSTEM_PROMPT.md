# نظام الـ System Prompt - توثيق متكامل

## نظرة عامة

نظام الـ system prompt هو قلب طريقة تفكير Cline. يقسم الـ prompt النهائي إلى ثلاث طبقات:
1. **Components** - أقسام نصية قابلة لإعادة الاستخدام
2. **Variants** - تكوينات مخصصة لكل عائلة نموذج (model family)
3. **Templates** - محرك قوالب يحل محل `{{PLACEHOLDER}}` tokens

## هيكل المجلدات

```
src/core/prompts/system-prompt/
├── components/          # أقسام نصية مشتركة قابلة للتركيب
│   ├── index.ts        # إعادة تصدير جميع المكونات
│   ├── agent_role.ts   # دور وهوية Cline
│   ├── capabilities.ts # القدرات المتاحة
│   ├── rules.ts        # القواعد الأساسية
│   ├── editing_files.ts # تعليمات تعديل الملفات
│   ├── act_vs_plan_mode.ts # وضع Act vs Plan
│   ├── mcp.ts          # تكامل MCP
│   ├── system_info.ts  # معلومات بيئة النظام
│   ├── user_instructions.ts # تعليمات المستخدم
│   ├── task_progress.ts # تتبع تقدم المهام
│   ├── feedback.ts     # التعليمات التكرارية
│   ├── skills.ts       # المهارات المتاحة
│   └── tool_use/       # تعليمات استخدام الأدوات
├── variants/           # تكوينات مخصصة لكل عائلة نموذج
│   ├── generic/        # افتراضي للنماذج القياسية
│   ├── next-gen/       # Claude 4, GPT-5, Gemini 2.5
│   ├── native-next-gen/ # Native tool calling للجيل القادم
│   ├── native-gpt-5/   # Native tool calling لـ GPT-5
│   ├── native-gpt-5-1/ # Native tool calling لـ GPT-5.1
│   ├── gpt-5/          # GPT-5 محدد
│   ├── gemini-3/       # Gemini 3 محدد
│   ├── hermes/         # Hermes
│   ├── glm/            # GLM
│   ├── xs/             # نماذج صغيرة/محلية (مكثف)
│   ├── devstral/       # Devstral
│   └── trinity/        # Trinity
├── templates/          # محرك القوالب
│   ├── TemplateEngine.ts # محرك حل {{PLACEHOLDER}}
│   └── placeholders.ts   # تعريفات placeholder القياسية
├── tools/              # تعريفات الأدوات
│   ├── init.ts         # سجل جميع متغيرات الأدوات
│   ├── spec.ts         # واجهة ClineToolSpec
│   └── [tool-name].ts  # ملف لكل أداة
├── registry/           # تجميع الـ prompt
│   ├── PromptBuilder.ts    # بناء الـ prompt النهائي
│   ├── PromptRegistry.ts   # Singleton لإدارة الـ prompts
│   └── ClineToolSet.ts     # إدارة مجموعة الأدوات
└── __tests__/          # اختبارات snapshot
```

## المكونات الأساسية

### 1. PromptRegistry (Singleton)

المسجل المركزي لجميع الـ prompts والمكونات:

```typescript
class PromptRegistry {
  private static instance: PromptRegistry
  private variants: Map<string, PromptVariant>
  private components: ComponentRegistry
  private loaded: boolean

  static getInstance(): PromptRegistry
  async load(): Promise<void> // تحميل المكونات والمتغيرات
  async get(context: SystemPromptContext): Promise<string> // استرجاع prompt حسب النموذج
}
```

**مبدأ fallback التلقائي:** إذا لم يتم العثور على variant محدد لنموذج ما، يعود النظام تلقائياً إلى `GENERIC`.

### 2. PromptVariant Structure

كل variant يعرف:
- `id` و `family` - معرف عائلة النموذج
- `components` - قائمة المكونات المضمنة وترتيبها
- `tools` - قائمة الأدوات المفعلة
- `componentOverrides` - تجاوزات للمكونات (قوالب مخصصة)
- `placeholders` - قيم placeholder افتراضية
- `tags` و `labels` - للـ versioning

### 3. PromptBuilder

ينسق بناء الـ prompt النهائي:
1. بناء جميع المكونات بالترتيب المحدد
2. تحضير قيم placeholders (variant + system + runtime)
3. حل القالب باستخدام TemplateEngine
4. معالجة نهائية (إزالة الأسطر الفارغة المتعددة، إلخ)

### 4. TemplateEngine

يستخدم `{{PLACEHOLDER}}` syntax مع دعم:
- dot notation للكائنات المتداخلة
- الحفاظ على placeholders غير الموجودة (partial resolution)
- استخراج جميع placeholders من قالب

## عائلات النماذج (Model Families)

| العائلة | النماذج | الوصف |
|---------|---------|-------|
| `GENERIC` | افتراضي لمعظم النماذج | fallback الأساسي |
| `NEXT_GEN` | Claude 4, GPT-5, Gemini 2.5, Grok 4 | قدرات agentic متطورة |
| `NATIVE_NEXT_GEN` | نفس NEXT_GEN | Native tool calling |
| `NATIVE_GPT_5` | GPT-5 | Native tools لـ GPT-5 |
| `NATIVE_GPT_5_1` | GPT-5.1 | Native tools لـ GPT-5.1 |
| `GPT_5` | GPT-5 | تكوين XML tools |
| `GEMINI_3` | Gemini 3 | تكوين Gemini محدد |
| `XS` | نماذج صغيرة/محلية | مكثف جداً للموديلات ذات context window الصغير |
| `HERMES` | Hermes | نموذج متخصص |
| `GLM` | GLM | نموذج متخصص |
| `DEVSTRAL` | Devstral | نموذج متخصص |
| `TRINITY` | Trinity | نموذج متخصص |

## إضافة أداة جديدة

هذه العملية حساسة وتتطلب 5 خطوات:

### الخطوة 1: إضافة معرف الأداة إلى enum
```typescript
// src/shared/tools.ts
export enum ClineDefaultTool {
  MY_NEW_TOOL = "my_new_tool",
}
```

### الخطوة 2: إنشاء ملف تعريف الأداة
```typescript
// src/core/prompts/system-prompt/tools/my_new_tool.ts
export const my_new_tool_variants = [generic] // GENERIC يكفي كـ fallback
```

### الخطوة 3: تسجيل الأداة
```typescript
// src/core/prompts/system-prompt/tools/init.ts
export function registerClineToolSets(): void {
  const allToolVariants = [
    ...my_new_tool_variants,
  ]
  allToolVariants.forEach((v) => ClineToolSet.register(v))
}
```

### الخطوة 4: إضافة إلى variant configs
```typescript
// variants/generic/config.ts - إضافة ClineDefaultTool.MY_NEW_TOOL إلى .tools()
```

### الخطوة 5: إنشاء handler في `src/core/task/tools/handlers/`

## نقاط هامة من .clinerules/general.md

- **Fallback تلقائي:** إذا لم يعرف variant لعائلة نموذج، يستخدم GENERIC تلقائياً
- **تحديث snapshots:** بعد أي تغيير في النظام:
  ```bash
  UPDATE_SNAPSHOTS=true npm run test:unit
  ```
- **XS variant خاص:** يحتوي محتوى مكثف inline في `template.ts`
- **التعديل على الـ system prompt:** اقرأ `README.md` و `tools/README.md` و `__tests__/README.md` أولاً
- **الـ variants تدعم componentOverrides:** يمكن تجاوز مكونات محددة بقوالب مخصصة

## اختبار النظام

```bash
# تحديث snapshots
UPDATE_SNAPSHOTS=true npm run test:unit

# تشغيل بدون تحديث
npm run test:unit
```

الـ snapshots في `__tests__/__snapshots__/` تتحقق عبر جميع عائلات النماذج وسياقات مختلفة (browser, MCP, focus chain).

## Related Files

- `src/core/prompts/system-prompt/README.md` - توثيق رسمي شامل
- `src/core/prompts/system-prompt/tools/README.md` - توثيق نظام الأدوات
- `src/core/prompts/system-prompt/__tests__/README.md` - إرشادات الاختبار
- `src/core/prompts/system-prompt/CONTRIBUTING.md` - إرشادات المساهمة
- `.clinerules/general.md` - قسم "Modifying System Prompt" و "Adding Tools to System Prompt"