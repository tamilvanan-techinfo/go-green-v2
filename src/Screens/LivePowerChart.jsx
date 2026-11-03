import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import ReactECharts from "echarts-for-react";

import {
    Box,
    Card,
    CardContent,
    Stack,
    Typography,
    Fade,
    useMediaQuery,
    useTheme,
} from "@mui/material";

import BoltIcon from "@mui/icons-material/Bolt";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import GroupsIcon from "@mui/icons-material/Groups";
import ShowChartIcon from "@mui/icons-material/ShowChart";

import logo from "../assets/images/logo.png";

import {
    colorForIndex,
    COLORS,
    DEFAULT_MERGED_COLORS,
} from "../theme.jsx";

import { useSocket } from "../context/SocketContext";
import api from "../../config.json";

const WS_BASE_URL =
    api.ws + "/ws/power-monitor/client/";

const FALLBACK_MINUTES = 10;
const RECONNECT_DELAY_MS = 3000;

/* =========================================================
   PARTICIPANT COLORS
========================================================= */

function useParticipantColors(series) {
    const colorMapRef = useRef(new Map());

    Object.keys(series)
        .sort()
        .forEach((key) => {
            if (!colorMapRef.current.has(key)) {
                colorMapRef.current.set(
                    key,
                    colorMapRef.current.size 
                );
            }
        });

    return colorMapRef.current;
}
/* =========================================================
   POWER FORMAT
========================================================= */

