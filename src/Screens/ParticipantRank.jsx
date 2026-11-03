import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";

import { Box, Typography, Avatar, CssBaseline } from "@mui/material";

import logo from "../assets/images/logo.png";
import { FONT_STYLESHEET_URL, DEFAULT_MERGED_COLORS } from "../theme";

import { useSocket } from "../context/SocketContext";
import Header from "../components/Header";

/* =========================================================
  CONSTANTS
========================================================= */

const TOP_10_API = "http://192.168.1.46:8000/api/admin/cycle-history/1/top-10/";

// RANK | PARTICIPANT | DURATION | VOLTAGE | POWER
const EVEN_GRID_COLUMNS = "12% 28% 20% 20% 20%";

const VISIBLE_RANKS_PER_BATCH = 5;

const BATCH_ROTATE_INTERVAL_MS = 5000;

const BATCH_FADE_DURATION_MS = 450;

const COLUMN_LABELS = ["RANK", "PARTICIPANT", "DURATION", "VOLTAGE", "POWER"];

/* =========================================================
  DATA SOURCE
========================================================= */

const DATA_SOURCE = {
  DUMMY: "dummy",
  API: "api",
  CACHE: "cache",
  LIVE: "live",
};

/* =========================================================
  DUMMY DATA (used only when API has no data)
  duration is in seconds
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
  return Number.isFinite(n) ? n : fallback;
}

// 1583.95 -> "26:24", 5000 -> "1:23:20"
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(toFiniteNumber(totalSeconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");

  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
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
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
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

/* =========================================================
  RESPONSIVE SCALE
========================================================= */

function useDisplayScale(containerWidth, containerHeight) {
  return useMemo(() => {
    if (!containerWidth || !containerHeight) return 1;

    const ws = containerWidth / 1920;
    const hs = containerHeight / 1075;

    return Math.min(Math.max(Math.min(ws, hs), 0.45), 1.8);
  }, [containerWidth, containerHeight]);
}

/* =========================================================
  RANKING ROW (5 columns)
========================================================= */

