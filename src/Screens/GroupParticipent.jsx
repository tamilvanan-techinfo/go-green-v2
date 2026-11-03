import React from "react";
import {
  Box,
  Typography,
  Avatar,
  CssBaseline,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import logo from "../assets/images/logo.png";

import {
  FONT,
  FONT_STYLESHEET_URL,
  DEFAULT_MERGED_COLORS,
} from "../theme";

import { useSocket } from "../context/SocketContext";
import api from "../../config.json";

const WS_URL = api.ws + "/ws/group-ranking/";
const RECONNECT_DELAY_MS = 2000;

/*
 * ============================================================
 * SESSION STORAGE KEY
 * ============================================================
 */
const SESSION_STORAGE_KEY = "group_participant_rankings";

/*
 * ============================================================
 * SESSION STORAGE HELPERS
 * ============================================================
 */
function saveToSession(groups) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(groups));
  } catch (err) {
    console.warn("[SessionStorage] Failed to save group rankings:", err);
  }
}

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch (err) {
    console.warn("[SessionStorage] Failed to load group rankings:", err);
    return null;
  }
}

const FONT_SCALE = 1.5;

const DUMMY_GROUPS = [
  {
    group_id: "dummy-1",
    group_name: "GROUP A",
    rank: 1,
    total_power: 0,
    participants: [
      { id: "d1", name: "PARTICIPANT A", profile_image: null, power: 0 },
      { id: "d2", name: "PARTICIPANT B", profile_image: null, power: 0 },
    ],
  },
  {
    group_id: "dummy-2",
    group_name: "GROUP B",
    rank: 2,
    total_power: 0,
    participants: [
      { id: "d3", name: "PARTICIPANT C", profile_image: null, power: 0 },
      { id: "d4", name: "PARTICIPANT D", profile_image: null, power: 0 },
    ],
  },
];

/*
 * ============================================================
 * DATA SOURCE ENUM
 * ============================================================
 */
const DATA_SOURCE = {
  DUMMY: "dummy",
  SESSION: "session",   // ← sessionStorage hydration
  LIVE: "live",
};

/* ---------------------------------------------------------
   RESPONSIVE SIZES
--------------------------------------------------------- */

function sizes(bp) {
  return {
    rankCircle:
      bp === "xs"
        ? "clamp(32px, 6vw, 60px)"
        : bp === "sm"
          ? "clamp(38px, 5.5vw, 70px)"
          : bp === "md"
            ? "clamp(44px, 5vw, 76px)"
            : "clamp(50px, 4.5vw, 80px)",

    rankNumber:
      bp === "xs"
        ? "clamp(20px, 4vw, 42px)"
        : bp === "sm"
          ? "clamp(26px, 3.8vw, 50px)"
          : bp === "md"
            ? "clamp(32px, 3.5vw, 58px)"
            : "clamp(38px, 3.2vw, 60px)",

    groupName:
      bp === "xs"
        ? "clamp(22px, 4.5vw, 24px)"
        : bp === "sm"
          ? "clamp(28px, 4vw, 34px)"
          : bp === "md"
            ? "clamp(34px, 3.8vw, 44px)"
            : "clamp(40px, 3.5vw, 54px)",

    groupStat:
      bp === "xs"
        ? "clamp(18px, 3.5vw, 10px)"
        : bp === "sm"
          ? "clamp(22px, 3.2vw, 23px)"
          : bp === "md"
            ? "clamp(26px, 3vw, 30px)"
            : "clamp(30px, 2.8vw, 38px)",

    memberName:
      bp === "xs"
        ? "clamp(20px, 4vw, 32px)"
        : bp === "sm"
          ? "clamp(26px, 3.8vw, 42px)"
          : bp === "md"
            ? "clamp(32px, 3.5vw, 52px)"
            : "clamp(38px, 3.2vw, 62px)",

    memberStat:
      bp === "xs"
        ? "clamp(16px, 3vw, 26px)"
        : bp === "sm"
          ? "clamp(20px, 2.8vw, 34px)"
          : bp === "md"
            ? "clamp(24px, 2.6vw, 42px)"
            : "clamp(28px, 2.4vw, 50px)",

    avatar:
      bp === "xs"
        ? "clamp(30px, 6vw, 44px)"
        : bp === "sm"
          ? "clamp(38px, 5.5vw, 54px)"
          : bp === "md"
            ? "clamp(46px, 5vw, 64px)"
            : "clamp(54px, 4.5vw, 74px)",

    rowGap:
      bp === "xs"
        ? "clamp(6px, 1vw, 10px)"
        : bp === "sm"
          ? "clamp(8px, 1vw, 12px)"
          : "clamp(10px, 0.8vw, 16px)",

    rowPadX:
      bp === "xs"
        ? "clamp(8px, 1.5vw, 16px)"
        : bp === "sm"
          ? "clamp(10px, 1.5vw, 20px)"
          : "clamp(14px, 1.3vw, 26px)",

    rowPadY:
      bp === "xs"
        ? "clamp(6px, 1vh, 12px)"
        : bp === "sm"
          ? "clamp(8px, 1vh, 14px)"
          : "clamp(10px, 1vh, 18px)",

    chipGap:
      bp === "xs"
        ? "clamp(6px, 1vw, 10px)"
        : "clamp(8px, 0.8vw, 14px)",

    chipPadX:
      bp === "xs"
        ? "clamp(8px, 1.5vw, 14px)"
        : bp === "sm"
          ? "clamp(10px, 1.2vw, 18px)"
          : "clamp(12px, 1vw, 22px)",

    chipPadY:
      bp === "xs"
        ? "clamp(6px, 0.8vh, 10px)"
        : bp === "sm"
          ? "clamp(8px, 0.8vh, 12px)"
          : "clamp(10px, 0.8vh, 14px)",

    radius:
      bp === "xs" ? "12px" : bp === "sm" ? "15px" : "18px",
  };
}

