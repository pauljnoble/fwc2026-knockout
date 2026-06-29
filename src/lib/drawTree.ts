export type DrawPosition = {
  position: number
  pair: number
  isoCode: string
  team: string | null
}

export const RING_COUNTS = [32, 32, 16, 8, 4, 2] as const

export const PLAYABLE_RINGS = [0, 2, 3, 4, 5] as const

export type PlayableRing = (typeof PLAYABLE_RINGS)[number]

export const NEXT_RING: Record<PlayableRing, number | null> = {
  0: 2,
  2: 3,
  3: 4,
  4: 5,
  5: null,
}

export type Team = {
  isoCode: string
  name: string
}

export function slotKey(ringIndex: number, slotIndex: number): string {
  return `${ringIndex}-${slotIndex}`
}

export function pairKey(ringIndex: number, pairIndex: number): string {
  return `${ringIndex}-pair-${pairIndex}`
}

export function getPairIndices(_ringIndex: number, pairIndex: number): [number, number] {
  return [pairIndex * 2, pairIndex * 2 + 1]
}

export function getPairCount(ringIndex: number): number {
  return RING_COUNTS[ringIndex] / 2
}

export function getPairIndex(slotIndex: number): number {
  return Math.floor(slotIndex / 2)
}

export function isPlayableRing(ringIndex: number): ringIndex is PlayableRing {
  return PLAYABLE_RINGS.includes(ringIndex as PlayableRing)
}

function teamFromPosition(position: DrawPosition): Team {
  return {
    isoCode: position.isoCode,
    name: position.team ?? position.isoCode,
  }
}

export function createInitialSlotTeams(positions: DrawPosition[]): Record<string, Team> {
  const slots: Record<string, Team> = {}

  positions.forEach((position, index) => {
    slots[slotKey(0, index)] = teamFromPosition(position)
  })

  return slots
}

export function deriveSlotTeams(
  positions: DrawPosition[],
  pairWinners: Record<string, Team>,
): Record<string, Team> {
  const slots = createInitialSlotTeams(positions)

  for (const ringIndex of PLAYABLE_RINGS) {
    const pairCount = getPairCount(ringIndex)

    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const winner = pairWinners[pairKey(ringIndex, pairIndex)]
      if (!winner) {
        continue
      }

      const [slotA, slotB] = getPairIndices(ringIndex, pairIndex)
      const teamA = slots[slotKey(ringIndex, slotA)]
      const teamB = slots[slotKey(ringIndex, slotB)]

      if (!teamA || !teamB) {
        continue
      }

      const winnerInPair =
        winner.isoCode === teamA.isoCode || winner.isoCode === teamB.isoCode

      if (!winnerInPair) {
        continue
      }

      const nextRing = NEXT_RING[ringIndex]
      if (nextRing === null) {
        continue
      }

      slots[slotKey(nextRing, pairIndex)] = winner
    }
  }

  return slots
}

export function prunePairWinners(
  positions: DrawPosition[],
  pairWinners: Record<string, Team>,
): Record<string, Team> {
  const slots = createInitialSlotTeams(positions)
  const validWinners: Record<string, Team> = {}

  for (const ringIndex of PLAYABLE_RINGS) {
    const pairCount = getPairCount(ringIndex)

    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const winner = pairWinners[pairKey(ringIndex, pairIndex)]
      if (!winner) {
        continue
      }

      const [slotA, slotB] = getPairIndices(ringIndex, pairIndex)
      const teamA = slots[slotKey(ringIndex, slotA)]
      const teamB = slots[slotKey(ringIndex, slotB)]

      if (!teamA || !teamB) {
        continue
      }

      const winnerInPair =
        winner.isoCode === teamA.isoCode || winner.isoCode === teamB.isoCode

      if (!winnerInPair) {
        continue
      }

      validWinners[pairKey(ringIndex, pairIndex)] = winner

      const nextRing = NEXT_RING[ringIndex]
      if (nextRing !== null) {
        slots[slotKey(nextRing, pairIndex)] = winner
      }
    }
  }

  return validWinners
}

export function selectPairWinner(
  positions: DrawPosition[],
  pairWinners: Record<string, Team>,
  ringIndex: PlayableRing,
  pairIndex: number,
  team: Team,
): Record<string, Team> {
  const updated = {
    ...pairWinners,
    [pairKey(ringIndex, pairIndex)]: team,
  }

  return prunePairWinners(positions, updated)
}

export function canSelectPair(
  ringIndex: PlayableRing,
  pairIndex: number,
  slotTeams: Record<string, Team>,
  blockedSlots: ReadonlySet<string> = new Set(),
): boolean {
  const [slotA, slotB] = getPairIndices(ringIndex, pairIndex)
  const keyA = slotKey(ringIndex, slotA)
  const keyB = slotKey(ringIndex, slotB)

  return Boolean(
    slotTeams[keyA] &&
    slotTeams[keyB] &&
    !blockedSlots.has(keyA) &&
    !blockedSlots.has(keyB),
  )
}

export function getPairWinner(
  ringIndex: PlayableRing,
  pairIndex: number,
  pairWinners: Record<string, Team>,
): Team | null {
  return pairWinners[pairKey(ringIndex, pairIndex)] ?? null
}

export function getTeamState(
  ringIndex: PlayableRing,
  slotIndex: number,
  slotTeams: Record<string, Team>,
  pairWinners: Record<string, Team>,
): 'idle' | 'winner' | 'eliminated' {
  const pairIndex = getPairIndex(slotIndex)
  const winner = getPairWinner(ringIndex, pairIndex, pairWinners)

  if (!winner) {
    return 'idle'
  }

  const team = slotTeams[slotKey(ringIndex, slotIndex)]
  if (!team) {
    return 'idle'
  }

  return team.isoCode === winner.isoCode ? 'winner' : 'eliminated'
}
