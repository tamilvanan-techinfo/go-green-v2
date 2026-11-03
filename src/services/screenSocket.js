
import config from "../../config.json";

const WS_BASE_URL = String(config.ws || "").replace(/\/+$/, "");
const WS_URL = `${WS_BASE_URL}/ws/screen/client/`;

let socket = null;
let reconnectTimer = null;
let reconnectCount = 0;
let manuallyStopped = true;
let activeConnectionId = 0;

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

/**
 * Connect to Django's screen WebSocket.
 * All messages are passed to main.js.
 */
export function startScreenSocket(callback) {
  if (typeof callback !== "function") {
    throw new Error("A callback function is required.");
  }

  manuallyStopped = false;
  reconnectCount = 0;

  const connectionId = ++activeConnectionId;

  function isCurrentConnection() {
    return (
      !manuallyStopped &&
      connectionId === activeConnectionId
    );
  }

  function connect() {
    if (!isCurrentConnection()) return;

    console.log("[SCREEN WS] Connecting:", WS_URL);

    let currentSocket;

    try {
      currentSocket = new WebSocket(WS_URL);
      socket = currentSocket;
    } catch (error) {
      console.error("[SCREEN WS] Connection failed:", error);
      scheduleReconnect();
      return;
    }

    currentSocket.onopen = () => {
      if (!isCurrentConnection()) {
        currentSocket.close();
        return;
      }

      reconnectCount = 0;
      console.log("[SCREEN WS] Connected.");
    };

    currentSocket.onmessage = async (event) => {
      if (!isCurrentConnection()) return;

      try {
        const message = JSON.parse(event.data);

        console.log("[SCREEN WS] Received:", message);

        await callback(message);
      } catch (error) {
        console.error(
          "[SCREEN WS] Failed to process message:",
          error
        );
      }
    };

    currentSocket.onerror = (error) => {
      console.error("[SCREEN WS] Error:", error);

      if (
        currentSocket.readyState !== WebSocket.CLOSED &&
        currentSocket.readyState !== WebSocket.CLOSING
      ) {
        currentSocket.close();
      }
    };

    currentSocket.onclose = (event) => {
      if (socket === currentSocket) {
        socket = null;
      }

      if (!isCurrentConnection()) return;

      console.warn("[SCREEN WS] Disconnected:", {
        code: event.code,
        reason: event.reason,
      });

      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (!isCurrentConnection() || reconnectTimer !== null) {
      return;
    }

    reconnectCount += 1;

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY *
        2 ** (reconnectCount - 1),
      MAX_RECONNECT_DELAY
    );

    console.log(`[SCREEN WS] Reconnecting in ${delay} ms`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  connect();

  return () => {
    if (connectionId !== activeConnectionId) return;

    manuallyStopped = true;
    activeConnectionId += 1;

    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (socket) {
      const currentSocket = socket;
      socket = null;

      currentSocket.onopen = null;
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;

      if (currentSocket.readyState !== WebSocket.CLOSED) {
        currentSocket.close();
      }
    }

    console.log("[SCREEN WS] Stopped.");
  };
}

/**
 * Send a message to Django.
 */
export function sendScreenSocketMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error("[SCREEN WS] Cannot send: not connected.");
    return false;
  }

  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch (error) {
    console.error("[SCREEN WS] Send failed:", error);
    return false;
  }
}

/**
 * Check the connection status.
 */
export function isScreenSocketConnected() {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}
