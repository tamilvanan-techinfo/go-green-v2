import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";

import {
  Box,
  Avatar,
  Typography,
  Alert,
  CircularProgress,
  CssBaseline,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import { keyframes } from "@emotion/react";
import logo from "../assets/images/logo.png";

import {
  FONT_STYLESHEET_URL,
  DEFAULT_MERGED_COLORS,
  COLORS,
} from "../theme";

import { useSocket } from "../context/SocketContext";
import api from "../../config.json";

const cardEnter = keyframes`
  0% {
    opacity: 0;
    transform: translateY(18px) scale(0.9);
  }

  60% {
    opacity: 1;
    transform: translateY(-2px) scale(1.02);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const API_URL = api.api + "/api/participants-data/";

const electronBridge =
  typeof window !== "undefined"
    ? window.api
    : undefined;

/* ---------------------------------------------------------
   GRID
--------------------------------------------------------- */

function computeGrid(count, bp) {
  const safeCount = Math.min(Math.max(count, 1), 12);

  if (bp === "xs") {
    return {
      columns: 2,
      rows: Math.ceil(safeCount / 2),
    };
  }

  if (bp === "sm") {
    return {
      columns: 3,
      rows: Math.ceil(safeCount / 3),
    };
  }

  return {
    columns: 4,
    rows: Math.ceil(safeCount / 4),
  };
}

/* ---------------------------------------------------------
   NORMALIZE PARTICIPANT
--------------------------------------------------------- */

function normalizeParticipant(raw) {
  return {
    participant_id:
      raw.participent_id ?? raw.participant_id,

    cycle_no: String(
      raw.cycle_no ?? raw.cycle ?? ""
    ).trim(),

    controller_no:
      raw.controller_no ?? "",

    participant_name:
      raw.participant_name ?? "",

    participant_dob:
      raw.participant_dob ?? "",

    participant_profile:
      raw.participant_profile ?? "",

    participant_registered_on:
      raw.participant_registered_on ?? "",
  };
}

/* ---------------------------------------------------------
   PROFILE IMAGE
--------------------------------------------------------- */

function profileImageUrl(path) {
  if (!path) return undefined;

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const base = API_URL.replace(
    /\/api\/.*$/,
    ""
  );

  return `${base}/${path.replace(/^\/+/, "")}`;
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function ParticipentScreen() {
  const muiTheme = useTheme();

  const isXs = useMediaQuery(
    muiTheme.breakpoints.down("sm")
  );

  const isSm = useMediaQuery(
    muiTheme.breakpoints.between("sm", "md")
  );

  const isMd = useMediaQuery(
    muiTheme.breakpoints.between("md", "lg")
  );

  const bp = isXs
    ? "xs"
    : isSm
      ? "sm"
      : isMd
        ? "md"
        : "lg";

  /* -------------------------------------------------------
     LIVE THEME
  ------------------------------------------------------- */

  const socketCtx = useSocket();

  const colors =
    socketCtx?.colors ||
    DEFAULT_MERGED_COLORS.colors;

  const font =
    socketCtx?.fontFamily ||
    DEFAULT_MERGED_COLORS.fontFamily;

  /* -------------------------------------------------------
     STATE
  ------------------------------------------------------- */

  const [participants, setParticipants] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  const participantsRef =
    useRef(participants);

  participantsRef.current =
    participants;

  /* -------------------------------------------------------
     CACHE
  ------------------------------------------------------- */

  const loadFromCache = useCallback(
    async () => {
      if (
        !electronBridge?.participant?.getAll
      ) {
        return [];
      }

      try {
        const cached =
          await electronBridge.participant.getAll();

        return Array.isArray(cached)
          ? cached
          : [];
      } catch (err) {
        console.error(
          "Failed to read participant cache:",
          err
        );

        return [];
      }
    },
    []
  );

  /* -------------------------------------------------------
     API
  ------------------------------------------------------- */

  const fetchFromApi = useCallback(
    async () => {
      const res = await fetch(API_URL);

      if (!res.ok) {
        throw new Error(
          `Request failed with status ${res.status}`
        );
      }

      const json = await res.json();

      if (
        !json?.status ||
        !Array.isArray(json.data)
      ) {
        throw new Error(
          "Unexpected API response shape"
        );
      }

      return json.data.map(
        normalizeParticipant
      );
    },
    []
  );

  /* -------------------------------------------------------
     SAVE CACHE
  ------------------------------------------------------- */

  const persistToCache = useCallback(
    async (list) => {
      if (
        !electronBridge?.participant?.save
      ) {
        return;
      }

      try {
        await Promise.all(
          list.map((p) =>
            electronBridge.participant.save(p)
          )
        );
      } catch (err) {
        console.error(
          "Failed to persist participants to cache:",
          err
        );
      }
    },
    []
  );

  /* -------------------------------------------------------
     REFRESH
  ------------------------------------------------------- */

  const refresh = useCallback(
    async () => {
      try {
        const fresh =
          await fetchFromApi();

        setParticipants(fresh);
        setError(null);

        persistToCache(fresh);
      } catch (err) {
        console.error(
          "Failed to fetch participants from API:",
          err
        );

        setError(
          "Live data unavailable — showing cached data."
        );
      } finally {
        setLoading(false);
      }
    },
    [
      fetchFromApi,
      persistToCache,
    ]
  );

  /* -------------------------------------------------------
     INITIAL LOAD
  ------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached =
        await loadFromCache();

      if (
        !cancelled &&
        cached.length
      ) {
        setParticipants(cached);
        setLoading(false);
      }

      if (!cancelled) {
        await refresh();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    loadFromCache,
    refresh,
  ]);

  /* -------------------------------------------------------
     ELECTRON PARTICIPANT UPDATE
  ------------------------------------------------------- */

  useEffect(() => {
    if (
      !electronBridge?.onParticipantUpdate
    ) {
      return undefined;
    }

    const handleUpdate = (
      payload
    ) => {
      const incoming =
        Array.isArray(payload)
          ? payload
          : [payload];

      const normalized =
        incoming.map(
          normalizeParticipant
        );

      setParticipants((prev) => {
        const byId = new Map(
          prev.map((p) => [
            p.participant_id,
            p,
          ])
        );

        normalized.forEach((p) => {
          byId.set(
            p.participant_id,
            p
          );
        });

        return Array.from(
          byId.values()
        ).sort(
          (a, b) =>
            Number(a.cycle_no) -
            Number(b.cycle_no)
        );
      });

      persistToCache(normalized);
    };

    const unsubscribe =
      electronBridge.onParticipantUpdate(
        handleUpdate
      );

    return () => {
      if (
        typeof unsubscribe ===
        "function"
      ) {
        unsubscribe();
      }
    };
  }, [persistToCache]);

  /* -------------------------------------------------------
     SORT PARTICIPANTS
  ------------------------------------------------------- */

  const sorted = useMemo(() => {
    return [...participants]
      .sort(
        (a, b) =>
          Number(a.cycle_no) -
          Number(b.cycle_no)
      )
      .slice(0, 12);
  }, [participants]);

  const count = sorted.length;

  const {
    columns,
    rows,
  } = useMemo(
    () => computeGrid(count, bp),
    [count, bp]
  );

  /* =======================================================
     RESPONSIVE CARD SIZING

     These are intentionally larger than the old values.
     The card itself provides the available space.
  ======================================================= */

  const cardGap =
    bp === "xs"
      ? "7px"
      : bp === "sm"
        ? "9px"
        : bp === "md"
          ? "12px"
          : "14px";

  const cardPadding =
    bp === "xs"
      ? "7px"
      : bp === "sm"
        ? "9px"
        : bp === "md"
          ? "12px"
          : "14px";

  const avatarSize =
    bp === "xs"
      ? "clamp(48px, 11vw, 72px)"
      : bp === "sm"
        ? "clamp(55px, 8vw, 82px)"
        : bp === "md"
          ? "clamp(68px, 8vh, 105px)"
          : "clamp(75px, 9vh, 125px)";

  const participantNameSize =
    bp === "xs"
      ? "clamp(14px, 3.8vw, 42px)"
      : bp === "sm"
        ? "clamp(16px, 2.6vw, 65px)"
        : bp === "md"
          ? "clamp(20px, 2.7vh, 75px)"
          : "clamp(22px, 2.8vh, 100px)";

  const controllerSize =
    bp === "xs"
      ? "clamp(11px, 2.8vw, 16px)"
      : bp === "sm"
        ? "clamp(12px, 1.8vw, 18px)"
        : bp === "md"
          ? "clamp(14px, 1.9vh, 22px)"
          : "clamp(16px, 2vh, 25px)";

  const dobSize =
    bp === "xs"
      ? "clamp(10px, 2.4vw, 14px)"
      : bp === "sm"
        ? "clamp(11px, 1.5vw, 15px)"
        : bp === "md"
          ? "clamp(13px, 1.6vh, 18px)"
          : "clamp(14px, 1.7vh, 21px)";


  const getParticipantNameSize = (name) => {
    const length = name?.trim().length || 0;

    if (length <= 8) return 58;  // current size
    if (length <= 12) return 52;
    if (length <= 16) return 46;
    if (length <= 20) return 40;
    return 34;
  };

  /* =======================================================
     UI
  ======================================================= */

  return (
    <>
      <CssBaseline />

      <link
        rel="stylesheet"
        href={FONT_STYLESHEET_URL}
      />

      <Box
        sx={{
          width: "100%",
          height: "100vh",

          background:
            colors.backgroundGradient,

          /* LESS OUTER EMPTY SPACE */
          p: {
            xs: "0.8vh 1vw",
            sm: "1vh 1.2vw",
            md: "1.2vh 1.5vw",
            lg: "1.4vh 1.8vw",
          },

          boxSizing: "border-box",

          fontFamily: font,

          display: "flex",
          flexDirection: "column",

          overflow: "hidden",
        }}
      >
        {/* =================================================
            HEADER
        ================================================= */}

        <Box
          sx={{
            flex: "0 0 auto",

            width: "100%",

            border: {
              xs: `3px solid ${colors.headerBorder}`,
              sm: `4px solid ${colors.headerBorder}`,
              md: `5px solid ${colors.headerBorder}`,
            },

            borderRadius: {
              xs: "10px",
              sm: "13px",
              md: "16px",
              lg: "18px",
            },

            px: {
              xs: "1.2vw",
              sm: "1.5vw",
              md: "1.8vw",
              lg: "2vw",
            },

            py: {
              xs: "0.8vh",
              sm: "1vh",
              md: "1.2vh",
              lg: "1.4vh",
            },

            boxShadow:
              `0 0 42px ${colors.headerBorderShadow}`,

            display: "flex",
            alignItems: "center",

            gap: {
              xs: "1vw",
              sm: "1.2vw",
              md: "1.5vw",
              lg: "1.8vw",
            },

            boxSizing: "border-box",

            minHeight: 0,
          }}
        >
          {/* =================================================
              LOGO
          ================================================= */}

          <Box
            sx={{
              width: {
                xs: "clamp(50px, 10vw, 90px)",
                sm: "clamp(80px, 11vw, 140px)",
                md: "clamp(120px, 12vw, 200px)",
                lg: "clamp(140px, 13vw, 230px)",
              },

              height: {
                xs: "clamp(32px, 5.5vh, 60px)",
                sm: "clamp(42px, 6.5vh, 80px)",
                md: "clamp(55px, 8vh, 100px)",
                lg: "clamp(65px, 8.5vh, 115px)",
              },

              flexShrink: 0,

              display: "flex",
              alignItems: "center",
              justifyContent: "center",

              overflow: "hidden",
            }}
          >
            <Box
              component="img"
              src={logo}
              alt="Logo"
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
              onError={(e) => {
                e.target.style.display =
                  "none";
              }}
            />
          </Box>

          {/* =================================================
              TITLE

              Larger + uses more horizontal space
          ================================================= */}

          <Box
            sx={{
              flex: 1,
              minWidth: 0,

              display: "flex",
              flexDirection: "column",

              alignItems: "center",
              justifyContent: "center",

              overflow: "hidden",

              px: {
                xs: "0.5vw",
                sm: "0.8vw",
                md: "1vw",
              },
            }}
          >
            <Typography
              noWrap
              sx={{
                width: "100%",

                fontFamily: font,
                color: colors.white,

                textAlign: "center",

                fontWeight: 750,

                fontSize: {
                  xs: "clamp(11px, 3vw, 34px)",
                  sm: "clamp(15px, 2.8vw, 49px)",
                  md: "clamp(21px, 3vw, 58px)",
                  lg: "clamp(24px, 3.2vw, 69px)",
                },

                textShadow:
                  "0 0 12px rgba(255,255,255,0.5)",

                lineHeight: 1.15,

                overflow: "hidden",
                textOverflow: "ellipsis",

                letterSpacing: {
                  xs: "0.2px",
                  md: "0.5px",
                },
              }}
            >
              GO GREEN CYCLE PEDAL
            </Typography>

            <Typography
              noWrap
              sx={{
                width: "100%",

                fontFamily: font,
                color: colors.white,

                textAlign: "center",

                fontWeight: 750,

                fontSize: {
                  xs: "clamp(10px, 2.7vw, 33px)",
                  sm: "clamp(14px, 2.5vw, 47px)",
                  md: "clamp(19px, 2.8vw, 56px)",
                  lg: "clamp(22px, 3vw, 67px)",
                },

                textShadow:
                  "0 0 12px rgba(255,255,255,0.5)",

                lineHeight: 1.15,

                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              POWERED GAMIFICATION
            </Typography>
          </Box>

          {/* =================================================
              PARTICIPANT LIST

              SINGLE LINE
          ================================================= */}

          <Box
            sx={{
              flexShrink: 0,

              display: "flex",
              alignItems: "center",

              borderLeft:
                `2px solid ${colors.gold}`,

              pl: {
                xs: "1vw",
                sm: "1.3vw",
                md: "1.5vw",
                lg: "1.8vw",
              },

              pr: {
                xs: "0.3vw",
                md: "0.5vw",
              },

              whiteSpace: "nowrap",
            }}
          >
            <Typography
              sx={{
                fontFamily: font,
                color: colors.gold,
                textShadow:"0 0 12px rgba(255,215,0,0.5)",
                textAlign:"center",

                fontWeight: 700,

                fontSize: {
                  xs: "clamp(9px, 2.3vw, 25px)",
                  sm: "clamp(12px, 1.8vw, 30px)",
                  md: "clamp(16px, 2vw, 37px)",
                  lg: "clamp(18px, 2.1vw, 42px)",
                },

                lineHeight: 1.4,

                whiteSpace: "nowrap",

                letterSpacing: {
                  xs: "0.3px",
                  md: "0.8px",
                },
              }}
            >
              PARTICIPANT <br/> LIST
            </Typography>
          </Box>
        </Box>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <Alert
            severity="warning"
            sx={{
              flex: "0 0 auto",

              mt: "0.6vh",

              fontFamily: font,

              py: 0,

              fontSize: {
                xs: "10px",
                sm: "12px",
                md: "14px",
              },
            }}
          >
            {error}
          </Alert>
        )}

        {/* =================================================
            PARTICIPANT GRID
        ================================================= */}

        {loading &&
        participants.length === 0 ? (
          <Box
            sx={{
              flex: 1,

              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <CircularProgress
              sx={{
                color: colors.green,
              }}
            />
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,

              minHeight: 0,

              width: "100%",

              /* USE ALMOST ALL AVAILABLE HEIGHT */
              mt: {
                xs: "0.6vh",
                sm: "0.7vh",
                md: "0.8vh",
              },

              display: "grid",

              gridTemplateColumns:
                `repeat(${columns}, minmax(0, 1fr))`,

              gridTemplateRows:
                `repeat(${rows}, minmax(0, 1fr))`,

              gap: cardGap,

              overflow: "hidden",
            }}
          >
            {sorted.map(
              (p, index) => (
                <Box
                  key={
                    p.participant_id
                  }
                  sx={{
                    position: "relative",

                    width: "100%",
                    height: "100%",

                    display: "flex",

                    flexDirection:
                      "column",

                    alignItems:
                      "center",

                    /*
                     * Center content but use
                     * the available card space.
                     */
                    justifyContent:
                      "center",

                    gap: {
                      xs: "4px",
                      sm: "6px",
                      md: "clamp(6px, 1vh, 12px)",
                      lg: "clamp(7px, 1.1vh, 14px)",
                    },

                    p: cardPadding,

                    minWidth: 0,
                    minHeight: 0,

                    boxSizing:
                      "border-box",

                    overflow:
                      "hidden",

                    borderRadius: {
                      xs: "9px",
                      sm: "12px",
                      md: "15px",
                      lg: "18px",
                    },

                    background:
                      "linear-gradient(160deg, rgba(34,197,94,0.25) 0%, rgba(4,20,10,0.92) 55%, rgba(4,20,10,0.97) 100%)",

                    border: {
                      xs: `1.5px solid ${colors.headerBorder}`,
                      sm: `2px solid ${colors.headerBorder}`,
                      md: `clamp(2px, 0.22vh, 3px) solid ${colors.headerBorder}`,
                    },

                    boxShadow:
                      `0 0 20px ${colors.headerBorderShadow}, 0 6px 18px rgba(0,0,0,0.55), inset 0 0 24px rgba(0,0,0,0.35)`,

                    opacity: 0,

                    animation:
                      `${cardEnter} 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards`,

                    animationDelay:
                      `${Math.min(
                        index * 60,
                        900
                      )}ms`,

                    transition:
                      "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",

                    /* TOP GREEN/GOLD LINE */

                    "&::before": {
                      content: '""',

                      position:
                        "absolute",

                      top: 0,
                      left: 0,
                      right: 0,

                      height: {
                        xs: "2px",
                        sm: "3px",
                        md: "4px",
                      },

                      background:
                        `linear-gradient(90deg, ${colors.green}, ${colors.gold})`,
                    },

                    "&:hover": {
                      transform:
                        "translateY(-3px) scale(1.02)",

                      borderColor:
                        colors.highlightBorder,

                      boxShadow:
                        `0 0 28px ${colors.highlightShadow}, 0 10px 22px rgba(0,0,0,0.6)`,
                    },
                  }}
                >
                  {/* =================================================
                      PROFILE IMAGE
                  ================================================= */}

                  {/* <Avatar
                    src={profileImageUrl(
                      p.participant_profile
                    )}
                    sx={{
                      bgcolor:
                        "#0d3a20",

                      color:
                        colors.white,

                      border:
                        `2px solid ${colors.circleHighlightBorder}`,

                      boxShadow:
                        `0 0 16px ${colors.circleHighlightShadow}, 0 2px 8px rgba(0,0,0,0.55)`,

                      width:
                        avatarSize,

                      height:
                        avatarSize,

                      fontSize: {
                        xs: "28px",
                        sm: "32px",
                        md: "clamp(20px, 3vh, 50px)",
                        lg: "clamp(24px, 3.2vh, 68px)",
                      },

                      fontFamily:
                        font,

                      fontWeight: 800,

                      flexShrink: 0,

                      textShadow:
                        "0 1px 3px rgba(0,0,0,0.6)",
                    }}
                  >
                    {p.participant_name
                      ?.[0]
                      ?.toUpperCase()}
                  </Avatar> */}

                  {/* =================================================
                      PARTICIPANT NAME
                  ================================================= */}

                  <Typography
                    noWrap
                    sx={{
                      fontFamily:
                        font,

                      fontWeight: 800,

                      fontSize:
                        getParticipantNameSize(p.participant_name),

                      color:
                        colors.white,

                      textAlign:
                        "center",

                      width:
                        "100%",

                      maxWidth:
                        "100%",

                      overflow:
                        "hidden",

                      textOverflow:
                        "ellipsis",

                      lineHeight:
                        1.1,

                      textShadow:
                        "0 1px 4px rgba(0,0,0,0.7), 0 0 10px rgba(255,255,255,0.15)",
                    }}
                  >
                    {p.participant_name?.toUpperCase()}
                  </Typography>

                  {/* =================================================
                      CYCLE
                  ================================================= */}

                  <Typography
                    noWrap
                    sx={{
                      fontFamily:
                        font,

                      fontWeight: 700,

                      fontSize:
                        55,

                      color:
                        COLORS.gold,

                      textAlign:
                        "center",

                      maxWidth:
                        "100%",

                      lineHeight:
                        1.1,

                      textShadow:
                        "0 1px 3px rgba(0,0,0,0.6)",
                    }}
                  >
                   {p.cycle_no}
                  </Typography>

                  {/* =================================================
                      DOB
                  ================================================= */}

                  {/* <Typography
                    noWrap
                    sx={{
                      fontFamily:
                        font,

                      fontWeight: 600,

                      fontSize:
                        dobSize,

                      color:
                        "rgba(255,255,255,0.88)",

                      textAlign:
                        "center",

                      maxWidth:
                        "100%",

                      lineHeight:
                        1.1,

                      textShadow:
                        "0 1px 3px rgba(0,0,0,0.6)",
                    }}
                  >
                    DOB {p.participant_dob}
                  </Typography> */}
                </Box>
              )
            )}
          </Box>
        )}
      </Box>
    </>
  );
}