import React from "react";
import {
  Box,
  Typography,
  Stack,
  Avatar,
  CssBaseline,
} from "@mui/material";
import logo from "../assets/images/logo.png";
import {
  FONT_STYLESHEET_URL,
  DEFAULT_MERGED_COLORS,
} from "../theme";
import { useSocket } from "../context/SocketContext";
import api from "../../config.json";

const WS_URL = api.ws + "/ws/";
const RECONNECT_DELAY_MS = 2000;
const EVEN_GRID_COLUMNS = "repeat(4, 1fr)";

/*
 * ============================================================
 * SESSION STORAGE KEY
 * ============================================================
 */
const SESSION_STORAGE_KEY = "individual_participant_rankings";

/*
 * ============================================================
 * SESSION STORAGE HELPERS
 * ============================================================
 */
function saveToSession(rankings) {
  try {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(rankings)
    );
  } catch (err) {
    console.warn("[SessionStorage] Failed to save:", err);
  }
}

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : null;
  } catch (err) {
    console.warn("[SessionStorage] Failed to load:", err);
    return null;
  }
}

/*
 * ============================================================
 * TOP RANK CUSTOMIZATION
 * ============================================================
 */
const mul = 1.14;

const TOP_RANK_CONFIG = {
  rowHeight: 1.45,
  rankCircle: 1.40,
  rankNumber: 1.45,
  participantName: 1.45,
  participantTag: 1.30,
  voltage: 1.45,
  power: 1.45,
};

const FONT_SCALE = 2;

/*
 * ============================================================
 * F1 RANKING ANIMATION CONFIG
 * ============================================================
 */
const RANK_ANIMATION_DURATION = 900;
const RANK_ANIMATION_EASING = "cubic-bezier(0.2, 0.9, 0.2, 1)";
const VISIBLE_RANKS = 4;

const HIGHLIGHT_STYLE = `
  @property --angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }

  @keyframes borderSpin {
    0%   { --angle: 0deg; }
    100% { --angle: 360deg; }
  }

  @keyframes trackPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.6; }
  }

  .rank-row { outline: none; }

  .rank-row-normal {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15) !important;
    border-radius: 20px;
  }

  .rank-row-glow {
    box-shadow: 0 0 0 3px rgba(0,255,135,0.9),
                0 0 45px 8px rgba(0,255,135,0.75),
                inset 0 0 20px rgba(0,255,135,0.3) !important;
    border-radius: 20px;
  }

  .rank-row-highlighted {
    border: 16px solid transparent !important;
    border-radius: 20px;
    position: relative;
  }

  .rank-row-highlighted::after {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 28px;
    border: 12px solid rgba(178, 255, 30, 0.95);
    box-shadow:
      0 0 18px 6px rgba(178,255,30,0.6),
      0 0 40px 10px rgba(178,255,30,0.35),
      inset 0 0 12px rgba(178,255,30,0.25);
    pointer-events: none;
    z-index: 29;
    animation: trackPulse 2.5s ease-in-out infinite;
  }

  .rank-row-highlighted::before {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 28px;
    background: conic-gradient(
      from var(--angle),
      rgba(255, 255, 255, 0.02)  0deg,
      rgba(255, 255, 255, 0.02)  50deg,
      rgba(210, 255, 80,  0.25)  75deg,
      rgba(210, 255, 30,  0.65) 100deg,
      rgba(235, 255, 60,  0.92) 120deg,
      rgba(255, 255, 255, 1)    138deg,
      rgba(255, 255, 255, 1)    190deg,
      rgba(255, 255, 230, 0.95) 205deg,
      rgba(240, 255, 60,  0.88) 220deg,
      rgba(210, 255, 30,  0.55) 240deg,
      rgba(180, 220, 10,  0.25) 262deg,
      rgba(255, 255, 255, 0.02) 285deg,
      rgba(255, 255, 255, 0.02) 360deg
    );
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    padding: 12px;
    animation: borderSpin 2.2s linear infinite;
    pointer-events: none;
    z-index: 30;
    filter: brightness(3.5) blur(2px);
  }
`;

/*
 * ============================================================
 * DUMMY DATA
 * ============================================================
 */
