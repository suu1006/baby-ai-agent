# Home and Chat Background Design

## Context

The app is a React Native Expo parenting AI assistant. The home screen and AI consultation screen currently feel too similar because both use the same warm background family in several key areas.

## Decision

Use distinct, calm screen backgrounds:

- Home screen: use a very light sage background (`#F7FAF8`) so daily records, summaries, and timeline content feel quiet and easy to scan.
- AI consultation screen: use a very light blue background (`#F8FBFF`) with a slightly stronger blue header surface (`#F0F7FF`) so long-form reading and question flow feel focused and trustworthy.

Keep the existing coral primary color for important actions and user message bubbles. Keep card and assistant bubble surfaces white for readability.

## Scope

Change only background color tokens and screen-level background usage for:

- `constants/theme.ts`
- `app/(tabs)/index.tsx`
- `app/(tabs)/chat.tsx`

Do not redesign layouts, typography, navigation, message bubbles, or card structure.

## Verification

Run the existing home and chat layout tests and TypeScript checks where practical. Visually verify that the home screen and AI consultation screen are clearly differentiated while preserving existing brand accents.
