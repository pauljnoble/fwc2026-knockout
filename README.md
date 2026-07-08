# FWC26 Circle Draw

## add-tooltip-goals

Added score-aware tooltips for completed matches and a championship winner celebration in the bracket UI.

### Changes

- Built a `beatByScores` map from live game data so eliminated teams can show the actual completed match score in their tooltip.
- Displayed the championship winner name above the trophy as `Winner: <team name>` once the final is settled.
- Added a confetti burst animation when the championship winner is selected.
- Kept the live World Cup 2026 API integration and bracket seeding flow intact.

### Branch Notes

- The tooltip score format supports penalties for drawn knockout games, for example `(0-0)PK:4-3`.
- Confetti is driven from the final bracket selection state and resets with the draw.

## add-worldcup26-api

Integrated the live World Cup 2026 API into the knockout draw so bracket seeding and winner state are derived from current match data instead of a hardcoded default.

### Changes

- Added live fetches for team and game data from `https://worldcup26.ir/get/teams` and `https://worldcup26.ir/get/games`.
- Built the initial draw state from API results by comparing `home_score` and `away_score` across supported match types.
- Kept draw-tree validation aligned with the existing bracket structure so winner states continue to resolve correctly.
- Refined the `r16` position seeding flow so it matches the live ordering used by the bracket renderer.

### Scope

- Supported match types: `r32`, `r16`, `qf`, `sf`, and `final`.
- The third-place match remains outside the current bracket tree.
