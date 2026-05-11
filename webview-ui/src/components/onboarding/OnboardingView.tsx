import type { ModelInfo } from "@shared/api"
import type { OnboardingModel, OnboardingModelGroup, OpenRouterModelInfo } from "@shared/proto/index.cline"
import { AlertCircleIcon, CircleCheckIcon, CircleIcon, ListIcon, LoaderCircleIcon, ZapIcon } from "lucide-react"
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import ClineLogoWhite from "@/assets/ClineLogoWhite"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemHeader, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { cn } from "@/lib/utils"
import { AccountServiceClient, StateServiceClient } from "@/services/grpc-client"
import ApiConfigurationSection from "../settings/sections/ApiConfigurationSection"
import { useApiConfigurationHandlers } from "../settings/utils/useApiConfigurationHandlers"
import WelcomeView from "../welcome/WelcomeView"
import {
	getCapabilities,
	getClineUIOnboardingGroups,
	getPriceRange,
	getSpeedLabel,
	type OnboardingModelsByGroup,
} from "./data-models"
import { NEW_USER_TYPE, STEP_CONFIG, USER_TYPE_SELECTIONS } from "./data-steps"
import StepDots from "./StepDots"
import { useOnboardingModels } from "./useOnboardingModels"

/**
 * Unified selected/idle class set used by both user-type cards and model cards.
 * Per SPEC §5 — one selected-state language across all onboarding cards.
 */
const cardClass = (isSelected: boolean) =>
	cn(
		"cursor-pointer hover:cursor-pointer w-full motion-safe:transition-colors motion-safe:duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring",
		isSelected
			? "bg-input-background/80 border border-button-background"
			: "border border-input-foreground/30 hover:bg-input-background/40",
	)

/**
 * Roving-tabindex arrow-key handler for a vertical `radiogroup` of cards.
 * Per SPEC §4 — keyboard parity is principle 1.
 */
function makeRadioGroupKeyHandler<T>({
	options,
	current,
	onChange,
	getKey,
}: {
	options: T[]
	current: T | undefined
	onChange: (next: T) => void
	getKey: (option: T) => string
}) {
	return (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") {
			return
		}
		e.preventDefault()
		const currentIndex = current ? options.findIndex((o) => getKey(o) === getKey(current)) : -1
		let nextIndex = currentIndex
		if (e.key === "ArrowDown") {
			nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length
		} else if (e.key === "ArrowUp") {
			nextIndex = currentIndex < 0 ? options.length - 1 : (currentIndex - 1 + options.length) % options.length
		} else if (e.key === "Home") {
			nextIndex = 0
		} else if (e.key === "End") {
			nextIndex = options.length - 1
		}
		const next = options[nextIndex]
		if (next) {
			onChange(next)
		}
	}
}

type ModelSelectionProps = {
	userType: NEW_USER_TYPE.FREE | NEW_USER_TYPE.POWER
	selectedModelId: string
	onSelectModel: (modelId: string) => void
	onboardingModels: OnboardingModelsByGroup
	models?: Record<string, ModelInfo>
	searchTerm: string
	setSearchTerm: (term: string) => void
}

