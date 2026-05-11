import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AgentMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChildContext = {
  id: string;
  name: string;
  birthdate: string;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        { type: string; description: string; enum?: string[] }
      >;
      required: string[];
    };
  };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

export type AgentContext = {
  child: ChildContext;
  supabase: SupabaseClient;
  env: {
    OPENROUTER_API_KEY: string;
    TAVILY_API_KEY?: string;
    OPENROUTER_MODEL: string;
    OPENROUTER_REFERER: string;
    OPENROUTER_TITLE: string;
    OPENROUTER_MAX_TOKENS: number;
    OPENROUTER_REASONING_EFFORT: string;
  };
  fetch: typeof fetch;
  emitStatus?: (status: string) => void;
};

export type AgentTool = {
  definition: ToolDefinition;
  execution: "server" | "client";
  execute?: (
    args: Record<string, unknown>,
    context: AgentContext,
  ) => Promise<string>;
};

export type OpenRouterMessage =
  | {
    role: "system" | "user" | "assistant";
    content: string;
    tool_calls?: ToolCall[];
  }
  | { role: "tool"; content: string; tool_call_id: string };

export type AgentStreamEvent =
  | { type: "status"; status: string }
  | { type: "token"; token: string }
  | { type: "final"; content: string }
  | { type: "error"; message: string };
