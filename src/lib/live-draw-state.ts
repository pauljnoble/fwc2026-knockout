import type { DrawState } from "./drawState";
import type { DrawPosition } from "../components/CirclePoints";

type TeamRecord = {
  fifa_code: string;
  name_en: string;
};

type GameRecord = {
  type: string;
  home_score: string;
  away_score: string;
  home_team_name_en: string;
  away_team_name_en: string;
  home_penalty_score: string;
  away_penalty_score: string;
  home_team_label: string;
  away_team_label: string;
  id: string;
  finished: "TRUE" | "FALSE";
};

const WORLD_CUP_26_BASE_PATH = "https://worldcup26.ir";

const TYPE_TO_RING_INDEX: Record<string, number> = {
  r16: 2,
  qf: 3,
  sf: 4,
  final: 5,
};

function getWinnerIsoCode(
  game: GameRecord,
  teamsMap: Record<string, string>,
): string | null {
  if (game.finished === "FALSE") {
    return null;
  }
  const homeScore =
    game.home_penalty_score && game.home_penalty_score !== "null"
      ? Number(game.home_penalty_score)
      : Number(game.home_score);
  const awayScore =
    game.away_penalty_score && game.away_penalty_score !== "null"
      ? Number(game.away_penalty_score)
      : Number(game.away_score);

  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
    return null;
  }

  if (homeScore === awayScore) {
    return null;
  }

  const winnerName =
    homeScore > awayScore ? game.home_team_name_en : game.away_team_name_en;

  return teamsMap[winnerName] ?? null;
}

function getTeamFromGame(
  game: GameRecord | undefined,
  teamsMap: Record<string, string>,
): { isoCode: string; team: string }[] {
  if (!game) {
    return [];
  }

  const homeIsoCode = teamsMap[game.home_team_name_en];
  const awayIsoCode = teamsMap[game.away_team_name_en];

  if (!homeIsoCode || !awayIsoCode) {
    return [];
  }

  return [
    {
      isoCode: homeIsoCode,
      team: game.home_team_name_en,
    },
    {
      isoCode: awayIsoCode,
      team: game.away_team_name_en,
    },
  ];
}

export async function fetchLiveDrawState(): Promise<{
  state: DrawState;
  positions: DrawPosition[];
}> {
  const [teamsResponse, gamesResponse] = await Promise.all([
    fetch(`${WORLD_CUP_26_BASE_PATH}/get/teams`),
    fetch(`${WORLD_CUP_26_BASE_PATH}/get/games`),
  ]);

  if (!teamsResponse.ok) {
    throw new Error("Failed to load team data.");
  }

  if (!gamesResponse.ok) {
    throw new Error("Failed to load game data.");
  }

  const [teamsData, gamesData]: [
    { teams: TeamRecord[] },
    { games: GameRecord[] },
  ] = await Promise.all([teamsResponse.json(), gamesResponse.json()]);

  const teamsMap = teamsData.teams.reduce<Record<string, string>>(
    (acc, { fifa_code, name_en }) => {
      acc[name_en] = fifa_code;
      return acc;
    },
    {},
  );

  const winners: Record<string, string> = {};
  const positions: DrawPosition[] = [];
  let r32PairIndex = 0;

  for (const [type, ringIndex] of Object.entries(TYPE_TO_RING_INDEX)) {
    const games = gamesData.games.filter((game) => game.type === type);

    games.forEach((game, pairIndex) => {
      if (type === "r16") {
        const homeTeamId = game.home_team_label.substring(13);
        const awayTeamId = game.away_team_label.substring(13);
        const homeTeam = gamesData.games.find(({ id }) => id === homeTeamId);
        const awayTeam = gamesData.games.find(({ id }) => id === awayTeamId);
        const orderedTeams = [
          ...getTeamFromGame(homeTeam, teamsMap),
          ...getTeamFromGame(awayTeam, teamsMap),
        ];

        orderedTeams.forEach((team) => {
          const position = positions.length;
          positions.push({
            position,
            pair: pairIndex + 1,
            isoCode: team.isoCode,
            team: team.team,
          });
        });

        const homeSourceWinner = getWinnerIsoCode(homeTeam ?? game, teamsMap);
        if (homeSourceWinner) {
          winners[`0-pair-${r32PairIndex}`] = homeSourceWinner;
        }
        r32PairIndex += 1;

        const awaySourceWinner = getWinnerIsoCode(awayTeam ?? game, teamsMap);
        if (awaySourceWinner) {
          winners[`0-pair-${r32PairIndex}`] = awaySourceWinner;
        }
        r32PairIndex += 1;
      }

      const winnerIsoCode = getWinnerIsoCode(game, teamsMap);
      if (!winnerIsoCode) {
        return;
      }

      winners[`${ringIndex}-pair-${pairIndex}`] = winnerIsoCode;
    });
  }

  return {
    state: { v: 1, winners },
    positions,
  };
}
