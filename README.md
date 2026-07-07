# FWC26 Circle Draw

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