function RankingRow({ item, colors, font, scale }) {
  const rowHeight = 122 * scale;
  const nameFontSize = 56 * scale;
  const valFontSize = 56 * scale;

  const cellSx = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minWidth: 0,
    height: "100%",
  };

  const textSx = {
    color: colors.white,
    fontWeight: 800,
    lineHeight: 1,
    textAlign: "center",
    fontFamily: font,
    textShadow: "0 0 12px rgba(255,255,255,0.25)",
  };

  return (
    <Box
      className="pr-rank-row"
      sx={{
        width: "100%",
        height: rowHeight,
        flexShrink: 0,
        display: "grid",
        gridTemplateColumns: EVEN_GRID_COLUMNS,
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
        overflow: "visible",
      }}
    >
      {/* RANK */}
      <Box sx={cellSx}>
        <Avatar
          sx={{
            width: 88 * scale,
            height: 88 * scale,
            bgcolor: "transparent",
            color: colors.white,
            fontFamily: font,
            fontWeight: 800,
            fontSize: 56 * scale,
            border: `${2 * scale}px solid ${colors.white}`,
            boxShadow: "none",
            textShadow: "none",
          }}
        >
          {item.rank}
        </Avatar>
      </Box>

      {/* PARTICIPANT */}
      <Box sx={cellSx}>
        <Typography noWrap sx={{ ...textSx, fontSize: nameFontSize }}>
          {item.participantName}
        </Typography>
      </Box>

      {/* DURATION */}
      <Box sx={cellSx}>
        <Typography
          sx={{ ...textSx, fontSize: valFontSize, whiteSpace: "nowrap" }}
        >
          {formatDuration(item.duration)}
        </Typography>
      </Box>

      {/* VOLTAGE */}
      <Box sx={cellSx}>
        <Typography
          sx={{ ...textSx, fontSize: valFontSize, whiteSpace: "nowrap" }}
        >
          {Number(item.voltage).toFixed(1)}V
        </Typography>
      </Box>

      {/* POWER */}
      <Box sx={cellSx}>
        <Typography
          sx={{ ...textSx, fontSize: valFontSize, whiteSpace: "nowrap" }}
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
  const [batchSec, setBatchSec] = useState(5); // cycle duration from API (not yet used for rotation)

  const colors = socketCtx?.colors ?? DEFAULT_MERGED_COLORS.colors;
  const font = socketCtx?.fontFamily ?? DEFAULT_MERGED_COLORS.fontFamily;

  /* ---------- COLORS ---------- */

  const extendedColors = useMemo(
    () => ({
      ...colors,
      greenBright: colors.greenBright ?? "#B8FF00",
      normalBorder: colors.normalBorder ?? "rgba(255,255,255,0.72)",
      row: colors.row ?? "#082A1A",
      gold: colors.gold ?? "#FFD000",
      greenShadow: colors.greenShadow ?? "rgba(57,232,120,0.45)",
    }),
    [colors]
  );

  /* ---------- STATE ---------- */

  const [allocations, setAllocations] = useState([]);
  const [dataSource, setDataSource] = useState(DATA_SOURCE.DUMMY);

  const isMountedRef = useRef(true);

  /* ---------- NORMALIZE API RESPONSE ---------- */

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

    return rows.slice(0, 10).map((item, index) => ({
      rank: Number(item.rank) || index + 1,
      participantName: getParticipantName(item, `PARTICIPANT ${index + 1}`),
      duration: getDuration(item),
      voltage: toFiniteNumber(
        item.voltage ?? item.total_voltage ?? item.participant_voltage
      ),
      power: toFiniteNumber(
        item.power ?? item.total_power ?? item.participant_power
      ),
      participentId:
        item.participant_id ?? item.participent_id ?? item.id ?? `api-${index}`,
    }));
  }, []);

  /* ---------- LOAD TOP 10 FROM API ---------- */

  const loadTop10 = useCallback(async () => {
    try {
      const response = await fetch(TOP_10_API, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      if (data?.cycle?.duration != null) {
        setBatchSec(data.cycle.duration);
      }

      const rankedRows = normalizeParticipants(data);

      if (isMountedRef.current && rankedRows.length > 0) {
        setAllocations(rankedRows);
        setDataSource(DATA_SOURCE.API);
      }
    } catch (error) {
      console.error("[ParticipantRank] Failed to load top 10:", error);
    }
  }, [normalizeParticipants]);

  /* ---------- INITIAL LOAD ---------- */

  useEffect(() => {
    isMountedRef.current = true;

    loadTop10();

    const apiTimer = setInterval(loadTop10, 5000);

    return () => {
      isMountedRef.current = false;
      clearInterval(apiTimer);
    };
  }, [loadTop10]);

  /* ---------- FALLBACK / NORMALIZE ---------- */

  const rankings = useMemo(() => {
    if (dataSource === DATA_SOURCE.DUMMY) {
      return DUMMY_PARTICIPANTS.map((item) => ({
        ...item,
        highlighted: item.rank === 1,
      }));
    }

    return [...allocations]
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .slice(0, 10)
      .map((item, index) => ({
        rank: Number(item.rank) || index + 1,
        participentId: item.participentId ?? item.participant_id ?? index,
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
  }, [allocations, dataSource]);

  /* ---------- BATCHES (1-5, 6-10) ---------- */

  const batches = useMemo(() => {
    const first = rankings.slice(0, VISIBLE_RANKS_PER_BATCH);
    const second = rankings.slice(
      VISIBLE_RANKS_PER_BATCH,
      VISIBLE_RANKS_PER_BATCH * 2
    );

    return [first, second].filter((batch) => batch.length > 0);
  }, [rankings]);

  /* ---------- BATCH ROTATION ---------- */

  const [currentBatch, setCurrentBatch] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (batches.length <= 1) return;

    let fadeTimer;

    const interval = setInterval(() => {
      setVisible(false);

      fadeTimer = setTimeout(() => {
        setCurrentBatch((current) => (current + 1) % batches.length);
        setVisible(true);
      }, BATCH_FADE_DURATION_MS);
    }, BATCH_ROTATE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(fadeTimer);
    };
  }, [batches.length]);

  // If data changes and current batch no longer exists, reset to batch 0
  useEffect(() => {
    if (currentBatch >= batches.length) {
      setCurrentBatch(0);
    }
  }, [batches.length, currentBatch]);

  /* ---------- CURRENT BATCH ---------- */

  const currentRows = useMemo(
    () =>
      (batches[currentBatch] ?? []).map((item, index) => ({
        ...item,
        highlighted: index === 0,
      })),
    [batches, currentBatch]
  );

  /* ---------- CONTAINER SIZE ---------- */

  const [containerRef, containerSize] = useElementSize();

  const scale = useDisplayScale(containerSize.width, containerSize.height);

  /* ---------- DERIVED SIZES ---------- */

  const headerHeight = 145 * scale;
  const titleFontSize = 53 * scale;
  const sectionTitleSize = 64 * scale;
  const columnHeaderSize = 48 * scale;
  const topLeadersHeight = 105 * scale;
  const columnHeaderHeight = 62 * scale;
  const rowGap = 14 * scale;

  /* =======================================================
    RENDER
  ======================================================= */

  return (
    <>
      <CssBaseline />

      <link rel="stylesheet" href={FONT_STYLESHEET_URL} />

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
            `radial-gradient(ellipse at top, #0B321E 0%, #061D11 55%, #03150B 100%)`,
          fontFamily: font,
          color: extendedColors.white,
          display: "flex",
          flexDirection: "column",
          px: `${50 * scale}px`,
          pt: `${28 * scale}px`,
          pb: `${20 * scale}px`,
        }}
      >
        {/* HEADER */}
          <Header/>

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
              letterSpacing: "0.02em",
              textAlign: "center",
              fontFamily: font,
              textShadow:
                "0 0 12px rgba(255,255,255,0.6), 0 0 25px rgba(255,255,255,0.2)",
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
            gridTemplateColumns: EVEN_GRID_COLUMNS,
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
                letterSpacing: "0.02em",
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
            mt: "1%",
            display: "flex",
            flexDirection: "column",
            gap: `${rowGap}px`,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(18px)",
            transition: `opacity ${BATCH_FADE_DURATION_MS}ms ease, transform ${BATCH_FADE_DURATION_MS}ms ease`,
          }}
        >
          {currentRows.map((item) => (
            <MemoRankingRow
              key={item.participentId ?? `${item.participantName}-${item.rank}`}
              item={item}
              colors={extendedColors}
              font={font}
              scale={scale}
            />
          ))}
        </Box>
      </Box>
    </>
  );
}