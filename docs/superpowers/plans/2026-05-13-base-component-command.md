# Base Component Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/base-component` Claude command that supports proposal-first base component creation and UI extraction.

**Architecture:** Implement this as one markdown command file under `.claude/commands/base-component.md`, matching the existing `.claude/commands/*.md` pattern. The command will infer create, extract, or clarification mode, inspect relevant project files, present an approval report, and only apply approved component changes.

**Tech Stack:** Claude command markdown, React Native Expo project conventions, TypeScript/TSX, Jest via `npm test`, TypeScript validation via `npx tsc --noEmit`.

---

## File Structure

- Create: `.claude/commands/base-component.md`
  - Defines the `/base-component` command behavior.
  - Contains mode detection, code inspection rules, placement rules, approval format, implementation rules, validation rules, and final reporting format.
- Read-only reference: `docs/superpowers/specs/2026-05-13-base-component-command-design.md`
  - Source of truth for the approved design.
- Read-only reference: `.claude/commands/push.md`
  - Existing command style for approval gates and final reports.
- Read-only reference: `.claude/commands/spec.md`
  - Existing command style for sequential clarification questions.
- Read-only reference: `components/ui/Button.tsx`, `components/ui/Card.tsx`, `components/ui/Input.tsx`, `constants/theme.ts`
  - Existing component and theme patterns that `/base-component` must instruct agents to follow.

## Task 1: Create the Base Component Command

**Files:**
- Create: `.claude/commands/base-component.md`

- [ ] **Step 1: Confirm the command does not already exist**

Run:

```bash
test ! -f .claude/commands/base-component.md
```

Expected: command exits with status `0`. If it exits with status `1`, open the existing file and update it instead of creating a duplicate.

- [ ] **Step 2: Create `.claude/commands/base-component.md`**

Create `.claude/commands/base-component.md` with exactly this content:

```markdown
# 베이스 컴포넌트 에이전트

React Native Expo 프로젝트의 베이스 컴포넌트 생성과 기존 UI 추출을 도와줍니다.

기본 원칙은 **설계 보고 후 사용자 승인, 승인 후 파일 수정**입니다. 승인 전에는 어떤 파일도 생성하거나 수정하지 마세요.

## 실행 절차

### 1단계: 요청 분석

사용자 요청을 읽고 아래 모드 중 하나로 분류하세요.

- **생성 모드**: 새 재사용 컴포넌트를 만듭니다. 예: `Modal`, `Badge`, `EmptyState`, `Toggle`, `ListItem`
- **추출 모드**: 기존 화면의 반복 JSX나 스타일을 컴포넌트로 분리합니다.
- **확인 모드**: 요청이 모호해서 컴포넌트 이름, 대상 화면, 생성/추출 여부를 알 수 없습니다.

확인 모드일 때는 한 번에 하나씩 질문하세요. 예:

> 어떤 컴포넌트를 만들거나 추출하려는지 알려주세요. 예: `Modal 생성`, `홈 화면 카드 추출`

생성/추출 모드가 명확해질 때까지 파일을 수정하지 마세요.

### 2단계: 현재 코드 조사

아래 파일과 폴더를 먼저 확인하세요.

```bash
find components -maxdepth 3 -type f | sort
sed -n '1,220p' constants/theme.ts
sed -n '1,220p' components/ui/Button.tsx
sed -n '1,220p' components/ui/Card.tsx
sed -n '1,220p' components/ui/Input.tsx
```

추출 모드라면 사용자가 언급한 화면이나 관련 화면도 확인하세요.

```bash
find app -maxdepth 4 -type f | sort
```

필요한 화면 파일만 읽으세요. 전체 화면을 리디자인하지 말고, 요청된 컴포넌트 경계만 파악하세요.

### 3단계: 중복 및 위치 판단

새 컴포넌트를 만들기 전에 기존 `Button`, `Card`, `Input` 또는 다른 컴포넌트로 해결할 수 있는지 확인하세요.

위치 판단 기준:

- 여러 화면에서 재사용 가능한 표현 중심 컴포넌트: `components/ui`
- 도메인 데이터나 특정 기능에 묶인 컴포넌트: `components/<domain>`
- 한 화면에서만 쓰이지만 JSX가 길거나 반복되는 컴포넌트: 화면 근처 또는 `components/<domain>`

스타일 기준:

- `Colors`, `Spacing`, `Radius`, `Shadows`를 우선 사용하세요.
- 기존 `Button`, `Card`, `Input`의 props, StyleSheet, import 패턴을 우선 따르세요.
- 기존 테마 토큰으로 충분한데 임의 색상이나 간격을 새로 만들지 마세요.

### 4단계: 승인 전 설계 보고

파일을 수정하기 전에 반드시 아래 형식으로 사용자에게 보고하고 승인을 기다리세요.

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
- TypeScript 확인 가능 시 `npx tsc --noEmit`

이 계획대로 진행할까요? (승인/수정/취소)
---
```

