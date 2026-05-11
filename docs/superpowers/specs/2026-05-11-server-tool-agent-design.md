# Server Tool Agent Design

Date: 2026-05-11

## Goal

Replace the current rule and keyword based agent routing with a server-centered OpenRouter tool calling architecture.

The app should no longer decide whether to query baby records or web search by inspecting Korean keywords. Instead, the server agent should pass tool definitions to OpenRouter, execute requested tools on the server, and stream the final answer back to the client.

The design should also keep a clean path for future client-executed tools, such as device features or local app actions, without building that protocol in the first implementation.

## Current Context

The current chat agent is concentrated in `lib/agent.ts`.

It includes:

- Tool definitions for baby data search, pattern analysis, and web search.
- Client-side Supabase queries for `feeding_logs`, `sleep_logs`, `diaper_logs`, and `health_logs`.
- Keyword arrays and rule helpers such as feeding, sleep, diaper, health, data-query, and web-search keywords.
- Preloading logic that injects database or web context before the model decides whether to use tools.
- A non-streaming tool loop, while the streaming path skips tool calling after preloading.

`lib/llm.ts` already has the beginning of OpenRouter support through the existing `llm-proxy` Edge Function, but the chat orchestration still lives in the client.

The project also has two Supabase Edge Functions:

- `llm-proxy`: authenticated OpenRouter proxy.
- `tavily-search`: authenticated Tavily search proxy.

## Chosen Approach

Use a server-centered agent endpoint.

Create a dedicated Supabase Edge Function, tentatively named `agent-chat`, as the single AI chat entry point for the app. The client sends conversation messages and `childId`. The server verifies authentication and child ownership, builds the system prompt from server-side child data, calls OpenRouter with tool definitions, executes server tools, loops until a final answer is available, and streams the final assistant response when requested.

This is preferred over a client-centered tool loop because the app already depends on server-side functions for model and search access, and because baby record lookup belongs next to authentication, RLS, and service configuration.

## Architecture

### Server

Add `supabase/functions/agent-chat`.

Suggested internal modules:

- `index.ts`: HTTP request handling, CORS, authentication, child ownership validation, response streaming.
- `openrouter.ts`: OpenRouter request construction, response parsing, stream handling, error formatting.
- `tools.ts`: tool registry, OpenRouter tool definitions, tool dispatch.
- `baby-data.ts`: baby record queries and pattern analysis.
- `web-search.ts`: Tavily search implementation.

The first implementation may keep these modules under the same function folder. If Supabase deployment or Deno import ergonomics make that awkward, the code can start in `index.ts` with clear sections and be split once stable.

### Client

Reduce `lib/agent.ts` to a thin client wrapper.

It should:

- Accept the existing `runAgent(userMessages, child, options)` API so the chat UI needs minimal changes.
- Send messages and `child.id` to `agent-chat`.
- Forward server status events to `options.onStatus`.
- Forward streamed text chunks to `options.onToken`.
- Return the full assistant text.

It should no longer contain:

- Keyword arrays.
- Rule-based intent detection.
- Preload data or web context logic.
- Direct baby record query tools.
- Direct Tavily search execution.
- The main OpenRouter tool loop.

`lib/llm.ts` should no longer be the default chat path for OpenRouter server mode. It may remain as a lower-level helper or local Ollama fallback if the project still needs that mode, but the app chat flow should prefer `agent-chat`.

## Data Flow

1. The user sends a chat message.
2. The app calls `runAgent`.
3. `runAgent` sends `childId`, conversation messages, and streaming preference to `agent-chat`.
4. `agent-chat` verifies the Supabase Auth JWT.
5. `agent-chat` verifies that `childId` belongs to the authenticated user.
6. The server builds the system prompt from the child row, including name and birthdate.
7. The server sends messages and server tool definitions to OpenRouter.
8. If OpenRouter returns a final assistant message, the server returns it.
9. If OpenRouter returns tool calls, the server executes the requested server tools.
10. Tool results are appended as `role: "tool"` messages and sent back to OpenRouter.
11. The loop continues until there are no more tool calls or the max iteration limit is reached.
12. In streaming mode, only the final answer generation is streamed to the app.

## Tool Registry

Represent each tool through a shared registry shape:

```ts
type AgentTool = {
  definition: ToolDefinition;
  execution: 'server' | 'client';
  execute?: (args: Record<string, unknown>, context: AgentContext) => Promise<string>;
};
```

Initial tools:

- `search_baby_data`, server executed: queries Supabase baby records.
- `analyze_pattern`, server executed: summarizes raw baby records.
- `search_web`, server executed: calls Tavily using server secrets.