const DUMMY_RANKINGS = [
  {
    rank: 1,
    name: "PARTICIPANT A",
    tag: "CYCLE 1",
    voltage: "0.0",
    power: "0.0W",
    highlighted: true,
    profileImage: null,
    participentId: "dummy-a",
  },
  {
    rank: 2,
    name: "PARTICIPANT B",
    tag: "CYCLE 2",
    voltage: "0.0",
    power: "0.0W",
    highlighted: false,
    profileImage: null,
    participentId: "dummy-b",
  },
  {
    rank: 3,
    name: "PARTICIPANT C",
    tag: "CYCLE 3",
    voltage: "0.0",
    power: "0.0W",
    highlighted: false,
    profileImage: null,
    participentId: "dummy-c",
  },
  {
    rank: 4,
    name: "PARTICIPANT D",
    tag: "CYCLE 4",
    voltage: "0.0",
    power: "0.0W",
    highlighted: false,
    profileImage: null,
    participentId: "dummy-d",
  },
];

/*
 * ============================================================
 * DATA SOURCE ENUM
 * ============================================================
 */
const DATA_SOURCE = {
  DUMMY: "dummy",
  SESSION: "session",   // ← NEW: sessionStorage hydration
  CACHE: "cache",
  LIVE: "live",
};

/*
 * ============================================================
 * ELEMENT SIZE HOOK
 * ============================================================
 */
function useElementSize() {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        prev.width !== rect.width || prev.height !== rect.height
          ? { width: rect.width, height: rect.height }
          : prev
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return [ref, size];
}

/*
 * ============================================================
 * CLAMP HELPER
 * ============================================================
 */
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/*
 * ============================================================
 * RANKING SCALE
 * ============================================================
 */
function useRankingScale(containerWidth, containerHeight, rowCount) {
  return React.useMemo(() => {
    if (!containerWidth || !containerHeight || !rowCount) {
      return {
        rowHeight: 96, rowGap: 16, rankCircle: 24, rankNumber: 30,
        participantName: 75, participantTag: 40, statValue: 70,
        headerTitle: 74, headerSide: 16, sectionTitle: 24,
        columnHeader: 40, rowBorderNormal: 2, rowBorderHighlighted: 3,
      };
    }

    const reservedForChrome = containerHeight * 0.43;
    const rowGap = clamp(containerHeight * 0.015, 8, 24);
    const usableForRows = Math.max(containerHeight - reservedForChrome, 0);
    const totalGap = rowGap * Math.max(VISIBLE_RANKS - 1, 0);
    const topRankExtra = TOP_RANK_CONFIG.rowHeight - 1;
    const weightedRowCount = VISIBLE_RANKS + topRankExtra;
    const rowHeight = clamp((usableForRows - totalGap) / weightedRowCount, 54, 220);
    const cardScale = clamp(rowHeight / 96, 0.55, 2.2);
    const widthCap = clamp(containerWidth / 1920, 0.6, 2.2);
    const chromeScale = widthCap;

    return {
      rowHeight,
      rowGap,
      rankCircle: clamp(rowHeight * 0.68, 20, 99),
      rankNumber: clamp(rowHeight * 0.27 * FONT_SCALE, 16, 86),
      participantName: clamp(rowHeight * 0.23 * FONT_SCALE, 14, 150),
      participantTag: clamp(rowHeight * 0.145 * FONT_SCALE, 10, 66),
      statValue: clamp(rowHeight * 0.23 * FONT_SCALE, 14, 70),
      headerTitle: clamp(34 * chromeScale, 20, 70),
      headerSide: clamp(16 * chromeScale * FONT_SCALE, 11, 26),
      sectionTitle: clamp(24 * chromeScale * FONT_SCALE, 16, 50),
      columnHeader: clamp(40 * chromeScale * FONT_SCALE, 11, 45),
      rowBorderNormal: clamp(2 * cardScale, 1, 6),
      rowBorderHighlighted: clamp(3 * cardScale, 2, 6),
    };
  }, [containerWidth, containerHeight, rowCount]);
}

/*
 * ============================================================
 * GET ROW HEIGHT
 * ============================================================
 */
function getRowHeight(item, scale) {
  return item.rank === 1
    ? scale.rowHeight * TOP_RANK_CONFIG.rowHeight
    : scale.rowHeight * mul;
}

/*
 * ============================================================
 * GET Y POSITION FOR A RANK
 * ============================================================
 */
function getRankY(rank, scale) {
  if (rank <= 1) return 0;

  let y = 0;
  for (let currentRank = 1; currentRank < rank; currentRank++) {
    const currentHeight =
      currentRank === 1
        ? scale.rowHeight * TOP_RANK_CONFIG.rowHeight
        : scale.rowHeight * mul;
    y += currentHeight;
    y += scale.rowGap;
  }
  return y;
}

