import React, { useEffect, useMemo, useRef, useState } from "react";
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
import BarChartIcon from "@mui/icons-material/BarChart";

import logo from "../assets/images/logo.png";

import {
    colorForIndex,
    COLORS,
    DEFAULT_MERGED_COLORS,
} from "../theme";

import { useSocket } from "../context/SocketContext";
import api from "../../config.json";

const WS_BASE_URL =
    api.ws + "/ws/power-monitor/client/";

const FALLBACK_MINUTES = 10;
const RECONNECT_DELAY_MS = 3000;
const MIN_RATIO_FOR_INSIDE_LABELS = 0.12;

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
   DURATION FORMAT
========================================================= */

function formatDurationSeconds(totalSeconds) {
    if (totalSeconds == null) return "0s";

    const s = Math.max(0, totalSeconds);

    if (s < 60) {
        return `${Math.round(s)}s`;
    }

    if (s < 3600) {
        return `${Math.floor(s / 60)}m`;
    }

    return `${Math.floor(s / 3600)}h`;
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

export default function LivePowerBarChart() {
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

                if (message.type !== "trend") {
                    return;
                }

                const nextSeries = {};

                (message.series || []).forEach((p) => {
                    nextSeries[
                        p.participant_cycle_id
                    ] = {
                        name:
                            p.participant_name,

                        cycle_no:
                            p.cycle_no,

                        duration_seconds:
                            p.duration_seconds ?? 0,

                        duration_display:
                            p.duration_display ||
                            formatDurationSeconds(
                                p.duration_seconds
                            ),

                        points:
                            (p.points || []).map(
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

                setLastUpdated(new Date());

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

                reconnectRef.current = null;
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
       LATEST DATA
    ======================================================= */

    const latest = useMemo(() => {
        return Object.entries(series)
            .map(([key, bucket]) => {
                const lastPoint =
                    bucket.points[
                        bucket.points.length - 1
                    ];

                return {
                    key,

                    participant_cycle_id:
                        key,

                    participant_name:
                        bucket.name,

                    cycle_no:
                        bucket.cycle_no,

                    duration_seconds:
                        bucket.duration_seconds,

                    duration_display:
                        bucket.duration_display,

                    power:
                        lastPoint
                            ? lastPoint.power
                            : 0,

                    voltage:
                        lastPoint
                            ? lastPoint.voltage
                            : 0,

                    current:
                        lastPoint
                            ? lastPoint.current
                            : 0,
                };
            })
            .sort(
                (a, b) =>
                    Number(a.key) -
                    Number(b.key)
            );
    }, [series]);

    /* =======================================================
       LEADER
    ======================================================= */

    const leader = useMemo(() => {
        if (!latest.length) {
            return null;
        }

        return latest.reduce(
            (best, row) =>
                row.power > best.power
                    ? row
                    : best,
            latest[0]
        );
    }, [latest]);

    const participantColors =
        useParticipantColors(series);

    /* =======================================================
       CHART
    ======================================================= */

    const option = useMemo(() => {


        //conversion

        function getPowerScale(power) {
            const absPower = Math.abs(power);

            if (absPower > 0 && absPower < 1) {
                return {
                    divisor: 0.001,
                    unit: "mW",
                };
            }

            if (absPower >= 1000) {
                return {
                    divisor: 1000,
                    unit: "kW",
                };
            }

            return {
                divisor: 1,
                unit: "W",
            };
        }
        const categories =
            latest.map(
                (row) =>
                    `${row.cycle_no}`
            );

        const barColors =
            latest.map((row) => {
                const colorIdx =
                    participantColors.get(
                        row.key
                    ) ?? 0;

                const solid =
                    colorForIndex(
                        colorIdx,
                        1
                    );

                const soft =
                    colorForIndex(
                        colorIdx,
                        0.35
                    );

                return {
                    type: "linear",

                    x: 0,
                    y: 0,

                    x2: 0,
                    y2: 1,

                    colorStops: [
                        {
                            offset: 0,
                            color: solid,
                        },
                        {
                            offset: 1,
                            color: soft,
                        },
                    ],
                };
            });

        const maxPower = Math.max(
            ...latest.map(
                (row) => 
                    
                    Number(row.power)
            ),
            1
        );

        return {
            backgroundColor:
                "transparent",

            animationDuration: 300,

            animationDurationUpdate:
                400,

            animationEasingUpdate:
                "cubicOut",

            tooltip: {
                trigger: "axis",

                axisPointer: {
                    type: "shadow",

                    shadowStyle: {
                        color:
                            theme.neonSoft,
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

                formatter: (params) => {
                    const p =
                        params[0];

                    const row =
                        latest[
                            p.dataIndex
                        ];

                    if (!row) {
                        return "";
                    }

                    return `
                        <div style="font-weight:700;margin-bottom:4px;">
                             ${row.cycle_no}
                        </div>
                        Power: <b>${formatPower(row.power)} W</b><br/>
                        Voltage: ${row.voltage.toFixed(
                            2
                        )} V<br/>
                        Current: ${row.current.toFixed(
                            2
                        )} A<br/>
                        Duration: <b>${row.duration_display}</b>
                    `;
                },
            },

            /* =================================================
               CHART GRID
            ================================================= */

            grid: {
                left: 40,

                right: 40,

                top: 50,

                bottom:1,

                containLabel: true,
            },

            /* =================================================
               X AXIS
            ================================================= */

            xAxis: {
                type: "category",

                data: categories,

                axisLine: {
                    lineStyle: {
                        color:
                            theme.panelBorder,

                        width: 1.5,
                    },
                },

                axisTick: {
                    show: false,
                },

                axisLabel: {
                    color:
                        colors.white,

                    fontFamily:
                        font,

                    fontSize:
                        bp === "xs"
                            ? 20
                            : bp === "sm"
                                ? 30
                                : bp === "md"
                                    ? 35
                                    : 35,

                    fontWeight: 600,
                    

                    lineHeight: 52,

                    /* Show EVERY participant label */
                    interval: 0,

                    /* Do not let ECharts hide labels */
                    hideOverlap: false,

                    align: "center",

                    width:"auto",

                    overflow: "none",
                },
            },

            /* =================================================
               Y AXIS
            ================================================= */

            yAxis: {
    type: "value",
    // name: "Power (W)",
    // nameLocation: "middle",
    // nameRotate: 90,
    // nameGap: 88,
    // nameTextStyle: {
    //     color: colors.white,
    //     fontSize: 32,
    //     fontWeight: 600,
    //     fontFamily: font,
    //     align: "center",
    // },
    axisLabel: {
        color: colors.white,
        fontFamily: font,
        fontSize: 42,
        fontWeight: 600,
        margin: 12,
        formatter: (value) =>formatPower(value),
    },
    splitLine: {
        lineStyle: {
            color: theme.divider,
            type: "dashed",
        },
    },
},

            series: [
                /* =================================================
                   POWER BAR
                ================================================= */

                {
                    name: "Power",

                    type: "bar",

                    barMaxWidth: 64,

                    barMinHeight: 2,

                    data:
                        latest.map(
                            (row, i) => ({
                                value:
                                    row.power,

                                itemStyle: {
                                    color:
                                        barColors[
                                            i
                                        ],

                                    borderRadius: [
                                        10,
                                        10,
                                        0,
                                        0,
                                    ],

                                    borderColor:
                                        "rgba(255,255,255,0.35)",

                                    borderWidth: 1,

                                    shadowBlur:
                                        16,

                                    shadowColor:
                                        colorForIndex(
                                            participantColors.get(
                                                row.key
                                            ) ?? 0,
                                            0.45
                                        ),
                                },
                            })
                        ),

                    label: {
                        show: true,

                        position: "top",

                        color:
                            theme.text,

                        fontFamily:
                            font,

                        fontSize: 30,

                        fontWeight: 800,

                        textShadow:
                            "0 0 8px rgba(0,0,0,0.6)",

                        formatter: (p) =>
                            `${formatPower(p.value)} W`,
                    },
                },

                /* =================================================
                   INSIDE BAR LABEL
                ================================================= */

                /* =========================================================
   INSIDE BAR LABEL SERIES — replace the whole second series
========================================================= */
{
    name: "Name + Duration",
    type: "bar",
    barMaxWidth: 64,
    barMinHeight: 4,
    barGap: "-100%",
    silent: true,
    tooltip: { show: false },
    data: latest.map((row) => {
    const ratio = row.power / maxPower;
    const estBarHeightPx = ratio * 380; // estimated bar height in px

    // Font size scales with bar height, capped so it never overflows
    // The rotated label text width ≈ fontSize * ~10 chars
    // We want that to be at most 85% of bar height
    const maxFontSize = Math.floor(estBarHeightPx * 0.085);
    const fontSize = Math.min(Math.max(maxFontSize, 8), 28);

    // Only show if there's enough room for readable text
    const fitsInsideBar = estBarHeightPx >= 60 && fontSize >= 20;

    return {
        value: row.power,
        itemStyle: {
            color: "transparent",
            borderWidth: 0,
        },
        label: {
            show: fitsInsideBar,
            position: "inside",
            align: "center",
            verticalAlign: "middle",
            rotate: 90,
            color: "#FFFFFF",
            textBorderColor: "#04140A",
            textBorderWidth: 1.5,
            fontFamily: font,
            fontWeight: 800,
            fontSize,
            backgroundColor: "rgba(4,20,10,0.85)",
            borderColor: theme.gold,
            borderWidth: 1.2,
            borderRadius: 8,
            padding: [3, 6],
            rich: {
                name: {
                    fontSize,
                    fontWeight: 800,
                    color: "#FFFFFF",
                    fontFamily: font,
                },
                sep: {
                    fontSize,
                    color: theme.gold,
                    padding: [0, 3],
                    fontFamily: font,
                },
                duration: {
                    fontSize,
                    fontWeight: 700,
                    color: theme.neon,
                    fontFamily: font,
                },
            },
            formatter: () =>
                `{duration|${row.duration_display}}`,
        },
    };
}),
}, ],
        };
    },[
        latest,
        participantColors,
        theme,
        font,
        bp,
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

    const hasData =
        Object.keys(series)
            .length > 0;

    /* =======================================================
       RESPONSIVE HEADER
    ======================================================= */

    const headerTitleSize =
        bp === "xs"
            ? "clamp(11px, 4vw, 30px)"
            : bp === "sm"
                ? "clamp(17px, 3.5vw, 48px)"
                : bp === "md"
                    ? "clamp(23px, 3vw, 68px)"
                    : "clamp(27px, 3.2vw, 68px)";

    const comparisonFontSize =
        bp === "xs"
            ? "clamp(7px, 2vw, 10px)"
            : bp === "sm"
                ? "clamp(9px, 1.55vw, 14px)"
                : bp === "md"
                    ? "clamp(11px, 1.25vw, 17px)"
                    : "clamp(13px, 1.25vw, 20px)";

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
                        xs: "1vw",
                        sm: "1.8vw",
                        md: "2.5vw",
                    },

                    py: {
                        xs: "0.8vh",
                        sm: "1.3vh",
                        md: "2vh",
                    },

                    boxShadow:
                        `0 0 48px ${colors.headerBorderShadow}, inset 0 0 30px rgba(41,235,112,0.06)`,

                    width: "100%",

                    display: "flex",

                    justifyContent:
                        "space-between",

                    alignItems: "center",

                    gap: {
                        xs: "1vw",
                        sm: "1.5vw",
                        md: "2vw",
                    },

                    boxSizing:
                        "border-box",

                    minHeight: {
                        xs: "65px",
                        sm: "90px",
                        md: "125px",
                        lg: "145px",
                    },

                    overflow: "visible",
                }}
            >
                {/* LOGO */}

                <Box
                    sx={{
                        width: {
                            xs:
                                "clamp(45px, 12vw, 85px)",

                            sm:
                                "clamp(75px, 13vw, 150px)",

                            md:
                                "clamp(130px, 14vw, 280px)",
                        },

                        height: {
                            xs:
                                "clamp(30px, 7vh, 48px)",

                            sm:
                                "clamp(48px, 8vh, 70px)",

                            md:
                                "clamp(65px, 9vh, 110px)",
                        },

                        flexShrink: 1,

                        minWidth: 0,

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

                            width:
                                "100%",

                            height:
                                "100%",

                            objectFit:
                                "contain",
                        }}
                        onError={(e) => {
                            e.target.style.display =
                                "none";
                        }}
                    />
                </Box>

                {/* CENTER TITLE */}

                <Box
                    sx={{
                        flex:
                            "1 1 0",

                        minWidth: 0,

                        width:
                            "100%",

                        display:
                            "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        textAlign:
                            "center",

                        overflow:
                            "hidden",

                        gap: {
                            xs: "1px",
                            sm: "2px",
                            md: "4px",
                        },
                    }}
                >
                    <Typography
                        sx={{
                            width:
                                "100%",

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
                                "0.02em",

                            textTransform:
                                "uppercase",

                            whiteSpace:
                                "normal",
                        }}
                    >
                        GO GREEN CYCLE PEDAL
                    </Typography>

                    <Typography
                        sx={{
                            width:
                                "100%",

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
                                "0.02em",

                            textTransform:
                                "uppercase",

                            whiteSpace:
                                "normal",
                        }}
                    >
                        POWERED GAMIFICATION
                    </Typography>
                </Box>

                {/* PARTICIPANT COMPARISON */}

                <Box
                    sx={{
                        flexShrink: 0,

                        minWidth:
                            "max-content",

                        width:
                            "max-content",

                        display:
                            "flex",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        borderLeft:
                            `2px solid ${colors.gold}`,

                        pl: {
                            xs:
                                "0.8vw",

                            sm:
                                "1.2vw",

                            md:
                                "1.8vw",
                        },

                        pr: {
                            xs:
                                "0.2vw",

                            sm:
                                "0.4vw",

                            md:
                                "0.5vw",
                        },
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

        lineHeight: 1.7,
        textShadow:
            "0 0 12px rgba(255,215,0,0.5)",

        whiteSpace: "normal",
        textAlign: "center",
    }}
>

        PARTICIPANT
        <br/>
        COMPARISION
</Typography>
                    
                </Box>

                
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
                        xs: "70px",
                        sm: "80px",
                        md: "100px",
                        lg: "110px",
                    },
                }}
            >
                <StatCard
                    icon={
                        <GroupsIcon />
                    }
                    label="Active participants"
                    value={
                        latest.length
                    }
                    accent={
                        theme.neon
                    }
                    theme={
                        theme
                    }
                    font={
                        font
                    }
                    bp={
                        bp
                    }
                />

                <StatCard
                    icon={
                        <BoltIcon />
                    }
                    label="Total power"
                    value={`${formatPower(totalPower)} W`}
                    accent={
                        theme.neon
                    }
                    theme={
                        theme
                    }
                    font={
                        font
                    }
                    bp={
                        bp
                    }
                />

                <StatCard
                    icon={
                        <TrendingUpIcon />
                    }
                    label="Average power"
                    value={`${formatPower(avgPower)} W`}
                    accent={
                        theme.gold
                    }
                    theme={
                        theme
                    }
                    font={
                        font
                    }
                    bp={
                        bp
                    }
                />

                <StatCard
                    icon={
                        <EmojiEventsIcon />
                    }
                    label="Leader"
                    value={
                        leader
                            ? `${leader.cycle_no}`
                            : "—"
                    }
                    accent={
                        theme.gold
                    }
                    highlight
                    theme={
                        theme
                    }
                    font={
                        font
                    }
                    bp={
                        bp
                    }
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

                    display:
                        "flex",

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
                            lg: "16px 24px 8px 24px",
                        },

                        display:
                            "flex",

                        flexDirection:
                            "column",

                        boxSizing:
                            "border-box",
                    }}
                >
                    {/* =================================================
                        CHART HEADER
                    ================================================= */}

                    <Stack
                        direction="row"
                        alignItems="center"
                        sx={{
                            mb: {
                                xs: "8px",
                                md: "14px",
                            },

                            flexShrink: 0,

                            width: "100%",

                            position:
                                "relative",

                            minHeight: {
                                xs: "28px",
                                sm: "32px",
                                md: "36px",
                            },
                        }}
                    >
                        {/* LEFT SIDE */}

                        <Stack
                            direction="row"
                            alignItems="center"
                            spacing={{
                                xs: 0.7,
                                md: 1,
                            }}
                            sx={{
                                minWidth: 0,
                            }}
                        >
                            <BarChartIcon
                                sx={{
                                    color:
                                        theme.neon,

                                    fontSize: {
                                        xs: 26,
                                        sm: 28,
                                        md: 30,
                                    },

                                    flexShrink: 0,
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

                                    letterSpacing:
                                        0.3,

                                    textTransform:
                                        "uppercase",

                                    lineHeight:
                                        1.2,

                                    whiteSpace:
                                        "nowrap",
                                }}
                            >
                                Live Power (W)
                            </Typography>
                        </Stack>

                        {/* RIGHT CORNER */}

                        <Box
                            sx={{
                                position:
                                    "absolute",

                                right: 0,

                                top: "50%",

                                transform:
                                    "translateY(-50%)",

                                display:
                                    "flex",

                                alignItems:
                                    "center",

                                bgcolor:
                                    "rgba(57,255,136,0.08)",

                                border:
                                    `1px solid ${theme.neon}44`,

                                borderRadius:
                                    "8px",

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
                                    color:
                                        theme.neon,

                                    fontSize: {
                                        xs: 25,
                                        sm: 27,
                                        md: 30,
                                    },

                                    fontWeight:
                                        800,

                                    letterSpacing:
                                        0.4,

                                    whiteSpace:
                                        "nowrap",

                                    lineHeight: 1,
                                    textTransform:
                                        "uppercase",
                                }}
                            >
                                Last {minutes} min
                            </Typography>
                        </Box>
                    </Stack>

                    {/* =================================================
                        CHART CONTENT
                    ================================================= */}

                    {!hasData ? (
                        <Fade in>
                            <Stack
                                alignItems="center"
                                justifyContent="center"
                                spacing={{
                                    xs:
                                        0.8,
                                    md:
                                        1.2,
                                }}
                                sx={{
                                    flex:
                                        "1 1 0",

                                    minHeight:
                                        0,

                                    color:
                                        theme.muted,

                                    textAlign:
                                        "center",
                                }}
                            >
                                <Box
                                    sx={{
                                        width: {
                                            xs:
                                                44,
                                            md:
                                                52,
                                        },

                                        height: {
                                            xs:
                                                44,
                                            md:
                                                52,
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
                                    <BarChartIcon
                                        sx={{
                                            fontSize: {
                                                xs:
                                                    22,
                                                md:
                                                    26,
                                            },

                                            color:
                                                theme.neon,
                                        }}
                                    />
                                </Box>

                                <Typography
                                    sx={{
                                        fontSize: {
                                            xs:
                                                22,
                                            md:
                                                24,
                                        },

                                        fontWeight:
                                            600,

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
                                            xs:
                                                10,
                                            md:
                                                12.5,
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

                                minHeight:
                                    0,

                                minWidth:
                                    0,

                                width:
                                    "100%",
                            }}
                        >
                            <ReactECharts
                                option={
                                    option
                                }

                                style={{
                                    width:
                                        "100%",

                                    height:
                                        "100%",
                                }}

                                notMerge={
                                    true
                                }

                                lazyUpdate={
                                    true
                                }
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
            ? 19
            : bp === "sm"
                ? 22
                : 27;

    const iconBoxSize =
        bp === "xs"
            ? 34
            : bp === "sm"
                ? 40
                : 48;

    /* =====================================================
       INCREASED STAT CARD LABEL SIZE
    ===================================================== */

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
                    xs:
                        "11px",
                    sm:
                        "13px",
                    md:
                        "16px",
                },

                boxShadow:
                    highlight
                        ? "0 0 18px rgba(255,229,102,0.18)"
                        : "0 0 14px rgba(57,255,136,0.08)",

                height:
                    "100%",

                minWidth:
                    0,

                position:
                    "relative",

                overflow:
                    "hidden",

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
                    content:
                        '""',

                    position:
                        "absolute",

                    top: 0,

                    left: 0,

                    right: 0,

                    height: {
                        xs:
                            "2px",
                        md:
                            "3px",
                    },

                    background:
                        `linear-gradient(90deg, ${accent}, transparent)`,
                },
            }}
        >
            <CardContent
                sx={{
                    width:
                        "100%",

                    height:
                        "100%",

                    boxSizing:
                        "border-box",

                    p: {
                        xs:
                            "9px 10px",

                        sm:
                            "11px 14px",

                        md:
                            "15px 18px",

                        lg:
                            "17px 22px",
                    },

                    "&:last-child": {
                        pb: {
                            xs:
                                "9px",

                            sm:
                                "11px",

                            md:
                                "15px",

                            lg:
                                "17px",
                        },
                    },

                    display:
                        "flex",

                    flexDirection:
                        "column",

                    justifyContent:
                        "center",

                    alignItems:
                        "stretch",

                    textAlign:
                        "left",

                    gap: {
                        xs:
                            "5px",

                        sm:
                            "7px",

                        md:
                            "9px",
                    },
                }}
            >
                {/* ICON + TITLE */}

                <Stack
                    direction="row"
                    spacing={{
                        xs: 0.6,
                        sm: 0.8,
                        md: 1,
                    }}
                    alignItems="center"
                    justifyContent="flex-start"
                    sx={{
                        width:
                            "100%",

                        maxWidth:
                            "100%",

                        minWidth:
                            0,

                        alignSelf:
                            "flex-start",
                    }}
                >
                  

                    <Typography
    sx={{
        color: COLORS.white,

        fontSize:
            label === "Active participants"
                ? 40
                : label === "Total power"
                    ? 40
                    : label === "Average power"
                        ? 40
                        : label === "Leader"
                            ? 40
                            : labelSize,

        fontWeight: 650,

        textTransform: "uppercase",

        letterSpacing: 0.6,

        lineHeight:
            label === "Active participants"
                ? 1.05
                : 1.2,

        textAlign: "center",

        whiteSpace: "normal",

        minWidth: 0,

        flex: "1 1 auto",
    }}
>
    {label === "Active participants" ? (
        <>
          
            PARTICIPANTS
        </>
    ) : 
    label === "Total power" ? (
        <>
            TOTAL POWER
        </>
    ):(
        label
    )
    }
</Typography>
                </Stack>

                {/* VALUE */}

                <Typography
                    sx={{
                        width:
                            "100%",

                        color:
                            COLORS.gold,

                        fontSize:
                            valueSize,

                        fontWeight:
                            800,

                        letterSpacing:
                            "-0.2px",

                        lineHeight:
                            1.25,

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

                        WebkitLineClamp:
                            2,

                        fontFamily:
                            font,
                    }}
                >
                    {value}
                </Typography>
            </CardContent>
        </Card>
    );
}