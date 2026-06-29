import { useCallback, useState } from "react";
import { CirclePoints, type DrawPosition } from "./components/CirclePoints";
import { parseDrawState, serializeDrawState } from "./lib/drawState";
import { uploadDrawState } from "./lib/shareDraw";
import { DEFAULT_DRAW_STATE } from "./lib/default-state";
import type { Team } from "./lib/drawTree";
import "./App.css";

const TEAMS = [
  { isoCode: "CAN", name: "Canada" },
  { isoCode: "ZAF", name: "South Africa" },
  { isoCode: "BRA", name: "Brazil" },
  { isoCode: "JPN", name: "Japan" },
  { isoCode: "DEU", name: "Germany" },
  { isoCode: "PRY", name: "Paraguay" },
  { isoCode: "NLD", name: "Netherlands" },
  { isoCode: "MAR", name: "Morocco" },
  { isoCode: "CIV", name: "Côte d'Ivoire" },
  { isoCode: "NOR", name: "Norway" },
  { isoCode: "FRA", name: "France" },
  { isoCode: "SWE", name: "Sweden" },
  { isoCode: "MEX", name: "Mexico" },
  { isoCode: "ECU", name: "Ecuador" },
  { isoCode: "GB-ENG", name: "England" },
  { isoCode: "COD", name: "DR Congo" },
  { isoCode: "BEL", name: "Belgium" },
  { isoCode: "SEN", name: "Senegal" },
  { isoCode: "USA", name: "United States" },
  { isoCode: "BIH", name: "Bosnia and Herzegovina" },
  { isoCode: "ESP", name: "Spain" },
  { isoCode: "AUT", name: "Austria" },
  { isoCode: "PRT", name: "Portugal" },
  { isoCode: "HRV", name: "Croatia" },
  { isoCode: "CHE", name: "Switzerland" },
  { isoCode: "DZA", name: "Algeria" },
  { isoCode: "AUS", name: "Australia" },
  { isoCode: "EGY", name: "Egypt" },
  { isoCode: "ARG", name: "Argentina" },
  { isoCode: "CPV", name: "Cape Verde" },
  { isoCode: "COL", name: "Colombia" },
  { isoCode: "GHA", name: "Ghana" },
] as const;

const DRAW_POSITIONS: DrawPosition[] = TEAMS.map((team, index) => {
  const position = index + 1;

  return {
    position,
    pair: Math.ceil(position / 2),
    isoCode: team.isoCode,
    team: team.name,
  };
});

function getInitialPairWinners(): Record<string, Team> {
  const result = parseDrawState(
    JSON.stringify(DEFAULT_DRAW_STATE),
    DRAW_POSITIONS,
  );

  if ("error" in result) {
    throw new Error(result.error);
  }

  return result.pairWinners;
}

function isDebugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function App() {
  const showDebugPanel = isDebugEnabled();
  const [pairWinners, setPairWinners] = useState(getInitialPairWinners);
  const [drawKey, setDrawKey] = useState(0);
  const [debugDraft, setDebugDraft] = useState("");
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const hasChanges = Object.keys(pairWinners).length > 0;

  const handleCopyState = useCallback(async () => {
    const serialized = serializeDrawState(pairWinners);
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
    const result = parseDrawState(debugDraft, DRAW_POSITIONS);

    if ("error" in result) {
      setDebugMessage(result.error);
      return;
    }

    setPairWinners(result.pairWinners);
    setDrawKey((current) => current + 1);
    setDebugMessage("State loaded.");
  }, [debugDraft]);

  const handleReset = useCallback(() => {
    setPairWinners({});
    setDrawKey((current) => current + 1);
    setDebugDraft("");
    setDebugMessage(null);
    setShowShareModal(false);
  }, []);

  const handleResetState = useCallback(() => {
    handleReset();
    setDebugMessage("Draw reset.");
  }, [handleReset]);

  const handleShare = useCallback(async () => {
    setShowShareModal(true);
    setShareLink(null);
    setShareError(null);
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
  }, []);

  return (
    <main className="app">
      <aside className="app-sidebar">
        <h1 className="app-sidebar__title">World Cup 2026 Knockout Phase</h1>
        <p className="app-sidebar__text">
          Interactive visualization based on the{" "}
          <a
            target="_blank"
            href="https://x.com/mkobach/status/2071353471295430705"
            rel="noopener noreferrer"
          >
            original design
          </a>{" "}
          posted here.
        </p>
        <p className="app-sidebar__text">
          <a href="https://x.com/paul__ux">@paul__ux</a>
        </p>

        <div className="app-sidebar__actions">
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
        <CirclePoints
          key={drawKey}
          positions={DRAW_POSITIONS}
          pairWinners={pairWinners}
          onPairWinnersChange={setPairWinners}
        />
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
              <p className="app-share-modal__link">{shareLink}</p>
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
