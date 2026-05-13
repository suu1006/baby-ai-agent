# Base Component Command Design

## Overview

Add a Claude command at `.claude/commands/base-component.md` that automates base component creation and UI extraction work for this React Native Expo project.

The command should support both new reusable component creation and extraction of repeated UI from existing screens. It must default to a proposal-first workflow: inspect the code, present a concrete component plan, ask for user approval, and only modify files after approval.

## Goals

- Provide one command, `/base-component`, for base component creation and extraction.
- Keep component work aligned with the existing `components/ui` and `constants/theme.ts` patterns.
- Prevent accidental broad redesigns by requiring an approval gate before file edits.
- Help decide whether a component belongs in `components/ui`, a domain component folder, or near a screen.
- Report validation steps and results after changes are applied.

## Non-Goals

- Replace the existing `/spec`, `/test`, `/review`, or `/push` commands.
- Redesign whole screens as part of component extraction.
- Introduce a new component library or design system dependency.
- Modify build artifacts, `node_modules`, environment files, or unrelated source files.
- Automatically commit component implementation changes.

## Command Location

Create:

- `.claude/commands/base-component.md`

This follows the existing command pattern used by `.claude/commands/push.md`, `.claude/commands/spec.md`, `.claude/commands/test.md`, and `.claude/commands/review.md`.

## Supported Modes

The command has a single entry point and infers the mode from the user's request.

### Create Mode

Use create mode when the user asks for a new reusable component, such as:

- `Modal`
- `Badge`
- `EmptyState`
- `Toggle`
- `ListItem`

The command should identify the component name, intended use, required props, expected visual states, and likely target folder.

### Extract Mode

Use extract mode when the user asks to factor repeated UI out of existing screens, such as:

- Extract repeated cards from the home screen.
- Turn chat message markup into a component.
- Move repeated log timeline rows into a shared component.

The command should inspect the relevant files, identify repeated JSX and style patterns, propose a component boundary, and list the files that would change.

### Clarification Mode

Use clarification mode when the request does not clearly indicate what to create or extract. The command should ask one focused question at a time and avoid modifying files until it can produce a concrete proposal.

## Placement Rules

The command should propose the component location before implementation.

- Use `components/ui` when a component is presentation-oriented and reusable across multiple screens.
- Use `components/<domain>` when a component is tied to a domain concept, data shape, or screen family.
- Use a screen-adjacent component only when the component is clearly local to one screen but improves readability or removes repeated JSX.
- Prefer extending or reusing existing `Button`, `Card`, and `Input` components before creating a near-duplicate.
- Use `constants/theme.ts` values for colors, spacing, radius, and shadows whenever the existing theme covers the need.

## Execution Flow

1. Analyze the user request.
   - Classify the request as create, extract, or clarification.
   - Identify the component name, intended usage, target screens, and likely props.
2. Inspect current code.
   - Read `components/ui`.
   - Read `constants/theme.ts`.
   - Read relevant `app/` screens or existing component files.
3. Check for existing overlap.
   - If a similar component already exists, propose reuse or extension.
   - Avoid creating duplicate components with slightly different APIs.
4. Present a base component proposal.
   - Include mode, component name, target path, files to create or edit, props, states, styling rules, and validation steps.
   - Ask the user to choose `승인`, `수정`, or `취소`.
5. Wait for approval.
   - If the user chooses `취소`, stop.
   - If the user requests changes, revise the proposal and ask again.
   - If the user approves, continue.
6. Apply approved changes only.
   - Create or modify only the files listed in the approved proposal.
   - Preserve existing behavior during extraction.
   - Keep implementation scoped to the component boundary.
7. Validate.
   - Run the relevant available checks, such as `npm test`.
   - Run TypeScript or lint checks if they are available in the project scripts.
   - If a check cannot be run, report why.
8. Report completion.
   - Summarize changed files.
   - Explain how to use the new component or what was extracted.
   - Include validation results.

## Approval Report Format

The command should use this approval format before editing files:

```markdown
---
**[베이스 컴포넌트 설계]**

**모드:** 생성 / 추출
**컴포넌트:** ComponentName
**생성 위치:** components/ui/ComponentName.tsx

**사용/수정 파일:**
- app/...
- components/...

**Props 초안:**
- propName: 설명

**동작/상태:**
- 기본 상태
- disabled/loading/error/empty 등 필요한 상태

**스타일 기준:**
- Colors, Spacing, Radius, Shadows 사용
- 기존 Button/Card/Input 패턴과 맞춤

**검증 방법:**
- npm test
- TypeScript 확인 가능 시 실행

이 계획대로 진행할까요? (승인/수정/취소)
---
```

The report may omit fields that are genuinely irrelevant, but it must always include mode, component name, target path, affected files, and approval prompt.

## Safety Rules

- Do not edit files before the approval report is accepted.
- Do not touch `node_modules`, generated build output, environment files, or unrelated files.
- Do not widen a component extraction into a screen redesign.
- Do not introduce arbitrary colors or spacing when existing theme tokens are sufficient.
- Do not create a new component when an existing component can be extended cleanly.
- During extraction, preserve the existing user-facing behavior unless the approved plan explicitly includes a behavior change.
- Keep props explicit and small enough for a caller to understand without reading component internals.

## Validation Strategy

The command should decide validation based on the approved change.

- For pure component creation, run the smallest available project check that catches syntax and type errors.
- For extraction from a screen, run tests and inspect changed call sites for prop mismatches.
- If new tests are appropriate and the surrounding project has a clear pattern, include minimal behavior-focused tests in the proposal.
- If validation cannot run because a tool is missing or the project lacks a script, report that clearly in the final message.

## Success Criteria

- `/base-component` can handle both creation and extraction requests.
- The command always presents a proposal before editing.
- The proposal identifies component placement, props, states, affected files, and validation.
- Generated or extracted components follow the current theme and component conventions.
- Existing behavior is preserved during extraction unless an approved plan says otherwise.
- The command's final report clearly states what changed and what was verified.
