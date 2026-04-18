import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Tool;

export type ServerBundle = {
  server: string;
  tools: Tool[];
};

const notion: ServerBundle = {
  server: "notion",
  tools: [
    {
      name: "notion_search",
      description:
        "Search across all pages and databases in the connected Notion workspace by keyword. Returns page IDs and titles ranked by relevance.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text query" },
          filter: {
            type: "string",
            enum: ["page", "database"],
            description: "Optional type filter",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "notion_fetch",
      description:
        "Fetch the full content (blocks, properties, children) of a specific Notion page or database by ID.",
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Notion page or database ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "notion_create_page",
      description:
        "Create a new page in Notion, either as a child of an existing page or inside a database. Supports full block content.",
      input_schema: {
        type: "object",
        properties: {
          parent_id: { type: "string" },
          title: { type: "string" },
          content: { type: "string", description: "Markdown body" },
        },
        required: ["parent_id", "title"],
      },
    },
    {
      name: "notion_update_page",
      description:
        "Update properties or append blocks to an existing Notion page by ID.",
      input_schema: {
        type: "object",
        properties: {
          page_id: { type: "string" },
          properties: { type: "object" },
          append_content: { type: "string" },
        },
        required: ["page_id"],
      },
    },
  ],
};

const gmail: ServerBundle = {
  server: "gmail",
  tools: [
    {
      name: "gmail_search_threads",
      description:
        "Search Gmail threads using Gmail search operators (from:, to:, subject:, has:attachment, after:, before:, label:). Returns matching thread IDs with subject and snippet.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query" },
          max_results: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      name: "gmail_get_thread",
      description:
        "Fetch all messages in a Gmail thread by thread ID, including full bodies and attachments metadata.",
      input_schema: {
        type: "object",
        properties: { thread_id: { type: "string" } },
        required: ["thread_id"],
      },
    },
    {
      name: "gmail_create_draft",
      description:
        "Create a Gmail draft email (not sent). Supports to, cc, bcc, subject, body. Drafts appear in the Drafts folder for human review before sending.",
      input_schema: {
        type: "object",
        properties: {
          to: { type: "array", items: { type: "string" } },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "gmail_list_labels",
      description:
        "List all Gmail labels (system + user-created) with their IDs and message counts.",
      input_schema: { type: "object", properties: {} },
    },
  ],
};

const calendar: ServerBundle = {
  server: "calendar",
  tools: [
    {
      name: "calendar_list_events",
      description:
        "List upcoming events on a Google Calendar within a time window. Returns event IDs, titles, times, attendees.",
      input_schema: {
        type: "object",
        properties: {
          calendar_id: { type: "string" },
          time_min: { type: "string", description: "ISO 8601" },
          time_max: { type: "string", description: "ISO 8601" },
        },
      },
    },
    {
      name: "calendar_create_event",
      description:
        "Create a calendar event with start/end time, attendees, location, description. Sends invites to attendees.",
      input_schema: {
        type: "object",
        properties: {
          calendar_id: { type: "string" },
          summary: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "start", "end"],
      },
    },
    {
      name: "calendar_get_event",
      description: "Fetch full details of a single calendar event by ID.",
      input_schema: {
        type: "object",
        properties: {
          calendar_id: { type: "string" },
          event_id: { type: "string" },
        },
        required: ["event_id"],
      },
    },
    {
      name: "calendar_suggest_time",
      description:
        "Suggest meeting times that work for a list of attendees given a duration and search window.",
      input_schema: {
        type: "object",
        properties: {
          attendees: { type: "array", items: { type: "string" } },
          duration_minutes: { type: "number" },
        },
        required: ["attendees", "duration_minutes"],
      },
    },
  ],
};

const drive: ServerBundle = {
  server: "drive",
  tools: [
    {
      name: "drive_search_files",
      description:
        "Search files in Google Drive by name, content, mime type, or modification date. Returns file IDs with names and types.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          mime_type: { type: "string" },
        },
        required: ["query"],
      },
    },
    {
      name: "drive_read_file_content",
      description:
        "Read the contents of a Drive file by ID. Supports Docs, Sheets, Slides, PDFs, and plain text. Returns text content.",
      input_schema: {
        type: "object",
        properties: { file_id: { type: "string" } },
        required: ["file_id"],
      },
    },
    {
      name: "drive_create_file",
      description:
        "Create a new file in Google Drive (Doc, Sheet, or plain text) with given content in a folder.",
      input_schema: {
        type: "object",
        properties: {
          folder_id: { type: "string" },
          name: { type: "string" },
          content: { type: "string" },
          mime_type: { type: "string" },
        },
        required: ["name"],
      },
    },
    {
      name: "drive_list_recent_files",
      description:
        "List files modified in the last N days across the user's Drive.",
      input_schema: {
        type: "object",
        properties: { days: { type: "number" } },
      },
    },
  ],
};

const slack: ServerBundle = {
  server: "slack",
  tools: [
    {
      name: "slack_search_messages",
      description:
        "Search across Slack messages in accessible channels and DMs using Slack query syntax (in:, from:, before:, after:). Returns matching messages with channel + timestamp.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    {
      name: "slack_post_message",
      description:
        "Post a message to a Slack channel or DM. Supports threads and markdown. Message is sent immediately, not as a draft.",
      input_schema: {
        type: "object",
        properties: {
          channel: { type: "string" },
          text: { type: "string" },
          thread_ts: { type: "string" },
        },
        required: ["channel", "text"],
      },
    },
    {
      name: "slack_list_channels",
      description:
        "List Slack channels the user has access to (public + private + DMs).",
      input_schema: { type: "object", properties: {} },
    },
  ],
};