The first implementation should only execute server tools. The registry still includes `execution` so future client tools can use the same contract.

Future client tools may include app navigation, local notification setup, media picker actions, or device-only context. When those are introduced, the server should emit a `client_tool_request` event instead of trying to execute them directly. The client would execute the requested action and submit the result back to the server. That protocol is intentionally out of scope for the first implementation.

## Server Tool Behavior

### `search_baby_data`

Inputs:

- `data_type`: `feeding`, `sleep`, `diaper`, `health`, or `all`.
- `days`: recent-day window as a string or number.

Behavior:

- Query only records for the verified `childId`.
- Use authenticated Supabase context or explicit child ownership checks so users cannot access another child.
- Keep current limits around recent records unless implementation testing shows they need adjustment.
- Return structured JSON for the model.

### `analyze_pattern`

Inputs:

- `data_json`: JSON returned by `search_baby_data`.
- `analysis_type`: `feeding_summary`, `sleep_summary`, `diaper_summary`, `health_summary`, or `overall`.

Behavior:

- Preserve existing diaper counting semantics.
- Preserve health and temperature values as stored strings where user-facing answers need exact values.
- Return compact JSON summaries.

### `search_web`

Inputs:

- `query`: Korean search query.

Behavior:

- Execute on the server with `TAVILY_API_KEY`.
- Return a compact summary and top results.
- Avoid exposing Tavily credentials to the client.

## Status And Streaming

The server should emit status events based on real work stages, not keyword guesses.

Useful statuses:

- Request received and authenticated.
- Checking child profile.
- Thinking.
- Running a named tool.
- Searching web.
- Reading baby records.
- Writing final answer.

Streaming should start after tool calls are complete. This keeps the implementation predictable while still preserving the user experience of a streamed final answer.

## Error Handling

Return distinct errors:

- `401`: missing or expired auth.
- `403`: authenticated user does not own the requested child.
- `500`: missing server configuration such as `OPENROUTER_API_KEY` or `TAVILY_API_KEY`.
- Tool execution errors: return as tool result when recovery is possible, or fail the request if the agent cannot continue.
- OpenRouter errors: normalize status and message before returning to the client.
- Max tool iterations: request a final answer from the information already collected; if that fails, return a friendly error.

For streaming responses, errors should be emitted as structured stream events when possible, then converted to client exceptions by `runAgent`.

## Testing

Server tests or focused integration checks should cover:

- Missing auth returns `401`.
- A child owned by another user returns `403`.
- A general chat request can complete without tool calls.
- A baby-record request can execute `search_baby_data` from a mocked OpenRouter tool call.
- Health and temperature answers preserve stored `value` strings.
- A web-search request can execute `search_web`.
- Multiple tool calls stop at the max iteration limit.
- Streaming mode emits final answer chunks in order.

Client tests should focus on the new wrapper:

- `runAgent` sends the expected payload to `agent-chat`.
- Status events call `onStatus`.
- Text chunks call `onToken`.
- The returned promise resolves to the full assistant text.
- Server errors become useful client errors.

Keyword-specific tests should be removed instead of rewritten because keyword routing is being removed.

## Migration Scope

Remove from the active chat path:

- Keyword arrays.
- Rule-based intent detection.
- Data and web preloading.
- Client-side tool execution for baby data and web search.
- The split behavior where streaming skips real tool calling.

Add:

- `agent-chat` Edge Function.
- Server-side tool registry and execution.
- Server-side OpenRouter tool loop.
- Client wrapper that consumes server status and token events.

Keep:

- Existing chat UI API where practical.
- Existing Supabase RLS protections.
- Existing baby-data summary semantics.
- Existing `llm-proxy` and `tavily-search` until the implementation confirms whether they are still useful.

## Non-Goals

- Build client-executed tools in the first implementation.
- Redesign the chat UI.
- Change the baby log schema.
- Replace Supabase Auth or RLS.
- Add new model providers beyond the current OpenRouter direction.
- Rework unrelated dashboard or log screens.

## Acceptance Criteria

- The chat path no longer uses keyword or rule-based routing to decide data or web lookup.
- OpenRouter tool calling is the source of agent tool decisions.
- Baby record lookup and Tavily search run on the server.
- Streaming responses still work for final assistant answers.
- The client `runAgent` API remains compatible enough that the chat screen needs minimal changes.
- The code has a tool registry structure that can later represent client tools without rewriting the server tools.
- Tests or verification commands cover the main server and client paths.
