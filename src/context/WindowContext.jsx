import axios from "axios";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import { mergeColors, DEFAULT_MERGED_COLORS } from "../theme";
import url from "../../config.json";

const WindowContext = createContext(null);

export function WindowProvider({ children }) {
  const socketRef = useRef(null);
  const reconnectRef = useRef(null);
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [freeText, setFreeText] = useState("");

  // Colors + theme + font are all dynamic. Starts as hardcoded
  // defaults from theme.jsx; once the backend pushes "theme_updated"
  // (or /api/admin/app-theme/ on initial load, see currentTheme()
  // below) this is replaced with mergeColors(payload, prevFont) —
  // anything the backend didn't send stays at its previous/default
  // value. Screens read { colors, theme, fontFamily } from useTheme()
  // instead of importing COLORS/THEME/FONT directly, so a change from
  // the backend applies live everywhere.
  const [themeColors, setThemeColors] = useState(DEFAULT_MERGED_COLORS);

  // Fetches whatever theme is currently active on the backend so the
  // screen renders with the right palette + font immediately on
  // load/refresh, rather than waiting for the next "theme_updated"
  // socket push. Also re-run whenever the socket reconnects (see
  // connectSocket's onopen below) — any theme_updated pushed while we
  // were disconnected would otherwise be missed entirely, leaving the
  // screen stuck on stale colors/font until the NEXT live change.
  const currentTheme = useCallback(async () => {
    try {
      const response = await axios.get(url.api + "/api/admin/app-theme/");
      console.log(response.data);
      if (response.data && response.data.data) {
        setThemeColors((prev) => mergeColors(response.data.data, prev.fontFamily));
      }
    } catch (err) {
      console.warn("No active theme available yet, using defaults:", err?.message);
    }
  }, []);

  const connectSocket = useCallback(() => {
    const screenInfo = window?.screenWindowInfo
    const ws = new WebSocket(url.ws + "/ws/window/client/"+screenInfo?.currentWindowId+"/"  );

    socketRef.current = ws;

    ws.onopen = () => {
      console.log("✅ Client Socket Connected");
      setConnected(true);
      // Catch up on anything we might have missed while disconnected
      // (e.g. a theme saved during a brief network drop / reconnect).
      currentTheme();
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
        console.log("📩 Socket Message:", data);
      } catch (err) {
        console.error("Bad WS payload:", err);
        return;
      }

      if (data.type === "set_live_screen") {
        console.log("📩 Socket Message:", data.path);
        if (data.init_data) {
          localStorage.setItem("duration", data.init_data.duration);
          localStorage.setItem("cycles", data.init_data.cycles);
        }
        const currentPath = window.location.hash.replace("#", "") || "/";
        if(currentPath!==data.path){
          navigate(`${data.path}`);

        }
        
        setLastMessage(data);
      } else if (data.type === "free_text_updated") {
        console.log("📩 Socket Message:", data.data);
        setFreeText({
          content: data.data.content ?? data.data.text ?? "",
          style: data.data.style || {},
          bg_image_url: data.data.bg_image_url ?? data.data.bg_img_url ?? null,
        });
      } else if (data.type === "theme_updated") {
        console.log("📩 Socket Message: theme_updated", data);

        // Guard against a null/empty payload (e.g. a backend bug that
        // fails to return the saved theme) — merging null through
        // mergeColors silently resets every screen back to hardcoded
        // defaults, which looks exactly like "live changes aren't
        // applying" even though the message did arrive.
        if (!data.data || (!data.data.colors && !data.data.theme && !data.data.fontFamily)) {
          console.warn(
            "⚠ theme_updated received with no usable payload, ignoring:",
            data
          );
          return;
        }

        setThemeColors((prev) => mergeColors(data.data, prev.fontFamily));
      }
    };

    ws.onerror = (error) => {
      console.error("Socket Error:", error);
    };

    ws.onclose = () => {
      console.log("❌ Socket Closed");

      setConnected(false);

      reconnectRef.current = setTimeout(() => {
        console.log("🔄 Reconnecting...");
        connectSocket();
      }, 3000);
    };
  }, [navigate, currentTheme]);

const currentScreen = useCallback(async () => {
  try {
    // Get the current Electron window information.
    const screenInfo = window.screenWindowInfo;
    console.log("----screen-info----",screenInfo)
    navigate(screenInfo.assignedScreenPath)
    if (!screenInfo) {
      console.error("Electron screen information is unavailable.");
      return;
    }

    // Get the current window ID from storage.
    const storedWindowId = localStorage.getItem(
      screenInfo.storageKey
    );

    if (!storedWindowId) {
      console.warn("Current window ID was not found in storage.");
      return;
    }

    console.log("Current Window ID:", storedWindowId);

    // Get the active screen information from the backend.
    const response = await axios.get(
      `${url.api}/api/get_active_route/?id=${storedWindowId}`
    );

    if (!response.data?.path) {
      console.warn("No active screen path returned by the backend.");
      return;
    }

    const currentPath = window.location.pathname;
    const targetPath = response.data.path;

    console.log("Current Path:", currentPath);
    console.log("Backend Screen Path:", targetPath);

    // Preserve your existing Free Text route behavior.
    if (currentPath === "/free-text/") {
      navigate("/free-text");
    } else {
      navigate(targetPath);
    }
  } catch (error) {
    console.error("Failed to navigate to the active screen:", error);
  }
}, [navigate]);

  useEffect(() => {
    connectSocket();
    currentScreen();
    currentTheme();
    return () => {
      clearTimeout(reconnectRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback((data) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
      return true;
    }
    console.warn("Socket is not connected.");
    return false;
  }, []);

  // Memoized so consumers only re-render when something in the value
  // actually changed, instead of on every SocketProvider render (e.g.
  // from an unrelated parent re-render bubbling down).
  const value = useMemo(
    () => ({
      socket: socketRef.current,
      connected,
      lastMessage,
      sendMessage,
      freeText,
      setFreeText,
      colors: themeColors.colors,
      theme: themeColors.theme,
      fontFamily: themeColors.fontFamily,
    }),
    [connected, lastMessage, sendMessage, freeText, themeColors]
  );

  return (
    <WindowContext.Provider value={value}>{children}</WindowContext.Provider>
  );
}

export function useWindowSocket() {
  return useContext(WindowContext);
}

// Convenience hook for screens that only care about theme, e.g.:
//   const { colors, theme, fontFamily } = useTheme();
//   ... colors.gold, theme.neon, style={{ fontFamily }} ...
export function useTheme() {
  const ctx = useContext(WindowContext);
  return ctx
    ? { colors: ctx.colors, theme: ctx.theme, fontFamily: ctx.fontFamily }
    : DEFAULT_MERGED_COLORS;
}

export default WindowContext;