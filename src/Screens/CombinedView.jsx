import React, {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
} from "react";
import * as echarts from "echarts";
import { useSocket } from "../context/SocketContext";
import { colorForIndex, DEFAULT_MERGED_COLORS } from "../theme";
import logo from "../assets/images/logo.png";
import api from "../../config.json";

const WS_URL = api.ws + "/ws/power-monitor/client/";
const RECONNECT_MS = 3000;

// ─────────────────────────────────────────────────────────────
// Responsive scaling
// 1920px = 100%
// 1080px = ~56%
// Below 1080px = 55% minimum
// ─────────────────────────────────────────────────────────────

const BASE_WIDTH = 1920;
const MIN_SCALE = 0.55;

function getScale(width) {
  return Math.max(
    MIN_SCALE,
    Math.min(width / BASE_WIDTH, 1)
  );
}

function scaled(value, scale) {
  return Math.round(value * scale);
}

// ─────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────

function formatPower(v) {
  const n = Number(v);

  if (!Number.isFinite(n)) return "0";

  const r = Number(n.toFixed(2));

  if (n !== 0 && r === 0) {
    return n > 0 ? "0.01" : "-0.01";
  }

  return String(r);
}

function formatTime(ts) {
  const d = new Date(ts);

  let h = d.getHours();
  let m = d.getMinutes();

  h = h % 12 || 12;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(
    2,
    "0"
  )}`;
}

// ─────────────────────────────────────────────────────────────
// ECharts series
// ─────────────────────────────────────────────────────────────

function buildSeriesEntries(seriesSnapshot, colorMap) {
  return Object.entries(seriesSnapshot).map(([key, bucket]) => {
    if (!colorMap.has(key)) {
      colorMap.set(key, colorMap.size);
    }

    const idx = colorMap.get(key);
    const color = colorForIndex(idx, 1);

    return {
      id: key,
      type: "line",
      smooth: true,
      showSymbol: false,

      animation: true,
      animationDurationUpdate: 400,
      animationEasingUpdate: "cubicInOut",

      lineStyle: {
        width: 5,
        color,
      },

      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,

          colorStops: [
            {
              offset: 0,
              color: colorForIndex(idx, 0.35),
            },
            {
              offset: 1,
              color: colorForIndex(idx, 0.03),
            },
          ],
        },
      },

      emphasis: {
        lineStyle: {
          width: 7,
        },
      },

      data: bucket.points.map((pt) => [
        pt.time,
        pt.power,
      ]),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// ECharts base option
// ─────────────────────────────────────────────────────────────

function buildBaseOption(font, scale) {
  const s = (value) => scaled(value, scale);

  return {
    backgroundColor: "transparent",

    animation: true,
    animationDuration: 600,
    animationEasing: "cubicOut",
    animationDurationUpdate: 400,
    animationEasingUpdate: "cubicInOut",

    // ─────────────────────────────
    // Legend
    // ─────────────────────────────

    legend: {
      top: s(10),

      textStyle: {
        color: "#fff",
        fontFamily: font,
        fontSize: Math.max(14, s(36)),
        fontWeight: 800,
      },

      icon: "circle",

      itemWidth: Math.max(10, s(24)),
      itemHeight: Math.max(10, s(24)),
      itemGap: Math.max(16, s(48)),
    },

    // ─────────────────────────────
    // Tooltip
    // ─────────────────────────────

    tooltip: {
      trigger: "axis",

      backgroundColor: "rgba(0,30,15,0.97)",

      borderColor: "#39FF88",
      borderWidth: Math.max(1, s(2)),

      textStyle: {
        color: "#fff",
        fontFamily: font,
        fontSize: Math.max(12, s(28)),
      },

      formatter: (params) => {
        const ts = params[0]?.axisValue;
        const timeStr = ts ? formatTime(ts) : "";

        const timeFontSize = Math.max(11, s(24));
        const dotSize = Math.max(8, s(16));
        const marginRight = Math.max(4, s(8));
        const marginBottom = Math.max(3, s(6));

        return (
          `<div style="
            font-size:${timeFontSize}px;
            color:#aaa;
            margin-bottom:${marginBottom}px;
          ">${timeStr}</div>` +

          params
            .map(
              (p) =>
                `<span style="
                  display:inline-block;
                  width:${dotSize}px;
                  height:${dotSize}px;
                  border-radius:50%;
                  background:${p.color};
                  margin-right:${marginRight}px;
                  vertical-align:middle;
                "></span>` +

                `${p.seriesName} &nbsp;<b>${formatPower(
                  p.value?.[1]
                )} W</b>`
            )
            .join("<br/>")
        );
      },
    },

    // ─────────────────────────────
    // Grid
    // ─────────────────────────────

    grid: {
      left: s(24),
      right: s(40),
      top: s(110),
      bottom: s(20),
      containLabel: true,
    },

    // ─────────────────────────────
    // X Axis
    // ─────────────────────────────

    xAxis: {
      type: "time",

      axisLine: {
        lineStyle: {
          color: "#39FF8866",
          width: Math.max(1, s(2)),
        },
      },

      axisTick: {
        show: false,
      },

      splitLine: {
        show: false,
      },

      axisLabel: {
        color: "#aaa",
        fontFamily: font,
        fontSize: Math.max(12, s(32)),
        fontWeight: 600,
        formatter: formatTime,
      },
    },

    // ─────────────────────────────
    // Y Axis
    // ─────────────────────────────

    yAxis: {
      type: "value",

      axisLabel: {
        color: "#aaa",
        fontFamily: font,
        fontSize: Math.max(12, s(32)),
        fontWeight: 600,
        formatter: formatPower,
      },

      splitLine: {
        lineStyle: {
          color: "rgba(57,255,136,0.15)",
          type: "dashed",
          width: Math.max(1, 1.5 * scale),
        },
      },
    },

    series: [],
  };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function CombinedView() {
  const socketCtx = useSocket();

  // ─────────────────────────────
  // Responsive viewport
  // ─────────────────────────────

  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined"
      ? window.innerWidth
      : BASE_WIDTH
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const scale = useMemo(
    () => getScale(viewportWidth),
    [viewportWidth]
  );

  const fs = useCallback(
    (value) => scaled(value, scale),
    [scale]
  );

  const sp = useCallback(
    (value) => scaled(value, scale),
    [scale]
  );

  // ─────────────────────────────
  // Theme
  // ─────────────────────────────

  const colors = useMemo(
    () =>
      socketCtx?.colors ||
      DEFAULT_MERGED_COLORS.colors,
    [socketCtx]
  );

  const theme = useMemo(
    () =>
      socketCtx?.theme ||
      DEFAULT_MERGED_COLORS.theme,
    [socketCtx]
  );

  const font = useMemo(
    () =>
      socketCtx?.fontFamily ||
      DEFAULT_MERGED_COLORS.fontFamily,
    [socketCtx]
  );

  // ─────────────────────────────
  // Color tokens
  // ─────────────────────────────

  const NEON = useMemo(
    () => colors.neon ?? "#39FF88",
    [colors]
  );

  const GOLD = useMemo(
    () => colors.gold ?? "#FFD700",
    [colors]
  );

  const BORDER = useMemo(
    () => colors.headerBorder ?? "#39FF88",
    [colors]
  );

  const SHADOW = useMemo(
    () =>
      colors.headerBorderShadow ??
      "rgba(57,255,136,0.5)",
    [colors]
  );

  // ─────────────────────────────
  // ECharts
  // ─────────────────────────────

  const baseOption = useMemo(
    () => buildBaseOption(font, scale),
    [font, scale]
  );

  // ─────────────────────────────
  // Mutable refs
  // ─────────────────────────────

  const seriesRef = useRef({});
  const colorMapRef = useRef(new Map());

  const minutesRef = useRef(10);
  const rankingRef = useRef(null);

  // DOM refs

  const chartDomRef = useRef(null);
  const echartsRef = useRef(null);

  const nameRef = useRef(null);
  const titleRef = useRef(null);
  const powerRef = useRef(null);
  const voltageRef = useRef(null);

  const minutesBadgeRef = useRef(null);
  const noDataRef = useRef(null);
  const chartWrapRef = useRef(null);

  // WebSocket

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  // ─────────────────────────────────────────────────────────────
  // Chart update
  // ─────────────────────────────────────────────────────────────

  const pushChartUpdate = useCallback(() => {
    const ec = echartsRef.current;

    if (!ec) return;

    const series = buildSeriesEntries(
      seriesRef.current,
      colorMapRef.current
    );

    const hasData = series.length > 0;

    if (noDataRef.current) {
      noDataRef.current.style.display =
        hasData ? "none" : "flex";
    }

    if (chartWrapRef.current) {
      chartWrapRef.current.style.display =
        hasData ? "block" : "none";
    }

    if (!hasData) return;

    ec.setOption(
      {
        series,
      },
      false
    );
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Ranking update
  // ─────────────────────────────────────────────────────────────

  const pushRankingUpdate = useCallback(() => {
    const leader =
      rankingRef.current ??
      (() => {
        const entries = Object.values(
          seriesRef.current
        );

        if (!entries.length) {
          return {
            name: "—",
            power: 0,
            voltage: 0,
            title: "DEFENDING CHAMPION",
          };
        }

        const best = entries.reduce((a, b) => {
          const ap =
            a.points[a.points.length - 1]?.power ??
            0;

          const bp =
            b.points[b.points.length - 1]?.power ??
            0;

          return ap > bp ? a : b;
        });

        const lp =
          best.points[best.points.length - 1];

        return {
          name: best.name,
          power: lp?.power ?? 0,
          voltage: lp?.voltage ?? 0,
          title: "DEFENDING CHAMPION",
        };
      })();

    if (nameRef.current) {
      nameRef.current.textContent =
        leader.name;
    }

    if (titleRef.current) {
      titleRef.current.textContent =
        leader.title;
    }

    if (powerRef.current) {
      powerRef.current.textContent =
        `${formatPower(leader.power)}W`;
    }

    if (voltageRef.current) {
      voltageRef.current.textContent =
        `${formatPower(leader.voltage)}V`;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────
  // WebSocket
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;

    const connect = () => {
      const ws = new WebSocket(WS_URL);

      wsRef.current = ws;

      ws.onclose = () => {
        if (active) {
          reconnectRef.current =
            setTimeout(
              connect,
              RECONNECT_MS
            );
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = ({ data }) => {
        if (!active) return;

        let msg;

        try {
          msg = JSON.parse(data);
        } catch {
          return;
        }

        // ─────────────────────
        // Trend
        // ─────────────────────

        if (msg.type === "trend") {
          const next = {};

          (msg.series || []).forEach((p) => {
            next[p.participant_cycle_id] = {
              name: p.participant_name,
              cycle_no: p.cycle_no,

              points: (p.points || []).map(
                (pt) => ({
                  time: Date.parse(pt.time),
                  power: pt.power,
                  voltage: pt.voltage,
                  current: pt.current,
                })
              ),
            };
          });

          seriesRef.current = next;

          if (
            typeof msg.window_minutes ===
            "number"
          ) {
            minutesRef.current =
              msg.window_minutes;

            if (minutesBadgeRef.current) {
              minutesBadgeRef.current.textContent =
                `LAST ${msg.window_minutes} MIN`;
            }
          }

          pushChartUpdate();

          if (!rankingRef.current) {
            pushRankingUpdate();
          }
        }

        // ─────────────────────
        // Individual / Ranking
        // ─────────────────────

        if (
          msg.type === "individual" ||
          msg.type === "ranking"
        ) {
          rankingRef.current = {
            name:
              msg.participant_name || "—",

            power:
              msg.power ?? 0,

            voltage:
              msg.voltage ?? 0,

            title:
              msg.title ||
              "DEFENDING CHAMPION",
          };

          pushRankingUpdate();
        }
      };
    };

    connect();

    return () => {
      active = false;

      clearTimeout(
        reconnectRef.current
      );

      const ws = wsRef.current;

      if (ws) {
        ws.onopen =
          ws.onmessage =
          ws.onclose =
          ws.onerror =
            null;

        if (ws.readyState <= 1) {
          ws.close();
        }
      }
    };
  }, [
    pushChartUpdate,
    pushRankingUpdate,
  ]);

  // ─────────────────────────────────────────────────────────────
  // Mount ECharts
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!chartDomRef.current) return;

    const ec = echarts.init(
      chartDomRef.current,
      null,
      {
        renderer: "canvas",
      }
    );

    echartsRef.current = ec;

    ec.setOption(baseOption);

    const ro = new ResizeObserver(() => {
      ec.resize();
    });

    ro.observe(chartDomRef.current);

    return () => {
      ro.disconnect();

      ec.dispose();

      echartsRef.current = null;
    };
  }, [baseOption]);

  // ─────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",

        background:
          theme.bg ?? "#020d05",

        backgroundImage:
          theme.bgGradient ??
          "radial-gradient(ellipse at top, #071a0e 0%, #020d05 70%)",

        fontFamily: font,

        display: "flex",
        flexDirection: "column",

        gap: sp(16),

        padding: `${sp(20)}px ${sp(28)}px`,

        boxSizing: "border-box",

        overflow: "hidden",
      }}
    >
      {/* ═══════════════════════════════════════
          HEADER
      ═══════════════════════════════════════ */}

      <div
        style={{
          flexShrink: 0,

          display: "flex",
          alignItems: "center",

          border: `${Math.max(
            2,
            sp(5)
          )}px solid ${BORDER}`,

          borderRadius: sp(22),

          padding: `${sp(16)}px ${sp(
            36
          )}px`,

          background:
            "rgba(0,25,12,0.95)",

          boxShadow: `
            0 0 ${sp(60)}px ${SHADOW},
            0 0 ${sp(120)}px rgba(57,255,136,0.15),
            inset 0 0 ${sp(40)}px rgba(41,235,112,0.06)
          `,

          gap: sp(28),

          minHeight: sp(130),

          boxSizing: "border-box",
        }}
      >
        {/* Logo */}

        <img
          src={logo}
          alt="Logo"
          onError={(e) => {
            e.target.style.display = "none";
          }}
          style={{
            height: sp(90),
            objectFit: "contain",
            flexShrink: 0,
          }}
        />

        {/* Main title */}

        <div
          style={{
            flex: 1,
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "#fff",
              fontWeight: 900,

              fontSize: fs(62),

              textTransform: "uppercase",

              letterSpacing: "0.06em",

              textShadow:
                "0 0 20px rgba(255,255,255,0.9), 0 0 40px rgba(57,255,136,0.5), 0 0 80px rgba(57,255,136,0.25)",

              lineHeight: 1.15,
            }}
          >
            CYCLE PEDALLING
            <br />
            POWER GENERATOR
          </div>
        </div>

        {/* Participation metric */}

        <div
          style={{
            borderLeft: `${Math.max(
              1,
              sp(3)
            )}px solid ${GOLD}`,

            paddingLeft: sp(32),
            paddingRight: sp(8),

            color: GOLD,

            fontWeight: 900,

            fontSize: fs(32),

            lineHeight: 1.5,

            textAlign: "center",

            whiteSpace: "nowrap",

            textShadow:
              "0 0 20px rgba(255,215,0,0.7), 0 0 40px rgba(255,215,0,0.3)",

            letterSpacing: "0.05em",
          }}
        >
          PARTICIPATION
          <br />
          METRIC
        </div>
      </div>

      {/* ═══════════════════════════════════════
          PLAYER STATS
      ═══════════════════════════════════════ */}

      <div
        style={{
          flexShrink: 0,
        }}
      >
        {/* Title */}

        <div
          style={{
            color: "#fff",

            fontWeight: 900,

            fontSize: fs(58),

            textAlign: "center",

            textTransform: "uppercase",

            letterSpacing: "0.12em",

            marginBottom: sp(14),

            textShadow:
              "0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(57,255,136,0.4)",
          }}
        >
          PLAYER STATS
        </div>

        {/* Column headings */}

        <div
          style={{
            display: "flex",

            padding: `0 ${sp(24)}px`,

            marginBottom: sp(10),
          }}
        >
          {[
            {
              label: "NAME",
              flex: "0 0 40%",
            },
            {
              label: "POWER",
              flex: "0 0 30%",
            },
            {
              label: "VOLTAGE",
              flex: "0 0 30%",
            },
          ].map(({ label, flex }) => (
            <div
              key={label}
              style={{
                flex,

                color: NEON,

                fontWeight: 900,

                fontSize: fs(48),

                textAlign: "center",

                letterSpacing: "0.08em",

                textTransform: "uppercase",

                textShadow: `
                  0 0 ${sp(16)}px ${NEON},
                  0 0 ${sp(32)}px ${NEON}66
                `,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Player value card */}

        <div
          style={{
            display: "flex",

            alignItems: "center",

            border: `${Math.max(
              2,
              sp(4)
            )}px solid ${BORDER}`,

            borderRadius: sp(22),

            background:
              "rgba(0,35,16,0.92)",

            boxShadow: `
              0 0 ${sp(50)}px ${SHADOW},
              0 0 ${sp(100)}px rgba(57,255,136,0.12),
              inset 0 0 ${sp(30)}px rgba(41,235,112,0.06)
            `,

            padding: `${sp(28)}px ${sp(
              24
            )}px`,

            minHeight: sp(140),
          }}
        >
          {/* Name */}

          <div
            style={{
              flex: "0 0 40%",
              textAlign: "center",
              overflow: "hidden",
            }}
          >
            <div
              ref={nameRef}
              style={{
                color: "#fff",

                fontWeight: 900,

                fontSize: fs(110),

                textTransform: "uppercase",

                letterSpacing: "0.02em",

                lineHeight: 1,

                textShadow:
                  "0 0 20px rgba(255,255,255,0.7)",

                whiteSpace: "nowrap",

                overflow: "hidden",

                textOverflow: "ellipsis",
              }}
            >
              —
            </div>
          </div>

          {/* Power */}

          <div
            ref={powerRef}
            style={{
              flex: "0 0 30%",

              textAlign: "center",

              color: "#fff",

              fontWeight: 900,

              fontSize: fs(110),

              lineHeight: 1,

              letterSpacing: "-0.02em",

              textShadow:
                "0 0 24px rgba(255,255,255,0.6)",

              whiteSpace: "nowrap",
            }}
          >
            0W
          </div>

          {/* Voltage */}

          <div
            ref={voltageRef}
            style={{
              flex: "0 0 30%",

              textAlign: "center",

              color: "#fff",

              fontWeight: 900,

              fontSize: fs(110),

              lineHeight: 1,

              letterSpacing: "-0.02em",

              textShadow:
                "0 0 24px rgba(255,255,255,0.6)",

              whiteSpace: "nowrap",
            }}
          >
            0V
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          LINE CHART
      ═══════════════════════════════════════ */}

      <div
        style={{
          flex: "1 1 0",

          minHeight: 0,

          border: `${Math.max(
            2,
            sp(4)
          )}px solid ${BORDER}`,

          borderRadius: sp(22),

          background:
            "rgba(0,20,10,0.85)",

          boxShadow: `
            0 0 ${sp(40)}px ${SHADOW},
            0 0 ${sp(80)}px rgba(57,255,136,0.1),
            inset 0 0 ${sp(24)}px rgba(41,235,112,0.05)
          `,

          overflow: "hidden",

          display: "flex",

          flexDirection: "column",

          padding: `${sp(18)}px ${sp(
            28
          )}px ${sp(16)}px`,

          boxSizing: "border-box",
        }}
      >
        {/* Chart header */}

        <div
          style={{
            display: "flex",

            alignItems: "center",

            justifyContent:
              "space-between",

            flexShrink: 0,

            marginBottom: sp(4),
          }}
        >
          {/* Live power */}

          <div
            style={{
              display: "flex",

              alignItems: "center",

              gap: sp(14),

              color: NEON,

              fontWeight: 900,

              fontSize: fs(36),

              letterSpacing: "0.05em",

              textTransform: "uppercase",

              textShadow: `
                0 0 ${sp(16)}px ${NEON},
                0 0 ${sp(32)}px ${NEON}66
              `,
            }}
          >
            <span
              style={{
                fontSize: fs(38),
              }}
            >
              ↗
            </span>

            LIVE POWER (W)
          </div>

          {/* Minutes badge */}

          <div
            ref={minutesBadgeRef}
            style={{
              border: `${Math.max(
                1,
                sp(3)
              )}px solid ${NEON}`,

              borderRadius: sp(12),

              padding: `${sp(8)}px ${sp(
                28
              )}px`,

              color: NEON,

              fontWeight: 900,

              fontSize: fs(30),

              letterSpacing: "0.06em",

              textTransform: "uppercase",

              textShadow: `
                0 0 ${sp(14)}px ${NEON}
              `,

              boxShadow: `
                0 0 ${sp(20)}px ${NEON}44
              `,
            }}
          >
            LAST {minutesRef.current} MIN
          </div>
        </div>

        {/* No data */}

        <div
          ref={noDataRef}
          style={{
            flex: 1,

            display: "flex",

            alignItems: "center",

            justifyContent: "center",

            color: "#39FF8877",

            fontSize: fs(32),

            fontWeight: 700,

            letterSpacing: "0.05em",
          }}
        >
          No data yet — waiting for readings…
        </div>

        {/* ECharts */}

        <div
          ref={chartWrapRef}
          style={{
            flex: "1 1 0",

            minHeight: 0,

            display: "none",
          }}
        >
          <div
            ref={chartDomRef}
            style={{
              width: "100%",
              height: "100%",
            }}
          />
        </div>
      </div>
    </div>
  );
}