function formatPower(value) {
    const power = Number(value);

    if (!Number.isFinite(power)) {
        return "0";
    }

    const rounded = Number(power.toFixed(2));

    // Don't display tiny non-zero values as 0
    if (power !== 0 && rounded === 0) {
        return power > 0 ? "0.01" : "-0.01";
    }

    return String(rounded);
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function LivePowerLineChart() {
    const wsRef = useRef(null);
    const reconnectRef = useRef(null);

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

    /* =======================================================
       LIVE THEME
    ======================================================= */

    const socketCtx = useSocket();

    const colors =
        socketCtx?.colors ||
        DEFAULT_MERGED_COLORS.colors;

    const theme =
        socketCtx?.theme ||
        DEFAULT_MERGED_COLORS.theme;

    const font =
        socketCtx?.fontFamily ||
        DEFAULT_MERGED_COLORS.fontFamily;

    /* =======================================================
       STATE
    ======================================================= */

    const [connected, setConnected] =
        useState(false);

    const [lastUpdated, setLastUpdated] =
        useState(null);

    const [minutes, setMinutes] =
        useState(FALLBACK_MINUTES);

    const [selectedCycles, setSelectedCycles] =
        useState(null);

    const [series, setSeries] =
        useState({});

    /* =======================================================
       SOCKET
    ======================================================= */

    useEffect(() => {
        let active = true;

        const isActive = () => active;

        const connectSocket = () => {
            const socket =
                new WebSocket(WS_BASE_URL);

            wsRef.current = socket;

            socket.onopen = () => {
                if (!isActive()) return;

                setConnected(true);
            };

            socket.onmessage = ({ data }) => {
                if (!isActive()) return;

                let message;

                try {
                    message = JSON.parse(data);
                } catch {
                    return;
                }

                if (
                    message.type !== "trend"
                ) {
                    return;
                }

                const nextSeries = {};

                (
                    message.series || []
                ).forEach((p) => {
                    nextSeries[
                        p.participant_cycle_id
                    ] = {
                        name:
                            p.participant_name,

                        cycle_no:
                            p.cycle_no,

                        points:
                            (
                                p.points || []
                            ).map(
                                (pt) => ({
                                    time:
                                        Date.parse(
                                            pt.time
                                        ),

                                    power:
                                        pt.power,

                                    voltage:
                                        pt.voltage,

                                    current:
                                        pt.current,
                                })
                            ),
                    };
                });

                setSeries(nextSeries);

                setLastUpdated(
                    new Date()
                );

                if (
                    typeof message.window_minutes ===
                    "number"
                ) {
                    setMinutes(
                        message.window_minutes
                    );
                }

                setSelectedCycles(
                    message.cycles ?? null
                );
            };

            socket.onclose = () => {
                if (!isActive()) return;

                setConnected(false);

                reconnectRef.current =
                    setTimeout(
                        connectSocket,
                        RECONNECT_DELAY_MS
                    );
            };

            socket.onerror = () => {
                socket.close();
            };
        };

        connectSocket();

        return () => {
            active = false;

            if (reconnectRef.current) {
                clearTimeout(
                    reconnectRef.current
                );

                reconnectRef.current =
                    null;
            }

            if (wsRef.current) {
                const socket =
                    wsRef.current;

                wsRef.current = null;

                socket.onopen = null;
                socket.onmessage = null;
                socket.onclose = null;
                socket.onerror = null;

                if (
                    socket.readyState ===
                    WebSocket.OPEN ||
                    socket.readyState ===
                    WebSocket.CONNECTING
                ) {
                    socket.close();
                }
            }
        };
    }, []);

    /* =======================================================
       DERIVED DATA
    ======================================================= */

    const latest = useMemo(() => {
        return Object.entries(
            series
        ).map(([key, bucket]) => {
            const lastPoint =
                bucket.points[
                    bucket.points.length - 1
                ];

            return {
                participant_cycle_id:
                    key,

                participant_name:
                    bucket.name,

                cycle_no:
                    bucket.cycle_no,

                power:
                    lastPoint
                        ? lastPoint.power
                        : 0,
            };
        });
    }, [series]);

    const participantColors =
        useParticipantColors(series);

    /* =======================================================
       CHART
    ======================================================= */

    const option = useMemo(() => {
        const entries =
            Object.entries(series);

        const chartSeries =
            entries.map(
                ([key, bucket]) => {
                    const colorIdx =
                        participantColors.get(
                            key
                        ) ?? 0;

                    const solid =
                        colorForIndex(
                            colorIdx,
                            1
                        );

                    const soft =
                        colorForIndex(
                            colorIdx,
                            0.22
                        );

                    const transparent =
                        colorForIndex(
                            colorIdx,
                            0
                        );

                    return {
                        id: key,

                        name:
                            `${bucket.cycle_no}`,

                        type: "line",

                        showSymbol: false,

                        smooth: false,

                        step: false,

                        symbol: "circle",

                        symbolSize: 6,

                        lineStyle: {
                            width: 6,
                            color: solid,
                            cap: "round",
                            join: "round",
                        },

                        itemStyle: {
                            color: solid,
                            borderColor:
                                theme.bg,
                            borderWidth: 2,
                        },

                        emphasis: {
                            focus: "series",

                            lineStyle: {
                                width: 4,
                            },
                        },

                        areaStyle: {
                            color: {
                                type:
                                    "linear",

                                x: 0,
                                y: 0,
                                x2: 0,
                                y2: 1,

                                colorStops: [
                                    {
                                        offset: 0,
                                        color: soft,
                                    },
                                    {
                                        offset: 1,
                                        color:
                                            transparent,
                                    },
                                ],
                            },
                        },

                        data:
                            bucket.points.map(
                                (pt) => [
                                    pt.time,
                                    pt.power,
                                ]
                            ),
                    };
                }
            );

        return {
            backgroundColor:
                "transparent",

            animationDuration: 300,

            tooltip: {
                trigger: "axis",

                axisPointer: {
                    type: "cross",

                    label: {
                        backgroundColor:
                            theme.panel,

                        borderColor:
                            theme.panelBorder,

                        color:
                            theme.text,

                        fontFamily:
                            font,
                    },

                    lineStyle: {
                        color:
                            theme.neon,

                        opacity: 0.4,
                    },

                    crossStyle: {
                        color:
                            theme.neon,

                        opacity: 0.4,
                    },
                },

                backgroundColor:
                    theme.panel,

                borderColor:
                    theme.panelBorder,

                borderWidth: 1.5,

                padding: [
                    12,
                    16,
                ],

                extraCssText:
                    "border-radius: 10px; box-shadow: 0 0 24px rgba(57,255,136,0.18);",

                textStyle: {
                    color:
                        theme.text,

                    fontFamily:
                        font,

                    fontSize: 22,
                },

                valueFormatter: (value) =>
    `${formatPower(value)} W`,
            },

            legend: {
                top: 0,

                type: "scroll",

                pageIconColor:
                    theme.neon,

                pageIconInactiveColor:
                    theme.muted,

                pageTextStyle: {
                    color:
                        theme.subtext,
                },

                textStyle: {
                    color:
                        theme.text,

                    fontFamily:
                        font,

                    fontSize: 35,

                    fontWeight: 900,
                },

                icon: "circle",

                itemWidth: 24,

                itemHeight: 24,

                itemGap: 22,
                // Force one legend row

                height : 40
            },

            grid: {
                left: 40,
                right: 28,
                top: 75,
                bottom: 8,
                containLabel: true,
},

            xAxis: {
                type: "time",

                axisLine: {
                    lineStyle: {
                        color:
                            theme.panelBorder,

                        width: 1.5,
                    },
                },

                axisTick: {
                    lineStyle: {
                        color:
                            theme.panelBorder,
                    },
                },

                axisLabel: {
                    color:
                        COLORS.white,

                    fontFamily:
                        font,

                    fontSize: 27,
                    margin : 20,

                    fontWeight: 600,
                    alignMinLabel: true,
                    alignMaxLabel: true,

                    formatter: (value) =>
                        new Date(
                            value
                        ).toLocaleTimeString(
                            [],
                            {
                                hour:
                                    "2-digit",

                                minute:
                                    "2-digit",
                            }
                        ),
                },

                splitLine: {
                    show: false,
                },
            },

            yAxis: {
                type: "value",

                // name: "Power (W)",
                // nameLocation: "middle",
                // nameRotate: 90,
                // nameGap: 76,

                // nameTextStyle: {
                //     color:
                //         COLORS.white,

                //     fontSize: 32,

                //     fontWeight: 600,

                //     fontFamily:
                //         font,
                //     align:"center",
                // },

                axisLabel: {
                    color:
                        COLORS.white,

                    fontFamily:
                        font,

                    fontSize: 36,

                    fontWeight: 700,
                    formatter: (value) => formatPower(value),
                },

                splitLine: {
                    lineStyle: {
                        color:
                            theme.divider,

                        type:
                            "dashed",
                    },
                },
            },

            series:
                chartSeries,
        };
    }, [
        series,
        participantColors,
        theme,
        font,
    ]);

    /* =======================================================
       STATISTICS
    ======================================================= */

    const totalPower =
        latest.reduce(
            (sum, p) =>
                sum + p.power,
            0
        );

    const avgPower =
        latest.length
            ? totalPower /
              latest.length
            : 0;

    const leader =
        [...latest].sort(
            (a, b) =>
                b.power -
                a.power
        )[0];

    const hasData =
        Object.keys(series)
            .length > 0;

    const cyclesLabel =
        selectedCycles &&
        selectedCycles.length
            ? selectedCycles
                .map(
                    (c) =>
                        `C${c}`
                )
                .join(", ")
            : "All cycles";

    /* =======================================================
       RESPONSIVE HEADER SIZES
    ======================================================= */

    const headerTitleSize =
        bp === "xs"
            ? "clamp(11px, 4vw, 30px)"
            : bp === "sm"
                ? "clamp(17px, 3.5vw, 48px)"
                : bp === "md"
                    ? "clamp(23px, 3vw, 68px)"
                    : "clamp(27px, 3.2vw, 66px)";

    const headerSubSize =
        bp === "xs"
            ? "clamp(9px, 2.6vw, 13px)"
            : bp === "sm"
                ? "clamp(11px, 2vw, 17px)"
                : "clamp(13px, 1.15vw, 19px)";

    const headerMetricSize =
        bp === "xs"
            ? "clamp(9px, 2.3vw, 13px)"
            : bp === "sm"
                ? "clamp(11px, 1.8vw, 16px)"
                : "clamp(13px, 1.35vw, 21px)";

    /* =======================================================
       UI
    ======================================================= */

    return (
        <Box
            sx={{
                width: "100vw",
                height: "100vh",

                bgcolor:
                    theme.bg,

                backgroundImage:
                    theme.bgGradient,

                p: {
                    xs:
                        "1vh 1.5vw",
                    sm:
                        "1.5vh 2vw",
                    md:
                        "2vh 2.5vw",
                    lg:
                        "2.5vh 3vw",
                },

                boxSizing:
                    "border-box",

                fontFamily:
                    font,

                display:
                    "flex",

                flexDirection:
                    "column",

                gap: {
                    xs:
                        "1vh",
                    sm:
                        "1.2vh",
                    md:
                        "1.5vh",
                    lg:
                        "1.8vh",
                },

                overflow:
                    "hidden",
            }}
        >
            {/* =================================================
                HEADER
            ================================================= */}

            <Box
                sx={{
                    flexShrink: 0,

                    border: {
                        xs:
                            `2.5px solid ${colors.headerBorder}`,

                        sm:
                            `3.5px solid ${colors.headerBorder}`,

                        md:
                            `5px solid ${colors.headerBorder}`,
                    },

                    borderRadius: {
                        xs: "12px",
                        sm: "16px",
                        md: "20px",
                    },

                    px: {
                        xs: "1.5vw",
                        sm: "2vw",
                        md: "2.5vw",
                    },

                    py: {
                        xs: "1vh",
                        sm: "1.5vh",
                        md: "2vh",
                    },

                    boxShadow:
                        `0 0 48px ${colors.headerBorderShadow}, inset 0 0 30px rgba(41,235,112,0.06)`,

                    width: "100%",

                    display: "flex",

                    justifyContent:
                        "space-between",

                    alignItems:
                        "center",

                    gap: {
                        xs:
                            "1.5vw",
                        sm:
                            "2vw",
                        md:
                            "2.5vw",
                    },

                    boxSizing:
                        "border-box",

                    minHeight: {
                        xs: "72px",
                        sm: "100px",
                        md: "135px",
                        lg: "150px",
                    },
                }}
            >
                {/* =================================================
                    LOGO
                ================================================= */}

                <Box
                    sx={{
                        width: {
                            xs:
                                "clamp(55px, 14vw, 100px)",
                            sm:
                                "clamp(90px, 14vw, 170px)",
                            md:
                                "clamp(150px, 15vw, 300px)",
                        },

                        height: {
                            xs:
                                "clamp(35px, 8vh, 55px)",
                            sm:
                                "clamp(55px, 9vh, 80px)",
                            md:
                                "clamp(75px, 10vh, 120px)",
                        },

                        flexShrink: 0,

                        display: "flex",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        borderRadius:
                            "14px",

                        overflow:
                            "hidden",
                    }}
                >
                    <Box
                        component="img"
                        src={logo}
                        alt="Logo"
                        sx={{
                            maxWidth:
                                "100%",

                            maxHeight:
                                "100%",

                            width: "100%",

                            height: "100%",

                            objectFit:
                                "contain",
                        }}
                        onError={(e) => {
                            e.target.style.display =
                                "none";
                        }}
                    />
                </Box>

                {/* =================================================
                    CENTER TITLE
                ================================================= */}

                <Box
                    sx={{
                        flex:
                            "1 1 0",

                        minWidth: 0,

                        minHeight: 0,

                        display: "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        textAlign: "center",

                        overflow:
                            "hidden",

                        gap: {
                            xs: "1px",
                            sm: "3px",
                            md: "5px",
                        },
                    }}
                >
                    <Typography
                        sx={{
                            width: "100%",

                            color:
                                colors.white,

                            textAlign:
                                "center",

                            fontWeight: 800,

                            fontSize:
                                headerTitleSize,

                            textShadow:
                                "0 0 16px rgba(255,255,255,0.55), 0 0 34px rgba(57,255,136,0.35)",

                            lineHeight:
                                1.05,

                            letterSpacing:
                                "0.025em",

                            textTransform:
                                "uppercase",

                            whiteSpace:
                                "nowrap",

                            overflow:
                                "hidden",

                            textOverflow:
                                "clip",

                            minWidth: 0,
                        }}
                    >
                        GO GREEN CYCLE PEDAL
                    </Typography>

                    <Typography
                        sx={{
                            width: "100%",

                            color:
                                colors.white,

                            textAlign:
                                "center",

                            fontWeight: 800,

                            fontSize:
                                headerTitleSize,

                            textShadow:
                                "0 0 16px rgba(255,255,255,0.55), 0 0 34px rgba(57,255,136,0.35)",

                            lineHeight:
                                1.05,

                            letterSpacing:
                                "0.025em",

                            textTransform:
                                "uppercase",

                            whiteSpace:
                                "nowrap",

                            overflow:
                                "hidden",

                            textOverflow:
                                "clip",

                            minWidth: 0,
                        }}
                    >
                        POWERED GAMIFICATION
                    </Typography>

                    
                </Box>

                {/* =================================================
                    RIGHT HEADER LABEL
                ================================================= */}

                <Box
                    sx={{
                        minWidth: {
                            xs: "105px",
                            sm: "145px",
                            md: "205px",
                            lg: "245px",
                        },

                        textAlign: "center",

                        borderLeft:
                            `2px solid ${colors.gold}`,

                        pl: {
                            xs: "1vw",
                            sm: "1.5vw",
                            md: "1.8vw",
                        },

                        flexShrink: 0,

                        display: "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        overflow:
                            "hidden",
                    }}
                >
                    <Typography
                        sx={{
                            color: colors.gold,
                            fontWeight: 700,
                    
                            fontSize: {
                                xs: "clamp(9px, 2.3vw, 15px)",
                                sm: "clamp(12px, 1.8vw, 20px)",
                                md: "clamp(16px, 2vw, 27px)",
                                lg: "clamp(18px, 2.1vw, 32px)",
                            },
                    
                            lineHeight: 1.6,
                            textShadow:
                                "0 0 12px rgba(255,215,0,0.5)",
                    
                            whiteSpace: "normal",
                            textAlign: "center",
                        }}
                    >
                        <Box component="span" sx={{ display: "block" }}>
                            PARTICIPANT
                        </Box>
                    
                        <Box component="span" sx={{ display: "block" }}>
                            COMPARISION
                        </Box>
                    </Typography>
                </Box>
            </Box>




             {/* ultimate comparison TITLE */}
            <Box
                sx={{
                    width: "100%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: {
                        xs: "30px",
                        sm: "38px",
                        md: "45px",
                        lg: "50px",
                    },
                    overflow: "visible",
                }}
            >
                <Typography
                    sx={{
                        color: colors.white,
                        fontFamily: font,
                        fontWeight: 700,
                        fontSize: {
                            xs: "29px",
                            sm: "36px",
                            md: "42px",
                            lg: "49px",
                        },
                        lineHeight: 1.2,
                        letterSpacing: 1,
                        textAlign: "center",
                        whiteSpace: "nowrap",
                    }}
                >
                    ULTIMATE COMPARISON
                </Typography>
            </Box>

            {/* =================================================
                STAT CARDS
            ================================================= */}

            <Box
                sx={{
                    flexShrink: 0,

                    display: "grid",

                    gridTemplateColumns: {
                        xs:
                            "repeat(2, minmax(0, 1fr))",

                        sm:
                            "repeat(2, minmax(0, 1fr))",

                        md:
                            "repeat(4, minmax(0, 1fr))",
                    },

                    gap: {
                        xs:
                            "1vh 1.5vw",

                        sm:
                            "1.2vh 1.5vw",

                        md:
                            "1.5vh 1.5vw",
                    },

                    minHeight: {
                        xs: "92px",
                        sm: "105px",
                        md: "125px",
                        lg: "140px",
                    },
                }}
            >
                <StatCard
                    icon={<GroupsIcon />}
                    label="Top Participants"
                    value={latest.length}
                    accent={theme.neon}
                    theme={theme}
                    font={font}
                    bp={bp}
                />

                <StatCard
                    icon={<BoltIcon />}
                    label="Total power"
                    value={`${formatPower(totalPower)} W`}
                    accent={theme.neon}
                    theme={theme}
                    font={font}
                    bp={bp}
                />

                <StatCard
                    icon={<TrendingUpIcon />}
                    label="Average power"
                    value={`${formatPower(avgPower)} W`}
                    accent={theme.gold}
                    theme={theme}
                    font={font}
                    bp={bp}
                />

                <StatCard
                    icon={<EmojiEventsIcon />}
                    label="Leading"
                    value={
                        leader
                            ? `${leader.cycle_no}`
                            : "—"
                    }
                    accent={theme.gold}
                    highlight
                    theme={theme}
                    font={font}
                    bp={bp}
                />
            </Box>

            {/* =================================================
                CHART
            ================================================= */}

            <Card
                sx={{
                    flex:
                        "1 1 0",

                    minHeight: 0,

                    minWidth: 0,

                    bgcolor:
                        theme.panel,

                    border:
                        `2.5px solid ${colors.headerBorder}`,

                    borderRadius:
                        "20px",

                    boxShadow:
                        `0 0 32px ${colors.headerBorderShadow}, inset 0 0 24px rgba(41,235,112,0.05)`,

                    display: "flex",

                    flexDirection:
                        "column",

                    overflow:
                        "hidden",
                }}
            >
                <CardContent
                    sx={{
                        flex:
                            "1 1 0",

                        minHeight: 0,

                        minWidth: 0,

                        p: {
                            xs: "10px",
                            sm: "14px",
                            md: "20px",
                            lg: "24px",
                        },

                        display: "flex",

                        flexDirection:
                            "column",

                        boxSizing:
                            "border-box",
                    }}
                >
                    {/* CHART HEADER */}

                    <Stack
                        direction={{
                            xs: "column",
                            sm: "row",
                        }}
                        alignItems="center"
                        justifyContent={{
                            xs: "center",
                            sm: "space-between",
                        }}
                        sx={{
                            mb: {
                                xs: "8px",
                                md: "14px",
                            },

                            flexShrink: 0,

                            width: "100%",

                            textAlign:
                                "center",

                            gap: {
                                xs: "5px",
                                sm: "10px",
                            },
                            position:"relative",
                        }}
                    >
                        <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent={{
                                xs: "center",
                                sm: "flex-start",
                            }}
                            spacing={{
                                xs: 0.7,
                                md: 1,
                            }}
                        >
                            <ShowChartIcon
                                sx={{
                                    color:
                                        theme.neon,

                                    fontSize: {
                                        xs: 20,
                                        sm: 23,
                                        md: 26,
                                    },
                                }}
                            />

                            <Typography
                                sx={{
                                    color:
                                        theme.text,

                                    fontSize: {
                                        xs: 25,
                                        sm: 27,
                                        md: 30,
                                    },

                                    fontWeight: 800,

                                    letterSpacing: 0.3,

                                    textTransform:
                                        "uppercase",

                                    lineHeight: 1.2,
                                }}
                            >
                                Live Power (W)
                            </Typography>
                        </Stack>

                        {/* RIGHT CORNER */}
                        
                                                <Box
    sx={{
        position: "absolute",

        right: 0,

        top: "50%",

        transform: "translateY(-50%)",

        display: "flex",

        alignItems: "center",

        bgcolor:
            "rgba(57,255,136,0.08)",

        border:
            `1px solid ${theme.neon}44`,

        borderRadius: "8px",

        px: {
            xs: "8px",
            sm: "10px",
            md: "12px",
        },

        py: {
            xs: "4px",
            sm: "5px",
            md: "6px",
        },

        zIndex: 2,
    }}
>
    <Typography
        sx={{
            color: theme.neon,

            fontSize: {
                                        xs: 25,
                                        sm: 27,
                                        md: 30,
                                    },

            fontWeight: 800,

            letterSpacing: 0.4,

            whiteSpace: "nowrap",

            lineHeight: 1,
            textTransform : "uppercase",
        }}
    >
        Last {minutes} min
    </Typography>
</Box>

                        
                    </Stack>

                    {/* CHART CONTENT */}

                    {!hasData ? (
                        <Fade in>
                            <Stack
                                alignItems="center"
                                justifyContent="center"
                                spacing={{
                                    xs: 0.8,
                                    md: 1.2,
                                }}
                                sx={{
                                    flex:
                                        "1 1 0",

                                    minHeight: 0,

                                    color:
                                        theme.muted,

                                    textAlign:
                                        "center",
                                }}
                            >
                                <Box
                                    sx={{
                                        width: {
                                            xs: 44,
                                            md: 52,
                                        },

                                        height: {
                                            xs: 44,
                                            md: 52,
                                        },

                                        borderRadius:
                                            "50%",

                                        bgcolor:
                                            theme.neonSoft,

                                        display:
                                            "flex",

                                        alignItems:
                                            "center",

                                        justifyContent:
                                            "center",
                                    }}
                                >
                                    <ShowChartIcon
                                        sx={{
                                            fontSize: {
                                                xs: 22,
                                                md: 26,
                                            },

                                            color:
                                                theme.neon,
                                        }}
                                    />
                                </Box>

                                <Typography
                                    sx={{
                                        fontSize: {
                                            xs: 12,
                                            md: 14,
                                        },

                                        fontWeight: 600,

                                        color:
                                            theme.subtext,
                                    }}
                                >
                                    No readings in
                                    the selected
                                    window
                                </Typography>

                                <Typography
                                    sx={{
                                        fontSize: {
                                            xs: 10,
                                            md: 12.5,
                                        },

                                        color:
                                            theme.muted,
                                    }}
                                >
                                    Data will appear
                                    here as soon as
                                    it comes in
                                </Typography>
                            </Stack>
                        </Fade>
                    ) : (
                        <Box
                            sx={{
                                flex:
                                    "1 1 0",

                                minHeight: 0,

                                minWidth: 0,

                                width: "100%",
                            }}
                        >
                            <ReactECharts
                                option={option}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                }}
                                notMerge={true}
                                lazyUpdate={true}
                            />
                        </Box>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
    icon,
    label,
    value,
    accent,
    highlight,
    theme,
    font,
    bp,
}) {
    const iconSize =
        bp === "xs"
            ? 20
            : bp === "sm"
                ? 23
                : 28;

    const iconBoxSize =
        bp === "xs"
            ? 36
            : bp === "sm"
                ? 42
                : 50;

    const labelSize =
        bp === "xs"
            ? "clamp(15px, 2.6vw, 22px)"
            : bp === "sm"
                ? "clamp(18px, 2.7vw, 24px)"
                : "clamp(24px, 2vw, 29px)";

    const valueSize =
        bp === "xs"
            ? "clamp(20px, 5.5vw, 40px)"
            : bp === "sm"
                ? "clamp(24px, 3.5vw, 46px)"
                : "clamp(30px, 2.4vw, 55px)";

    return (
        <Card
            sx={{
                bgcolor:
                    theme.panel,

                border:
                    `1.5px solid ${
                        highlight
                            ? "rgba(255,229,102,0.5)"
                            : theme.panelBorder
                    }`,

                borderRadius: {
                    xs: "11px",
                    sm: "13px",
                    md: "16px",
                },

                boxShadow:
                    highlight
                        ? "0 0 18px rgba(255,229,102,0.18)"
                        : "0 0 14px rgba(57,255,136,0.08)",

                height: "100%",

                minWidth: 0,

                position: "relative",

                overflow: "hidden",

                transition:
                    "border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease",

                "&:hover": {
                    borderColor:
                        accent,

                    transform:
                        "translateY(-2px)",

                    boxShadow:
                        `0 0 24px ${accent}33`,
                },

                "&::before": {
                    content: '""',

                    position:
                        "absolute",

                    top: 0,
                    left: 0,
                    right: 0,

                    height: {
                        xs: "2px",
                        md: "3px",
                    },

                    background:
                        `linear-gradient(90deg, ${accent}, transparent)`,
                },
            }}
        >
            <CardContent
                sx={{
                    width: "100%",

                    height: "100%",

                    boxSizing:
                        "border-box",

                    p: {
                        xs:
                            "10px 12px",
                        sm:
                            "12px 16px",
                        md:
                            "16px 20px",
                        lg:
                            "18px 24px",
                    },

                    "&:last-child": {
                        pb: {
                            xs: "10px",
                            sm: "12px",
                            md: "16px",
                            lg: "18px",
                        },
                    },

                    display: "flex",

                    flexDirection:
                        "column",

                    justifyContent:
                        "center",

                    alignItems:
                        "center",

                    textAlign:
                        "center",

                    gap: {
                        xs: "6px",
                        sm: "8px",
                        md: "10px",
                    },
                }}
            >
                {/* =================================================
                    ICON LEFT + CENTERED TITLE
                ================================================= */}

                <Stack
                    direction="row"
                    spacing={{
                        xs: 0.7,
                        sm: 0.9,
                        md: 1.1,
                    }}
                    alignItems="center"
                    sx={{
                        width: "100%",

                        minWidth: 0,
                    }}
                >
                    {/* ICON STAYS ON LEFT

                    <Box
                        sx={{
                            width:
                                iconBoxSize,

                            height:
                                iconBoxSize,

                            borderRadius: {
                                xs: "8px",
                                md: "10px",
                            },

                            bgcolor:
                                `${accent}26`,

                            color:
                                accent,

                            display: "flex",

                            alignItems:
                                "center",

                            justifyContent:
                                "center",

                            flexShrink: 0,
                        }}
                    >
                        {React.cloneElement(
                            icon,
                            {
                                sx: {
                                    fontSize:
                                        iconSize,

                                    color:
                                        accent,
                                },
                            }
                        )}
                    </Box> */}

                    {/* TITLE CENTERED IN REMAINING SPACE */}

                    <Typography
                        noWrap
                        sx={{
                            color:
                                COLORS.white,

                            fontSize:
                                label === "Top Participants"
                                    ? 33
                                    : label === "Total power"
                                        ? 35
                                        : label === "Average power"
                                            ? 35
                                            : label === "Leading"
                                                ? 35
                                                : labelSize,

                            fontWeight: 800,

                            textTransform:
                                "uppercase",

                            letterSpacing: {
                                xs: 0.3,
                                md: 0.7,
                            },

                            lineHeight: 1.3,

                            textAlign:
                                "center",

                            flex: 1,

                            minWidth: 0,

                            overflow:
                                "hidden",

                            textOverflow:
                                "ellipsis",
                            
                        }}
                    >
                        {label }
                    </Typography>
                </Stack>

                {/* =================================================
                    VALUE
                ================================================= */}

                <Typography
                    sx={{
                        width: "100%",

                        color:
                            COLORS.gold,

                        fontSize:
                            valueSize,

                        fontWeight: 800,

                        letterSpacing:
                            "-0.2px",

                        lineHeight: 1.25,

                        textAlign:
                            "center",

                        wordBreak:
                            "break-word",

                        overflow:
                            "hidden",

                        textOverflow:
                            "ellipsis",

                        display:
                            "-webkit-box",

                        WebkitBoxOrient:
                            "vertical",

                        WebkitLineClamp: 2,
                    }}
                >
                    {value}
                </Typography>
            </CardContent>
        </Card>
    );
}