/*
 * ============================================================
 * RANK CIRCLE
 * ============================================================
 */
function RankCircle({ rank, highlighted, colors, font, rankCircleSize, rankNumberSize }) {
  return (
    <Avatar
      src={null}
      sx={{
        width: rankCircleSize,
        height: rankCircleSize,
        flexShrink: 0,
        bgcolor: colors.circleBg,
        color: highlighted ? colors.green : colors.white,
        fontFamily: font,
        fontWeight: 700,
        fontSize: rankNumberSize,
        border: highlighted
          ? `8px solid ${colors.circleHighlightBorder}`
          : `3px solid ${colors.white}`,
        boxShadow: highlighted
          ? `0 0 14px ${colors.circleHighlightShadow}`
          : "none",
      }}
    >
      {rank}
    </Avatar>
  );
}

/*
 * ============================================================
 * RANKING ROW
 * ============================================================
 */
function RankingRow({ item, colors, font, scale, yPosition }) {
  const prevRankRef = React.useRef(item.rank);
  const [glowType, setGlowType] = React.useState(null);

  React.useEffect(() => {
    const prev = prevRankRef.current;
    const curr = item.rank;
    if (prev !== curr) {
      const delta = prev - curr;
      setGlowType(delta > 0 ? "gain" : "drop");
      prevRankRef.current = curr;
      const timer = setTimeout(() => setGlowType(null), 950);
      return () => clearTimeout(timer);
    }
  }, [item.rank]);

  const isTopRank = item.rank === 1;

  const rankCircleSize = isTopRank ? scale.rankCircle * TOP_RANK_CONFIG.rankCircle : scale.rankCircle * mul;
  const rankNumberSize = isTopRank ? scale.rankNumber * TOP_RANK_CONFIG.rankNumber : scale.rankNumber * mul;
  const participantNameSize = isTopRank ? scale.participantName * TOP_RANK_CONFIG.participantName : scale.participantName * mul;
  const participantTagSize = isTopRank ? scale.participantTag * TOP_RANK_CONFIG.participantTag : scale.participantTag * mul;
  const voltageSize = isTopRank ? scale.statValue * TOP_RANK_CONFIG.voltage : scale.statValue * mul;
  const powerSize = isTopRank ? scale.statValue * TOP_RANK_CONFIG.power : scale.statValue * mul;
  const rowHeight = getRowHeight(item, scale);
  const isVisibleRank = item.rank <= VISIBLE_RANKS;

  return (
    <Box
      className={
        glowType === "gain" || glowType === "drop"
          ? "rank-row rank-row-glow"
          : item.highlighted
          ? "rank-row rank-row-highlighted"
          : "rank-row rank-row-normal"
      }
      sx={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: rowHeight,
        transform: `translate3d(0, ${yPosition}px, 0)`,
        transition: `transform ${RANK_ANIMATION_DURATION}ms ${RANK_ANIMATION_EASING}, box-shadow 300ms ease`,
        willChange: "transform",
        display: "grid",
        gridTemplateColumns: EVEN_GRID_COLUMNS,
        alignItems: "center",
        columnGap: "1.5vw",
        boxSizing: "border-box",
        borderRadius: "20px",
        px: "1.8vw",
        opacity: 1,
        pointerEvents: isVisibleRank ? "auto" : "none",
        zIndex: item.highlighted ? 20 : 10,
        boxShadow:
          glowType === "gain" || glowType === "drop"
            ? "0 0 45px 8px rgba(0,255,135,0.75), inset 0 0 20px rgba(0,255,135,0.3)"
            : "none",
        border:
          glowType === "gain" || glowType === "drop"
            ? `${scale.rowBorderNormal}px solid rgba(0,255,135,0.9)`
            : item.highlighted
            ? `${scale.rowBorderHighlighted * 2}px solid transparent`
            : `${scale.rowBorderNormal}px solid ${colors.normalRowBorder}`,
      }}
    >
      <style>{HIGHLIGHT_STYLE}</style>

      {/* RANK */}
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <RankCircle
          rank={item.rank}
          highlighted={item.highlighted}
          colors={colors}
          font={font}
          rankCircleSize={rankCircleSize}
          rankNumberSize={rankNumberSize}
        />
      </Box>

      {/* PARTICIPANT */}
      <Box sx={{ minWidth: 0, textAlign: "center" }}>
        <Typography
          noWrap
          sx={{ fontFamily: font, color: colors.white, fontWeight: 700, fontSize: participantNameSize, lineHeight: 1.25 }}
        >
          {item.tag}
        </Typography>
      </Box>

      {/* VOLTAGE */}
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "0.3vw" }}>
        <Typography sx={{ fontFamily: font, color: colors.white, fontWeight: 700, fontSize: voltageSize }}>
          {item.voltage}
        </Typography>
        <Typography sx={{ fontFamily: font, color: colors.white, fontWeight: 600, fontSize: voltageSize }}>
          V
        </Typography>
      </Box>

      {/* POWER */}
      <Box sx={{ textAlign: "center" }}>
        <Typography sx={{ fontFamily: font, color: colors.white, fontWeight: 700, fontSize: powerSize, textAlign: "center" }}>
          {item.power}
        </Typography>
      </Box>
    </Box>
  );
}

