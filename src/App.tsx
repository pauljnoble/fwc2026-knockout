import { useCallback, useEffect, useRef, useState } from "react";
import {
  CirclePoints,
  type DrawPosition,
  type Point,
} from "./components/CirclePoints";
import { parseDrawState, serializeDrawState } from "./lib/drawState";
import {
  getShareIdFromUrl,
  loadDrawState,
  uploadDrawState,
} from "./lib/shareDraw";
import { fetchLiveDrawState } from "./lib/live-draw-state";
import {
  getPairIndex,
  getPairWinner,
  isPlayableRing,
  selectPairWinner,
  type PlayableRing,
  type Team,
} from "./lib/drawTree";
import "./App.css";

export type AdvanceMove = {
  id: string;
  team: Team;
  pathD: string;
  startPosition: Point;
  sourceSlotKey: string;
  targetSlotKey: string;
};

function isDebugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function App() {
  const showDebugPanel = isDebugEnabled();
  const shareId = getShareIdFromUrl();
  const [pairWinners, setPairWinners] = useState({});
  const [drawKey, setDrawKey] = useState(0);
  const [debugDraft, setDebugDraft] = useState("");
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isLoadingShare, setIsLoadingShare] = useState(Boolean(shareId));
  const [shareLoadError, setShareLoadError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [activeUndoMove, setActiveUndoMove] = useState<AdvanceMove | null>(
    null,
  );
  const moveHistoryRef = useRef<AdvanceMove[]>([]);
  const basePairWinnersRef = useRef<Record<string, Team> | null>(null);
  const drawPositionsRef = useRef<DrawPosition[] | null>(null);
  const beatByScoresRef = useRef<Record<string, string>>({});
  const lastChampionshipWinnerIsoRef = useRef<string | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);

  const hasChanges = pairWinners ? Object.keys(pairWinners).length > 0 : false;
  const canUndo = Boolean(moveHistoryRef.current.length > 0);
  const isUndoAnimating = activeUndoMove !== null;
  const championshipWinner = getPairWinner(5, 0, pairWinners);

  useEffect(() => {
    const nextWinnerIso = championshipWinner?.isoCode ?? null;

    if (nextWinnerIso && nextWinnerIso !== lastChampionshipWinnerIsoRef.current) {
      setConfettiKey((current) => current + 1);
    }

    lastChampionshipWinnerIsoRef.current = nextWinnerIso;
  }, [championshipWinner]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { state, positions, beatByScores } = await fetchLiveDrawState();
        drawPositionsRef.current = positions;
        beatByScoresRef.current = beatByScores;
        const result = parseDrawState(JSON.stringify(state), positions);

        if ("error" in result) {
          console.error(result.error);
          return;
        }

        basePairWinnersRef.current = result.pairWinners;
        setPairWinners(shareId ? {} : basePairWinnersRef.current);
      } catch (e) {
        console.error(e);
      }
    };
    fetchData();
  }, [shareId]);

  useEffect(() => {
    if (!shareId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const json = await loadDrawState(shareId);
        const result = parseDrawState(json, drawPositionsRef.current);

        if (cancelled) {
          return;
        }

        if ("error" in result) {
          setShareLoadError(result.error);
          return;
        }

        setPairWinners(result.pairWinners);
        basePairWinnersRef.current = result.pairWinners;
        setDrawKey((current) => current + 1);
        moveHistoryRef.current = [];
        setActiveUndoMove(null);
      } catch (error) {
        if (!cancelled) {
          setShareLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load shared draw.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingShare(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const handleCopyState = useCallback(async () => {
    const serialized = pairWinners ? serializeDrawState(pairWinners) : "";
    setDebugDraft(serialized);
    setDebugMessage(null);

    try {
      await navigator.clipboard.writeText(serialized);
      setDebugMessage("Copied to clipboard.");
    } catch {
      setDebugMessage("State updated in textarea (clipboard unavailable).");
    }
  }, [pairWinners]);

  const handleLoadState = useCallback(() => {
    const result = parseDrawState(debugDraft, drawPositionsRef.current);

    if ("error" in result) {
      setDebugMessage(result.error);
      return;
    }

    setPairWinners(result.pairWinners);
    basePairWinnersRef.current = result.pairWinners;
    setDrawKey((current) => current + 1);
    moveHistoryRef.current = [];
    setActiveUndoMove(null);
    setDebugMessage("State loaded.");
  }, [debugDraft]);

  const handleReset = useCallback(() => {
    setPairWinners(
      shareId
        ? {}
        : basePairWinnersRef.current
          ? basePairWinnersRef.current
          : {},
    );
    basePairWinnersRef.current = {};
    lastChampionshipWinnerIsoRef.current = null;
    setDrawKey((current) => current + 1);
    setDebugDraft("");
    setDebugMessage(null);
    setShowShareModal(false);
    moveHistoryRef.current = [];
    setActiveUndoMove(null);
  }, []);

  const handleResetState = useCallback(() => {
    handleReset();
    setDebugMessage("Draw reset.");
  }, [handleReset]);

  const handleShare = useCallback(async () => {
    setShowShareModal(true);
    setShareLink(null);
    setShareError(null);
    setShareCopied(false);
    setIsSharing(true);

    try {
      const id = await uploadDrawState(serializeDrawState(pairWinners));
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("share", id);
      setShareLink(url.toString());
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Failed to share draw.",
      );
    } finally {
      setIsSharing(false);
    }
  }, [pairWinners]);

  const closeShareModal = useCallback(() => {
    setShowShareModal(false);
    setShareLink(null);
    setShareError(null);
    setShareCopied(false);
  }, []);

  const handleUndo = useCallback(() => {
    if (activeUndoMove) {
      return;
    }

    const latestMove = moveHistoryRef.current.pop();
    if (!latestMove) {
      return;
    }

    setActiveUndoMove(latestMove);
  }, [activeUndoMove]);

  const handleReverseMoveComplete = useCallback(() => {
    if (!activeUndoMove) {
      return;
    }

    const nextState = moveHistoryRef.current.reduce((current, move) => {
      const match = move.sourceSlotKey.match(/^(\d+)-(\d+)$/);
      if (!match) {
        return current;
      }

      const ringIndex = Number(match[1]);
      const slotIndex = Number(match[2]);
      if (!isPlayableRing(ringIndex)) {
        return current;
      }

      return selectPairWinner(
        drawPositionsRef.current,
        current,
        ringIndex as PlayableRing,
        getPairIndex(slotIndex),
        move.team,
      );
    }, basePairWinnersRef.current);

    setPairWinners(nextState ?? {});
    setActiveUndoMove(null);
  }, [activeUndoMove]);

  const handleMoveCreated = useCallback((move: AdvanceMove) => {
    moveHistoryRef.current.push(move);
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  }, [shareLink]);

  return (
    <main className="app">
      <aside className="app-sidebar">
        <h1 className="app-sidebar__title">World Cup 2026 Knockout Phase</h1>
        <p className="app-sidebar__text">
          Interactive visualization based on an{" "}
          <a
            target="_blank"
            href="https://x.com/mkobach/status/2071353471295430705"
            rel="noopener noreferrer"
          >
            original design
          </a>
          .
        </p>

        <div className="app-sidebar__actions">
          <button
            type="button"
            className="app-action-btn"
            disabled={!canUndo || isSharing || isUndoAnimating}
            onClick={handleUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="app-action-btn"
            disabled={!hasChanges || isSharing}
            onClick={handleShare}
          >
            Share
          </button>
          <button
            type="button"
            className="app-action-btn"
            onClick={handleReset}
          >
            Reset
          </button>
        </div>

        {isLoadingShare ? (
          <p className="app-sidebar__share-message" role="status">
            Loading shared draw…
          </p>
        ) : shareLoadError ? (
          <p
            className="app-sidebar__share-message app-sidebar__share-message--error"
            role="alert"
          >
            {shareLoadError}
          </p>
        ) : null}

        {showDebugPanel && (
          <section className="app-sidebar__debug" aria-label="Debug panel">
            <h2 className="app-sidebar__debug-title">Debug</h2>
            <p className="app-sidebar__debug-help">
              Copy the current draw, paste a saved state, then load it.
            </p>
            <textarea
              className="app-sidebar__debug-input"
              value={debugDraft}
              onChange={(event) => {
                setDebugDraft(event.target.value);
                setDebugMessage(null);
              }}
              rows={12}
              spellCheck={false}
              placeholder='{"v":1,"winners":{"0-pair-0":"CAN"}}'
            />
            <div className="app-sidebar__debug-actions">
              <button type="button" onClick={handleCopyState}>
                Copy current
              </button>
              <button type="button" onClick={handleLoadState}>
                Load
              </button>
              <button type="button" onClick={handleResetState}>
                Reset
              </button>
            </div>
            {debugMessage ? (
              <p className="app-sidebar__debug-message" role="status">
                {debugMessage}
              </p>
            ) : null}
          </section>
        )}
      </aside>
      <div className="app-main">
        {isLoadingShare ? (
          <p className="app-main__loading" role="status">
            Loading shared draw
          </p>
        ) : (
        <CirclePoints
          key={drawKey}
          positions={drawPositionsRef.current}
          pairWinners={pairWinners}
          beatByScores={beatByScoresRef.current}
          championshipWinner={championshipWinner}
          confettiKey={confettiKey}
          onPairWinnersChange={setPairWinners}
          onMoveCreated={handleMoveCreated}
          reverseMove={activeUndoMove}
        onReverseMoveComplete={handleReverseMoveComplete}
      />
        )}
      </div>
      {showShareModal ? (
        <div
          className="app-share-modal"
          role="presentation"
          onClick={closeShareModal}
        >
          <div
            className="app-share-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="share-modal-title" className="app-share-modal__title">
              Share
            </h2>
            {isSharing ? (
              <p className="app-share-modal__status" role="status">
                Uploading…
              </p>
            ) : shareError ? (
              <p className="app-share-modal__error" role="alert">
                {shareError}
              </p>
            ) : shareLink ? (
              <div className="app-share-modal__link-block">
                <div className="app-share-modal__link-row">
                  <p className="app-share-modal__link" title={shareLink}>
                    {shareLink}
                  </p>
                  <button
                    type="button"
                    className="app-share-modal__copy"
                    aria-label="Copy share link"
                    onClick={handleCopyShareLink}
                  >
                    <svg
                      className="app-share-modal__copy-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                </div>
                {shareCopied ? (
                  <p className="app-share-modal__copied" role="status">
                    Copied to clipboard
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className="app-action-btn"
              onClick={closeShareModal}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