export const ModelSelection = ({
	userType,
	selectedModelId,
	onSelectModel,
	models,
	searchTerm,
	setSearchTerm,
	onboardingModels,
}: ModelSelectionProps) => {
	const modelGroups = onboardingModels[userType === NEW_USER_TYPE.FREE ? "free" : "power"]

	const searchedModels = useMemo(() => {
		if (!models || !searchTerm) {
			return []
		}
		const flattenedModels = modelGroups.flatMap((g) => g.models.map((m) => m.id))
		// Filter out embedding models and already listed models
		const filtered = Object.entries(models).filter(
			([id, _info]) => !id.includes("embedding") && !flattenedModels.includes(id) && id.includes(searchTerm.toLowerCase()),
		)
		return filtered.slice(0, 5) // Return the first 5 models
	}, [models, modelGroups, searchTerm])

	// Flattened list of every selectable model id, in the order they appear on
	// screen — used for radiogroup arrow-key navigation.
	const flatModelIds = useMemo(() => {
		const grouped = modelGroups.flatMap((g) => g.models.map((m) => m.id))
		const searched = searchedModels.map(([id]) => id)
		return [...grouped, ...searched]
	}, [modelGroups, searchedModels])

	const onModelKeyDown = useMemo(
		() =>
			makeRadioGroupKeyHandler<string>({
				options: flatModelIds,
				current: flatModelIds.find((id) => id === selectedModelId),
				onChange: (id) => onSelectModel(id),
				getKey: (id) => id,
			}),
		[flatModelIds, selectedModelId, onSelectModel],
	)

	// Model Item Component — rendered as `role="radio"` for the radiogroup.
	const ModelItem = ({ id, model, isSelected }: { id: string; model: OnboardingModel; isSelected: boolean }) => {
		return (
			<Item
				aria-checked={isSelected}
				aria-label={`Select model ${model.name || id}`}
				className={cardClass(isSelected)}
				key={id}
				onClick={() => onSelectModel(id)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault()
						onSelectModel(id)
					}
				}}
				role="radio"
				tabIndex={isSelected || (!selectedModelId && flatModelIds[0] === id) ? 0 : -1}
				variant="outline">
				<ItemHeader className="flex flex-col w-full align-baseline">
					<ItemTitle className="flex w-full justify-between">
						<span className="font-semibold">{model.name || id}</span>
						{model.badge ? (
							<Badge className="capitalize" variant="info">
								{model.badge}
							</Badge>
						) : model.info ? (
							<Badge>{getPriceRange(model.info)}</Badge>
						) : null}
					</ItemTitle>
					{isSelected && model.info && (
						<ItemDescription>
							<span className="text-muted-foreground text-sm">Support: </span>
							<span className="text-foreground text-sm">{getCapabilities(model.info).join(", ")}</span>
						</ItemDescription>
					)}
				</ItemHeader>
				{model.badge && isSelected && (
					<ItemContent className="w-full border-t border-muted-foreground pt-5 text-ellipsis overflow-hidden">
						<div className="flex flex-col gap-3">
							<div className="inline-flex gap-1 [&_svg]:stroke-success [&_svg]:size-3 items-center text-sm">
								<ZapIcon />
								<span>Speed: </span>
								<span className="text-muted-foreground">{getSpeedLabel(model.latency)}</span>
							</div>
							{model.info && (
								<div className="flex w-full justify-between">
									<div className="inline-flex gap-1 [&_svg]:stroke-foreground [&_svg]:size-3 items-center text-sm">
										<ListIcon />
										<span>Context: </span>
										<span className="text-muted-foreground">{(model?.info.contextWindow || 0) / 1000}k</span>
									</div>
									<Badge>{getPriceRange(model.info)}</Badge>
								</div>
							)}
						</div>
					</ItemContent>
				)}
			</Item>
		)
	}

	return (
		<div className="flex flex-col w-full items-center px-2">
			<div
				aria-label="Choose a model"
				className="flex w-full max-w-lg flex-col gap-6 my-4"
				onKeyDown={onModelKeyDown}
				role="radiogroup">
				{modelGroups.map((group) => (
					<div className="flex flex-col gap-3" key={group.group}>
						<h4 className="text-sm font-semibold text-muted-foreground mb-2">{group.group}</h4>
						{group.models.map((model) => (
							<ModelItem id={model.id} isSelected={selectedModelId === model.id} key={model.id} model={model} />
						))}
					</div>
				))}
			</div>

			{/* SEARCH MODEL */}
			<div className="flex w-full max-w-lg flex-col gap-6 my-4 border-t border-muted-foreground">
				<div className="flex flex-col gap-3 mt-6" key="search-results">
					<Label className="text-sm font-semibold text-muted-foreground mb-2" htmlFor="onboarding-model-search">
						More models
					</Label>
					<Label className="sr-only" htmlFor="onboarding-model-search">
						Search for additional models
					</Label>
					<Input
						autoFocus={false}
						className="focus-visible:border-button-background"
						id="onboarding-model-search"
						onChange={(e) => {
							if (!e.target?.value) {
								onSelectModel("")
							}
							setSearchTerm(e.target.value)
						}}
						onClick={() => onSelectModel("")}
						placeholder="Search other models..."
						type="search"
						value={searchTerm}
					/>
					<div aria-label="Search results" className="w-full flex flex-col gap-3" role="radiogroup">
						{searchTerm &&
							searchedModels.map(([id, info]) => {
								const isSelected = selectedModelId === id
								// Convert ModelInfo to OpenRouterModelInfo for OnboardingModel
								const modelInfo: OpenRouterModelInfo = {
									name: info.name,
									maxTokens: info.maxTokens,
									contextWindow: info.contextWindow,
									supportsImages: info.supportsImages,
									supportsPromptCache: info.supportsPromptCache,
									inputPrice: info.inputPrice,
									outputPrice: info.outputPrice,
									cacheWritesPrice: info.cacheWritesPrice,
									cacheReadsPrice: info.cacheReadsPrice,
									description: info.description,
									supportsGlobalEndpoint: info.supportsGlobalEndpoint,
									thinkingConfig: info.thinkingConfig
										? {
												maxBudget: info.thinkingConfig.maxBudget,
												outputPrice: info.thinkingConfig.outputPrice,
												outputPriceTiers: info.thinkingConfig.outputPriceTiers || [],
											}
										: undefined,
									tiers: info.tiers || [],
								}
								const onboardingModel: OnboardingModel = {
									id,
									name: info.name || id,
									info: modelInfo,
									score: 0,
									latency: 0,
									badge: "",
									group: "",
								}
								return <ModelItem id={id} isSelected={isSelected} key={id} model={onboardingModel} />
							})}
						{searchTerm.length > 0 && searchedModels.length === 0 && (
							<p className="px-1 mt-1 text-sm text-muted-foreground">
								No models found for "{searchTerm}". Try a different name.
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

type UserTypeSelectionProps = {
	userType: NEW_USER_TYPE | undefined
	onSelectUserType: (type: NEW_USER_TYPE) => void
}

export const UserTypeSelectionStep = ({ userType, onSelectUserType }: UserTypeSelectionProps) => {
	const onUserTypeKeyDown = useMemo(
		() =>
			makeRadioGroupKeyHandler<{ type: NEW_USER_TYPE }>({
				options: USER_TYPE_SELECTIONS,
				current: userType ? { type: userType } : undefined,
				onChange: ({ type }) => onSelectUserType(type),
				getKey: ({ type }) => type,
			}),
		[userType, onSelectUserType],
	)

	return (
		<div className="flex flex-col w-full items-center">
			<div
				aria-label="How will you use GenCoder?"
				className="flex w-full max-w-lg flex-col gap-3 my-2"
				onKeyDown={onUserTypeKeyDown}
				role="radiogroup">
				{USER_TYPE_SELECTIONS.map((option, index) => {
					const isSelected = userType === option.type
					const isTabStop = isSelected || (!userType && index === 0)

					return (
						<Item
							aria-checked={isSelected}
							aria-label={`Select option: ${option.title}`}
							className={cardClass(isSelected)}
							key={option.type}
							onClick={() => onSelectUserType(option.type)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									onSelectUserType(option.type)
								}
							}}
							role="radio"
							tabIndex={isTabStop ? 0 : -1}>
							<ItemMedia className="[&_svg]:stroke-button-background" variant="icon">
								{isSelected ? <CircleCheckIcon className="stroke-1.5" /> : <CircleIcon className="stroke-1" />}
							</ItemMedia>
							<ItemContent className="w-full">
								<ItemTitle>{option.title}</ItemTitle>
								<ItemDescription>{option.description}</ItemDescription>
							</ItemContent>
						</Item>
					)
				})}
			</div>
		</div>
	)
}

type OnboardingStepContentProps = {
	step: number
	userType: NEW_USER_TYPE | undefined
	selectedModelId: string
	onSelectUserType: (type: NEW_USER_TYPE) => void
	onSelectModel: (modelId: string) => void
	searchTerm: string
	setSearchTerm: (term: string) => void
	models?: Record<string, ModelInfo>
	onboardingModels: OnboardingModelsByGroup
}

const OnboardingStepContent = ({
	step,
	userType,
	selectedModelId,
	onSelectUserType,
	onSelectModel,
	searchTerm,
	setSearchTerm,
	models,
	onboardingModels,
}: OnboardingStepContentProps) => {
	if (step === 0) {
		return <UserTypeSelectionStep onSelectUserType={onSelectUserType} userType={userType} />
	}
	if (step === 2) {
		return null
	}
	if (userType === NEW_USER_TYPE.FREE || userType === NEW_USER_TYPE.POWER) {
		return (
			<ModelSelection
				models={models}
				onboardingModels={onboardingModels}
				onSelectModel={onSelectModel}
				searchTerm={searchTerm}
				selectedModelId={selectedModelId}
				setSearchTerm={setSearchTerm}
				userType={userType}
			/>
		)
	}
	// userType === NEW_USER_TYPE.BYOK
	return <ApiConfigurationSection />
}

const OnboardingViewContent = ({ onboardingModels }: { onboardingModels: OnboardingModelGroup }) => {
	const { handleFieldsChange } = useApiConfigurationHandlers()
	const { openRouterModels, hideSettings, hideAccount, setShowWelcome } = useExtensionState()

	const [stepNumber, setStepNumber] = useState(0)
	const [isActionLoading, setIsActionLoading] = useState(false)
	const [userType, setUserType] = useState<NEW_USER_TYPE>(NEW_USER_TYPE.FREE)
	// Surface OAuth errors that were previously swallowed by `.catch(() => {})`.
	// `null` means "no error to display". See SPEC §5 (Errors are surfaces).
	const [loginError, setLoginError] = useState<string | null>(null)

	const [selectedModelId, setSelectedModelId] = useState("")
	const [searchTerm, setSearchTerm] = useState("")

	const models = useMemo(() => getClineUIOnboardingGroups(onboardingModels), [onboardingModels])

	// Track the action the user attempted so we can retry it from the Alert
	// without losing state.
	const lastAuthActionRef = useRef<"signup" | "signin" | null>(null)

	useEffect(() => {
		setSearchTerm("")
		const userGroup = userType === NEW_USER_TYPE.POWER ? NEW_USER_TYPE.POWER : NEW_USER_TYPE.FREE
		const modelGroup = models[userGroup][0]
		const userGroupInitModel = modelGroup.models[0]
		setSelectedModelId(userGroupInitModel.id)
	}, [userType, models])

	const onUserTypeClick = useCallback((userType: NEW_USER_TYPE) => {
		setUserType(userType)
		const action =
			userType === NEW_USER_TYPE.POWER
				? "power_user_selected"
				: userType === NEW_USER_TYPE.FREE
					? "free_user_selected"
					: "byok_user_selected"
		// User selection is available in step 0 only
		StateServiceClient.captureOnboardingProgress({ step: 0, action })
	}, [])

	const onModelClick = useCallback((modelSelected: string) => {
		setSelectedModelId(modelSelected)
		// User selection is available in step 1 only
		StateServiceClient.captureOnboardingProgress({ step: 1, modelSelected, action: "model_selected" })
	}, [])

	const finishOnboarding = useCallback(
		async (updateModelId: boolean, step: number) => {
			const modelSelected = (updateModelId && selectedModelId) || undefined
			if (modelSelected) {
				await handleFieldsChange({
					planModeOpenRouterModelId: selectedModelId,
					actModeOpenRouterModelId: selectedModelId,
					planModeOpenRouterModelInfo: openRouterModels[selectedModelId],
					actModeOpenRouterModelInfo: openRouterModels[selectedModelId],
					planModeApiProvider: "cline",
					actModeApiProvider: "cline",
				})
			}
			hideAccount()
			hideSettings()
			const action = "onboarding_completed"
			StateServiceClient.captureOnboardingProgress({ step, modelSelected, action, completed: true })
		},
		[hideAccount, hideSettings, handleFieldsChange, selectedModelId, openRouterModels],
	)

	const handleFooterAction = useCallback(
		async (action: "signin" | "next" | "back" | "done" | "signup") => {
			switch (action) {
				case "signup": {
					lastAuthActionRef.current = "signup"
					setLoginError(null)
					setStepNumber(stepNumber + 1)
					setIsActionLoading(true)
					try {
						await AccountServiceClient.accountLoginClicked({})
						await finishOnboarding(true, stepNumber + 1)
					} catch (err) {
						setLoginError(err instanceof Error && err.message ? err.message : "Sign-in failed. Please try again.")
						// Roll back to the model-select step so the retry CTA is visible.
						setStepNumber(stepNumber)
					} finally {
						setIsActionLoading(false)
					}
					break
				}
				case "signin": {
					lastAuthActionRef.current = "signin"
					setLoginError(null)
					setIsActionLoading(true)
					try {
						await AccountServiceClient.accountLoginClicked({})
						await finishOnboarding(true, stepNumber + 1)
					} catch (err) {
						setLoginError(err instanceof Error && err.message ? err.message : "Sign-in failed. Please try again.")
					} finally {
						setIsActionLoading(false)
					}
					break
				}
				case "next":
					StateServiceClient.captureOnboardingProgress({ step: stepNumber + 1 })
					setStepNumber(stepNumber + 1)
					break
				case "back":
					StateServiceClient.captureOnboardingProgress({ step: stepNumber - 1 })
					setStepNumber(stepNumber - 1)
					break
				case "done":
					await StateServiceClient.setWelcomeViewCompleted({ value: true }).catch(() => {})
					setShowWelcome(false)
					await finishOnboarding(false, stepNumber)
					break
			}
		},
		[stepNumber, finishOnboarding, setShowWelcome],
	)

	const retryAuth = useCallback(() => {
		const lastAction = lastAuthActionRef.current
		if (!lastAction) {
			return
		}
		setLoginError(null)
		void handleFooterAction(lastAction)
	}, [handleFooterAction])

	const stepDisplayInfo = useMemo(() => {
		const step = stepNumber === 0 || stepNumber === 2 ? STEP_CONFIG[stepNumber] : null
		const title = step ? step.title : userType ? STEP_CONFIG[userType].title : STEP_CONFIG[0].title
		const description = step ? step.description : null
		const buttons = step ? step.buttons : userType ? STEP_CONFIG[userType].buttons : STEP_CONFIG[0].buttons
		return { title, description, buttons }
	}, [stepNumber, userType])

	// 1-based progress for the StepDots indicator (3 dots total).
	const currentDot = stepNumber + 1
	const totalDots = 3

	return (
		<div className="fixed inset-0 p-0 flex flex-col w-full">
			<div className="h-full px-5 xs:mx-10 overflow-auto flex flex-col gap-4 items-center justify-center">
				<ClineLogoWhite className="size-12 flex-shrink-0" />
				<StepDots current={currentDot} total={totalDots} />
				<h2 className="text-lg font-semibold p-0 flex-shrink-0">{stepDisplayInfo.title}</h2>
				{stepNumber === 2 && (
					<div
						aria-busy={isActionLoading}
						aria-label="Waiting for sign-in to finish in your browser"
						className="flex w-full max-w-lg flex-col gap-6 my-4 items-center"
						role="status">
						<LoaderCircleIcon className="motion-safe:animate-spin" />
					</div>
				)}
				{stepDisplayInfo.description && (
					<p className="text-foreground text-sm text-center m-0 p-0 flex-shrink-0">{stepDisplayInfo.description}</p>
				)}

				{loginError && (
					<div className="w-full max-w-lg flex-shrink-0">
						<Alert isDismissible={false} title="Sign-in failed" variant="danger">
							<AlertDescription>
								<p className="mb-2">{loginError}</p>
								<Button onClick={retryAuth} size="sm" variant="secondary">
									Retry
								</Button>
							</AlertDescription>
						</Alert>
					</div>
				)}

				<div className="flex-1 w-full flex max-w-lg overflow-y-auto min-h-0">
					<OnboardingStepContent
						models={openRouterModels}
						onboardingModels={models}
						onSelectModel={onModelClick}
						onSelectUserType={onUserTypeClick}
						searchTerm={searchTerm}
						selectedModelId={selectedModelId}
						setSearchTerm={setSearchTerm}
						step={stepNumber}
						userType={userType}
					/>
				</div>

				<footer className="flex w-full max-w-lg flex-col gap-3 my-2 px-2 overflow-hidden flex-shrink-0">
					{stepDisplayInfo.buttons.map((btn) => (
						<Button
							className={cn("w-full rounded-xs", isActionLoading && "motion-safe:animate-pulse")}
							disabled={isActionLoading}
							key={btn.text}
							onClick={() => handleFooterAction(btn.action)}
							variant={btn.variant}>
							{btn.text}
						</Button>
					))}

					{stepNumber === 2 && (
						<button
							className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 self-center bg-transparent border-0 p-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							disabled={isActionLoading}
							onClick={retryAuth}
							type="button">
							Browser didn't open? Try again.
						</button>
					)}

					{stepNumber === 0 && (
						<div className="items-center justify-center flex text-sm text-muted-foreground gap-2 mb-3 text-pretty">
							<AlertCircleIcon className="shrink-0 size-2" /> You can change this later in settings
						</div>
					)}
				</footer>
			</div>
		</div>
	)
}

const OnboardingView = () => {
	const { status, models } = useOnboardingModels()

	if (status === "loading") {
		return (
			<div className="fixed inset-0 flex items-center justify-center">
				<LoaderCircleIcon className="motion-safe:animate-spin" />
			</div>
		)
	}

	if (status === "empty") {
		return <WelcomeView />
	}

	return <OnboardingViewContent onboardingModels={models} />
}

export default OnboardingView
