# Core Codebase Walkthrough (`src/core`)

This document provides a detailed tour of the `src/core` directory, which contains the "Brain" of the agent. This logic is shared between the VS Code Extension and the CLI.

## 1. Directory Structure

```
src/core/
├── controller/         # The "Manager". Orchestrates the app lifecycle.
├── task/               # The "Worker". Executes the agentic loop.
├── prompts/            # The "Persona". System prompts and prompt construction.
├── api/                # The "Phone". Handles communication with LLM providers.
├── context/            # The "Memory". Manages context window and history.
├── mentions/           # Handles @-mentions (files, folders, issues).
├── webview/            # Message definitions for UI communication.
└── ...
```

## 2. Key Classes & Roles

### A. The Controller (`src/core/controller/index.ts`)
The `Controller` is the singleton entry point. It wakes up when the extension starts.
*   **Responsibilities**:
    *   Initializes services: `AuthService` (Login), `McpHub` (Tools), `WorkspaceManager`.
    *   **`initTask()`**: Starts a new session when the user sends a message.
    *   **`postStateToWebview()`**: Syncs the entire application state (messages, settings, active task) to the UI.

### B. The Task (`src/core/task/index.ts`)
A `Task` instance represents a single conversation or "job".
*   **Responsibilities**:
    *   Runs the **Main Loop**.
    *   Holds the conversation history (`clineMessages`).
    *   Manages the context window (truncation).
    *   Connects all the pieces: API, Terminal, Browser, File System.

### C. The ToolExecutor (`src/core/task/ToolExecutor.ts`)
When the LLM decides to use a tool (e.g., "replace_file_content"), the `Task` delegates the actual work here.
*   **Responsibilities**:
    *   Parses tool calls.
    *   Asks for user permission (if not auto-approved).
    *   Executes the tool (via `FileEditProvider`, `TerminalManager`, etc.).
    *   Returns the result to the `Task`.

## 3. The Agentic Loop (How it Runs)

Here is the step-by-step flow when a user sends a message:

1.  **User Input**: User types "Refactor `utils.ts`" in the sidebar.
2.  **Controller Action**:
    *   `controller.initTask()` creates a new `Task`.
    *   Passes the user's input to the `Task`.
3.  **Task Execution (`initiateTaskLoop`)**:
    *   The `Task` enters a `while (!abort)` loop.
    *   **Prompt Construction**: It calls `getSystemPrompt()` (`src/core/prompts`) to build the massive system prompt, injecting:
    *   **Prompt Construction**: It calls `getSystemPrompt()` (`src/core/prompts`) to build the massive system prompt, injecting:
        *   Role definition (**"You are ICE, an expert in Analog IC Design..."**).
        *   Available Tools.
        *   File Context (loaded from `@-mentions` or open tabs).
    *   **API Call**: It calls `this.api.createMessage()` to send everything to the LLM (Claude/OpenAI).
4.  **Streaming Response**:
    *   The LLM streams back chunks.
    *   `Task` parses these chunks into "Content Blocks" (Text or ToolUse).
    *   **Text**: Displayed immediately in the chat.
    *   **ToolUse**: Pauses the stream to execute the tool.
5.  **Tool Execution**:
    *   `ToolExecutor` verifies permissions.
    *   Executes the tool (e.g., writes to `utils.ts`).
    *   Captures the output (e.g., "Successfully wrote file" or linter errors).
6.  **Recursion**:
    *   The tool output is added to the conversation history.
    *   The loop repeats! The `Task` sends the tool output back to the LLM so it can decide what to do next.

## 4. State Management
The state is NOT stored in Redux or a localized store. Instead, the `Controller` aggregates state from various managers (`StateManager`, `Task`, `McpHub`) and broadcasts it via `postStateToWebview()`.

*   **Persistence**: `src/core/storage` handles saving history to disk so conversations survive restarts.

## 5. Memory & Context Management

The agent's "memory" is managed by two key components working in tandem:

### A. Conversation History (`MessageStateHandler`)
The agent maintains two parallel versions of the conversation:
1.  **`clineMessages`**: The "Application State". Contains rich metadata, UI flags (partial streams), and everything needed to render the chat in VS Code.
2.  **`apiConversationHistory`**: The "LLM State". A strict list of messages formatted exactly as the Anthropic/LLM API expects. This is what is actually sent to the model.

