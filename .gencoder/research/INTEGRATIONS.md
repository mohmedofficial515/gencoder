# نظام التكاملات الداخلية - توثيق متكامل

## نظرة عامة

مجلد `src/integrations/` يحتوي على تكاملات داخلية متنوعة تدعم وظائف Cline الأساسية. هذه ليست تكاملات خارجية بل وحدات داخلية متخصصة.

## هيكل المجلدات

```
src/integrations/
├── checkpoints/           # نظام نقاط التفتيش (Git-based)
├── claude-code/           # تشغيل Claude Code
├── diagnostics/           # تشخيص الأخطاء والمشاكل
├── editor/                # أدوات تحرير الملفات
├── misc/                  # أدوات مساعدة متنوعة
├── notifications/         # نظام الإشعارات
├── openai-codex/          # تكامل OpenAI Codex OAuth
└── terminal/              # إدارة الطرفية والأوامر
```

## 1. نظام نقاط التفتيش (checkpoints/)

Git-based checkpoints تحفظ حالة المشروع بعد كل تنفيذ أداة.

| الملف | الوصف |
|-------|-------|
| `CheckpointTracker.ts` | المتتبع الرئيسي لنقاط التفتيش |
| `CheckpointGitOperations.ts` | عمليات Git (commit, revert, diff) |
| `CheckpointExclusions.ts` | استثناءات الملفات من التتبع |
| `CheckpointLockUtils.ts` | قفل الملفات لمنع التعارض |
| `CheckpointMigration.ts` | ترحيل بيانات checkpoint قديمة |
| `CheckpointUtils.ts` | أدوات مساعدة |
| `MultiRootCheckpointManager.ts` | إدارة checkpoints لـ multi-root workspaces |
| `factory.ts`, `initializer.ts` | إنشاء وتهيئة |
| `types.ts` | تعريفات الأنواع |

## 2. Claude Code (claude-code/)

تشغيل Claude Code كـ subprocess:

| الملف | الوصف |
|-------|-------|
| `run.ts` | تشغيل Claude Code |
| `message-filter.ts` | تصفية الرسائل بين Cline و Claude Code |
| `types.ts` | تعريفات الأنواع |
| `run.test.ts` | اختبارات |

## 3. التشخيص (diagnostics/)

أدوات تشخيص الأخطاء والمشاكل في الملحق.

## 4. المحرر (editor/)

أدوات تحرير وعرض الملفات:

| الملف | الوصف |
|-------|-------|
| `DiffViewProvider.ts` | عرض ومقارنة الـ diffs |
| `FileEditProvider.ts` | تطبيق التعديلات على الملفات |
| `CommentReviewController.ts` | مراجعة التعليقات والتعديلات |
| `detect-omission.ts` | اكتشاف الحذف في الملفات |

## 5. أدوات مساعدة (misc/)

| الملف | الوصف |
|-------|-------|
| `export-markdown.ts` | تصدير المحادثات إلى Markdown |
| `extract-file-content.ts` | استخراج محتوى الملفات |
| `extract-images.ts` | استخراج الصور من المحتوى |
| `extract-text.ts` | استخراج النصوص |
| `link-preview.ts` | معاينة الروابط |
| `notebook-utils.ts` | أدوات دفاتر الملاحظات |
| `open-file.ts` | فتح الملفات في المحرر |
| `process-files.ts` | معالجة الملفات |

## 6. الإشعارات (notifications/)

نظام إشعارات المستخدم للتنبيهات والتحديثات.

## 7. OpenAI Codex (openai-codex/)

تكامل OAuth لـ OpenAI Codex:

| الملف | الوصف |
|-------|-------|
| `oauth.ts` | تدفق OAuth لـ ChatGPT Plus/Pro |

يخزن الـ OAuth credentials في `secrets.json` تحت `openai-codex-oauth-credentials`.

## 8. الطرفية (terminal/)

إدارة الأوامر والـ terminal:

| الملف | الوصف |
|-------|-------|
| `CommandExecutor.ts` | تنفيذ الأوامر |
| `CommandOrchestrator.ts` | تنسيق الأوامر المتعددة |
| `constants.ts` | ثوابت |
| `types.ts` | تعريفات الأنواع |
| `standalone/` | وضع standalone |

## نقاط هامة

- **نظام checkpoints** يعتمد على Git ويتكامل مع `CheckpointTracker` الموثق في `TOOL_EXECUTION.md`
- **Claude Code** يمكن تشغيله كـ subprocess عبر `claude-code` provider
- **OpenAI Codex OAuth** يتطلب `openai-codex-oauth-credentials` في `secrets.json`
- **terminal** يستخدم `CommandOrchestrator` لتنسيق الأوامر (مدعم بالاختبارات)

## Related Files

- `src/integrations/checkpoints/` - نظام نقاط التفتيش
- `src/integrations/terminal/` - إدارة الطرفية
- `src/integrations/editor/DiffViewProvider.ts` - عارض الفروقات
- `src/integrations/claude-code/run.ts` - تشغيل Claude Code
- `TOOL_EXECUTION.md` - تكامل مع نظام الأدوات
- `STATE_MANAGEMENT.md` - تخزين OAuth secrets