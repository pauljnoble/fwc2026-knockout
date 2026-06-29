import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { buildAdvancePath, type PathPoint } from "../lib/advancePaths";
import {
  canSelectPair,
  deriveSlotTeams,
  getPairIndex,
  getPairWinner,
  getTeamState,
  isPlayableRing,
  NEXT_RING,
  RING_COUNTS,
  pairKey,
  selectPairWinner,
  slotKey,
  type DrawPosition,
  type PlayableRing,
  type Team,
} from "../lib/drawTree";
import { useHoverIntent } from "../hooks/useHoverIntent";
import { TeamFlag } from "./TeamFlag";
import { AdvanceAnimator } from "./TravelingTeam";
import "./CirclePoints.css";

export type { DrawPosition } from "../lib/drawTree";

const RING_RADII = [50, 40.5, 31, 22, 13.5, 5.5] as const;
const OUTER_RING_DIAMETER_EXPANSION_PX = 8;

type CirclePointsProps = {
  positions: DrawPosition[];
  pairWinners: Record<string, Team>;
  onPairWinnersChange: (pairWinners: Record<string, Team>) => void;
};

type AdvancingTeam = {
  id: string;
  team: Team;
  pathD: string;
  startPosition: Point;
  sourceSlotKey: string;
  targetSlotKey: string;
};

type Point = {
  id: string;
  x: number;
  y: number;
};

function computeRingOffsets() {
  const offsets: number[] = [];

  for (let ringIndex = 0; ringIndex < RING_COUNTS.length; ringIndex++) {
    const count = RING_COUNTS[ringIndex];
    const step = (2 * Math.PI) / count;

    if (ringIndex === 0) {
      offsets.push(step / 2);
      continue;
    }

    const prevCount = RING_COUNTS[ringIndex - 1];
    const prevOffset = offsets[ringIndex - 1];
    const prevStep = (2 * Math.PI) / prevCount;

    if (count === prevCount) {
      offsets.push(prevOffset);
      continue;
    }

    offsets.push(prevOffset + prevStep / 2);
  }

  return offsets;
}

const RING_OFFSETS = computeRingOffsets();

function getRingRadius(ringIndex: number, expansionOffset = 0) {
  return (
    (RING_RADII[ringIndex] ?? RING_RADII[RING_RADII.length - 1]) +
    expansionOffset
  );
}

function getRingPoints(
  count: number,
  ringIndex: number,
  expansionOffset = 0,
): Point[] {
  const radius = getRingRadius(ringIndex, expansionOffset);
  const offset = RING_OFFSETS[ringIndex];

  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count + offset;

    return {
      id: `${ringIndex}-${index}`,
      x: 50 + radius * Math.sin(angle),
      y: 50 - radius * Math.cos(angle),
    };
  });
}

function buildRings(expansionOffset = 0) {
  return RING_COUNTS.map((count, ringIndex) => ({
    count,
    ringIndex,
    points: getRingPoints(count, ringIndex, expansionOffset),
  }));
}

