 # نظام التقييم والاختبارات (Evals) - توثيق متكامل

## نظرة عامة

مجلد `evals/` يحتوي على نظام تقييم شامل لاختبار أداء Cline عبر benchmarks و E2E tests و smoke tests.

## هيكل المجلدات

```
evals/
├── README.md              # توثيق نظام التقييم
├── ARCHITECTURE.md        # معمارية نظام التقييم
├── package.json           # اعتماديات نظام التقييم
├── tsconfig.json          # تكوين TypeScript
├── .gitignore
├── analysis/              # تحليل النتائج والأنماط
│   ├── package.json
│   ├── tsconfig.json
│   ├── patterns/          # أنماط التحليل
│   └── src/               # كود التحليل
├── benchmarks/            # اختبارات الأداء
│   └── tool-precision/    # دقة الأدوات
├── cline-bench/           # Cline benchmark
│   ├── README.md
│   ├── .gitignore
│   └── tasks/             # مهام الـ benchmark
├── e2e/                   # اختبارات E2E
│   ├── README.md
│   └── run-cline-bench.ts # تشغيل benchmark
└── smoke-tests/           # اختبارات سريعة
    ├── README.md
    ├── run-smoke-tests.ts # تشغيل smoke tests
    └── scenarios/         # سيناريوهات الاختبار
```

## المكونات الرئيسية

### 1. Benchmarks (`benchmarks/`)
اختبارات أداء متخصصة:
- **tool-precision/** - قياس دقة الأدوات (مدى صحة استخدام الـ AI للأدوات)

### 2. Cline Bench (`cline-bench/`)
نظام benchmark موحد لمهام Cline:
- مهام معرفة مسبقاً في `tasks/`
- يقيس قدرة Cline على إكمال مهام برمجية
- تشغيل عبر `e2e/run-cline-bench.ts`

### 3. E2E Tests