const linear: ServerBundle = {
  server: "linear",
  tools: [
    {
      name: "linear_search_issues",
      description:
        "Search Linear issues across teams by keyword, assignee, status, label, or priority. Returns issue IDs and identifiers like ENG-123.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          assignee: { type: "string" },
          status: { type: "string" },
        },
      },
    },
    {
      name: "linear_create_issue",
      description:
        "Create a new Linear issue in a given team with title, description, priority, assignee, labels.",
      input_schema: {
        type: "object",
        properties: {
          team_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["team_id", "title"],
      },
    },
    {
      name: "linear_update_issue",
      description:
        "Update a Linear issue's status, assignee, labels, priority, or description. Does not create comments.",
      input_schema: {
        type: "object",
        properties: {
          issue_id: { type: "string" },
          status: { type: "string" },
          assignee: { type: "string" },
        },
        required: ["issue_id"],
      },
    },
  ],
};

const github: ServerBundle = {
  server: "github",
  tools: [
    {
      name: "github_search_code",
      description:
        "Search for code content across GitHub repositories using GitHub code search syntax (language:, repo:, path:). Returns matching code blobs with file paths and line numbers.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          repo: { type: "string" },
        },
        required: ["query"],
      },
    },
    {
      name: "github_search_issues",
      description:
        "Search GitHub issues and pull requests by keyword, author, label, state. Returns issue/PR numbers with titles.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          state: { type: "string", enum: ["open", "closed", "all"] },
        },
        required: ["query"],
      },
    },
    {
      name: "github_create_pr",
      description:
        "Open a new pull request on GitHub from a head branch to a base branch with title and body.",
      input_schema: {
        type: "object",
        properties: {
          repo: { type: "string" },
          head: { type: "string" },
          base: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["repo", "head", "base", "title"],
      },
    },
    {
      name: "github_get_pr",
      description:
        "Get full details of a GitHub pull request by repo and number: status, files, reviews, checks.",
      input_schema: {
        type: "object",
        properties: {
          repo: { type: "string" },
          number: { type: "number" },
        },
        required: ["repo", "number"],
      },
    },
  ],
};

const stripe: ServerBundle = {
  server: "stripe",
  tools: [
    {
      name: "stripe_list_customers",
      description:
        "List Stripe customers with optional filters (email, created date). Returns customer objects with IDs.",
      input_schema: {
        type: "object",
        properties: { email: { type: "string" }, limit: { type: "number" } },
      },
    },
    {
      name: "stripe_create_customer",
      description:
        "Create a new Stripe customer with email, name, metadata. Does not create a subscription or charge.",
      input_schema: {
        type: "object",
        properties: {
          email: { type: "string" },
          name: { type: "string" },
          metadata: { type: "object" },
        },
        required: ["email"],
      },
    },
    {
      name: "stripe_list_charges",
      description:
        "List recent Stripe charges for a customer or globally. Includes amount, currency, status, created date.",
      input_schema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  ],
};

const figma: ServerBundle = {
  server: "figma",
  tools: [
    {
      name: "figma_get_design_context",
      description:
        "Get design context (components, variables, layout) for a specific Figma node by file + node ID. Used to ground code generation in the actual design.",
      input_schema: {
        type: "object",
        properties: {
          file_key: { type: "string" },
          node_id: { type: "string" },
        },
        required: ["file_key", "node_id"],
      },
    },
    {
      name: "figma_search_design_system",
      description:
        "Search the design system library for components matching a query. Returns component names + variant info.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  ],
};

const todoist: ServerBundle = {
  server: "todoist",
  tools: [
    {
      name: "todoist_create_task",
      description:
        "Create a new Todoist task with content, project, due date, priority, labels.",
      input_schema: {
        type: "object",
        properties: {
          content: { type: "string" },
          project_id: { type: "string" },
          due_string: { type: "string" },
          priority: { type: "number" },
        },
        required: ["content"],
      },
    },
    {
      name: "todoist_list_tasks",
      description:
        "List active Todoist tasks filtered by project, label, or due date. Returns task IDs with content.",
      input_schema: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          filter: { type: "string" },
        },
      },
    },
    {
      name: "todoist_complete_task",
      description: "Mark a Todoist task as completed by task ID.",
      input_schema: {
        type: "object",
        properties: { task_id: { type: "string" } },
        required: ["task_id"],
      },
    },
  ],
};

export const ALL_SERVERS: ServerBundle[] = [
  notion,
  gmail,
  calendar,
  drive,
  slack,
  linear,
  github,
  stripe,
  figma,
  todoist,
];

export function buildToolset(serverNames: string[]): Tool[] {
  const selected = ALL_SERVERS.filter((s) => serverNames.includes(s.server));
  return selected.flatMap((s) => s.tools);
}

export function allToolNames(): string[] {
  return ALL_SERVERS.flatMap((s) => s.tools.map((t) => t.name));
}
