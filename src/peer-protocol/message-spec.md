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
  processingStatus?: 'idle' | 'busy' | 'retry'
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

`opencode.session.prompt`

```ts
interface Data {
  id: string
  type: 'opencode.session.prompt'
  sessionId: string
  prompt: string
  delivery?: 'immediate' | 'deferred'
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
