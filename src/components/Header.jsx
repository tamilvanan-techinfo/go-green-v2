import React, { useRef, useState, useMemo, useLayoutEffect } from "react";
import { Box, Typography } from "@mui/material";
import logo from "../assets/images/logo.png";
import company from "../assets/images/infieldSports.png";
import { FONT_STYLESHEET_URL, DEFAULT_MERGED_COLORS } from "../theme";
import { useSocket } from "../context/SocketContext";

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
  HEADER COMPONENT
========================================================= */

export default function Header() {
  const socketCtx = useSocket();

  const colors = socketCtx?.colors ?? DEFAULT_MERGED_COLORS.colors;
  const font = socketCtx?.fontFamily ?? DEFAULT_MERGED_COLORS.fontFamily;

  const extendedColors = useMemo(
    () => ({
      ...colors,
      greenShadow: colors.greenShadow ?? "rgba(57,232,120,0.45)",
      gold: colors.gold ?? "#FFD000",
      green: colors.green,
      white: colors.white,
    }),
    [colors]
  );

  const [containerRef, containerSize] = useElementSize();
  const scale = useDisplayScale(containerSize.width, containerSize.height);

  const headerHeight = 145 * scale;
  const titleFontSize = 53 * scale;

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height: headerHeight,
        minHeight: headerHeight,
        border: `${5 * scale}px solid ${extendedColors.green}`,
        borderRadius: `${18 * scale}px`,
        background: "rgba(5,39,23,0.96)",
        boxShadow: `0 0 28px ${extendedColors.greenShadow}, inset 0 0 25px rgba(57,232,120,0.05)`,
        display: "grid",
        gridTemplateColumns: "22% 58% 20%",
        alignItems: "center",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      {/* LOGO */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Box
          component="img"
          src={logo}
          alt="GO GREEN"
          sx={{
            width: `${260 * scale}px`,
            maxWidth: "80%",
            height: "auto",
            objectFit: "contain",
          }}
        />
      </Box>

      {/* TITLE */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          textAlign: "center",
          px: `${10 * scale}px`,
        }}
      >
        <Typography
          sx={{
            color: extendedColors.white,
            fontFamily: font,
            fontWeight: 800,
            fontSize: titleFontSize,
            lineHeight: 1.15,
            letterSpacing: "0.02em",
            textAlign: "center",
            textShadow:
              "0 0 10px rgba(255,255,255,0.85), 0 0 25px rgba(255,255,255,0.35)",
            whiteSpace: "nowrap",
          }}
        >
          GO GREEN CYCLE PEDAL
          <br />
          POWERED GAMIFICATION
        </Typography>
      </Box>

      {/* PARTICIPATION METRIC */}
      <Box
  sx={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  }}
>
  <Box
    component="img"
    src={company}
    alt="company logo"
    sx={{
      width: `${260 * scale}px`,
      maxWidth: "80%",
      height: "auto",
      objectFit: "contain",
      borderRadius: "50% / 60%",
      backgroundColor: "#ffffff",
      padding: `${10 * scale}px`,
    }}
  />
</Box>
    </Box>
  );
}