필드가 실제로 필요 없으면 생략할 수 있지만, 아래 항목은 반드시 포함하세요.

- 모드
- 컴포넌트 이름
- 생성 또는 수정 위치
- 영향 파일
- 승인 질문

### 5단계: 사용자 응답 처리

- 사용자가 `취소`하면 즉시 중단하세요.
- 사용자가 수정을 요청하면 설계 보고서를 고쳐서 다시 승인받으세요.
- 사용자가 `승인`하면 승인된 범위 안에서만 파일을 생성하거나 수정하세요.

승인받지 않은 파일은 수정하지 마세요.

### 6단계: 승인 후 구현 규칙

생성 모드:

- 컴포넌트 파일은 명확한 props 타입을 포함하세요.
- props는 호출자가 내부 구현을 읽지 않아도 이해할 수 있게 작고 명시적으로 유지하세요.
- 필요한 상태만 지원하세요. 예: `disabled`, `loading`, `error`, `empty`
- 기본 export보다 named export를 우선 사용하세요. 기존 `Button`, `Card`, `Input` 패턴과 맞춥니다.

추출 모드:

- 기존 사용자 동작과 화면 결과를 유지하세요.
- 먼저 반복 JSX와 스타일을 새 컴포넌트 props로 옮기세요.
- 추출 후 기존 화면 파일에서는 데이터 준비와 화면 조립만 남기세요.
- 화면 전체 리디자인이나 unrelated refactor로 확장하지 마세요.

금지 사항:

- 승인 전 파일 수정
- `node_modules`, 빌드 산출물, `.env`류 파일 수정
- 요청 범위를 넘어선 화면 리디자인
- 기존 컴포넌트와 거의 같은 새 컴포넌트 생성
- 사용하지 않는 import, 디버그 `console.log` 남기기

### 7단계: 검증

변경 후 가능한 검증을 실행하세요.

```bash
npm test
```

TypeScript 확인이 필요하고 프로젝트 의존성이 설치되어 있으면 실행하세요.

```bash
npx tsc --noEmit
```

검증 명령이 실패하면 실패 내용을 요약하고, 컴포넌트 변경과 관련 있는 실패인지 구분해서 보고하세요.

### 8단계: 완료 보고

완료 후 아래 형식으로 보고하세요.

```markdown
---
**[베이스 컴포넌트 완료]**

**변경 파일:**
- components/...
- app/...

**요약:**
- 무엇을 생성하거나 추출했는지 설명

**사용법:**
```tsx
<ComponentName propName={value} />
```

**검증 결과:**
- `npm test`: 통과 / 실패 / 실행하지 못함
- `npx tsc --noEmit`: 통과 / 실패 / 실행하지 못함

---
```

검증을 실행하지 못했다면 이유를 명확히 적으세요.

## 주의사항

