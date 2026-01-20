# Adding New Native Tools to UniScientist

This guide explains the end-to-end process of adding a new **native tool** to the system. While `CONTRIBUTING.md` covers the prompt generation aspect, this guide focuses on the complete lifecycle, including the runtime execution logic required to make the tool actually work.

## Overview

To add a new tool, you must:
1.  **Define Identity:** Add the tool to the `ClineDefaultTool` enum.
2.  **Define Interface:** Create the tool specification (description & parameters) for the prompt.
3.  **Implement Behavior:** Create a handler class that executes the logic.
4.  **Register Handler:** Connect the handler to the `ToolExecutor`.
5.  **Enable Tool:** Add the tool to the relevant system prompt variants.

---

## Step 1: Define Tool Identity

**File:** `src/shared/tools.ts`

Add a new entry to the `ClineDefaultTool` enum. This string ID is the internal key used to reference the tool throughout the system.

```typescript
export enum ClineDefaultTool {
    // ... existing tools
    MY_NEW_TOOL = "my_new_tool_name", // <--- Add this
}
```

---

## Step 2: Create Tool Specification

**File:** `src/core/prompts/system-prompt/tools/my_new_tool.ts` (Create new file)

Define how the tool appears to the AI model. You should define a `GENERIC` variant (fallback) and optionally model-specific variants (e.g., `NATIVE_GPT_5`).

```typescript
import { ModelFamily } from "@/shared/prompts"
import { ClineDefaultTool } from "@/shared/tools"
import type { ClineToolSpec } from "../spec"
import { TASK_PROGRESS_PARAMETER } from "../types"

const id = ClineDefaultTool.MY_NEW_TOOL

const generic: ClineToolSpec = {
    variant: ModelFamily.GENERIC,
    id,
    name: "my_new_tool_name",
    description: "A clear, concise description of what this tool does. The model sees this.",
    parameters: [
        {
            name: "param_name",
            required: true,
            instruction: "Instructions for the model on how to use this parameter.",
            usage: "Example value",
        },
        // CRITICAL: Always include this to allow the agent to track its progress
        TASK_PROGRESS_PARAMETER,
    ],
}

// Export the variants for registration
export const my_new_tool_variants = [generic]
```

**Note:** See `src/core/prompts/system-prompt/CONTRIBUTING.md` for more advanced details on model-specific variants.

---

## Step 3: Implement Tool Handler

**File:** `src/core/task/tools/handlers/MyNewToolHandler.ts` (Create new file)

Implement the `IFullyManagedTool` interface. This class contains the actual code that runs when the tool is called.

```typescript
import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { ClineDefaultTool } from "@/shared/tools"
import type { ToolResponse } from "../../index"
import type { IFullyManagedTool } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

export class MyNewToolHandler implements IFullyManagedTool {
    // strict link to the enum ID
    readonly name = ClineDefaultTool.MY_NEW_TOOL

    getDescription(block: ToolUse): string {
        return `[Executing my new tool with param: ${block.params.param_name}]`
    }

    // Optional: Handle partial updates for streaming UI feedback
    async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
        // Use uiHelpers to update the UI while the tool call is being typed by the model
    }

    async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
        const param = block.params.param_name

        // 1. Validate inputs (optional but recommended)
        if (!param) {
             return formatResponse.toolError("Missing required parameter: param_name")
        }

        // 2. Handle User Approval
        // config.callbacks.shouldAutoApproveTool will check the user's settings
        if (await config.callbacks.shouldAutoApproveTool(this.name)) {
            // ... Logic for auto-approved execution ...
        } else {
            // ... Logic for asking user permission ...
            // See ReadFileToolHandler.ts for a complete example of the approval flow
        }

        try {
            // 3. Perform the actual operation
            const result = `Operation complete. Processed: ${param}`

            // 4. Return success response
            return result // Or formatResponse.toolResult(result)
        } catch (error) {
            return formatResponse.toolError(`Failed to execute: ${error}`)
        }
    }
}
```

---

## Step 4: Register the Handler

**File:** `src/core/task/ToolExecutor.ts`

You must register your new handler in the `registerToolHandlers` method so the system knows how to execute it.

1.  Import your handler class.
2.  Add it to the registration list.

```typescript
// ... imports
import { MyNewToolHandler } from "./tools/handlers/MyNewToolHandler"

// ... inside ToolExecutor class

private registerToolHandlers(): void {
    // ... existing registrations
    this.coordinator.register(new ReadFileToolHandler(validator))
    
    // Add your new registration
    this.coordinator.register(new MyNewToolHandler()) 
}
```

---

## Step 5: Enable Tool in Prompt Variants

**File:** `src/core/prompts/system-prompt/variants/*/config.ts` (e.g., `glm/config.ts`, `native-gpt-5-1/config.ts`)

Finally, tell the system to actually include this tool in the system prompt for the models you want to support.

```typescript
export const config = createVariant(ModelFamily.GLM)
    // ...
    .tools(
        ClineDefaultTool.BASH,
        ClineDefaultTool.FILE_READ,
        // ...
        ClineDefaultTool.MY_NEW_TOOL, // <--- Add this line
    )
    .build()
```

---

## Step 6: Export Tool Spec (Registry)

**File:** `src/core/prompts/system-prompt/tools/index.ts` (and `register.ts` if needed)

Ensure your tool specification file is exported so the build system picks it up.

```typescript
export * from "./my_new_tool"
```

## Verification

To verify your new tool:
1.  Rebuild the project (`npm run compile` / `npm run watch`).
2.  Open the extension in debug mode.
3.  Ask the agent to use your new tool.
4.  Verify that:
    *   The tool appears in the system prompt (check "Export Task JSON").
    *   The model calls the tool correctly.
    *   Your handler executes and returns the correct result.
