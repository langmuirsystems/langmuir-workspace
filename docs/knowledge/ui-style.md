# Langmuir UI style

*Copy the established visual language. Do not invent a new theme for a new page.*

Brendan strongly prefers the established PMS visual language over new custom styling.

## The picker-page header

`#1d2127` bar, 3px `#C8102E` bottom border, brand mark, "LANGMUIR SYSTEMS" wordmark with the page name beneath, rounded nav pills, clock on the right, ☰ collapse on mobile.

## The old CI board look

Body `#14171c`, surfaces `#1d2127`, and especially the **status-colored column progression**: New `#60a5fa` blue → Reviewing `#fbbf24` amber → In Progress `#fb923c` orange → Done `#4ade80` green, each with colored count pills. Small colored `.tag` chips, mini action buttons, and the 🏆 leaderboard strip.

## Keep the CI points system

Brendan, explicitly: "keep the points system to encourage people participating in CI." Leaderboard, hardware ×2 / software ×1 scoring, and the "no leaderboard credit — add name" nudge. **Voting is retired; points are not.**

## Why

Consistency across the shop's tools. Operators already know this language, and the gamification drives CI participation.

## How to apply

Any new Langmuir page copies the picker header block and the `feedback.html` board palette rather than inventing a theme. Reference implementations: `pms/public/picker.html` (header), `pms/public/feedback.html` (board), `ci/public/board.html` (both combined).

Related: [branding-assets](branding-assets.md)