const MemoRankingRow = React.memo(RankingRow);

/*
 * ============================================================
 * NUMBER HELPER
 * ============================================================
 */
function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/*
 * ============================================================
 * MAIN COMPONENT
 * ============================================================
 */
function IndividualParticipent() {
  /*
   * ----------------------------------------------------------
   * STATE
   *
   * Priority on mount:
   *   1. sessionStorage  → DATA_SOURCE.SESSION
   *   2. dummy data      → DATA_SOURCE.DUMMY
   *
   * Once live WS data arrives:
   *   3. live data       → DATA_SOURCE.LIVE  (also updates sessionStorage)
   * ----------------------------------------------------------
   */

  // ── Initialise from sessionStorage immediately (no flash of dummy data) ──
  const sessionSeed = React.useMemo(() => loadFromSession(), []);

  const [allocations, setAllocations] = React.useState(
    sessionSeed ?? []
  );

  const [dataSource, setDataSource] = React.useState(
    sessionSeed ? DATA_SOURCE.SESSION : DATA_SOURCE.DUMMY
  );

  const socketCtx = useSocket();
  const colors = socketCtx?.colors ?? DEFAULT_MERGED_COLORS.colors;
  const font   = socketCtx?.fontFamily ?? DEFAULT_MERGED_COLORS.fontFamily;

  const socketRef         = React.useRef(null);
  const reconnectTimerRef = React.useRef(null);
  const isMountedRef      = React.useRef(true);
  const lastSavedTsRef    = React.useRef(null);

  const dataSourceRef = React.useRef(dataSource);
  React.useEffect(() => {
    dataSourceRef.current = dataSource;
  }, [dataSource]);

  /*
   * ==========================================================
   * LOAD PARTICIPANTS FROM SQLITE CACHE
   * ==========================================================
   */
  const loadFromCache = React.useCallback(async () => {
    try {
      const rows = await window.electronAPI?.getAllParticipants();

      if (!isMountedRef.current || !Array.isArray(rows)) return;

      // Don't overwrite a better source
      if (
        dataSourceRef.current === DATA_SOURCE.LIVE ||
        dataSourceRef.current === DATA_SOURCE.SESSION
      ) {
        console.log("[loadFromCache] skipped — better data already shown");
        return;
      }

      if (rows.length === 0) {
        console.log("[loadFromCache] cache empty — keeping current data");
        return;
      }

      const seen = new Set();
      const uniqueRows = rows.filter((row) => {
        const key =
          row.participant_id != null
            ? `id:${row.participant_id}`
            : `name:${row.participant_name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const rankedRows = [...uniqueRows]
        .sort((a, b) => (b.participant_power ?? 0) - (a.participant_power ?? 0))
        .map((row, i) => ({
          rank: i + 1,
          participentId: row.participant_id,
          name: row.participant_name,
          tag: `${row.cycle}`,
          controller_id: row.controller_id,
          voltage: row.participant_voltage,
          power: row.participant_power,
          profileImage: row.profile_image,
        }));

      setAllocations(rankedRows);
      setDataSource(DATA_SOURCE.CACHE);
    } catch (err) {
      console.error("Failed to load cached participants:", err);
    }
  }, []);

  /*
   * ==========================================================
   * HANDLE LIVE WEBSOCKET DATA
   * ==========================================================
   */
  const handleMessage = React.useCallback(async (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.error("Bad WS payload:", err);
      return;
    }

    if (data.type !== "heartbeat" || !Array.isArray(data.allocations)) return;

    const incomingAllocations = data.allocations.filter(
      (entry) => entry && typeof entry === "object"
    );

    const seen = new Set();
    const rankedRows = [...incomingAllocations]
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .filter((entry) => {
        const key =
          entry.participent_id != null
            ? `id:${entry.participent_id}`
            : `name:${entry.participent}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((entry) => ({
        rank: entry.rank,
        participentId: entry.participent_id,
        name: entry.participent || "",
        tag: ` ${entry.cycle ?? ""}`,
        controller_id: entry.controller_id,
        voltage: toFiniteNumber(entry.voltage),
        power: toFiniteNumber(entry.power),
        profileImage: entry.profile_image || null,
      }));

    if (isMountedRef.current) {
      setAllocations(rankedRows);
      setDataSource(DATA_SOURCE.LIVE);

      /*
       * ── UPDATE SESSION STORAGE with the latest live rankings ──
       *
       * We store the raw `rankedRows` (pre-formatting) so that
       * on next mount the session seed is already shaped correctly
       * for the allocations → rankings memo below.
       */
      saveToSession(rankedRows);
    }

    // ── SQLite persistence (unchanged) ──
    if (!window.electronAPI?.saveParticipant) return;
    if (lastSavedTsRef.current === data.ts) return;
    lastSavedTsRef.current = data.ts;

    for (const entry of incomingAllocations) {
      const payload = {
        screen_name: "Individual",
        cycle: String(entry.cycle ?? ""),
        total_voltage: toFiniteNumber(entry.voltage),
        total_amperage: toFiniteNumber(entry.amperage),
        total_power: toFiniteNumber(entry.power),
        participant_name: entry.participent || "",
        profile_image: entry.profile_image || "",
        participant_voltage: toFiniteNumber(entry.voltage),
        participant_amperage: toFiniteNumber(entry.amperage),
        participant_power: toFiniteNumber(entry.power),
        ts: Date.now(),
      };
      // saveParticipant call intentionally kept commented as in original
    }
  }, []);

  /*
   * ==========================================================
   * WEBSOCKET CONNECTION
   * ==========================================================
   */
  const connect = React.useCallback(() => {
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen    = () => console.log("Socket opened");
    ws.onmessage = handleMessage;
    ws.onerror   = (error) => console.error("WebSocket error:", error);
    ws.onclose   = () => {
      console.log("Socket closed — retrying in", RECONNECT_DELAY_MS, "ms");
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, [handleMessage]);

  /*
   * ==========================================================
   * INITIALIZATION
   * ==========================================================
   */
  React.useEffect(() => {
    isMountedRef.current = true;

    (async () => {
      await loadFromCache();
      if (isMountedRef.current) connect();
    })();

    return () => {
      isMountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
    };
  }, [connect, loadFromCache]);

  /*
   * ============================================================
   * PREPARE RANKINGS
   *
   * Handles all three sources uniformly:
   *   • DUMMY   → DUMMY_RANKINGS (static placeholder)
   *   • SESSION → allocations seeded from sessionStorage
   *   • CACHE   → allocations from SQLite
   *   • LIVE    → allocations from WebSocket (always latest)
   * ============================================================
   */
  const rankings = React.useMemo(() => {
    if (dataSource === DATA_SOURCE.DUMMY) {
      return DUMMY_RANKINGS;
    }

    return [...allocations]
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .slice(0, 5)
      .map((item) => ({
        rank: item.rank,
        participentId: item.participentId,
        name: item.name ? item.name.toUpperCase() : "—",
        tag: item.tag,
        controller_id: item.controller_id,
        voltage: item.voltage?.toFixed
          ? item.voltage.toFixed(1)
          : String(item.voltage ?? "0.0"),
        power: `${
          item.power?.toFixed
            ? item.power.toFixed(1)
            : String(item.power ?? "0.0")
        }W`,
        highlighted: item.rank === 1,
        profileImage: item.profileImage || null,
      }));
  }, [allocations, dataSource]);

  /*
   * ============================================================
   * CONTAINER SIZE
   * ============================================================
   */
  const [containerRef, containerSize] = useElementSize();

  const scale = useRankingScale(
    containerSize.width,
    containerSize.height,
    VISIBLE_RANKS
  );

  /*
   * ============================================================
   * VISIBLE RANKING AREA HEIGHT
   * ============================================================
   */
  const rankingViewportHeight = React.useMemo(() => {
    if (!scale) return 0;
    let height = 0;
    for (let rank = 1; rank <= VISIBLE_RANKS; rank++) {
      height +=
        rank === 1
          ? scale.rowHeight * TOP_RANK_CONFIG.rowHeight
          : scale.rowHeight * mul;
      if (rank < VISIBLE_RANKS) height += scale.rowGap;
    }
    return height;
  }, [scale]);

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */
  return (
    <>
      <CssBaseline />
      <link rel="stylesheet" href={FONT_STYLESHEET_URL} />

      <Box
        ref={containerRef}
        sx={{
          minHeight: "100vh",
          height: "100vh",
          width: "100%",
          background: colors.backgroundGradient,
          p: { xs: "2vh 2vw", sm: "3vh 3vw" },
          boxSizing: "border-box",
          fontFamily: font,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <Box
          sx={{
            border: `9px solid ${colors.headerBorder}`,
            borderRadius: "18px",
            px: "2.5vw",
            py: "1vh",
            boxShadow: `0 0 42px ${colors.headerBorderShadow}`,
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1.5vw",
            flexShrink: 0,
          }}
        >
          {/* LOGO */}
          <Box
            sx={{
              width: "clamp(140px, 13vw, 260px)",
              height: "clamp(60px, 9vh, 115px)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            <Box
              component="img"
              src={logo}
              alt="Logo"
              sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "cover" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          </Box>

          {/* CENTER TITLE */}
          <Box sx={{ width: "100%" }}>
            <Typography
              sx={{
                fontFamily: font,
                color: colors.white,
                textAlign: "center",
                fontWeight: 700,
                fontSize: scale.headerTitle * 2,
                textShadow: "0 0 10px rgba(255,255,255,0.5)",
                lineHeight: 1,
              }}
            >
              GO GREEN CYCLE PEDAL
            </Typography>
            <Typography
              sx={{
                textAlign: "center",
                fontFamily: font,
                color: colors.white,
                fontWeight: 700,
                fontSize: scale.headerTitle * 2,
                textShadow: "0 0 10px rgba(255,255,255,0.5)",
                lineHeight: 1.25,
              }}
            >
              POWERED GAMIFICATION
            </Typography>
          </Box>

          {/* PARTICIPATION METRIC */}
          <Box
            sx={{
              textAlign: "center",
              borderLeft: `1px solid ${colors.gold}`,
              pl: "1.5vw",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            <Typography
              sx={{
                fontFamily: font,
                color: colors.gold,
                fontWeight: 700,
                fontSize: {
                  xs: "clamp(9px, 2.3vw, 37px)",
                  sm: "clamp(12px, 1.8vw, 42px)",
                  md: "clamp(16px, 2vw, 49px)",
                  lg: "clamp(18px, 2.1vw, 64px)",
                },
                lineHeight: 1.7,
                whiteSpace: "nowrap",
                textShadow: "0 0 12px rgba(255,215,0,0.5)",
              }}
            >
              PARTICIPATION
              <br />
              METRIC
            </Typography>
          </Box>
        </Box>

        {/* TOP RANKINGS TITLE */}
        <Typography
          align="center"
          sx={{
            fontFamily: font,
            color: colors.white,
            fontWeight: 600,
            fontSize: scale.sectionTitle * 1.29,
            letterSpacing: 1,
            mt: "0.7vh",
            flexShrink: 0,
          }}
        >
          TOP LEADERS
        </Typography>

        {/* COLUMN HEADERS */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: EVEN_GRID_COLUMNS,
            columnGap: "2vw",
            px: "1.8vw",
            flexShrink: 0,
            transform: "translateY(-1vh)",
          }}
        >
          {["RANK", "PARTICIPANT", "VOLTAGE", "POWER"].map((label) => (
            <Typography
              key={label}
              sx={{
                fontFamily: font,
                color: colors.green,
                fontWeight: 600,
                fontSize: scale.columnHeader,
                textAlign: "center",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </Typography>
          ))}
        </Box>

        {/* F1-STYLE ANIMATED RANKING VIEWPORT */}
        <Box
          sx={{
            position: "relative",
            width: "100%",
            height: rankingViewportHeight,
            minHeight: 0,
            flexShrink: 0,
            mt: "-1vh",
            overflow: "hidden",
            pb: `${scale.rowGap}px`,
            boxSizing: "border-box",
          }}
        >
          {rankings.map((item) => {
            const yPosition = getRankY(item.rank, scale);
            return (
              <MemoRankingRow
                key={item.participentId ?? `${item.name}-${item.rank}`}
                item={item}
                colors={colors}
                font={font}
                scale={scale}
                yPosition={yPosition}
              />
            );
          })}
        </Box>
      </Box>
    </>
  );
}

export default IndividualParticipent;