- 이 커맨드는 컴포넌트 작업을 돕는 에이전트입니다. 커밋과 푸시는 `/push`에서 처리합니다.
- 명세 작성이 필요한 큰 기능이면 먼저 `/spec` 실행을 권장하세요.
- 테스트 생성이 별도 단계로 필요하면 `/test` 실행을 권장하세요.
- 코드 리뷰가 필요하면 `/review` 실행을 권장하세요.
```

- [ ] **Step 3: Inspect the created command**

Run:

```bash
sed -n '1,260p' .claude/commands/base-component.md
```

Expected: The output contains these exact headings:

- `# 베이스 컴포넌트 에이전트`
- `## 실행 절차`
- `### 4단계: 승인 전 설계 보고`
- `### 7단계: 검증`
- `## 주의사항`

- [ ] **Step 4: Commit the command**

Run:

```bash
git add .claude/commands/base-component.md
git commit -m "feat: add base component command"
```

Expected: commit succeeds.

## Task 2: Verify the Command Against the Design

**Files:**
- Read: `docs/superpowers/specs/2026-05-13-base-component-command-design.md`
- Read: `.claude/commands/base-component.md`

- [ ] **Step 1: Check required design phrases**

Run:

```bash
rg -n "승인|생성 모드|추출 모드|components/ui|components/<domain>|npm test|npx tsc --noEmit|/push" .claude/commands/base-component.md
```

Expected: output includes all of these concepts:

- Approval before edits
- Create mode
- Extract mode
- `components/ui`
- `components/<domain>`
- `npm test`
- `npx tsc --noEmit`
- `/push`

- [ ] **Step 2: Check for forbidden placeholders**

Run:

```bash
rg -n "$(printf '%s' 'TB' 'D|TO' 'DO|FIX' 'ME|나' '중에|적절' '히|알아' '서')" .claude/commands/base-component.md
```

Expected: command exits with status `1` and prints no matches.

- [ ] **Step 3: Compare command behavior to the spec**

Run:

```bash
sed -n '1,220p' docs/superpowers/specs/2026-05-13-base-component-command-design.md
sed -n '1,260p' .claude/commands/base-component.md
```

Expected: Every spec success criterion is represented in `.claude/commands/base-component.md`:

- `/base-component` handles creation and extraction requests.
- The command presents a proposal before editing.
- The proposal identifies placement, props, states, affected files, and validation.
- Components follow current theme and component conventions.
- Extraction preserves existing behavior unless approved otherwise.
- The final report states changed files and validation results.

- [ ] **Step 4: Run repository tests**

Run:

```bash
npm test -- --runInBand
```

Expected: tests pass, or failures are clearly unrelated to adding `.claude/commands/base-component.md`.

- [ ] **Step 5: Run TypeScript validation**

Run:

```bash
npx tsc --noEmit
```

Expected: TypeScript passes, or failures are clearly unrelated to adding `.claude/commands/base-component.md`.

- [ ] **Step 6: Commit verification notes if command changed**

If verification required edits to `.claude/commands/base-component.md`, run:

```bash
git add .claude/commands/base-component.md
git commit -m "fix: refine base component command"
```

Expected: commit succeeds. If no files changed after verification, skip this commit.

## Task 3: Final Review

**Files:**
- Read: `.claude/commands/base-component.md`
- Read: `docs/superpowers/specs/2026-05-13-base-component-command-design.md`

- [ ] **Step 1: Review git status**

Run:

```bash
git status --short
```

Expected: only intentional files are modified or the worktree is clean after commits. Existing unrelated user changes may still appear and must not be reverted.

- [ ] **Step 2: Review final commit log**

Run:

```bash
git log --oneline -3
```

Expected: the recent commits include:

- `feat: add base component command`
- optional `fix: refine base component command` if Task 2 changed the command

- [ ] **Step 3: Prepare final handoff**

Report:

```markdown
구현 완료:
- `.claude/commands/base-component.md` 추가
- `/base-component`는 생성/추출/확인 모드를 지원
- 승인 전 설계 보고 후 파일 수정하도록 구성
- 검증: `npm test -- --runInBand`, `npx tsc --noEmit`

다음 사용 흐름:
- `/base-component Modal 생성`
- `/base-component 홈 화면 카드 추출`
- 완료 후 `/review`, `/push`
```
