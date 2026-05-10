# نظام المصادقة والحسابات - توثيق متكامل

## نظرة عامة

Cline يستخدم نظام مصادقة متعدد الطبقات يدعم:
1. **حسابات Cline** - عبر Firebase Authentication
2. **مزودي OCA** - OAuth للمزودين الخارجيين
3. **MCP OAuth** - مصادقة خوادم MCP

## هيكل الخدمات

```
src/services/
├── auth/
│   ├── AuthService.ts          # المنسق الرئيسي للمصادقة (Singleton)
│   ├── ClineAuthTokenStorage.ts # تخزين آمن للـ tokens
│   ├── providers/
│   │   └── ClineAuthProvider.ts # مزود Firebase للمصادقة
│   └── types.ts                # أنواع المصادقة
├── account/
│   └── ClineAccountService.ts   # خدمة الحسابات والـ API calls
├── oca/
│   └── OcaAuthService.ts        # مصادقة OCA OAuth
├── mcp/
│   ├── McpOAuthManager.ts       # إدارة OAuth لخوادم MCP
│   └── McpOAuthRedirectResolver.ts # حل عناوين إعادة التوجيه
└── uri/
    └── SharedUriHandler.ts      # معالج عناوين URI للمصادقة
```

## AuthService (المنسق الرئيسي)

```typescript
export class AuthService {
  // Singleton
  static getInstance(): AuthService

  // الحالة
  private _authToken: string | undefined | null
  private _userInfo: ClineAccountUserInfo | undefined

  // العمليات الأساسية
  async signIn(): Promise<void>       // بدء تدفق المصادقة
  async signOut(reason: LogoutReason): Promise<void>  // تسجيل الخروج
  getAuthToken(): string | undefined | null  // استرجاع token الحالي
  getUserInfo(): ClineAccountUserInfo | undefined  // معلومات المستخدم
}
```

### تدفق المصادقة:

1. `signIn()` - يبدأ التدفق
2. `AuthHandler.getCallbackUrl("/auth")` - إنشاء URL callback محلي
3. فتح المتصفح الخارجي للمصادقة (Firebase/Google/GitHub)
4. `SharedUriHandler` يستقبل الـ callback عبر `vscode://cline.cline/auth?idToken=...`
5. `authStateChanged()` - تحديث الحالة وإرسالها للـ webview
6. تخزين الـ token في `ClineAuthTokenStorage`

## أنواع المصادقة

### ClineAuthInfo
```typescript
interface ClineAuthInfo {
  idToken: string           // JWT access token
  refreshToken?: string     // token تحديث قصير المدى
  expiresAt?: number        // وقت انتهاء الـ access token
  userInfo: ClineAccountUserInfo
  provider: string          // "google", "github", "email", إلخ
  startedAt?: number
}
```

### ClineAccountUserInfo
```typescript
interface ClineAccountUserInfo {
  id: string
  email: string
  displayName: string
  createdAt: string
  organizations: ClineAccountOrganization[]
  appBaseUrl?: string      // Cline app URL للـ webview
  subject?: string         // WorkOS IDP ID لـ SSO
}
```

## مسارات الـ URI Callback

يتعامل `SharedUriHandler` مع ثلاثة مسارات:

| المسار | الاستخدام |
|--------|-----------|
| `/auth` | مصادقة Cline الأساسية (idToken مطلوب) |
| `/auth/oca` | مصادقة OCA OAuth (code مطلوب) |
| `/mcp-auth/callback/{hash}` | مصادقة خوادم MCP OAuth |

مثال: `vscode://cline.cline/auth?idToken=jwt123&provider=google`

## ClineAccountService

خدمة الحسابات للتواصل مع API:

```typescript
class ClineAccountService {
  // جلب إعدادات المستخدم عن بعد
  async fetchUserRemoteConfig(): Promise<RemoteConfig | undefined>
  
  // جلب Featurebase JWT للـ feedback
  async fetchFeaturebaseToken(): Promise<{ featurebaseJwt: string } | undefined>
  
  // طلبات مصادقة مع الـ token
  private async authenticatedRequest<T>(...): Promise<T>
}
```

## OCA (OAuth Customer Account)

`OcaAuthService` - مصادقة منفصلة لمزودي OCA:
- تدفق OAuth مستقل عن Cline
- callback عبر `/auth/oca`
- يدعم `ocaMode` في الإعدادات

## MCP OAuth

خوادم MCP يمكن أن تطلب مصادقة OAuth:

```typescript
// خادم MCP غير مصرح
{
  oauthRequired: true,
  oauthAuthStatus: "unauthenticated" // أو "authenticated" أو "pending"
}
```

**التدفق:**
1. محاولة الاتصال بالخادم
2. إذا تطلب OAuth → `McpOAuthManager.startOAuthFlow()`
3. فتح المتصفح لصفحة المصادقة
4. callback عبر `/mcp-auth/callback/{hash}`
5. إعادة محاولة الاتصال مع الـ token

## تخزين المصادقة

الـ tokens تخزن في `secrets.json`:
- `authNonce` - nonce للتحقق من حالة المصادقة
- `mcpOAuthSecrets` - أسرار OAuth لخوادم MCP
- `openai-codex-oauth-credentials` - OAuth tokens لـ OpenAI Codex

## Telemetry للمصادقة

يتم تتبع أربعة أحداث:
- `AUTH_STARTED` - بدء تدفق المصادقة
- `AUTH_SUCCEEDED` - نجاح المصادقة
- `AUTH_FAILED` - فشل المصادقة
- `AUTH_LOGGED_OUT` - تسجيل الخروج (مع سبب)

## Proto RPCs للمصادقة

من `account.proto`:
- `authStateChanged` - تحديث حالة المصادقة من Firebase
- `subscribeToAuthStatusUpdate` - اشتراك في تحديثات حالة المصادقة (streaming)
- `authenticateMcpServer` - بدء مصادقة MCP OAuth

## استخدام `@/shared/net`

**قاعدة هامة:** أي طلب شبكة من خدمة المصادقة يجب أن يستخدم `fetch` من `@/shared/net` لدعم proxies.

## نقاط هامة من .clinerules

- **تخزين المفاتيح**: دائماً في `secrets.json` (mode 0o600) عبر `StateManager.get().setSecret()`
- **عدم استخدام VSCode ExtensionContext**: استخدم `StateManager` للتخزين عبر المنصات
- **استخدام `@/shared/net`**: لجميع طلبات الشبكة

## Related Files

- `src/services/auth/AuthService.ts` - المنسق الرئيسي
- `src/services/account/ClineAccountService.ts` - خدمة الحسابات
- `src/services/oca/OcaAuthService.ts` - مصادقة OCA
- `src/services/uri/SharedUriHandler.ts` - معالج URI
- `src/services/mcp/McpHub.ts` - OAuth MCP
- `src/shared/auth/AuthHandler.ts` - معالج الـ auth callback
- `src/shared/ClineAccount.ts` - ثوابت الحسابات
- `proto/cline/account.proto` - تعريفات RPC
- `proto/cline/oca_account.proto` - تعريفات OCA
- `test/services/auth-callback-url.test.ts` - اختبارات الـ callback
- `test/services/ClineAccountService.test.ts` - اختبارات الحسابات