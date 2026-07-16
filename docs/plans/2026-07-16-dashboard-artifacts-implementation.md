# Dashboard Artifacts Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Implement worker generation and publication for Jira, GitLab, blocker, and healthcheck artifacts in a shared per-user `user_artifacts` table.

**Architecture:** Extend the existing event-sourced refresh flow with a typed artifact dispatcher and independent artifact builders. Builders fetch and normalize external data, validate complete payloads against the shared TypeBox protocol, and publish atomically through a shared `user_artifacts` replacement helper. The event log remains the coordination source; `user_artifacts` is the current per-user read model with one row per `(user_id, type)`.

**Tech Stack:** TypeScript, Effector, Supabase JS, Zod, TypeBox, `smol-toml`, Bun tests, native `fetch`.

---

### Task 1: Define the shared artifact and refresh contracts

**Files:**
- Modify: `src/worker/operations-artifact/operations-artifact-protocol.ts`
- Modify: `src/worker/events.ts`
- Test: `src/worker/operations-artifact/operations-artifact-protocol.test.ts`

**Steps:**
1. Write tests for the four artifact type values: `jira`, `gitlab`, `healthcheck`, and `blocker`.
2. Add a shared artifact-type TypeBox schema/type and make Jira use `jira` rather than `jira_inbox`.
3. Make fetched Jira ticket fields nullable while keeping configured team/key/url required.
4. Add/adjust TypeBox schemas for transport-failed healthchecks (`statusCode: 0`) and the complete artifact payloads.
5. Extend the refresh event schema to accept the four types; normalize or explicitly reject legacy `jira_inbox` requests.
6. Run `bun test src/worker/operations-artifact/operations-artifact-protocol.test.ts` and `bun run ts`.
7. Commit: `feat: define operations artifact protocol`.

### Task 2: Extend worker configuration and document deployment settings

**Files:**
- Modify: `src/config/config.ts`
- Modify: `src/worker/config.ts`
- Modify: `examples/config.toml`
- Modify: `website/docs/configuration.mdx`
- Test: `src/config/config.test.ts` (create if absent)

**Steps:**
1. Write failing parsing tests for GitLab credentials/projects/branches, blocker TOML path, and named healthchecks.
2. Add Zod configuration schemas with URL validation, required project names/IDs, branch lists, and healthcheck IDs/names/URLs.
3. Expose the validated settings through `WorkerConfig` without leaking secrets into logs.
4. Add example TOML and configuration documentation.
5. Run the focused config tests and `bun run ts`.
6. Commit: `feat: configure dashboard artifact sources`.

### Task 3: Add the shared `user_artifacts` publication path

**Files:**
- Create: `src/worker/operations-artifact/operations-artifact-publisher.ts`
- Modify: `src/worker/jira-artifact/effect-fetch-artifact.ts`
- Modify: `src/worker/test/test-supabase-client.ts`
- Test: `src/worker/operations-artifact/operations-artifact-publisher.test.ts`

**Steps:**
1. Write tests proving publication inserts `{ user_id, type, content }`, emits `inserted_artifact`, and replaces only the same user/type.
2. Add explicit Supabase error handling and TypeBox validation before publication.
3. Implement safe replacement: insert the validated new row, emit its event, then delete the prior same-user/type row; preserve the prior row if generation or insertion fails.
4. Update the test Supabase client to support the required select/delete filters and errors.
5. Move Jira inbox publication to `user_artifacts` with type `jira`, preserving its current payload.
6. Run focused publisher/Jira tests and `bun test`.
7. Commit: `feat: publish artifacts in user_artifacts`.

### Task 4: Implement GitLab client and normalization

**Files:**
- Create: `src/gitlab/gitlab.ts`
- Create: `src/gitlab/gitlab-types.ts`
- Create: `src/worker/operations-artifact/gitlab-artifact.ts`
- Test: `src/worker/operations-artifact/gitlab-artifact.test.ts`

**Steps:**
1. Write fixture-driven tests for open MRs, MRs merged in the previous three days, branch pipelines, and normalized MR/pipeline fields.
2. Add a GitLab client boundary for project MR listing, pipeline lookup/history, jobs, and exact-key MR search.
3. Implement configured FE/BE activity collection and date filtering.
4. Implement failed-pipeline investigation: latest failed pipeline, most recent successful baseline before it, earliest failed pipeline after that baseline, and non-successful jobs; do not fetch history for non-failed latest pipelines.
5. Validate the result against `GitlabArtifactSchema`.
6. Run focused tests and `bun run ts`.
7. Commit: `feat: build GitLab dashboard artifacts`.

