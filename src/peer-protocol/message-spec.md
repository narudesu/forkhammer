#### Message structure

Messages follow this structure:

```ts
interface Message {
  id: string // id is a uuid of the message
  type: string // type identifies the type of the message
  // plus some additional properties
}
```

#### Message types

`worktree.list`

```ts
interface Data {
  id: string
  type: 'worktree.list'
}
```

`worktree.list_response`

```ts
interface Data { 
  id: string
  type: 'worktree.list_response'
  worktrees: WorktreeInfo[]
}

interface WorktreeInfo {
  path: string;
  branch: string;
  name?: string;
}
```

`opencode.status`

```ts
interface Data {
  id: string
  type: 'opencode.status'
}
```

`opencode.status_response`

```ts
interface Data {
  id: string
  type: 'opencode.status_response'
  status: OpencodeStatus
}

interface OpencodeStatus {
  projects: OpencodeProjectStatus[]
}

type OpencodeAgent = 'plan' | 'build'

interface OpencodeProjectStatus {
  id: string
  worktree: string
  name?: string
  sandboxes: OpencodeSandboxStatus[]
}

interface OpencodeSandboxStatus {
  directory: string
  name?: string
  sessions: OpencodeSessionStatus[]
}

interface OpencodeSessionStatus {
  id: string
  slug: string
  title: string
  directory: string
  processing: boolean
  processingStatus?: 'idle' | 'busy' | 'retry' | null
  issueKey?: string | null
  agent?: OpencodeAgent | null
  model?: {
    id: string
    providerID: string
    variant?: string
  }
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  summary?: {
    additions: number
    deletions: number
    files: number
  }
  messages: OpencodeSessionMessageStatus[]
}

type OpencodeSessionMessageStatus =
  | {
      role: 'user'
      text: string
    }
  | {
      role: 'assistant'
      stepFinishText?: string
      structuredOutputInput?: unknown
    }
```

`opencode.session.create`

Create a new OpenCode session in a selected sandbox/worktree and send the initial prompt.

```ts
interface Data {
  id: string
  type: 'opencode.session.create'
  projectId: string
  worktree: string
  sandboxName: string
  prompt: string
  agent: OpencodeAgent
  issueKey?: string
}
```

`opencode.session.create_response`

```ts
interface Data {
  id: string
  type: 'opencode.session.create_response'
  accepted: boolean
  sessionId?: string
  error?: string
}
```

`opencode.session.prompt`

Send a follow-up prompt to an existing OpenCode session. If `agent` is omitted, the worker preserves its default prompt behavior.

```ts
interface Data {
  id: string
  type: 'opencode.session.prompt'
  sessionId: string
  prompt: string
  delivery?: 'immediate' | 'deferred'
  agent?: OpencodeAgent
}
```

`opencode.session.prompt_response`

```ts
interface Data {
  id: string
  type: 'opencode.session.prompt_response'
  sessionId: string
  accepted: boolean
  messageId?: string
}
```
