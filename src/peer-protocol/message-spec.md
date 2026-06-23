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