### Task 5: Implement blocker TOML parsing and enrichment

**Files:**
- Create: `src/worker/operations-artifact/blocker-config.ts`
- Create: `src/worker/operations-artifact/blocker-artifact.ts`
- Modify: `src/jira/jira.ts`
- Modify: `src/jira/jira-types.ts`
- Test: `src/worker/operations-artifact/blocker-artifact.test.ts`

**Steps:**
1. Write failing tests for valid TOML, malformed TOML, invalid lowercase snake_case IDs, ticket-key extraction, missing Jira tickets, exact-key GitLab matches, filtering, and deduplication.
2. Parse stable named blocker tables and validate their shape; treat an empty file as valid.
3. Add Jira metadata lookup behavior that returns null fetched fields for a missing ticket while preserving configured references.
4. Search configured GitLab projects using identifier-boundary matching in MR titles/descriptions; fail the complete build on GitLab API/search failure, but not on zero matches.
5. Compute `suggestedResolved`, evidence sources, and human-readable reasons without deleting TOML-defined blockers.
6. Validate against `BlockersArtifactSchema`.
7. Run focused blocker tests and `bun run ts`.
8. Commit: `feat: build blocker dashboard artifacts`.

### Task 6: Implement healthcheck artifact generation

**Files:**
- Create: `src/worker/operations-artifact/healthcheck-artifact.ts`
- Test: `src/worker/operations-artifact/healthcheck-artifact.test.ts`

**Steps:**
1. Write tests for status 200 success, non-200 failure, complete response-body capture, timing, and network failure.
2. Implement one request per configured healthcheck with an independent timeout/measurement boundary.
3. Represent transport failures as `statusCode: 0`, `healthy: false`, available response time, and a diagnostic body.
4. Ensure configuration errors or missing result entries abort publication, while individual request failures remain in the artifact.
5. Validate against `HealthchecksArtifactSchema`.
6. Run focused healthcheck tests and `bun run ts`.
7. Commit: `feat: build healthcheck dashboard artifacts`.

### Task 7: Add refresh dispatch and artifact store wiring

**Files:**
- Create: `src/worker/operations-artifact/operations-artifact-events.ts`
- Create: `src/worker/operations-artifact/operations-artifact-store.ts`
- Create: `src/worker/operations-artifact/effect-refresh-artifact.ts`
- Modify: `src/run-worker.ts`
- Modify: `src/worker/constants.ts`
- Modify: `src/worker/domain.ts`
- Test: `src/worker/operations-artifact/operations-artifact-store.test.ts`

**Steps:**
1. Write tests for each refresh type dispatch, pending-state tracking, duplicate suppression, and failure behavior.
2. Implement a hydratable Effector store keyed by artifact type and cursor.
3. Dispatch to Jira, GitLab, blocker, or healthcheck builders and publish through the shared helper.
4. Emit normalized `inserted_artifact` events and clear pending state only after successful publication.
5. Register the store in `run-worker.ts`; preserve existing validation/peer stores and realtime behavior.
6. Run focused store tests and the full worker test suite.
7. Commit: `feat: dispatch operations artifact refreshes`.

### Task 8: Add database and operational documentation

**Files:**
- Modify: `website/docs/self-hosting-supabase.mdx`
- Modify: `website/docs/configuration.mdx`
- Create or modify: repository Supabase schema/deployment documentation as applicable

**Steps:**
1. Document `user_artifacts` columns and the unique `(user_id, type)` constraint.
2. Document the four type values, replacement semantics, and required policies.
3. Document artifact refresh event payloads and failure behavior.
4. Run `bun run build:docs`.
5. Commit: `docs: document user artifact storage`.

### Task 9: Full verification and review

**Files:**
- Potentially modify: affected tests and formatting only

**Steps:**
1. Run `bun test`.
2. Run `bun run ts`.
3. Run `bun run build:cli` if available, otherwise record the repository’s current CLI verification command.
4. Run `bun run build` to verify the full required path.
5. Run `bun run format:check`.
6. Inspect `git diff` for secrets, generated files, and accidental changes.
7. Request code review using the requesting-code-review skill.
8. Before claiming completion, follow the verification-before-completion skill and report command results.