### B. Context Window (`ContextManager`)
The `ContextManager` ensures the agent doesn't run out of tokens.
*   **Sliding Window**: It monitors token usage (`tokensIn` + `tokensOut`). When usage hits a threshold (e.g., 90% of model limit), it triggers truncation.
*   **Truncation Strategy**: It preserves the **System Prompt** and the **First User Message** (to keep the original task context), but sacrifices older messages in the middle of the conversation.
*   **Optimization**: It actively optimizes inputs, such as removing duplicate "File Read" outputs if a file hasn't changed, to save tokens.
*   **Auto-Condense Strategy**: When context gets critically low, instead of blindly deleting messages, the agent triggers a recursion.
    *   It prompts itself to: *"create a comprehensive detailed summary of the conversation so far"*.
    *   This summary (including key technical concepts, file changes, and pending tasks) replaces the deleted message history.
    *   This allows "infinite" conversation length by effectively compressing the past into a shorter narrative form.

## 6. Subagent System
The project supports a recursive "Subagent" capability.
*   **Mechanism**: It is not a complex multi-agent framework. Instead, the main agent can simply run the `cline "prompt"` command in its terminal.
*   **Recursive Spawning**: This command spawns a **new, independent CLI process** (a fresh `Controller` + `Task`).
*   **Roles & Persona**:
    *   **Shared Persona**: Every agent (parent and child) shares the same base "System Role" (*"You are Cline, a highly skilled software engineer..."*).
    *   **Specific Task**: The child agent's effective "role" is defined by the **prompt** you pass to it (e.g., `cline "Act as a QA tester and..."`).
*   **Implementation**: There is NO special code for subagents in `ToolExecutor.ts`. The agent simply uses `execute_command` to run the `cline` binary, just like it would run `git` or `npm`.
*   **Use Case**: The system prompt encourages using this for "Research" or "Exploration" to offload work from the main context.
*   **Detection**: Child agents detect they are subagents via specific flags (like `yoloMode` and `maxConsecutiveMistakes` patterns) to prevent infinite loops (child spawning grandchild).

## 6.1 Activation & Requirements
To enable the "Enable Subagents" feature in the extension, two conditions must be met:

1.  **Installation**: The `uniscientist` CLI must be installed.
    *   **Production**: `npm install -g uniscientist`
    *   **Developer / Local Build**: If you are building from source and the package is not published:
        ```bash
        # 1. Build the CLI binary
        npm run compile-cli
        # (This builds to dist-standalone/bin/uniscientist)

        # 2. Add to PATH (e.g., link to /usr/local/bin)
        ln -s "$(pwd)/dist-standalone/bin/uniscientist" /usr/local/bin/uniscientist
        ```
2.  **Authentication**: The CLI must be "logged in" or configured.

**Local / No-Login Workflow**
You do **not** need a central Cline account to use this. You can bypass the login requirement by configuring a "Bring Your Own" (BYO) provider:
1.  Run `uniscientist auth` in your terminal.
2.  Select **"Configure BYO API providers"** (this is now the default option).
3.  Choose a provider (e.g., Ollama for local models, or OpenAI/Anthropic for direct keys).
4.  Complete the setup.

This process sets the necessary local state flags (`welcomeViewCompleted`), allowing the extension to enable the subagent button and preventing headless subagents from hanging on interactive prompts.

## 7. Skill System
The agent supports a modular "Skill" system for on-demand knowledge loading.
*   **Discovery**: It scans `~/.cline/skills` (Global) and `.cline/skills` (Project-level) for subdirectories containing a `SKILL.md` file.
*   **Format**: `SKILL.md` files use YAML frontmatter for metadata (name, description) and Markdown for the actual instructions.
*   **Execution**: The agent has a `use_skill` tool. When called, it reads the content of `SKILL.md` and injects it into the context, effectively "learning" that skill for the duration of the task.

## 8. Tools vs Skills: What's the difference?
It is easy to confuse the two, but they serve different purposes:

| Feature | **Tool** | **Skill** |
| :--- | :--- | :--- |
| **Definition** | A native capability compiled into the code. | A markdown file (`SKILL.md`) containing text. |
| ** Purpose** | To **DO** something (Execute code, Read file). | To **KNOW** something (Best practices, Procedures). |
| **Implementation** | TypeScript code (`src/core/task/tools/`). | Markdown text in `~/.cline/skills`. |
| **Analogy** | A **Hammer** or **Screwdriver**. | A **User Manual** or **Recipe**. |
| **Example** | `read_file`, `execute_command`. | "How to Deploy to AWS", "Code Style Guide". |

