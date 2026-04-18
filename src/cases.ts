export type TestCase = {
  id: string;
  query: string;
  correct: string[];
  category: "search" | "create" | "fetch" | "update" | "list" | "ambiguous";
  notes?: string;
};

export const CASES: TestCase[] = [
  {
    id: "s01",
    query: "Find the Q3 planning doc I wrote in Notion last week.",
    correct: ["notion_search"],
    category: "search",
  },
  {
    id: "s02",
    query: "Find that email from Maya about the seed round last month.",
    correct: ["gmail_search_threads"],
    category: "search",
  },
  {
    id: "s03",
    query: "Find the PDF pitch deck I uploaded to Drive on Monday.",
    correct: ["drive_search_files"],
    category: "search",
  },
  {
    id: "s04",
    query: "Find the Slack message where Jen posted the Figma link.",
    correct: ["slack_search_messages"],
    category: "search",
  },
  {
    id: "s05",
    query: "Find all Linear issues assigned to me that are still in progress.",
    correct: ["linear_search_issues"],
    category: "search",
  },
  {
    id: "s06",
    query:
      "Find where we implement the rate limiter in the backend repo on GitHub.",
    correct: ["github_search_code"],
    category: "search",
  },
  {
    id: "s07",
    query: "Find any open GitHub pull requests mentioning the migration.",
    correct: ["github_search_issues"],
    category: "search",
  },
  {
    id: "s08",
    query: "Find the Button component in our design system.",
    correct: ["figma_search_design_system"],
    category: "search",
  },
  {
    id: "s09",
    query: "What Stripe customers do we have with @acme.com emails?",
    correct: ["stripe_list_customers"],
    category: "search",
  },
  {
    id: "s10",
    query: "Which tasks do I have due today in Todoist?",
    correct: ["todoist_list_tasks"],
    category: "search",
  },

  {
    id: "c01",
    query:
      "Draft an email to priya@example.com with subject 'Kickoff next Monday' saying we're on for 10am.",
    correct: ["gmail_create_draft"],
    category: "create",
  },
  {
    id: "c02",
    query:
      "Put a new Notion page titled 'Sprint 12 retro' under the Engineering workspace.",
    correct: ["notion_create_page"],
    category: "create",
  },
  {
    id: "c03",
    query:
      "Schedule a 30-minute meeting with the design team on Friday afternoon.",
    correct: ["calendar_create_event"],
    category: "create",
  },
  {
    id: "c04",
    query: "Make a new Google Doc in the Marketing folder called 'Q4 brief'.",
    correct: ["drive_create_file"],
    category: "create",
  },
  {
    id: "c05",
    query:
      "Post in #launches: 'Shipping v2.3 tomorrow morning, details in thread.'",
    correct: ["slack_post_message"],
    category: "create",
  },
  {
    id: "c06",
    query:
      "File a Linear ticket for the bug where the export button hangs on Safari.",
    correct: ["linear_create_issue"],
    category: "create",
  },
  {
    id: "c07",
    query:
      "Open a PR in the frontend repo from branch fix/login to main with title 'Fix login redirect'.",
    correct: ["github_create_pr"],
    category: "create",
  },
  {
    id: "c08",
    query: "Add a new Stripe customer for alex@acme.com named Alex Chen.",
    correct: ["stripe_create_customer"],
    category: "create",
  },
  {
    id: "c09",
    query: "Add a task 'review overnight eval output' for tomorrow morning.",
    correct: ["todoist_create_task"],
    category: "create",
  },
  {
    id: "c10",
    query:
      "Reply to Maya's email thread — send the draft to her saying yes to Tuesday.",
    correct: ["gmail_create_draft"],
    category: "create",
    notes: "Tests ambiguity: reply is still a draft creation.",
  },

  {
    id: "f01",
    query:
      "Open the Notion page at ID 2a972407-306a-450d-9351-330f62e90d95 and read it.",
    correct: ["notion_fetch"],
    category: "fetch",
  },
  {
    id: "f02",
    query: "Show me thread id 18c3a4b5 in Gmail.",
    correct: ["gmail_get_thread"],
    category: "fetch",
  },
  {
    id: "f03",
    query: "Get the details of calendar event abc123.",
    correct: ["calendar_get_event"],
    category: "fetch",
  },
  {
    id: "f04",
    query: "Open the Drive file with ID 1XyZ and print its contents.",
    correct: ["drive_read_file_content"],
    category: "fetch",
  },
  {
    id: "f05",
    query: "Pull up PR #482 in the api repo and tell me its status.",
    correct: ["github_get_pr"],
    category: "fetch",
  },
  {
    id: "f06",
    query:
      "Fetch the design context for the node 12:34 in the checkout file in Figma.",
    correct: ["figma_get_design_context"],
    category: "fetch",
  },

  {
    id: "u01",
    query:
      "Update the Notion page 'Sprint 12 retro' — add a section called Action items at the bottom.",
    correct: ["notion_update_page"],
    category: "update",
  },
  {
    id: "u02",
    query: "Move Linear ticket ENG-204 to In Review.",
    correct: ["linear_update_issue"],
    category: "update",
  },
  {
    id: "u03",
    query: "Mark task id 7483920 as done in Todoist.",
    correct: ["todoist_complete_task"],
    category: "update",
  },

  {
    id: "l01",
    query: "What's on my calendar for tomorrow?",
    correct: ["calendar_list_events"],
    category: "list",
  },
  {
    id: "l02",
    query: "Which files did I touch on Drive in the last 3 days?",
    correct: ["drive_list_recent_files"],
    category: "list",
  },
  {
    id: "l03",
    query: "Show me my Gmail labels.",
    correct: ["gmail_list_labels"],
    category: "list",
  },
  {
    id: "l04",
    query: "List Slack channels I'm in.",
    correct: ["slack_list_channels"],
    category: "list",
  },
  {
    id: "l05",
    query: "Show recent Stripe charges from the last week.",
    correct: ["stripe_list_charges"],
    category: "list",
  },

  {
    id: "a01",
    query:
      "Find times that work for me and Jordan for a 45-minute chat next week.",
    correct: ["calendar_suggest_time"],
    category: "ambiguous",
    notes:
      "Not list_events — user is asking for availability, not existing events.",
  },
  {
    id: "a02",
    query:
      "Search for 'rate limiter' — I'm trying to remember where we discussed it.",
    correct: [
      "slack_search_messages",
      "notion_search",
      "gmail_search_threads",
      "github_search_code",
      "github_search_issues",
    ],
    category: "ambiguous",
    notes:
      "No context — any search tool acceptable. Measures which the model reaches for first.",
  },
  {
    id: "a03",
    query:
      "I need to tell the team the standup is cancelled tomorrow — do it the fastest way they'll see.",
    correct: ["slack_post_message"],
    category: "ambiguous",
    notes: "Not email — user said fastest. Tests instruction following.",
  },
  {
    id: "a04",
    query: "Remember I need to pick up milk on the way home.",
    correct: ["todoist_create_task"],
    category: "ambiguous",
  },
  {
    id: "a05",
    query: "Pull the Q3 revenue number for Acme Inc — it's in Stripe.",
    correct: ["stripe_list_charges", "stripe_list_customers"],
    category: "ambiguous",
    notes: "Path usually: find customer → list charges. First call is either.",
  },
  {
    id: "a06",
    query: "Find the figma link — I think it was in an email from Jen.",
    correct: ["gmail_search_threads"],
    category: "ambiguous",
    notes:
      "Trap: 'figma' in query. Correct is gmail_search_threads, not figma_*.",
  },
  {
    id: "a07",
    query:
      "Write up a ticket for the checkout bug, then post it in #engineering.",
    correct: ["linear_create_issue"],
    category: "ambiguous",
    notes: "First action is create issue, then post. Measures ordering.",
  },
  {
    id: "a08",
    query: "Which tasks am I behind on?",
    correct: ["todoist_list_tasks"],
    category: "ambiguous",
  },
  {
    id: "a09",
    query: "Find the design spec for the new onboarding flow.",
    correct: [
      "notion_search",
      "drive_search_files",
      "figma_search_design_system",
    ],
    category: "ambiguous",
    notes: "Design spec could live anywhere — acceptable across three.",
  },
  {
    id: "a10",
    query: "Give me the contents of the Board Update doc from last quarter.",
    correct: ["drive_search_files", "notion_search"],
    category: "ambiguous",
    notes: "First must locate before reading. Search, not fetch.",
  },
];

export const SERVER_TIERS = {
  small: ["notion", "gmail", "calendar"],
  medium: [
    "notion",
    "gmail",
    "calendar",
    "drive",
    "slack",
    "linear",
    "todoist",
  ],
  large: [
    "notion",
    "gmail",
    "calendar",
    "drive",
    "slack",
    "linear",
    "github",
    "stripe",
    "figma",
    "todoist",
  ],
} as const;

export type Tier = keyof typeof SERVER_TIERS;