/* ---------------------------------------------------------
   RANK BADGE
--------------------------------------------------------- */

function RankBadge({ rank, highlighted, S, colors }) {
  return (
    <Box
      sx={{
        width: S.rankCircle,
        height: S.rankCircle,
        minWidth: S.rankCircle,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        bgcolor: colors.circleBg,
        border: highlighted
          ? `3px solid ${colors.circleHighlightBorder}`
          : `3px solid ${colors.white}`,
        boxShadow: highlighted
          ? `0 0 14px ${colors.circleHighlightShadow}`
          : "none",
      }}
    >
      <Typography
        sx={{
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: S.rankNumber,
          color: highlighted ? colors.green : colors.white,
          lineHeight: 1,
        }}
      >
        {rank}
      </Typography>
    </Box>
  );
}

/* ---------------------------------------------------------
   MEMBER CHIP
--------------------------------------------------------- */

function MemberChip({ member, S, colors }) {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        justifyContent: "center",
        textAlign: "center",
        gap: S.chipGap,
        bgcolor: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "clamp(8px, 0.7vw, 14px)",
        px: S.chipPadX,
        py: S.chipPadY,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
        <Typography
          noWrap
          sx={{
            fontFamily: FONT,
            color: colors.gold,
            fontWeight: 650,
            fontSize: 54,
            lineHeight: 1.2,
          }}
        >
          {member.cycle ?? "—"}
        </Typography>

        <Typography
          noWrap
          sx={{
            fontFamily: FONT,
            color: colors.green,
            fontWeight: 650,
            fontSize: 54,
            lineHeight: 1.2,
          }}
        >
          {(member.power ?? 0).toFixed(1)}W
        </Typography>
      </Box>
    </Box>
  );
}

/* ---------------------------------------------------------
   GROUP ROW
--------------------------------------------------------- */

function GroupRow({ group, S, colors, bp }) {
  const highlighted = group.rank === 1;
  const participantCount = group.participants?.length || 0;

  const participantColumns =
    bp === "xs"
      ? participantCount <= 1
        ? "1fr"
        : "repeat(2, minmax(0, 1fr))"
      : bp === "sm"
        ? participantCount <= 1
          ? "1fr"
          : "repeat(2, minmax(0, 1fr))"
        : participantCount <= 1
          ? "1fr"
          : participantCount === 2
            ? "repeat(2, minmax(0, 1fr))"
            : participantCount === 3
              ? "repeat(3, minmax(0, 1fr))"
              : "repeat(4, minmax(0, 1fr))";

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "stretch",
        gap: S.rowGap,
        border: highlighted
          ? `3px solid ${colors.highlightBorder}`
          : `2px solid ${colors.normalRowBorder}`,
        borderRadius: S.radius,
        px: S.rowPadX,
        py: S.rowPadY,
        boxShadow: highlighted ? `0 0 20px ${colors.highlightShadow}` : "none",
        overflow: "hidden",
      }}
    >
      {/* RANK */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <RankBadge rank={group.rank} highlighted={highlighted} S={S} colors={colors} />
      </Box>

      {/* GROUP INFO */}
      <Box
        sx={{
          flex: {
            xs: "0 0 clamp(90px, 24vw, 140px)",
            sm: "0 0 clamp(110px, 20vw, 180px)",
            md: "0 0 clamp(150px, 17vw, 220px)",
            lg: "0 0 clamp(180px, 15vw, 260px)",
          },
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Typography
          noWrap
          sx={{
            fontFamily: FONT,
            color: colors.white,
            fontWeight: 700,
            fontSize: S.groupName,
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.2,
          }}
        >
          {group.group_name?.toUpperCase()}
        </Typography>

        <Typography
          noWrap
          sx={{
            fontFamily: FONT,
            color: colors.gold,
            fontWeight: 600,
            fontSize: S.groupStat,
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.2,
          }}
        >
          {(group.total_power ?? 0).toFixed(1)}W TOTAL
        </Typography>
      </Box>

      {/* PARTICIPANTS */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: participantColumns,
          gridAutoRows: "minmax(0, 1fr)",
          gap: S.chipGap,
          alignItems: "stretch",
          overflow: "hidden",
        }}
      >
        {group.participants?.slice(0, 4).map((member) => (
          <MemberChip key={member.id} member={member} S={S} colors={colors} />
        ))}
      </Box>
    </Box>
  );
}

