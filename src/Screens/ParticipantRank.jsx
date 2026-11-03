
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";

import {
  Box,
  Typography,
  Avatar,
  CssBaseline,
} from "@mui/material";

import { useSearchParams } from "react-router-dom";

import Header from "../components/Header.jsx";

import {
  FONT_STYLESHEET_URL,
  DEFAULT_MERGED_COLORS,
} from "../theme";

import { useSocket } from "../context/SocketContext";

import config from "../../config.json";

/* =========================================================
   CONSTANTS
========================================================= */

const ACTIVE_PARTICIPENT_URL =
  `${config.api}/screens/active-participent/`;

const VALID_SORTS = [
  "power",
  "voltage",
  "duration",
];

const DEFAULT_SORT = "power";

const LANDSCAPE_GRID_COLUMNS =
  "12% 28% 20% 20% 20%";

const PORTRAIT_GRID_COLUMNS =
  "10% 32% 19% 19% 20%";

const MAX_PARTICIPANTS = 10;

const VISIBLE_RANKS_PER_BATCH = 5;

const BATCH_ROTATE_INTERVAL_MS = 5000;

const BATCH_FADE_DURATION_MS = 450;

const LANDSCAPE_ROW_HEIGHT = 122;

const PORTRAIT_ROW_HEIGHT = 273;

const COLUMN_LABELS = [
  "RANK",
  "PARTICIPANT",
  "DURATION",
  "VOLTAGE",
  "POWER",
];

/* =========================================================
   DATA SOURCE
========================================================= */

const DATA_SOURCE = {
  DUMMY: "dummy",
  API: "api",
};

/* =========================================================
   DUMMY DATA
========================================================= */

const DUMMY_PARTICIPANTS = [
  { rank: 1, participantName: "PARTICIPANT 10", duration: 1583, voltage: 0.9, power: 6.5 },
  { rank: 2, participantName: "PARTICIPANT 7", duration: 394, voltage: 0.7, power: 5.8 },
  { rank: 3, participantName: "PARTICIPANT 12", duration: 387, voltage: 0.8, power: 5.7 },
  { rank: 4, participantName: "PARTICIPANT 6", duration: 97, voltage: 0.7, power: 5.4 },
  { rank: 5, participantName: "PARTICIPANT 3", duration: 74, voltage: 0.7, power: 5.1 },
  { rank: 6, participantName: "PARTICIPANT 9", duration: 76, voltage: 0.7, power: 4.9 },
  { rank: 7, participantName: "PARTICIPANT 1", duration: 107, voltage: 0.6, power: 4.7 },
  { rank: 8, participantName: "PARTICIPANT 4", duration: 70, voltage: 0.6, power: 4.4 },
  { rank: 9, participantName: "PARTICIPANT 8", duration: 54, voltage: 0.5, power: 4.1 },
  { rank: 10, participantName: "PARTICIPANT 2", duration: 96, voltage: 0.5, power: 3.8 },
];

/* =========================================================
   HELPERS
========================================================= */

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function formatDuration(totalSeconds) {
  const s = Math.max(
    0,
    Math.round(toFiniteNumber(totalSeconds))
  );

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const pad = (n) => String(n).padStart(2, "0");

  return h > 0
    ? `${h}:${pad(m)}:${pad(sec)}`
    : `${pad(m)}:${pad(sec)}`;
}

function getParticipantName(item, fallback = "") {
  return (
    item?.participant_name ??
    item?.participantName ??
    item?.participant ??
    item?.participent ??
    item?.name ??
    item?.user_name ??
    item?.username ??
    fallback
  );
}

function getDuration(item) {
  return toFiniteNumber(
    item?.total_duration_seconds ??
    item?.duration ??
    item?.duration_seconds
  );
}

/* =========================================================
   ELEMENT SIZE HOOK
========================================================= */