| **Example** | `read_file`, `execute_command`. | "How to Deploy to AWS", "Code Style Guide". |

*   **Key Insight**: You use a **Tool** (`use_skill`) to read a **Skill**.

## 9. Task Progress Tracking
The user asked about maintaining a "log" or "markdown file". The system has a specific mechanism for this called **Task Progress**.
*   **Mechanism**: Every tool call includes an optional `task_progress` string parameter.
*   **Format**: The agent is instructed to maintain a **Markdown Checklist** (`- [x] Step 1`, `- [ ] Step 2`) in this parameter.
*   **Persistence**: This string is NOT written to a file on disk (like `task.md`). Instead, it is persisted in the conversation state and re-injected into the system prompt on every turn.
*   **Purpose**: This acts as a "Short Term Memory" or "Working Memory" to keep the agent focused on the immediate plan without needing to read/write external files constantly.
*   **Implementation**:
    *   **Capture**: `ToolExecutor.ts` extracts the `task_progress` string from every tool call.
    *   **Manager**: It passes this string to the `FocusChainManager` (`src/core/task/focus-chain/index.ts`).
    *   **Injection**: This manager stores the checklist in the `TaskState` and injects it back into the prompt via `task_progress.ts`.

## 10. Built-in Tools
The system currently has **27 Native Tools** defined in `src/shared/tools.ts`:

### File Operations
*   `read_file`, `write_to_file`, `replace_in_file`, `search_files`, `list_files`
*   `list_code_definition_names`
*   `apply_patch` (Git patch application)

### System & Terminal
*   `execute_command` (The workhorse)
*   `new_task` (Subagent spawning)
*   `condense` (Memory management)
*   `summarize_task`

### Web & Browser
*   `browser_action` (Puppeteer control)
*   `web_search`, `web_fetch`

### MCP (Model Context Protocol)
*   `use_mcp_tool`, `access_mcp_resource`, `load_mcp_documentation`

### Agent & Mode Control
*   `ask_followup_question`, `attempt_completion`
*   `plan_mode_respond`, `act_mode_respond`
*   `focus_chain` (Task Progress)
*   `use_skill`
*   `report_bug`
*   `generate_explanation`

## 11. System Prompt Structure
The user asked for the "General Prompt". The prompt is not a single static string but a **Dynamic Template** (`src/core/prompts/system-prompt/variants/generic/template.ts`).

It is assembled at runtime by injecting the following 14 components:

1.  **`AGENT_ROLE`**: *"You are Cline, a highly skilled software engineer..."*
2.  **`TOOL_USE`**: Definitions of all 27 tools and how to use them (XML format).
3.  **`TASK_PROGRESS`**: The persistent markdown checklist (Working Memory).
4.  **`MCP`**: Instructions for external MCP servers.
5.  **`EDITING_FILES`**: Rules for diffs and file modifications.
6.  **`ACT_VS_PLAN`**: Mode-specific behaviors (Architecture vs Implementation).
7.  **`CLI_SUBAGENTS`**: Instructions for spawning search agents.
8.  **`CAPABILITIES`**: What the OS/Environment can do.
9.  **`SKILLS`**: Content of any loaded `SKILL.md` files.
10. **`FEEDBACK`**: User feedback loop instructions.
11. **`RULES`**: Critical operational boundaries (No deletion without permission, etc.).
12. **`SYSTEM_INFO`**: OS, CWD, Home Dir, VS Code Version.
13. **`OBJECTIVE`**: The high-level user goal.
14. **`USER_INSTRUCTIONS`**: Custom instructions from `.clinerules`.

*   **Logic**: The `TemplateEngine` (`src/core/prompts/templates/TemplateEngine.ts`) resolves these placeholders into the final massive string sent to the API.

## 12. Multimodal Capabilities (Images)
The user asked "Can this system read images?".

*   **Yes, via Chat**: The user can **drag and drop** images into the chat window. These are converted to base64 and sent to the LLM (if the model supports vision, like Claude 3.5 Sonnet or GPT-4o).
*   **No, via Filesystem**: There is **NO built-in tool** (like `read_image`) for the agent to autonomously open an image file from the disk and look at it.
    *   *Workaround*: The agent can use `browser_action` to open a local file URL in its headless browser and take a screenshot, but this is a hack.
    *   *Solution*: We should add a `read_image` tool if IC design requires analyzing diagrams or waveforms.