function getPairArcPath(from: Point, to: Point, radius: number): string {
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 0 1 ${to.x} ${to.y}`;
}

function getRingClassName(ringIndex: number): string {
  if (ringIndex === 0) {
    return "circle-points__ring circle-points__ring--first";
  }

  if (ringIndex === 1) {
    return "circle-points__ring circle-points__ring--second";
  }

  if (ringIndex === 2) {
    return "circle-points__ring circle-points__ring--playable";
  }

  if (ringIndex === 3) {
    return "circle-points__ring circle-points__ring--playable-inner";
  }

  if (ringIndex === 4) {
    return "circle-points__ring circle-points__ring--playable-final";
  }

  if (ringIndex === 5) {
    return "circle-points__ring circle-points__ring--playable-championship";
  }

  return "circle-points__ring";
}

const TOOLTIP_EDGE_THRESHOLD = 72;

function getTooltipSide(pointX: number): "left" | "right" {
  const onRightSide = pointX >= 50;

  if (onRightSide) {
    return pointX > TOOLTIP_EDGE_THRESHOLD ? "right" : "left";
  }

  return pointX < 100 - TOOLTIP_EDGE_THRESHOLD ? "left" : "right";
}

type FlagWithTooltipProps = {
  team: Team;
  side: "left" | "right";
  inactive?: boolean;
  beatBy?: Team | null;
};

function FlagWithTooltip({
  team,
  side,
  inactive = false,
  beatBy,
}: FlagWithTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [focusedVisible, setFocusedVisible] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const {
    active: hoverVisible,
    onMouseEnter,
    onMouseLeave,
    showImmediately,
    hideImmediately,
  } = useHoverIntent();
  const tooltipText = beatBy
    ? `${team.name} — lost to ${beatBy.name}`
    : team.name;
  const visible = hoverVisible || focusedVisible;

  const updateTooltipPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const gap = 8;

    if (side === "right") {
      setTooltipStyle({
        top: rect.top + rect.height / 2,
        left: rect.right + gap,
        transform: "translateY(-50%)",
      });
      return;
    }

    setTooltipStyle({
      top: rect.top + rect.height / 2,
      left: rect.left - gap,
      transform: "translate(-100%, -50%)",
    });
  }, [side]);

  useLayoutEffect(() => {
    if (!visible) {
      setIsPositioned(false);
      return;
    }

    updateTooltipPosition();
    setIsPositioned(true);

    window.addEventListener("scroll", updateTooltipPosition, true);
    window.addEventListener("resize", updateTooltipPosition);

    return () => {
      window.removeEventListener("scroll", updateTooltipPosition, true);
      window.removeEventListener("resize", updateTooltipPosition);
    };
  }, [visible, updateTooltipPosition]);

  useEffect(() => {
    const button = anchorRef.current?.closest("button");
    if (!button) {
      return;
    }

    const handleFocusIn = () => {
      if (button.matches(":focus-visible")) {
        showImmediately();
        setFocusedVisible(true);
      }
    };

    const handleFocusOut = () => {
      hideImmediately();
      setFocusedVisible(false);
    };

    button.addEventListener("focusin", handleFocusIn);
    button.addEventListener("focusout", handleFocusOut);

    return () => {
      button.removeEventListener("focusin", handleFocusIn);
      button.removeEventListener("focusout", handleFocusOut);
    };
  }, [hideImmediately, showImmediately]);

  return (
    <>
      <span
        ref={anchorRef}
        className={`circle-points__flag-tooltip circle-points__flag-tooltip--${side}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <span
          className={`circle-points__flag-stack${inactive ? " circle-points__flag-stack--inactive" : ""}`}
        >
          <TeamFlag
            team={team}
            className="circle-points__flag circle-points__flag--active"
          />
          <TeamFlag
            team={team}
            className="circle-points__flag circle-points__flag--inactive"
          />
        </span>
      </span>
      {visible
        ? createPortal(
            <span
              className={`circle-points__tooltip${isPositioned ? " circle-points__tooltip--visible" : ""} circle-points__tooltip--${side}`}
              style={tooltipStyle}
              role="tooltip"
            >
              {tooltipText}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

function getPairArcMidpoint(
  pairIndex: number,
  ringIndex: number,
  expansionOffset = 0,
) {
  const count = RING_COUNTS[ringIndex];
  const radius = getRingRadius(ringIndex, expansionOffset);
  const offset = RING_OFFSETS[ringIndex];
  const step = (2 * Math.PI) / count;
  const angle = (pairIndex * 2 + 0.5) * step + offset;

  return {
    x: 50 + radius * Math.sin(angle),
    y: 50 - radius * Math.cos(angle),
  };
}

export function CirclePoints({
  positions,
  pairWinners,
  onPairWinnersChange,
}: CirclePointsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ringRadiusOffset, setRingRadiusOffset] = useState(0);
  const [advancingTeams, setAdvancingTeams] = useState<AdvancingTeam[]>([]);
  const [travelPositions, setTravelPositions] = useState<
    Record<string, PathPoint>
  >({});
  const slotTeams = useMemo(
    () => deriveSlotTeams(positions, pairWinners),
    [positions, pairWinners],
  );
  const pendingSlots = useMemo(
    () => new Set(advancingTeams.map((advance) => advance.targetSlotKey)),
    [advancingTeams],
  );
  const advancingFromSlots = useMemo(
    () => new Set(advancingTeams.map((advance) => advance.sourceSlotKey)),
    [advancingTeams],
  );
  const blockedSlots = useMemo(() => {
    const blocked = new Set<string>();

    for (const key of pendingSlots) {
      blocked.add(key);
    }

    for (const key of advancingFromSlots) {
      blocked.add(key);
    }

    return blocked;
  }, [pendingSlots, advancingFromSlots]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateOffset = () => {
      const width = container.getBoundingClientRect().width;
      if (width <= 0) {
        return;
      }

      setRingRadiusOffset((OUTER_RING_DIAMETER_EXPANSION_PX / 2 / width) * 100);
    };

    updateOffset();
    const observer = new ResizeObserver(updateOffset);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const rings = useMemo(() => buildRings(ringRadiusOffset), [ringRadiusOffset]);
  const ringGeometry = useMemo(
    () => buildRings(ringRadiusOffset).map((ring) => ring.points),
    [ringRadiusOffset],
  );
  const pendingTargetPoints = useMemo(
    () =>
      advancingTeams.flatMap((advance) => {
        const match = advance.targetSlotKey.match(/^(\d+)-(\d+)$/);
        if (!match) {
          return [];
        }

        const ringIndex = Number(match[1]);
        const slotIndex = Number(match[2]);
        const point = ringGeometry[ringIndex]?.[slotIndex];

        if (!point) {
          return [];
        }

        return [
          {
            key: advance.targetSlotKey,
            point,
          },
        ];
      }),
    [advancingTeams, ringGeometry],
  );

  useEffect(() => {
    setAdvancingTeams((current) =>
      current.filter(
        (advance) =>
          slotTeams[advance.targetSlotKey]?.isoCode === advance.team.isoCode,
      ),
    );
  }, [slotTeams]);

  const firstRing = rings[0].points;
  const secondRing = rings[1].points;
  const thirdRing = rings[2].points;
  const fourthRing = rings[3].points;
  const fifthRing = rings[4].points;
  const sixthRing = rings[5].points;
  const secondRingRadius = getRingRadius(1, ringRadiusOffset);
  const thirdRingRadius = getRingRadius(2, ringRadiusOffset);
  const fourthRingRadius = getRingRadius(3, ringRadiusOffset);
  const fifthRingRadius = getRingRadius(4, ringRadiusOffset);
  const pairCount = secondRing.length / 2;
  const thirdRingPairCount = thirdRing.length / 2;
  const fourthRingPairCount = fourthRing.length / 2;
  const fifthRingPairCount = fifthRing.length / 2;
  const { passedPairs, advancingPairs } = useMemo(() => {
    const advancing = new Set<string>();
    const passed = new Set<string>();

    for (const advance of advancingTeams) {
      const match = advance.sourceSlotKey.match(/^(\d+)-(\d+)$/);
      if (!match) {
        continue;
      }

      const ringIndex = Number(match[1]);
      const slotIndex = Number(match[2]);

      if (isPlayableRing(ringIndex)) {
        advancing.add(pairKey(ringIndex, getPairIndex(slotIndex)));
      }
    }

    for (const ringIndex of [0, 2, 3, 4, 5] as const) {
      const pairCount = RING_COUNTS[ringIndex] / 2;

      for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
        const key = pairKey(ringIndex, pairIndex);
        if (pairWinners[key] && !advancing.has(key)) {
          passed.add(key);
        }
      }
    }

    return { passedPairs: passed, advancingPairs: advancing };
  }, [pairWinners, advancingTeams]);

  const handleAdvanceComplete = useCallback((advanceId: string) => {
    setAdvancingTeams((current) =>
      current.filter((advance) => advance.id !== advanceId),
    );
  }, []);

  const handleTravelPositionChange = useCallback(
    (sourceSlotKey: string, position: PathPoint | null) => {
      setTravelPositions((current) => {
        if (position === null) {
          if (!(sourceSlotKey in current)) {
            return current;
          }

          const next = { ...current };
          delete next[sourceSlotKey];
          return next;
        }

        const existing = current[sourceSlotKey];
        if (
          existing &&
          existing.x === position.x &&
          existing.y === position.y
        ) {
          return current;
        }

        return { ...current, [sourceSlotKey]: position };
      });
    },
    [],
  );

  function handleTeamSelect(ringIndex: PlayableRing, slotIndex: number) {
    const pairIndex = getPairIndex(slotIndex);
    const team = slotTeams[`${ringIndex}-${slotIndex}`];

    if (
      !team ||
      !canSelectPair(ringIndex, pairIndex, slotTeams, blockedSlots)
    ) {
      return;
    }

    onPairWinnersChange(
      selectPairWinner(positions, pairWinners, ringIndex, pairIndex, team),
    );

    const nextRing = NEXT_RING[ringIndex];
    if (nextRing === null) {
      return;
    }

    const targetSlotKey = slotKey(nextRing, pairIndex);
    const sourceSlotKey = slotKey(ringIndex, slotIndex);
    const pathD = buildAdvancePath({
      ringIndex,
      winnerSlotIndex: slotIndex,
      ringPoints: ringGeometry,
      getRingRadius: (ringIndex) => getRingRadius(ringIndex, ringRadiusOffset),
      getPairArcMidpoint: (pairIndex, ringIndex) =>
        getPairArcMidpoint(pairIndex, ringIndex, ringRadiusOffset),
    });

    if (!pathD) {
      return;
    }

    const startPosition = ringGeometry[ringIndex][slotIndex];

    setAdvancingTeams((current) => [
      ...current.filter((advance) => advance.targetSlotKey !== targetSlotKey),
      {
        id: `${targetSlotKey}-${team.isoCode}-${Date.now()}`,
        team,
        pathD,
        startPosition,
        sourceSlotKey,
        targetSlotKey,
      },
    ]);
  }

  function renderPoint(ringIndex: number, point: Point, slotIndex: number) {
    const isFirstRing = ringIndex === 0;
    const isPlayable = isPlayableRing(ringIndex);
    const currentSlotKey = slotKey(ringIndex, slotIndex);

    if (pendingSlots.has(currentSlotKey)) {
      return null;
    }
    const actualTeam = slotTeams[currentSlotKey];
    const pairIndex = getPairIndex(slotIndex);
    const teamState =
      isPlayable && actualTeam
        ? getTeamState(ringIndex, slotIndex, slotTeams, pairWinners)
        : "idle";
    const isAdvancing = advancingFromSlots.has(currentSlotKey);
    const isWinner = teamState === "winner";
    const isChampionshipRing = ringIndex === 5;
    const championshipSettled = Boolean(
      isChampionshipRing && getPairWinner(5, pairIndex, pairWinners),
    );
    const showChampionshipWinner =
      isChampionshipRing && isWinner && championshipSettled;
    const travelPosition = travelPositions[currentSlotKey];
    const isTraveling = isAdvancing && Boolean(travelPosition);
    const showTeamDot = Boolean(
      actualTeam &&
      (isFirstRing || isPlayable) &&
      (!isWinner || showChampionshipWinner) &&
      !isAdvancing,
    );
    const showStructuralDot = !showTeamDot && !isFirstRing;
    const shouldRenderFlag = Boolean(
      actualTeam &&
      (isFirstRing || isPlayable) &&
      (!isWinner || isAdvancing || showChampionshipWinner) &&
      !isTraveling,
    );
    const isSelectable =
      isPlayable &&
      Boolean(actualTeam) &&
      teamState !== "winner" &&
      !blockedSlots.has(currentSlotKey) &&
      canSelectPair(ringIndex, pairIndex, slotTeams, blockedSlots);

    const isPairPassedOrAdvancing =
      passedPairs.has(pairKey(ringIndex, pairIndex)) ||
      advancingPairs.has(pairKey(ringIndex, pairIndex));
    const isDotPassed =
      isPairPassedOrAdvancing &&
      (isFirstRing || (isPlayable && showStructuralDot));
    const pointClasses = [
      "circle-points__point",
      isFirstRing ? "circle-points__point--first-slot" : "",
      !isFirstRing && showTeamDot ? "circle-points__point--team" : "",
      isSelectable ? "circle-points__point--selectable" : "",
      isDotPassed ? "circle-points__point--passed" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const tooltipSide = getTooltipSide(point.x);
    const pointStyle: CSSProperties = {
      left: `${point.x}%`,
      top: `${point.y}%`,
    };
    const beatBy =
      teamState === "eliminated"
        ? getPairWinner(ringIndex as PlayableRing, pairIndex, pairWinners)
        : null;
    const flagElement = shouldRenderFlag ? (
      <FlagWithTooltip
        team={actualTeam}
        side={tooltipSide}
        inactive={teamState === "eliminated"}
        beatBy={beatBy}
      />
    ) : null;
    const selectLabel = `Select ${actualTeam?.name ?? actualTeam?.isoCode}`;
    const handleSelect = () =>
      handleTeamSelect(ringIndex as PlayableRing, slotIndex);
    const flagButtonClasses = "circle-points__flag-button";

    if (isFirstRing) {
      return (
        <span key={point.id} className={pointClasses} style={pointStyle}>
          <span className="circle-points__dot-marker" aria-hidden="true" />
          {flagElement ? (
            <button
              type="button"
              className={flagButtonClasses}
              disabled={!isSelectable}
              aria-pressed={false}
              aria-label={selectLabel}
              onClick={isSelectable ? handleSelect : undefined}
            >
              {flagElement}
            </button>
          ) : null}
        </span>
      );
    }

    if (showTeamDot) {
      return (
        <button
          key={point.id}
          type="button"
          className={pointClasses}
          style={pointStyle}
          disabled={!isSelectable}
          aria-pressed={false}
          aria-label={selectLabel}
          onClick={isSelectable ? handleSelect : undefined}
        >
          {flagElement}
        </button>
      );
    }

    return <span key={point.id} className={pointClasses} style={pointStyle} />;
  }

  return (
    <div className="circle-points" ref={containerRef}>
      <svg
        className="circle-points__connector"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        {firstRing.map((from, index) => {
          const to = secondRing[index];
          return (
            <line
              key={`connector-${index}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
        {Array.from({ length: pairCount }, (_, pairIndex) => {
          const from = secondRing[pairIndex * 2];
          const to = secondRing[pairIndex * 2 + 1];
          return (
            <path
              key={`pair-arc-${pairIndex}`}
              d={getPairArcPath(from, to, secondRingRadius)}
            />
          );
        })}
        {Array.from({ length: pairCount }, (_, pairIndex) => {
          const from = getPairArcMidpoint(pairIndex, 1, ringRadiusOffset);
          const to = thirdRing[pairIndex];
          return (
            <line
              key={`pair-third-${pairIndex}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
        {Array.from({ length: thirdRingPairCount }, (_, pairIndex) => {
          const from = thirdRing[pairIndex * 2];
          const to = thirdRing[pairIndex * 2 + 1];
          return (
            <path
              key={`third-pair-arc-${pairIndex}`}
              d={getPairArcPath(from, to, thirdRingRadius)}
            />
          );
        })}
        {Array.from({ length: thirdRingPairCount }, (_, pairIndex) => {
          const from = getPairArcMidpoint(pairIndex, 2, ringRadiusOffset);
          const to = fourthRing[pairIndex];
          return (
            <line
              key={`third-fourth-${pairIndex}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
        {Array.from({ length: fourthRingPairCount }, (_, pairIndex) => {
          const from = fourthRing[pairIndex * 2];
          const to = fourthRing[pairIndex * 2 + 1];
          return (
            <path
              key={`fourth-pair-arc-${pairIndex}`}
              d={getPairArcPath(from, to, fourthRingRadius)}
            />
          );
        })}
        {Array.from({ length: fourthRingPairCount }, (_, pairIndex) => {
          const from = getPairArcMidpoint(pairIndex, 3, ringRadiusOffset);
          const to = fifthRing[pairIndex];
          return (
            <line
              key={`fourth-fifth-${pairIndex}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
        {Array.from({ length: fifthRingPairCount }, (_, pairIndex) => {
          const from = fifthRing[pairIndex * 2];
          const to = fifthRing[pairIndex * 2 + 1];
          return (
            <path
              key={`fifth-pair-arc-${pairIndex}`}
              d={getPairArcPath(from, to, fifthRingRadius)}
            />
          );
        })}
        {Array.from({ length: fifthRingPairCount }, (_, pairIndex) => {
          const from = getPairArcMidpoint(pairIndex, 4, ringRadiusOffset);
          const to = sixthRing[pairIndex];
          return (
            <line
              key={`fifth-sixth-${pairIndex}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
      </svg>
      <div className="circle-points__trophy" aria-hidden="true">
        <picture>
          <source
            srcSet="/img/trophy-dm.png"
            media="(prefers-color-scheme: dark)"
          />
          <img src="/img/trophy-lm.png" alt="" />
        </picture>
      </div>
      {rings.map((ring) => (
        <div key={ring.ringIndex} className={getRingClassName(ring.ringIndex)}>
          {ring.points.map((point, slotIndex) =>
            ring.ringIndex === 1
              ? null
              : renderPoint(ring.ringIndex, point, slotIndex),
          )}
        </div>
      ))}
      <div className="circle-points__pending-target-layer" aria-hidden="true">
        {pendingTargetPoints.map(({ key, point }) => (
          <span
            key={key}
            className="circle-points__point circle-points__point--pending-target"
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
            }}
          />
        ))}
      </div>
      <div className="circle-points__traveling-layer" aria-hidden="true">
        {advancingTeams.map((advance) => {
          const position = travelPositions[advance.sourceSlotKey];
          if (!position) {
            return null;
          }

          return (
            <span
              key={`traveling-flag-${advance.id}`}
              className="circle-points__traveling-flag"
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
              }}
            >
              <TeamFlag team={advance.team} className="circle-points__flag" />
            </span>
          );
        })}
        {advancingTeams.map((advance) => (
          <AdvanceAnimator
            key={advance.id}
            sourceSlotKey={advance.sourceSlotKey}
            pathD={advance.pathD}
            startPosition={advance.startPosition}
            onPositionChange={handleTravelPositionChange}
            onComplete={() => handleAdvanceComplete(advance.id)}
          />
        ))}
      </div>
    </div>
  );
}
