declare module "vscode" {
	interface LanguageModelChatSelector {
		vendor?: string
		family?: string
		version?: string
		id?: string
	}

	interface LanguageModelChat {
		readonly name: string
		readonly id: string
		readonly vendor: string
		readonly family: string
		readonly version: string
		readonly maxInputTokens: number
		sendRequest(messages: any[], options?: any, token?: any): Thenable<any>
		countTokens(text: string | any, token?: any): Thenable<number>
	}

	namespace lm {
		function selectChatModels(selector?: LanguageModelChatSelector): Thenable<LanguageModelChat[]>
	}
}
