# Operations Dashboard Artifacts Design

## Overview

The existing dashboard route will become an operations overview containing three focused sections:

- **GitLab:** FE and BE merge requests, recently merged merge requests, and configured branch pipeline status.
- **Blockers:** manually maintained unresolved blockers enriched with Jira and GitLab data.
- **Healthchecks:** configured deployed-page HTTP checks and complete response bodies.

The design favors compact cards, clear status badges, strong failure/blocker hierarchy, and quiet presentation of healthy data. Each artifact may have its own snapshot timestamp.

## Artifact contracts

A shared worker/app contract file will define only artifact payloads using TypeBox and exported `Static` TypeScript types. It must not import React, Supabase, browser APIs, or worker-specific code. Supabase record fields such as `id` and `created_at` remain outside this shared contract.

### GitLab artifact

The payload contains configured FE and BE project summaries, open MRs, MRs merged during the previous three days, and the latest pipeline for each configured branch (typically `main`, `staging`, and `production`).

MR records include project, IID, title, URL, author, assignee, source branch, target branch, state, timestamps, and pipeline summary.

For a failed latest pipeline, the worker also fetches and stores:

- the most recent successful pipeline before it;
- the chronologically earliest failed pipeline after that successful baseline;
- non-successful job statuses for the investigated pipelines.

Individual job logs are never stored. If the latest pipeline is not failed, no additional pipeline history is fetched.

### Blockers artifact

Blockers are defined in a worker-accessible TOML file using stable named tables and lowercase snake_case identifiers:

```toml
[blockers.document_management]
title = "Document management feature"
comments = [
  "Asked @sebike to inform me once the API shape is ready.",
]

[[blockers.document_management.blocked_tickets]]
team = "fe"
url = "https://cleevio.atlassian.net/browse/AT-1146"
```

Ticket groups are generic (`blocked_tickets` and `blocking_tickets`); every ticket has a `team` field and manually supplied Jira URL. Comments are plain strings.

The worker extracts Jira keys, fetches Jira metadata, searches configured GitLab projects for exact Jira-key references in MR titles/descriptions, filters and deduplicates matches, and includes all related MRs (including merged MRs). The artifact retains original URLs and fetched metadata when available.

Every TOML blocker is unresolved by definition. The worker may set a non-authoritative `suggestedResolved` signal when either all linked Jira tickets are resolved or all relevant related MRs are merged. The artifact includes the evidence source (`jira`, `gitlab`, or both) and a human-readable reason. Actual resolution requires deleting the blocker from TOML.

### Healthchecks artifact

Each worker-configured healthcheck has a name and URL, expects HTTP status `200`, and stores status code, success state, response time, check timestamp, and the full response body. Responses are expected to be small.

## Data flow

A refresh event identifies an artifact type. The worker reads its configuration, fetches all required APIs, validates the completed payload against the shared TypeBox schema, and inserts a new Supabase artifact record only after successful validation.

FE and BE GitLab projects and monitored branches are configured for the worker. FE and BE lists contain open MRs plus MRs merged within the last three days. Blocker-related MRs are driven by Jira keys from the blocker TOML instead of the general MR lists.

Artifact generation is atomic. Malformed TOML, invalid configuration, API failures, incomplete required results, or schema violations prevent publication of a new snapshot; the app continues showing the previous valid artifact. Worker logs should provide diagnostic source context without exposing secrets.

## Dashboard presentation

The dashboard keeps the three domains visually separate rather than combining them into one table. Failures and blockers receive the strongest visual emphasis. Pipeline cards show the regression chain where applicable. Blocker suggestions clearly state their evidence source. Healthcheck cards show status, timing, and response content.

## Testing

Tests should cover:

- TOML parsing and lowercase snake_case blocker validation;
- TypeBox payload validation;
- Jira-key extraction from URLs;
- exact-key GitLab MR matching, filtering, and deduplication;
- pipeline baseline and earliest-failure selection;
- blocker resolution suggestions and evidence sources;
- atomic publication behavior;
- representative dashboard states for loading, healthy, failed, stale, and suggested-resolved data.