const MemoGroupRow = React.memo(GroupRow);

/* ---------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------- */

function GroupParticipent() {
  /*
   * ----------------------------------------------------------
   * STATE
   *
   * Priority on mount:
   *   1. sessionStorage  → DATA_SOURCE.SESSION  (instant, no flash)
   *   2. dummy data      → DATA_SOURCE.DUMMY
   *
   * Once live WS data arrives:
   *   3. live data       → DATA_SOURCE.LIVE  (also updates sessionStorage)
   * ----------------------------------------------------------
   */

  // ── Synchronous seed — no flash of dummy data if session exists ──
  const sessionSeed = React.useMemo(() => loadFromSession(), []);

  const [groups, setGroups] = React.useState(
    sessionSeed ?? DUMMY_GROUPS
  );

  const [dataSource, setDataSource] = React.useState(
    sessionSeed ? DATA_SOURCE.SESSION : DATA_SOURCE.DUMMY
  );

  const muiTheme = useTheme();
  const isXs = useMediaQuery(muiTheme.breakpoints.down("sm"));
  const isSm = useMediaQuery(muiTheme.breakpoints.between("sm", "md"));
  const isMd = useMediaQuery(muiTheme.breakpoints.between("md", "lg"));
  const bp = isXs ? "xs" : isSm ? "sm" : isMd ? "md" : "lg";

  const S = React.useMemo(() => sizes(bp), [bp]);

  const socketCtx = useSocket();
  const colors = socketCtx?.colors ?? DEFAULT_MERGED_COLORS.colors;

  const socketRef         = React.useRef(null);
  const reconnectTimerRef = React.useRef(null);
  const isMountedRef      = React.useRef(true);

  /* -------------------------------------------------------
     WEBSOCKET
  ------------------------------------------------------- */

  const handleMessage = React.useCallback((event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.error("Bad WS payload:", err);
      return;
    }

    if (data.type !== "group_heartbeat" || !Array.isArray(data.groups)) return;
    if (!isMountedRef.current) return;

    setGroups(data.groups);
    setDataSource(DATA_SOURCE.LIVE);

    /*
     * ── UPDATE SESSION STORAGE with the latest live group data ──
     *
     * Replaces the old localStorage approach entirely.
     * On next mount, sessionSeed picks this up instantly.
     */
    saveToSession(data.groups);
  }, []);

  const connect = React.useCallback(() => {
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen    = () => console.log("Group socket opened");
    ws.onmessage = handleMessage;
    ws.onerror   = (error) => console.error("WebSocket error:", error);
    ws.onclose   = () => {
      console.log("Group socket closed — retrying in", RECONNECT_DELAY_MS, "ms");
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, [handleMessage]);

  React.useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  /* -------------------------------------------------------
     RANKING DATA
  ------------------------------------------------------- */

  const rankedGroups = React.useMemo(
    () => [...groups].sort((a, b) => a.rank - b.rank),
    [groups]
  );

  /* -------------------------------------------------------
     UI
  ------------------------------------------------------- */

  return (
    <>
      <CssBaseline />
      <link rel="stylesheet" href={FONT_STYLESHEET_URL} />

      <Box
        sx={{
          width: "100%",
          height: "100vh",
          background: colors.backgroundGradient,
          p: { xs: "1vh 1.5vw", sm: "1.5vh 2vw", md: "2vh 2.5vw", lg: "2vh 3vw" },
          boxSizing: "border-box",
          fontFamily: FONT,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <Box
          sx={{
            width: "100%",
            border: {
              xs: `3px solid ${colors.headerBorder}`,
              sm: `4px solid ${colors.headerBorder}`,
              md: `5px solid ${colors.headerBorder}`,
            },
            borderRadius: { xs: "10px", sm: "14px", md: "18px" },
            px: { xs: "0.8vw", sm: "1.2vw", md: "1.5vw", lg: "1.8vw" },
            py: { xs: "0.8vh", sm: "1vh", md: "1.2vh", lg: "1.5vh" },
            boxShadow: `0 0 42px ${colors.headerBorderShadow}`,
            display: "flex",
            alignItems: "center",
            gap: { xs: "0.8vw", sm: "1vw", md: "1.5vw" },
            flexShrink: 0,
            boxSizing: "border-box",
            minHeight: 0,
          }}
        >
          {/* LOGO */}
          <Box
            sx={{
              width: "clamp(140px, 13vw, 260px)",
              height: "clamp(60px, 9vh, 105px)",
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
              sx={{ width: "100%", height: "100%", objectFit: "contain" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          </Box>

          {/* CENTER TITLE */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              px: { xs: "0.5vw", sm: "0.8vw", md: "1vw" },
            }}
          >
            <Typography
              noWrap
              sx={{
                width: "100%",
                fontFamily: FONT,
                color: colors.white,
                textAlign: "center",
                fontWeight: 700,
                fontSize: "68px",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textShadow: "0 0 15px rgba(255,255,255,0.4)",
              }}
            >
              GO GREEN CYCLE PEDAL
            </Typography>

            <Typography
              noWrap
              sx={{
                width: "100%",
                fontFamily: FONT,
                color: colors.white,
                textAlign: "center",
                fontWeight: 700,
                fontSize: 68,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textShadow: "0 0 15px rgba(255,255,255,0.4)",
              }}
            >
              POWERED GAMIFICATION
            </Typography>
          </Box>

          {/* GROUP METRIC */}
          <Box
            sx={{
              textAlign: "center",
              borderLeft: `2px solid ${colors.gold}`,
              pl: { xs: "1vw", sm: "1.2vw", md: "1.5vw" },
              pr: { xs: "0.5vw", sm: "0.8vw", md: "1vw" },
              flexShrink: 0,
              minWidth: "fit-content",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography
              noWrap
              sx={{
                fontFamily: FONT,
                color: colors.gold,
                textShadow: "0 0 12px rgba(255,215,0,0.5)",
                fontWeight: 700,
                fontSize: {
                  xs: "clamp(9px, 2.3vw, 27px)",
                  sm: "clamp(12px, 1.8vw, 32px)",
                  md: "clamp(16px, 2vw, 39px)",
                  lg: "clamp(18px, 2.1vw, 44px)",
                },
                lineHeight: 1.5,
                whiteSpace: "nowrap",
                letterSpacing: { xs: "0.5px", sm: "1px", md: "1.5px" },
              }}
            >
              GROUP <br /> METRIC
            </Typography>
          </Box>
        </Box>

        {/* GROUP RANKINGS TITLE */}
        <Typography
          align="center"
          sx={{
            flexShrink: 0,
            fontFamily: FONT,
            color: colors.white,
            fontWeight: 700,
            fontSize: "49px",
            letterSpacing: { xs: "1px", sm: "1.5px", md: "2px" },
            mt: { xs: "0.5vh", sm: "0.7vh", md: "0.8vh" },
            mb: { xs: "0.3vh", sm: "0.4vh", md: "0.5vh" },
          }}
        >
          GROUP RANKINGS
        </Typography>

        {/* GROUP ROWS */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            display: "grid",
            gridTemplateRows: `repeat(${Math.max(rankedGroups.length, 1)}, minmax(0, 1fr))`,
            gap: { xs: "0.8vh", sm: "1vh", md: "1.2vh", lg: "1.5vh" },
            overflow: "hidden",
            mt: { xs: "0.2vh", sm: "0.3vh", md: "0.4vh" },
            pb: { xs: "0.3vh", sm: "0.5vh" },
          }}
        >
          {rankedGroups.map((group) => (
            <MemoGroupRow
              key={group.group_id}
              group={group}
              colors={colors}
              S={S}
              bp={bp}
            />
          ))}
        </Box>
      </Box>
    </>
  );
}

export default GroupParticipent;