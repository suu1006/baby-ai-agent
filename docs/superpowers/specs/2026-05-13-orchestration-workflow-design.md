# Orchestration Workflow Design

## Purpose

Create a reusable orchestration workflow for this project so finished code changes can move through review, verification, focused fixes, and then hand off to the existing `/push` command.

The first version should be practical and small. It should let the project owner experience multi-agent orchestration without introducing a large automation framework or changing product code.

## Project Context

This repository is a React Native Expo app for a parenting AI assistant. It uses Expo Router, Supabase, Zustand, Jest, and a Supabase Edge Function named `agent-chat`.

The project already has Claude commands for related workflow steps:

- `.claude/commands/test.md`: creates tests from a spec.
- `.claude/commands/review.md`: reviews changed code without modifying files.
- `.claude/commands/review-and-fix.md`: stabilizes changed code before push.
- `.claude/commands/push.md`: stages, commits, rebases, and pushes after user approval.

The orchestration workflow should sit above these ideas. It should coordinate roles and evidence, but it should not replace `/push`.

## Recommended V1 Approach

Use a role-based model:

- `Reviewer`: inspects diff and impact scope.
- `Tester`: selects and runs verification commands.
- `Fixer`: integrates findings and makes focused fixes.

Reviewer and Tester can run in parallel when the environment supports subagents. In environments that cannot launch subagents, the same roles can run sequentially while keeping the output separated by role.

This approach is the best first version because it matches the user's current workflow:

```text
code changes -> check errors -> test -> fix errors -> code review -> commit
```

It also keeps write ownership simple. Reviewer and Tester produce findings only. Fixer is the only role allowed to edit files.

## Command Artifact

Create `.claude/commands/orchestrate.md`.

The command should:

1. Collect current git status and diffs.
2. Classify changed files by project area.
3. Map impact scope by searching references to changed exports, functions, components, and types.
4. Run Reviewer and Tester roles in parallel when possible.
5. Fall back to sequential role simulation when parallel subagents are unavailable.
6. Combine findings into a prioritized fix list.
7. Let Fixer make only directly related changes.
8. Re-run failed or relevant verification commands.
9. Stop after at most three fix loops.
10. Report results and hand off to `/push`.

The command must not commit or push.

## Role Responsibilities

### Reviewer

Reviewer reads the diff and impact scope, then identifies risks in these categories:

- Security and hardcoded secrets.
- User ownership, authentication, or Supabase data access regressions.
- User flow regressions.
- Type safety and null handling.
- Async state, loading state, and error state handling.
- Unused imports, debug logs, and unrelated refactors.

Reviewer output should group findings as:

- `Needs fix`
- `Note`
- `Can ignore`

Each finding should include a file location, impact, and reason.

### Tester

Tester chooses verification commands based on changed files.

Run TypeScript checks when app source or TypeScript files changed:

```bash
npx tsc --noEmit
```

Run Jest when app, component, lib, store, constants, or Jest test files changed:

```bash
npm test -- --runInBand
```

Run Deno tests when Supabase Edge Function files changed:

```bash
deno test --allow-env --allow-net supabase/functions/agent-chat
```

For docs or `.claude/commands/*.md` only, skip heavy tests and run:

```bash
git diff --check
```

For migration SQL changes, run:

```bash
rg -n "create policy|alter policy|drop policy|enable row level security|auth.uid|user_id" supabase/migrations
git diff --check supabase/migrations
```

Tester classifies failures as:

- `Related failure`: caused by or directly connected to the current changes.
- `Unrelated failure`: appears to be pre-existing or outside the changed area.
- `Environment failure`: caused by missing tools, network, credentials, or local setup.

Tester does not edit files.

### Fixer

Fixer receives Reviewer and Tester results and edits only when the issue is directly related to the current changes.

Fixer rules:

- Keep changes minimal.
- Preserve user-authored work.
- Do not perform unrelated refactors.
- Do not change `.env`, `node_modules`, build outputs, or generated artifacts.
- Re-run only the failed or relevant verification commands.
- Stop after three failed fix attempts and report the remaining blocker.

## Data Flow

```text
Git diff and status
  -> file classification
  -> impact scope
  -> Reviewer findings
  -> Tester verification evidence
  -> combined fix queue
  -> Fixer changes
  -> verification rerun
  -> final report
  -> /push
```

## Error Handling

The workflow should not treat every failure as something to fix. Failures must be classified first.

Fix immediately:

- Failures caused by the current changes.
- Serious review findings with clear, local fixes.
- Type or test failures in files touched by the current work.

Report without fixing:

- Existing failures outside the changed area.
- Tooling or credential failures.
- Product behavior decisions.
- Large design changes that need a new spec.

## Testing Strategy

The first rehearsal should use a low-risk documentation and command change. That validates the orchestration flow without changing app behavior.

Expected first rehearsal:

- Add `.claude/commands/orchestrate.md`.
- Add this design document.
- Ignore `.superpowers/` visual companion artifacts.
- Run `git diff --check`.

After the rehearsal works, use the same command on a small UI or type cleanup change. Supabase Edge Function changes should be used later because they add Deno verification and external-service risk.

## Conflict Prevention

Only Fixer may edit files. Reviewer and Tester are read-only roles.

When true parallel subagents are used, give them disjoint responsibilities:

- Reviewer owns review findings only.
- Tester owns command execution and failure classification only.
- Fixer waits for both outputs before editing.

If multiple Fixer-style workers are added later, they must have disjoint file ownership.

## Extension Roadmap

V2 can split work by code area:

- UI/App agent for `app/**`, `components/**`, and `constants/**`.
- Client state agent for `lib/**` and `store/**`.
- Supabase agent for `supabase/functions/**` and `supabase/migrations/**`.
- Test agent for Jest and Deno tests.

V3 can combine both models:

1. Area agents inspect their own scope in parallel.
2. Reviewer summarizes cross-cutting risks.
3. Tester runs the verification matrix.
4. Fixer applies changes with explicit file ownership.

Worktree-based parallel implementation can be added after the user is comfortable with the simpler role model.

## Completion Criteria

The v1 workflow is complete when:

- `.claude/commands/orchestrate.md` exists and follows existing command style.
- The command clearly separates Reviewer, Tester, and Fixer.
- Reviewer and Tester are read-only.
- Fixer is the only role allowed to edit files.
- The command never commits or pushes.
- Docs-only changes use `git diff --check` instead of heavy tests.
- The workflow hands off to `/push` after successful validation.
