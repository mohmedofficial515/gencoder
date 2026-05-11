export enum NEW_USER_TYPE {
	FREE = "free",
	POWER = "power",
	BYOK = "byok",
}

type UserTypeSelection = {
	title: string
	description: string
	type: NEW_USER_TYPE
}

export const STEP_CONFIG = {
	0: {
		title: "How will you use GenCoder?",
		description: "Choose how you want to power your assistant.",
		buttons: [
			{ text: "Continue", action: "next", variant: "default" },
			{ text: "Login to GenCoder", action: "signin", variant: "secondary" },
		],
	},
	[NEW_USER_TYPE.FREE]: {
		title: "Select a free model",
		buttons: [
			{ text: "Create my Account", action: "signup", variant: "default" },
			{ text: "Back", action: "back", variant: "secondary" },
		],
	},
	[NEW_USER_TYPE.POWER]: {
		title: "Select your model",
		buttons: [
			{ text: "Create my Account", action: "signup", variant: "default" },
			{ text: "Back", action: "back", variant: "secondary" },
		],
	},
	[NEW_USER_TYPE.BYOK]: {
		title: "Configure your provider",
		buttons: [
			{ text: "Continue", action: "done", variant: "default" },
			{ text: "Back", action: "back", variant: "secondary" },
		],
	},
	2: {
		title: "Almost there!",
		description: "We opened your browser to finish sign-in. Come back here when you're done.",
		buttons: [{ text: "Back", action: "back", variant: "secondary" }],
	},
} as const

export const USER_TYPE_SELECTIONS: UserTypeSelection[] = [
	{ title: "Free", description: "Hosted models with no upfront cost", type: NEW_USER_TYPE.FREE },
	{
		title: "Premium models",
		description: "Claude, GPT, Gemini and other top-tier models",
		type: NEW_USER_TYPE.POWER,
	},
	{ title: "Use my own API key", description: "Connect to any supported provider", type: NEW_USER_TYPE.BYOK },
]
