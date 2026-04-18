export type ToolSchema = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type ServerSpec = {
  name: string;
  description: string;
  tools: ToolSchema[];
};

export type ToolsFixture = {
  servers: ServerSpec[];
};

export type Query = {
  id: string;
  category:
    | "clear_single"
    | "multi_tool"
    | "ambiguous"
    | "no_tool"
    | "adversarial"
    | "param_precision";
  prompt: string;
  gold_tool: string;
  gold_any_of: string[];
  notes?: string;
};

export type RunnerResult = {
  query_id: string;
  model: string;
  first_tool: string | null;
  first_args: Record<string, unknown> | null;
  text_only_response: string | null;
  num_tool_calls: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  error: string | null;
  raw?: unknown;
};

export type JudgeResult = {
  query_id: string;
  model: string;
  tool_correct: boolean;
  tool_in_any_of: boolean;
  param_score: 0 | 1 | 2 | 3 | 4 | 5;
  justification: string;
};

export type ScoredRow = RunnerResult & JudgeResult;

export type Runner = {
  model: string;
  run: (query: Query, flatTools: ToolSchema[]) => Promise<RunnerResult>;
};
