---
sidebar_position: 2
---

# `forkhammer new`

Run `forkhammer new -k AT-123`.

This command:

- fetches Jira issue context
- resolves the configured project
- creates or reuses an OpenCode worktree
- opens an OpenCode session
- asks the agent to validate the issue and draft a plan

## Configuration

`~/.config/forkhammer/config.toml`

Example contents:

`[jira]` with `url = "https://your-jira.example.com"` and `auth = "email:api-token"`.

`[project.app]` with `root = "/home/naru/code/opencode/your-project"` and `key = "AT"`.

## Requirements

- OpenCode server running on `http://localhost:8000`
- valid Jira credentials
- git available in the configured project path
