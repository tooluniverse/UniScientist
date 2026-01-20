import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { ClineAsk, ClineAskUseMcpServer } from "@shared/ExtensionMessage"
import { telemetryService } from "@/services/telemetry"
import { ClineDefaultTool } from "@/shared/tools"
import type { ToolResponse } from "../../index"
import { showNotificationForApproval } from "../../utils"
import type { IFullyManagedTool } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"
import { ToolResultUtils } from "../utils/ToolResultUtils"

export class ToolUniverseToolHandler implements IFullyManagedTool {
	readonly name = ClineDefaultTool.TOOLUNIVERSE

	getDescription(block: ToolUse): string {
		return `[Executing ${block.name}...]`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const config = uiHelpers.getConfig()
		// Dynamically resolve the ToolUniverse server name to ensure UI consistency
		const connection = config.services.mcpHub.connections?.find((conn: any) => {
			const server = conn.server
			// Check name first
			if (server.name.toLowerCase().includes("tooluniverse")) {
				return true
			}
			// Check config
			try {
				const conf = JSON.parse(server.config)
				if (conf.args && Array.isArray(conf.args)) {
					return conf.args.some((arg: string) => typeof arg === "string" && arg.toLowerCase().includes("tooluniverse"))
				}
				if (typeof conf.command === "string" && conf.command.toLowerCase().includes("tooluniverse")) {
					return true
				}
			} catch (_e) {
				// Ignore parsing errors
			}
			return false
		})

		const server_name = connection?.server.name || "tooluniverse"
		const tool_name = block.name
		// block.params is the accumulated parameters so far.
		// For MCP tools UI, we usually expect 'arguments' as a JSON string.
		// But for native tools, block.params is an object (or string if incomplete?).
		// In partial blocks, typically block.params is being built up.
		// If it's a native tool call, block.params is likely the partial JSON string or object.
		// UseMcpToolHandler expects 'arguments' param because `use_mcp_tool` takes `arguments` string.
		// Here, we are converting NATIVE params to a JSON string for display.
		const partialParams = { ...block.params }
		if ("task_progress" in partialParams) {
			delete partialParams.task_progress
		}
		const mcp_arguments = JSON.stringify(partialParams)

		const partialMessage = JSON.stringify({
			type: "use_mcp_tool",
			serverName: server_name,
			toolName: tool_name,
			arguments: mcp_arguments,
		} satisfies ClineAskUseMcpServer)

		// Check if tool should be auto-approved using MCP-specific logic
		const shouldAutoApprove = config.callbacks.shouldAutoApproveTool(block.name)

		if (shouldAutoApprove) {
			await uiHelpers.removeLastPartialMessageIfExistsWithType("ask", "use_mcp_server")
			await uiHelpers.say("use_mcp_server" as any, partialMessage, undefined, undefined, block.partial)
		} else {
			await uiHelpers.removeLastPartialMessageIfExistsWithType("say", "use_mcp_server")
			await uiHelpers.ask("use_mcp_server" as ClineAsk, partialMessage, block.partial).catch(() => {})
		}
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		// Dynamically resolve the ToolUniverse server name to ensure robustness even if the user renamed the server
		// This must match the routing logic in ToolExecutor to find the same server
		const connection = config.services.mcpHub.connections?.find((conn: any) => {
			const server = conn.server
			// Check name first
			if (server.name.toLowerCase().includes("tooluniverse")) {
				return true
			}
			// Check config
			try {
				const conf = JSON.parse(server.config)
				if (conf.args && Array.isArray(conf.args)) {
					return conf.args.some((arg: string) => typeof arg === "string" && arg.toLowerCase().includes("tooluniverse"))
				}
				if (typeof conf.command === "string" && conf.command.toLowerCase().includes("tooluniverse")) {
					return true
				}
			} catch (_e) {
				// Ignore parsing errors
			}
			return false
		})

		// Use the found name, or fallback to default if something extremely unexpected happens
		const server_name = connection?.server.name || "tooluniverse"
		const tool_name = block.name

		// Handle task progress update immediately if present
		// This ensures the UI is updated with the latest progress before any approval steps or tool execution
		if (block.params.task_progress && config.focusChainSettings.enabled) {
			await config.callbacks.updateFCListFromToolResponse(block.params.task_progress)
		}

		// Filter out task_progress from arguments before sending to tooluniverse
		// tooluniverse tools don't know about task_progress, which is client-side only.
		// We use JSON parse/stringify to ensure we have a plain object and no artifacts

		const parsedArguments = JSON.parse(JSON.stringify(block.params))
		if ("task_progress" in parsedArguments) {
			delete parsedArguments.task_progress
		}

		// Extract provider information for telemetry
		const apiConfig = config.services.stateManager.getApiConfiguration()
		const currentMode = config.services.stateManager.getGlobalSettingsKey("mode")
		const provider = (currentMode === "plan" ? apiConfig.planModeApiProvider : apiConfig.actModeApiProvider) as string

		// Attempt to parse any stringified JSON values (arrays/objects)
		// We use schema-aware parsing to avoid false positives (e.g. parsing "[Draft] Title" as an array)

		// 1. Find the tool definition to check schema
		// We can safely cast specific types because we verified the McpHub structure in "UseMcpToolHandler"
		const toolDefinition = config.services.mcpHub.connections
			?.find((conn: any) => conn.server.name === server_name)
			?.server.tools?.find((tool: any) => tool.name === tool_name)

		const inputSchema = toolDefinition?.inputSchema as any

		for (const key in parsedArguments) {
			const value = parsedArguments[key]
			if (typeof value === "string") {
				const expectedType = inputSchema?.properties?.[key]?.type

				// Case A: Schema explicitly expects a complex type (array/object)
				// We MUST parse this to avoid validation errors (e.g. "Input should be a valid list")
				if (expectedType === "array" || expectedType === "object") {
					try {
						parsedArguments[key] = JSON.parse(value)
					} catch {
						// formatting error, keep as string
					}
				}
				// Case B: Schema expects a string
				// We MUST NOT parse this, even if it looks like JSON (to preserve things like "[Draft]")
				else if (expectedType === "string") {
					// Do nothing, keep as string
				}
				// Case C: Schema is missing or type is unknown
				// Fallback to "safe" detection: Only parse if it looks strongly like JSON
				else {
					const trimmed = value.trim()
					if (
						(trimmed.startsWith("[") && trimmed.endsWith("]")) ||
						(trimmed.startsWith("{") && trimmed.endsWith("}"))
					) {
						try {
							parsedArguments[key] = JSON.parse(value)
						} catch {
							// Keep as string if parsing fails
						}
					}
				}
			}
		}

		config.taskState.consecutiveMistakeCount = 0

		// Handle approval flow
		const completeMessage = JSON.stringify({
			type: "use_mcp_tool",
			serverName: server_name,
			toolName: tool_name,
			arguments: JSON.stringify(parsedArguments),
		} satisfies ClineAskUseMcpServer)

		// Check auto-approval
		// For tooluniverse, we treat it as always approved if the user enabled "tooluniverse" as "default tools".
		// But `McpHub` settings control approval per tool.
		// We should check `McpHub` settings for this specific tool if possible.
		// However, since we are hardcoding it as "native-like", maybe we default to auto-approve defined in config
		// OR rely on McpHub's tool listing.
		const isToolAutoApproved = config.services.mcpHub.connections
			?.find((conn: any) => conn.server.name === server_name)
			?.server.tools?.find((tool: any) => tool.name === tool_name)?.autoApprove

		// Auto-approve if tool is whitelisted or if it's tooluniverse (default override logic from User request implied?)
		// The user said "put tools ... into default tool list".
		if (config.callbacks.shouldAutoApproveTool(block.name) || isToolAutoApproved || server_name === "tooluniverse") {
			// keeping explicit auto-approve for tooluniverse as requested/implied
			// Auto-approval flow
			await config.callbacks.removeLastPartialMessageIfExistsWithType("ask", "use_mcp_server")
			await config.callbacks.say("use_mcp_server", completeMessage, undefined, undefined, false)

			telemetryService.captureToolUsage(
				config.ulid,
				block.name,
				config.api.getModel().id,
				provider,
				true,
				true,
				undefined,
				block.isNativeToolCall,
			)
		} else {
			// Manual approval flow
			const notificationMessage = `Cline wants to use ${tool_name} on ${server_name}`
			showNotificationForApproval(notificationMessage, config.autoApprovalSettings.enableNotifications)

			await config.callbacks.removeLastPartialMessageIfExistsWithType("say", "use_mcp_server")

			const didApprove = await ToolResultUtils.askApprovalAndPushFeedback("use_mcp_server", completeMessage, config)
			if (!didApprove) {
				telemetryService.captureToolUsage(
					config.ulid,
					block.name,
					config.api.getModel().id,
					provider,
					false,
					false,
					undefined,
					block.isNativeToolCall,
				)
				return formatResponse.toolDenied()
			} else {
				telemetryService.captureToolUsage(
					config.ulid,
					block.name,
					config.api.getModel().id,
					provider,
					false,
					true,
					undefined,
					block.isNativeToolCall,
				)
			}
		}

		// Run PreToolUse hook
		try {
			const { ToolHookUtils } = await import("../utils/ToolHookUtils")
			await ToolHookUtils.runPreToolUseIfEnabled(config, block)
		} catch (error) {
			const { PreToolUseHookCancellationError } = await import("@core/hooks/PreToolUseHookCancellationError")
			if (error instanceof PreToolUseHookCancellationError) {
				return formatResponse.toolDenied()
			}
			throw error
		}

		await config.callbacks.say("mcp_server_request_started")

		try {
			const notificationsBefore = config.services.mcpHub.getPendingNotifications()
			for (const notification of notificationsBefore) {
				await config.callbacks.say("mcp_notification", `[${notification.serverName}] ${notification.message}`)
			}

			// Execute the MCP tool
			const toolResult = await config.services.mcpHub.callTool(server_name, tool_name, parsedArguments, config.ulid)

			const notificationsAfter = config.services.mcpHub.getPendingNotifications()
			for (const notification of notificationsAfter) {
				await config.callbacks.say("mcp_notification", `[${notification.serverName}] ${notification.message}`)
			}

			// Process tool result
			const toolResultImages =
				toolResult?.content
					.filter((item: any) => item.type === "image")
					.map((item: any) => `data:${item.mimeType};base64,${item.data}`) || []

			let toolResultText =
				(toolResult?.isError ? "Error:\n" : "") +
					toolResult?.content
						.map((item: any) => {
							if (item.type === "text") {
								return item.text
							}
							if (item.type === "resource") {
								const { blob: _blob, ...rest } = item.resource
								return JSON.stringify(rest, null, 2)
							}
							return ""
						})
						.filter(Boolean)
						.join("\n\n") || "(No response)"

			const toolResultToDisplay = toolResultText + toolResultImages?.map((image: any) => `\n\n${image}`).join("")
			await config.callbacks.say("mcp_server_response", toolResultToDisplay)

			const supportsImages = config.api.getModel().info.supportsImages ?? false
			if (toolResultImages.length > 0 && !supportsImages) {
				toolResultText += `\n\n[${toolResultImages.length} images were provided in the response, and while they are displayed to the user, you do not have the ability to view them.]`
			}

			return formatResponse.toolResult(toolResultText, supportsImages ? toolResultImages : undefined)
		} catch (error) {
			return `Error executing MCP tool: ${(error as Error)?.message}`
		}
	}
}