function useElementSize() {
  const ref = useRef(null);

  const [size, setSize] = useState({
    width: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const el = ref.current;

    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();

      setSize((prev) =>
        prev.width !== rect.width ||
        prev.height !== rect.height
          ? {
              width: rect.width,
              height: rect.height,
            }
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

/* =========================================================
   RESPONSIVE SCALE
========================================================= */

function useDisplayScale(containerWidth, containerHeight) {
  return useMemo(() => {
    if (!containerWidth || !containerHeight) {
      return 1;
    }

    const ws = containerWidth / 1920;
    const hs = containerHeight / 1075;

    return Math.min(
      Math.max(Math.min(ws, hs), 0.45),
      1.8
    );
  }, [containerWidth, containerHeight]);
}

/* =========================================================
   RANKING ROW
========================================================= */

function RankingRow({
  item,
  colors,
  font,
  scale,
  rowHeightBase,
  isPortrait,
}) {
  const rowHeight = rowHeightBase * scale;

  const valueFontSize =
    56 * scale * (isPortrait ? 1.55 : 1);

  const participantFontSize =
    56 * scale * (isPortrait ? 1.42 : 1);

  const rankFontSize =
    56 * scale * (isPortrait ? 1.35 : 1);

  const rankCircleSize =
    88 * scale * (isPortrait ? 1.25 : 1);

  const cellSx = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minWidth: 0,
    height: "100%",
    overflow: "hidden",
    px: isPortrait ? `${8 * scale}px` : 0,
    boxSizing: "border-box",
  };

  const textSx = {
    color: colors.white,
    fontWeight: 800,
    lineHeight: 1,
    textAlign: "center",
    fontFamily: font,
    textShadow: "0 0 12px rgba(255,255,255,0.25)",
  };

  const nameFontSize = Math.min(
    participantFontSize,
    item.participantName?.length > 12
      ? 48 * scale * (isPortrait ? 2 : 1)
      : participantFontSize
  );

  return (
    <Box
      className="pr-rank-row"
      sx={{
        width: "100%",
        height: rowHeight,
        flexShrink: 0,
        display: "grid",
        gridTemplateColumns: isPortrait
          ? PORTRAIT_GRID_COLUMNS
          : LANDSCAPE_GRID_COLUMNS,
        alignItems: "center",
        boxSizing: "border-box",
        background: colors.row ?? "#082A1A",
        border: `${2 * scale}px solid ${
          colors.normalBorder ?? "rgba(255,255,255,0.72)"
        }`,
        borderRadius: `${16 * scale}px`,
        boxShadow: "0 0 0 2px rgba(255,255,255,0.15)",
        position: "relative",
        zIndex: 1,
        overflow: "hidden",
      }}
    >
      {/* RANK */}

      <Box sx={cellSx}>
        <Avatar
          sx={{
            width: rankCircleSize,
            height: rankCircleSize,
            bgcolor: "transparent",
            color: colors.white,
            fontFamily: font,
            fontWeight: 800,
            fontSize: rankFontSize,
            border: `${2 * scale}px solid ${colors.white}`,
            boxShadow: "none",
            textShadow: "none",
            flexShrink: 0,
          }}
        >
          {item.rank}
        </Avatar>
      </Box>

      {/* PARTICIPANT */}

      <Box sx={cellSx}>
        <Typography
          sx={{
            ...textSx,
            width: "100%",
            fontSize: `${nameFontSize}px`,
            whiteSpace: "nowrap",
            letterSpacing: isPortrait ? "-0.025em" : "normal",
          }}
        >
          {item.participantName}
        </Typography>
      </Box>

      {/* DURATION */}

      <Box sx={cellSx}>
        <Typography
          sx={{
            ...textSx,
            fontSize: `${valueFontSize}px`,
            whiteSpace: "nowrap",
            letterSpacing: isPortrait ? "-0.02em" : "normal",
          }}
        >
          {formatDuration(item.duration)}
          {" "}
          <span style={{ fontSize: "0.5em" }}>Min</span>
        </Typography>
      </Box>

      {/* VOLTAGE */}

      <Box sx={cellSx}>
        <Typography
          sx={{
            ...textSx,
            fontSize: `${valueFontSize}px`,
            whiteSpace: "nowrap",
            letterSpacing: isPortrait ? "-0.02em" : "normal",
          }}
        >
          {Number(item.voltage).toFixed(1)}V
        </Typography>
      </Box>

      {/* POWER */}

      <Box sx={cellSx}>
        <Typography
          sx={{
            ...textSx,
            fontSize: `${valueFontSize}px`,
            whiteSpace: "nowrap",
            letterSpacing: isPortrait ? "-0.02em" : "normal",
          }}
        >
          {Number(item.power).toFixed(1)}W
        </Typography>
      </Box>
    </Box>
  );
}

const MemoRankingRow = React.memo(RankingRow);

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function ParticipantRank() {
  const socketCtx = useSocket();

  const colors =
    socketCtx?.colors ??
    DEFAULT_MERGED_COLORS.colors;

  const font =
    socketCtx?.fontFamily ??
    DEFAULT_MERGED_COLORS.fontFamily;

  /* ---------- URL OVERRIDES ---------- */

  const [searchParams] = useSearchParams();

  const urlCycle =
    Number(searchParams.get("cycle")) || null;

  const urlSortRaw = searchParams.get("sort");

  const urlSort = VALID_SORTS.includes(urlSortRaw)
    ? urlSortRaw
    : null;

  const [sortBy, setSortBy] = useState(
    urlSort ?? DEFAULT_SORT
  );

  const requestIdRef = useRef(0);

  /* ---------- CONTAINER ---------- */

  const [containerRef, containerSize] = useElementSize();

  const scale = useDisplayScale(
    containerSize.width,
    containerSize.height
  );

  /* ---------- ORIENTATION ---------- */

  const isPortrait =
    containerSize.width > 0 &&
    containerSize.height > containerSize.width;

  const rowHeightBase = isPortrait
    ? PORTRAIT_ROW_HEIGHT
    : LANDSCAPE_ROW_HEIGHT;

  /* ---------- COLORS ---------- */

  const extendedColors = useMemo(
    () => ({
      ...colors,
      greenBright: colors.greenBright ?? "#B8FF00",
      normalBorder:
        colors.normalBorder ?? "rgba(255,255,255,0.72)",
      row: colors.row ?? "#082A1A",
      gold: colors.gold ?? "#FFD000",
      greenShadow:
        colors.greenShadow ?? "rgba(57,232,120,0.45)",
    }),
    [colors]
  );

  /* ---------- STATE ---------- */

  const [allocations, setAllocations] = useState([]);

  const [dataSource, setDataSource] = useState(
    DATA_SOURCE.DUMMY
  );

  const isMountedRef = useRef(false);

  /* ---------- NORMALIZE API ---------- */

  const normalizeParticipants = useCallback((response) => {
    let rows = [];

    if (Array.isArray(response)) {
      rows = response;
    } else if (Array.isArray(response?.data)) {
      rows = response.data;
    } else if (Array.isArray(response?.results)) {
      rows = response.results;
    } else if (Array.isArray(response?.top_10)) {
      rows = response.top_10;
    } else if (Array.isArray(response?.participants)) {
      rows = response.participants;
    }

    return rows
      .slice(0, MAX_PARTICIPANTS)
      .map((item, index) => ({
        rank: Number(item.rank) || index + 1,

        participantName: getParticipantName(
          item,
          `PARTICIPANT ${index + 1}`
        ),

        duration: getDuration(item),

        voltage: toFiniteNumber(
          item.voltage ??
          item.total_voltage ??
          item.participant_voltage
        ),

        power: toFiniteNumber(
          item.power ??
          item.total_power ??
          item.participant_power
        ),

        participentId:
          item.participant_id ??
          item.participent_id ??
          item.id ??
          `api-${index}`,
      }));
  }, []);

  /* ---------- LOAD TOP 10 ---------- */

  const loadTop10 = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    try {
      let cycleId = urlCycle ?? 1;

      let effectiveSort = urlSort ?? DEFAULT_SORT;

      /* ACTIVE PARTICIPANT CONFIGURATION */

      try {
        const cfgRes = await fetch(
          ACTIVE_PARTICIPENT_URL,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (cfgRes.ok) {
          const cfg = await cfgRes.json();

          if (!urlCycle) {
            const picked = Array.isArray(cfg?.cycles)
              ? Number(cfg.cycles[0])
              : 0;

            if (picked > 0) {
              cycleId = picked;
            }
          }

          if (
            !urlSort &&
            VALID_SORTS.includes(cfg?.leaderboard_sort)
          ) {
            effectiveSort = cfg.leaderboard_sort;
          }
        }
      } catch (error) {
        // Continue using default cycle and sort.
      }

      /* TOP 10 API */

      const response = await fetch(
        `${config.api}/api/admin/cycle-history/${cycleId}/top-10/?sort_by=${effectiveSort}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      if (
        !isMountedRef.current ||
        requestId !== requestIdRef.current
      ) {
        return;
      }

      setSortBy(effectiveSort);

      const rankedRows = normalizeParticipants(data);

      setAllocations(rankedRows);

      setDataSource(DATA_SOURCE.API);

    } catch (error) {
      if (
        isMountedRef.current &&
        requestId === requestIdRef.current
      ) {
        console.error(
          "[ParticipantRank] Failed to load leaders:",
          error
        );
      }
    }
  }, [
    normalizeParticipants,
    urlCycle,
    urlSort,
  ]);

  /* ---------- POLLING ---------- */

  useEffect(() => {
    isMountedRef.current = true;

    loadTop10();

    const apiTimer = setInterval(
      loadTop10,
      5000
    );

    return () => {
      isMountedRef.current = false;

      // Invalidate any pending requests.
      requestIdRef.current += 1;

      clearInterval(apiTimer);
    };
  }, [loadTop10]);

  /* ---------- RANKINGS ---------- */

  const rankings = useMemo(() => {
    if (dataSource === DATA_SOURCE.DUMMY) {
      return DUMMY_PARTICIPANTS.map((item) => ({
        ...item,
        highlighted: item.rank === 1,
      }));
    }

    const metricOf = (item) =>
      sortBy === "duration"
        ? item.duration
        : sortBy === "voltage"
        ? item.voltage
        : item.power;

    return [...allocations]
      .sort((a, b) => metricOf(b) - metricOf(a))
      .slice(0, MAX_PARTICIPANTS)
      .map((item, index) => ({
        rank: index + 1,

        participentId: item.participentId ?? index,

        participantName: getParticipantName(
          item,
          `PARTICIPANT ${index + 1}`
        )
          .toString()
          .toUpperCase(),

        duration: toFiniteNumber(item.duration),

        voltage: toFiniteNumber(item.voltage),

        power: toFiniteNumber(item.power),

        highlighted: false,
      }));
  }, [
    allocations,
    dataSource,
    sortBy,
  ]);

  /* ---------- BATCHES ---------- */

  const batches = useMemo(() => {
    if (isPortrait) {
      return rankings.length > 0
        ? [rankings]
        : [];
    }

    const first = rankings.slice(
      0,
      VISIBLE_RANKS_PER_BATCH
    );

    const second = rankings.slice(
      VISIBLE_RANKS_PER_BATCH,
      VISIBLE_RANKS_PER_BATCH * 2
    );

    return [first, second].filter(
      (batch) => batch.length > 0
    );
  }, [
    rankings,
    isPortrait,
  ]);

  /* ---------- BATCH ROTATION ---------- */

  const [currentBatch, setCurrentBatch] = useState(0);

  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (batches.length <= 1) {
      setCurrentBatch(0);
      setVisible(true);
      return;
    }

    let fadeTimer;

    const interval = setInterval(() => {
      setVisible(false);

      fadeTimer = setTimeout(() => {
        setCurrentBatch((current) =>
          (current + 1) % batches.length
        );

        setVisible(true);
      }, BATCH_FADE_DURATION_MS);

    }, BATCH_ROTATE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(fadeTimer);
    };
  }, [batches.length]);

  /* ---------- ORIENTATION CHANGE ---------- */

  useEffect(() => {
    setCurrentBatch(0);
    setVisible(true);
  }, [isPortrait]);

  /* ---------- DATA CHANGE ---------- */

  useEffect(() => {
    if (currentBatch >= batches.length) {
      setCurrentBatch(0);
    }
  }, [
    batches.length,
    currentBatch,
  ]);

  /* ---------- CURRENT BATCH ---------- */

  const currentRows = useMemo(
    () =>
      (batches[currentBatch] ?? []).map(
        (item, index) => ({
          ...item,
          highlighted: index === 0,
        })
      ),
    [
      batches,
      currentBatch,
    ]
  );

  /* ---------- DERIVED SIZES ---------- */

  const sectionTitleSize =
    (isPortrait ? 82 : 62) * scale;

  const columnHeaderSize =
    (isPortrait ? 66 : 56) * scale;

  const topLeadersHeight =
    (isPortrait ? 145 : 125) * scale;

  const columnHeaderHeight =
    (isPortrait ? 72 : 82) * scale;

  const rowGap = 14 * scale;

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <>
      <CssBaseline />

      <link
        rel="stylesheet"
        href={FONT_STYLESHEET_URL}
      />

      <Box
        ref={containerRef}
        sx={{
          width: "100vw",
          height: "100vh",
          minHeight: "100vh",
          overflow: "hidden",
          boxSizing: "border-box",

          background:
            extendedColors.backgroundGradient ??
            `radial-gradient(
              ellipse at top,
              #0B321E 0%,
              #061D11 55%,
              #03150B 100%
            )`,

          fontFamily: font,

          color: extendedColors.white,

          display: "flex",
          flexDirection: "column",

          px: `${(isPortrait ? 28 : 50) * scale}px`,
          pt: `${(isPortrait ? 18 : 28) * scale}px`,
          pb: `${(isPortrait ? 14 : 20) * scale}px`,
        }}
      >
        {/* HEADER */}

        <Header />

        {/* TOP LEADERS */}

        <Box
          sx={{
            height: `${topLeadersHeight}px`,
            minHeight: `${topLeadersHeight}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              color: extendedColors.white,
              fontSize: sectionTitleSize,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: isPortrait ? "0em" : "0.02em",
              textAlign: "center",
              fontFamily: font,
              textShadow:
                "0 0 12px rgba(255,255,255,0.6), 0 0 25px rgba(255,255,255,0.2)",
              whiteSpace: "nowrap",
            }}
          >
            TOP LEADERS
          </Typography>
        </Box>

        {/* COLUMN HEADERS */}

        <Box
          sx={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: isPortrait
              ? PORTRAIT_GRID_COLUMNS
              : LANDSCAPE_GRID_COLUMNS,
            alignItems: "center",
            flexShrink: 0,
            height: `${columnHeaderHeight}px`,
          }}
        >
          {COLUMN_LABELS.map((label) => (
            <Typography
              key={label}
              sx={{
                color: extendedColors.green,
                fontSize: columnHeaderSize,
                fontWeight: 700,
                textAlign: "center",
                lineHeight: 1,
                letterSpacing: isPortrait ? "-0.01em" : "0.02em",
                fontFamily: font,
                textShadow: `0 0 10px ${extendedColors.greenShadow}`,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </Typography>
          ))}
        </Box>

        {/* PARTICIPANT ROWS */}

        <Box
          sx={{
            width: "100%",

            mt: isPortrait
              ? `${28 * scale}px`
              : 0,

            display: "flex",
            flexDirection: "column",
            gap: `${rowGap}px`,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",

            opacity: visible ? 1 : 0,

            transform: visible
              ? "translateY(0)"
              : "translateY(18px)",

            transition:
              `opacity ${BATCH_FADE_DURATION_MS}ms ease,
               transform ${BATCH_FADE_DURATION_MS}ms ease`,
          }}
        >
          {currentRows.map((item) => (
            <MemoRankingRow
              key={
                item.participentId ??
                `${item.participantName}-${item.rank}`
              }
              item={item}
              colors={extendedColors}
              font={font}
              scale={scale}
              rowHeightBase={rowHeightBase}
              isPortrait={isPortrait}
            />
          ))}
        </Box>
      </Box>
    </>
  );
}
