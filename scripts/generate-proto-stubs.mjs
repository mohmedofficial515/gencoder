#!/usr/bin/env node
import * as fs from "fs/promises"
import * as path from "path"

const PROTO_DIR = path.resolve("proto")

const protoFiles = {
	"google/protobuf/timestamp.proto": `syntax = "proto3";
package google.protobuf;
message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}
`,
	"cline/common.proto": `syntax = "proto3";
package cline;
message EmptyRequest {}
message StringRequest { string value = 1; }
message BooleanRequest { bool value = 1; }
message Int64Request { int64 value = 1; }
message StringArrayRequest { repeated string values = 1; }
message Empty {}
message StringMsg { string value = 1; }
message BooleanMsg { bool value = 1; }
message KeyValuePair { string key = 1; string value = 2; }
message Int64 { int64 value = 1; }
`,
	"cline/state.proto": `syntax = "proto3";
package cline;
import "google/protobuf/timestamp.proto";
message State { string stateJson = 1; }
message UpdateSettingsRequest {
  string apiConfiguration = 1;
  int32 telemetrySetting = 2;
  bool planActSeparateModelsSetting = 3;
  bool enableCheckpointsSetting = 4;
  int32 mcpDisplayMode = 5;
  string mode = 6;
  string preferredLanguage = 7;
  int32 shellIntegrationTimeout = 8;
  int32 vscodeTerminalExecutionMode = 9;
  int32 maxConsecutiveMistakes = 10;
  bool strictPlanModeEnabled = 11;
  bool yoloModeToggled = 12;
  bool clineWebToolsEnabled = 13;
  bool worktreesEnabled = 14;
  bool subagentsEnabled = 15;
  bool useAutoCondense = 16;
  string customPrompt = 17;
  bool backgroundEditEnabled = 18;
  bool multiRootEnabled = 19;
  bool nativeToolCallEnabled = 20;
  bool enableParallelToolCalling = 21;
  bool optOutOfRemoteConfig = 22;
  bool doubleCheckCompletionEnabled = 23;
  bool lazyTeammateModeEnabled = 24;
  bool showFeatureTips = 25;
  int32 terminalOutputLineLimit = 26;
  bool hooksEnabled = 27;
  bool terminalReuseEnabled = 28;
  string browserSettings = 29;
  string defaultTerminalProfile = 30;
  string focusChainSettings = 31;
  string clineEnv = 32;
  bool mcpResponsesCollapsed = 33;
}
message UpdateSettingsRequestCli {
  string settings = 1;
  string secrets = 2;
}
message UpdateTaskSettingsRequest {
  string taskId = 1;
  string settings = 2;
}
message TogglePlanActModeRequest {
  int32 mode = 1;
  string chatContent = 2;
}
message ResetStateRequest { bool global = 1; }
message AutoApprovalSettingsRequest {
  int32 version = 1;
  bool enableNotifications = 2;
  string actions = 3;
}
message TelemetrySettingRequest { int32 setting = 1; }
message UpdateTerminalConnectionTimeoutRequest { int32 timeoutMs = 1; }
message UpdateTerminalConnectionTimeoutResponse { int32 timeoutMs = 1; }
message TerminalProfile { string name = 1; string shellPath = 2; string args = 3; bool isDefault = 4; }
message TestConnectionResult { bool success = 1; string message = 2; }
message ProcessInfo { int32 processId = 1; string version = 2; int64 uptimeMs = 3; }
message OnboardingProgressRequest { string step = 1; }
message OnboardingModel { string id = 1; string name = 2; string provider = 3; }
message OnboardingModelGroup { string name = 1; string provider = 2; repeated OnboardingModel models = 3; }
`,
	"cline/models.proto": `syntax = "proto3";
package cline;
message ModelsApiConfiguration {
  string apiProvider = 1;
  string apiModelId = 2;
  string openRouterApiKey = 3;
  string openRouterModelId = 4;
  string openRouterModelInfo = 5;
  string anthropicApiKey = 6;
  string openAiApiKey = 7;
  string openAiBaseUrl = 8;
  string openAiModelId = 9;
  string openAiModelInfo = 10;
  string vertexProjectId = 11;
  string vertexRegion = 12;
  string geminiApiKey = 13;
  string bedrockRegion = 14;
  string ollamaModelId = 15;
  string ollamaBaseUrl = 16;
  string lmStudioModelId = 17;
  string lmStudioBaseUrl = 18;
  string togetherApiKey = 19;
  string togetherModelId = 20;
  string fireworksApiKey = 21;
  string fireworksModelId = 22;
  string deepseekApiKey = 23;
  string deepseekModelId = 24;
  string qwenApiLine = 25;
  string qwenApiKey = 26;
  string qwenModelId = 27;
  string mistralApiKey = 28;
  string mistralModelId = 29;
  string doubaoApiKey = 30;
  string doubaoModelId = 31;
  string vsCodeLmModelSelector = 32;
  string liteLllmModelId = 33;
  string liteLlmModelInfo = 34;
  string liteLlmBaseUrl = 35;
  string requestyApiKey = 36;
  string requestyModelId = 37;
  string requestyModelInfo = 38;
  string groqApiKey = 39;
  string groqModelId = 40;
  string groqModelInfo = 41;
  string basetenModelId = 42;
  string basetenModelInfo = 43;
  string basetenBaseUrl = 44;
  string huggingFaceModelId = 45;
  string huggingFaceModelInfo = 46;
  string awsBedrockCustomSelected = 47;
  string awsBedrockCustomModelBaseId = 48;
  string hicapApiKey = 49;
  string hicapModelId = 50;
  string hicapModelInfo = 51;
  string openAiCodexApiKey = 52;
  string openAiCodexModelId = 53;
  string askSageApiKey = 54;
  string askSageModelId = 55;
  string sambaNovaApiKey = 56;
  string sambaNovaModelId = 57;
  string xaiApiKey = 58;
  string xaiModelId = 59;
  string moonshotApiKey = 60;
  string moonshotModelId = 61;
  string nebiusApiKey = 62;
  string nebiusModelId = 63;
  string wandbApiKey = 64;
  string wandbModelId = 65;
  string cerebrasApiKey = 66;
  string cerebrasModelId = 67;
  string sapAiCoreModelId = 68;
  string sapAiCoreModelDeployment = 69;
  string sapAiCoreApiKey = 70;
  string sapAiCoreBaseUrl = 71;
  string huaweiCloudMaasModelId = 72;
  string huaweiCloudMaasModelInfo = 73;
  string huaweiCloudMaasApiKey = 74;
  string huaweiCloudMaasBaseUrl = 75;
  string zaiApiLine = 76;
  string zaiApiKey = 77;
  string zaiModelId = 78;
  string vercelAiGatewayModelId = 79;
  string vercelAiGatewayModelInfo = 80;
  string vercelAiGatewayBaseUrl = 81;
  string difyBaseUrl = 82;
  string difyApiKey = 83;
  string aihubmixApiKey = 84;
  string aihubmixModelId = 85;
  string aihubmixModelInfo = 86;
  string aihubmixBaseUrl = 87;
  string ocaBaseUrl = 88;
  string ocaApiKey = 89;
  string ocaModelId = 90;
  string ocaModelInfo = 91;
  string claudeCodeModelId = 92;
  string claudeCodeModelInfo = 93;
  string claudeCodeApiKey = 94;
  string nousResearchApiKey = 95;
  string nousResearchModelId = 96;
  string planModeApiProvider = 97;
  string planModeApiModelId = 98;
  string actModeApiProvider = 99;
  string actModeApiModelId = 100;
}
message OpenRouterModelInfo {
  int64 maxTokens = 1; int64 contextWindow = 2; bool supportsImages = 3; bool supportsPromptCache = 4;
  double inputPrice = 5; double outputPrice = 6; double cacheWritesPrice = 7; double cacheReadsPrice = 8;
  string description = 9; string thinkingConfig = 10; bool supportsGlobalEndpoint = 11; string tiers = 12;
}
message OpenAiCompatibleModelInfo {
  int64 maxTokens = 1; int64 contextWindow = 2; bool supportsImages = 3; bool supportsPromptCache = 4;
  double inputPrice = 5; double outputPrice = 6; string description = 7; double temperature = 8;
  bool isR1FormatRequired = 9;
}
message LiteLLMModelInfo {
  int64 maxTokens = 1; int64 contextWindow = 2; bool supportsImages = 3; bool supportsPromptCache = 4;
  double inputPrice = 5; double outputPrice = 6; string description = 7; double temperature = 8;
  bool supportsReasoning = 9;
}
message OcaModelInfo {
  int64 maxTokens = 1; int64 contextWindow = 2; bool supportsImages = 3; bool supportsPromptCache = 4;
  double inputPrice = 5; double outputPrice = 6; string description = 7; string thinkingConfig = 8;
  string surveyContent = 9; string surveyId = 10; string banner = 11; string modelName = 12;
  string apiFormat = 13; bool supportsReasoning = 14; string reasoningEffortOptions = 15;
}
message ClineRecommendedModel { string id = 1; string name = 2; string provider = 3; string modelInfo = 4; }
message ClineRecommendedModelsResponse { repeated ClineRecommendedModel models = 1; }
message ThinkingConfig { int64 maxBudget = 1; double outputPrice = 2; string outputPriceTiers = 3; }
message OpenAiModelsRequest { string apiKey = 1; string baseUrl = 2; }
message UpdateApiConfigurationRequest { string apiConfiguration = 1; }
message UpdateApiConfigurationRequestNew { string apiConfiguration = 1; }
message UpdateApiConfigurationPartialRequest { string apiConfiguration = 1; }
message LanguageModelChatSelector { string vendor = 1; string family = 2; string version = 3; string id = 4; }
message VsCodeLmModelsArray { repeated LanguageModelChatSelector models = 1; }
message SapAiCoreModelDeployment { string id = 1; string name = 2; string endpointUrl = 3; }
`,
	"cline/task.proto": `syntax = "proto3";
package cline;
message NewTaskRequest { string text = 1; repeated string images = 2; repeated string files = 3; string taskSettings = 4; }
message AskResponseRequest { string askType = 1; string text = 2; bool approved = 3; }
message GetTaskHistoryRequest { int32 limit = 1; int32 offset = 2; }
message TaskHistoryArray { repeated string tasks = 1; }
message TaskFavoriteRequest { string taskId = 1; }
message TaskResponse { string id = 1; string text = 2; string ts = 3; }
message DeleteAllTaskHistoryCount { int64 count = 1; }
message ExplainChangesRequest { string taskId = 1; string diff = 2; }
message ExecuteQuickWinRequest { string action = 1; }
`,
	"cline/file.proto": `syntax = "proto3";
package cline;
message FileSearchRequest { string query = 1; string mentionsRequestId = 2; int32 selectedType = 3; string workspaceHint = 4; int32 limit = 5; }
message FileSearchResults { repeated FileInfo results = 1; string mentionsRequestId = 2; string errorReason = 3; string errorMessage = 4; }
message FileInfo { string path = 1; int32 type = 2; string label = 3; string workspaceName = 4; }
message RelativePathsRequest { repeated string uris = 1; }
message RelativePaths { repeated string paths = 1; }
message GitCommits { repeated string commits = 1; }
message RefreshedRules {
  string globalClineRulesToggles = 1; string localClineRulesToggles = 2; string localCursorRulesToggles = 3;
  string localWindsurfRulesToggles = 4; string localAgentsRulesToggles = 5; string localWorkflowToggles = 6;
  string globalWorkflowToggles = 7;
}
message ClineRulesToggles { string toggles = 1; }
message RuleFile { string filePath = 1; string displayName = 2; bool alreadyExists = 3; }
message RuleFileRequest { bool isGlobal = 1; string filename = 2; string type = 3; }
message ToggleClineRuleRequest { bool isGlobal = 1; string ruleName = 2; }
message ToggleCursorRuleRequest { bool isGlobal = 1; string ruleName = 2; }
message ToggleWindsurfRuleRequest { bool isGlobal = 1; string ruleName = 2; }
message ToggleAgentsRuleRequest { bool isGlobal = 1; string ruleName = 2; }
message ToggleWorkflowRequest { bool isGlobal = 1; string workflowName = 2; }
message ToggleClineRules { string toggles = 1; }
message ToggleHookRequest { bool isGlobal = 1; string hookName = 2; }
message ToggleHookResponse { string hooksToggles = 1; }
message CreateHookRequest { string hookName = 1; bool isGlobal = 2; string workspaceName = 3; }
message CreateHookResponse { string hooksToggles = 1; }
message DeleteHookRequest { string hookName = 1; bool isGlobal = 2; }
message DeleteHookResponse { string hooksToggles = 1; }
message HookInfo { string name = 1; bool enabled = 2; string absolutePath = 3; }
message HooksToggles { repeated HookInfo globalHooks = 1; repeated WorkspaceHooks workspaceHooks = 2; bool isWindows = 3; }
message WorkspaceHooks { string workspaceName = 1; repeated HookInfo hooks = 2; }
message SkillInfo { string name = 1; string description = 2; string path = 3; bool enabled = 4; bool alwaysEnabled = 5; }
message SkillsToggles { string toggles = 1; }
message RefreshedSkills { repeated SkillInfo globalSkills = 1; repeated SkillInfo localSkills = 2; }
message CreateSkillRequest { string name = 1; string description = 2; bool isGlobal = 3; }
message DeleteSkillRequest { string name = 1; bool isGlobal = 2; }
message ToggleSkillRequest { string name = 1; bool isGlobal = 2; }
`,
	"cline/mcp.proto": `syntax = "proto3";
package cline;
message McpServers { repeated McpServer mcpServers = 1; }
message McpServer {
  string name = 1; string config = 2; int32 status = 3; string error = 4;
  repeated McpTool tools = 5; repeated McpResource resources = 6;
  repeated McpResourceTemplate resourceTemplates = 7; repeated McpPrompt prompts = 8;
  bool disabled = 9; int32 timeout = 10; bool oauthRequired = 11; string oauthAuthStatus = 12;
}
message McpTool { string name = 1; string description = 2; string inputSchema = 3; bool autoApprove = 4; }
message McpResource { string uri = 1; string name = 2; string mimeType = 3; string description = 4; }
message McpResourceTemplate { string uriTemplate = 1; string name = 2; string mimeType = 3; string description = 4; }
message McpPrompt { string name = 1; string title = 2; string description = 3; repeated McpPromptArgument arguments = 4; }
message McpPromptArgument { string name = 1; string description = 2; bool required = 3; }
message McpMarketplaceCatalog { string catalog = 1; }
message McpDownloadResponse { string mcpId = 1; string githubUrl = 2; string name = 3; string author = 4; string description = 5; string readmeContent = 6; string llmsInstallationContent = 7; bool requiresApiKey = 8; string error = 9; }
message ToggleMcpServerRequest { string serverName = 1; }
message ToggleToolAutoApproveRequest { string serverName = 1; string toolName = 2; }
message UpdateMcpTimeoutRequest { string serverName = 1; int32 timeout = 2; }
message AddRemoteMcpServerRequest { string url = 1; string apiKey = 2; string name = 3; }
`,
	"cline/account.proto": `syntax = "proto3";
package cline;
message AuthState { UserInfo user = 1; }
message UserInfo { string uid = 1; string displayName = 2; string email = 3; string photoUrl = 4; string appBaseUrl = 5; }
message AuthStateChangedRequest { UserInfo user = 1; }
message UserOrganization { bool active = 1; string memberId = 2; string name = 3; string organizationId = 4; string roles = 5; }
message UserOrganizationsResponse { repeated UserOrganization organizations = 1; }
message UserOrganizationUpdateRequest { string organizationId = 1; }
message UserCreditsData { string balance = 1; repeated string usageTransactions = 2; repeated string paymentTransactions = 3; }
message OrganizationCreditsData { string balance = 1; string organizationId = 2; repeated string usageTransactions = 3; }
message OrganizationUsageTransaction {
  string aiInferenceProviderName = 1; string aiModelName = 2; string aiModelTypeName = 3;
  int64 completionTokens = 4; double costUsd = 5; string createdAt = 6; double creditsUsed = 7;
  string generationId = 8; string organizationId = 9; int64 promptTokens = 10; int64 totalTokens = 11;
  string userId = 12; string operation = 13;
}
message GetOrganizationCreditsRequest { string organizationId = 1; }
message UsageTransaction { string id = 1; double amount = 2; string description = 3; string ts = 4; }
message SubmitLimitIncreaseResponse { bool success = 1; }
`,
	"cline/ui.proto": `syntax = "proto3";
package cline;
message ClineMessage {
  double ts = 1; int32 type = 2; int32 ask = 3; int32 say = 4;
  string text = 5; string reasoning = 6; repeated string images = 7; repeated string files = 8;
  bool partial = 9; string lastCheckpointHash = 10; bool isCheckpointCheckedOut = 11;
  bool isOperationOutsideWorkspace = 12; int32 conversationHistoryIndex = 13;
  ConversationHistoryDeletedRange conversationHistoryDeletedRange = 14;
}
message ConversationHistoryDeletedRange { int32 startIndex = 1; int32 endIndex = 2; }
message ShowWebviewEvent { string viewType = 1; string title = 2; string icon = 3; }
`,
	"cline/browser.proto": `syntax = "proto3";
package cline;
message BrowserConnection { bool success = 1; string message = 2; string endpoint = 3; }
message BrowserConnectionInfo { bool isConnected = 1; bool isRemote = 2; string host = 3; }
message ChromePath { string path = 1; bool isBundled = 2; }
`,
	"cline/checkpoints.proto": `syntax = "proto3";
package cline;
import "google/protobuf/timestamp.proto";
message CheckpointEvent {
  int32 operation = 1; string cwdHash = 2; bool isActive = 3;
  google.protobuf.Timestamp timestamp = 4; string taskId = 5; string commitHash = 6;
}
message CheckpointSubscriptionRequest { string cwdHash = 1; }
message CheckpointRestoreRequest { string commitHash = 1; string cwdHash = 2; string taskId = 3; }
message PathHashMap { string hash = 1; }
`,
	"cline/slash.proto": `syntax = "proto3";
package cline;
message SlashCommandInfo { string name = 1; string description = 2; }
message SlashCommandsResponse { repeated SlashCommandInfo commands = 1; }
`,
	"cline/hooks.proto": `syntax = "proto3";
package cline;
message HookOutput { bool cancel = 1; string contextModification = 2; string errorMessage = 3; }
message NotificationData {
  string event = 1; string source = 2; string message = 3; bool waitingForUserInput = 4;
  int32 eventVersion = 5; string eventId = 6; bool messageTruncated = 7;
  string sourceType = 8; string sourceId = 9; bool requiresUserAction = 10; int32 severity = 11;
}
`,
	"cline/worktree.proto": `syntax = "proto3";
package cline;
message Worktree {
  string path = 1; string branch = 2; string commitHash = 3; bool isCurrent = 4;
  bool isBare = 5; bool isDetached = 6; bool isLocked = 7; string lockReason = 8;
}
message WorktreeList {
  repeated Worktree worktrees = 1; bool isGitRepo = 2; bool isMultiRoot = 3;
  bool isSubfolder = 4; string gitRootPath = 5; string error = 6;
}
message WorktreeResult { string result = 1; }
message WorktreeDefaults { string defaults = 1; }
message WorktreeIncludeStatus { string status = 1; }
message BranchList { repeated string branches = 1; }
message MergeWorktreeResult { string result = 1; }
message CreateWorktreeRequest { string path = 1; string branch = 2; }
message CreateWorktreeIncludeRequest { string path = 1; }
message DeleteWorktreeRequest { string path = 1; }
message SwitchWorktreeRequest { string path = 1; }
message MergeWorktreeRequest { string path = 1; string branch = 2; }
message CheckoutBranchRequest { string branch = 1; }
message TrackWorktreeViewOpenedRequest { string view = 1; }
`,
	"cline/oca_account.proto": `syntax = "proto3";
package cline;
message OcaAuthState { OcaUserInfo user = 1; string apiKey = 2; }
message OcaUserInfo { string uid = 1; string displayName = 2; string email = 3; }
`,
	"host/window.proto": `syntax = "proto3";
package host;
message ShowMessageRequest { int32 type = 1; string message = 2; repeated string items = 3; }
message ShowMessageResponse { string selected = 1; }
`,
	"host/workspace.proto": `syntax = "proto3";
package host;
message ExecuteCommandInTerminalRequest { string command = 1; }
message ExecuteCommandInTerminalResponse { bool success = 1; int32 exitCode = 2; string output = 3; }
`,
}

async function main() {
	// Create all proto directories and files
	for (const [filepath, content] of Object.entries(protoFiles)) {
		const fullPath = path.join(PROTO_DIR, filepath)
		await fs.mkdir(path.dirname(fullPath), { recursive: true })
		await fs.writeFile(fullPath, content)
		console.log(`Created: ${filepath}`)
	}
	console.log(`\n✓ All ${Object.keys(protoFiles).length} proto files created in ${PROTO_DIR}`)
}

main().catch(console.error)
