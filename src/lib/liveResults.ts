import {
  PLAYABLE_RINGS,
  deriveSlotTeams,
  getPairCount,
  getPairIndices,
  prunePairWinners,
  selectPairWinner,
  slotKey,
  type DrawPosition,
  type Team,
} from "./drawTree";

const WORLD_CUP_GAMES_URL = "https://worldcup26.ir/get/games";

const STAGE_ORDER: Record<string, number> = {
  r32: 0,
  r16: 1,
  qf: 2,
  sf: 3,
  final: 4,
};

const NAME_ALIASES: Record<string, string> = {
  "cote divoire": "CIV",
  "cote d ivoire": "CIV",
  "ivory coast": "CIV",
  "dr congo": "COD",
  "democratic republic of the congo": "COD",
  england: "GB-ENG",
  germany: "DEU",
  netherlands: "NLD",
  paraguay: "PRY",
  "south africa": "ZAF",
  switzerland: "CHE",
};

type ApiGamesResponse = {
  games?: ApiGame[];
};

type ApiGame = {
  id?: string;
  type?: string;
  finished?: string | boolean;
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_score?: string | number | null;
  away_score?: string | number | null;
  home_penalty_score?: string | number | null;
  away_penalty_score?: string | number | null;
};

export type LiveDrawResult = {
  pairWinners: Record<string, Team>;
  appliedMatchCount: number;
  fetchedAt: Date;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (!value || value === "null") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFinished(game: ApiGame): boolean {
  return game.finished === true || String(game.finished).toLowerCase() === "true";
}

function createTeamLookup(positions: DrawPosition[]): Map<string, Team> {
  const teams = new Map<string, Team>();

  for (const position of positions) {
    const team = {
      isoCode: position.isoCode,
      name: position.team ?? position.isoCode,
    };

    teams.set(normalize(team.name), team);
    teams.set(normalize(team.isoCode), team);
  }

  for (const [name, isoCode] of Object.entries(NAME_ALIASES)) {
    const position = positions.find((entry) => entry.isoCode === isoCode);
    if (!position) {
      continue;
    }

    teams.set(normalize(name), {
      isoCode: position.isoCode,
      name: position.team ?? position.isoCode,
    });
  }

  return teams;
}

function getWinnerSide(game: ApiGame): "home" | "away" | null {
  const homeScore = scoreNumber(game.home_score);
  const awayScore = scoreNumber(game.away_score);

  if (homeScore === null || awayScore === null) {
    return null;
  }

  if (homeScore > awayScore) {
    return "home";
  }

  if (awayScore > homeScore) {
    return "away";
  }

  const homePenaltyScore = scoreNumber(game.home_penalty_score);
  const awayPenaltyScore = scoreNumber(game.away_penalty_score);

  if (homePenaltyScore === null || awayPenaltyScore === null) {
    return null;
  }

  if (homePenaltyScore > awayPenaltyScore) {
    return "home";
  }

  if (awayPenaltyScore > homePenaltyScore) {
    return "away";
  }

  return null;
}

function findTeam(lookup: Map<string, Team>, name: string | undefined): Team | null {
  if (!name) {
    return null;
  }

  return lookup.get(normalize(name)) ?? null;
}

function findMatchingPair(
  positions: DrawPosition[],
  pairWinners: Record<string, Team>,
  home: Team,
  away: Team,
): { ringIndex: 0 | 2 | 3 | 4 | 5; pairIndex: number } | null {
  const slotTeams = deriveSlotTeams(positions, pairWinners);

  for (const ringIndex of PLAYABLE_RINGS) {
    const pairCount = getPairCount(ringIndex);

    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const [slotA, slotB] = getPairIndices(ringIndex, pairIndex);
      const teamA = slotTeams[slotKey(ringIndex, slotA)];
      const teamB = slotTeams[slotKey(ringIndex, slotB)];

      if (!teamA || !teamB) {
        continue;
      }

      const pairIsMatch =
        (teamA.isoCode === home.isoCode && teamB.isoCode === away.isoCode) ||
        (teamA.isoCode === away.isoCode && teamB.isoCode === home.isoCode);

      if (pairIsMatch) {
        return { ringIndex, pairIndex };
      }
    }
  }

  return null;
}

export function buildLiveDrawResult(
  games: ApiGame[],
  positions: DrawPosition[],
): Omit<LiveDrawResult, "fetchedAt"> {
  const lookup = createTeamLookup(positions);
  let pairWinners: Record<string, Team> = {};
  let appliedMatchCount = 0;

  const finishedKnockoutGames = games
    .filter((game) => isFinished(game) && game.type && game.type in STAGE_ORDER)
    .sort((a, b) => {
      const stageA = STAGE_ORDER[a.type ?? ""] ?? Number.MAX_SAFE_INTEGER;
      const stageB = STAGE_ORDER[b.type ?? ""] ?? Number.MAX_SAFE_INTEGER;
      const idA = Number(a.id ?? 0);
      const idB = Number(b.id ?? 0);

      return stageA - stageB || idA - idB;
    });

  for (const game of finishedKnockoutGames) {
    const home = findTeam(lookup, game.home_team_name_en);
    const away = findTeam(lookup, game.away_team_name_en);
    const winnerSide = getWinnerSide(game);

    if (!home || !away || !winnerSide) {
      continue;
    }

    const winner = winnerSide === "home" ? home : away;
    const match = findMatchingPair(positions, pairWinners, home, away);

    if (!match) {
      continue;
    }

    pairWinners = selectPairWinner(
      positions,
      pairWinners,
      match.ringIndex,
      match.pairIndex,
      winner,
    );
    appliedMatchCount += 1;
  }

  return {
    pairWinners: prunePairWinners(positions, pairWinners),
    appliedMatchCount,
  };
}

export async function loadLiveDrawResult(
  positions: DrawPosition[],
  signal?: AbortSignal,
): Promise<LiveDrawResult> {
  const response = await fetch(WORLD_CUP_GAMES_URL, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`World Cup API returned ${response.status}.`);
  }

  const payload = (await response.json()) as ApiGamesResponse;
  const games = Array.isArray(payload.games) ? payload.games : [];

  return {
    ...buildLiveDrawResult(games, positions),
    fetchedAt: new Date(),
  };
}
