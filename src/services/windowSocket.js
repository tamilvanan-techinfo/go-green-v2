  import config from "../../config.json";

  const WS_BASE_URL = String(config.ws || "").replace(/\/+$/, "");

  // One independent connection state per Django Window ID.
  const connections = new Map();

  const INITIAL_RECONNECT_DELAY = 1000;
  const MAX_RECONNECT_DELAY = 30000;

  export function startWindowSocket(
    callback,
    windowId,
    role = "client",
    windowPid = process.pid
  ) {
    const normalizedWindowId = Number(windowId);

    if (
      !Number.isInteger(normalizedWindowId) ||
      normalizedWindowId <= 0
    ) {
      throw new Error(`Invalid Django Window ID: ${windowId}`);
    }

    if (typeof callback !== "function") {
      throw new Error("A callback function is required.");
    }

    if (!/^\w+$/.test(String(role))) {
      throw new Error(`Invalid WebSocket role: ${role}`);
    }

    const existing = connections.get(normalizedWindowId);

    if (existing && !existing.manuallyStopped) {
      console.warn(
        `[WINDOW WS] Connection already registered for Window ${normalizedWindowId}`
      );

      return () => stopWindowSocket(normalizedWindowId);
    }

    const WS_URL =
      `${WS_BASE_URL}/ws/window/${encodeURIComponent(role)}/${normalizedWindowId}/`;

    const state = {
      windowId: normalizedWindowId,
      role,
      callback,
      url: WS_URL,
      socket: null,
      reconnectTimer: null,
      reconnectCount: 0,
      manuallyStopped: false,
      connectionId: 0,
    };

    connections.set(normalizedWindowId, state);

    function isCurrentConnection(connectionId) {
      return (
        !state.manuallyStopped &&
        state.connectionId === connectionId &&
        connections.get(normalizedWindowId) === state
      );
    }

    function getCurrentWindowPid() {
      try {
        // main.js passes a getter for the corresponding BrowserWindow.
        const value =
          typeof windowPid === "function"
            ? windowPid()
            : windowPid;

        const pid = Number(value);

        return Number.isInteger(pid) && pid > 0 ? pid : null;
      } catch (error) {
        console.error(
          `[WINDOW WS] Could not obtain PID for Window ${normalizedWindowId}:`,
          error
        );

        return null;
      }
    }

    function connect() {
      if (
        state.manuallyStopped ||
        connections.get(normalizedWindowId) !== state
      ) {
        return;
      }

      if (
        state.socket &&
        (
          state.socket.readyState === WebSocket.CONNECTING ||
          state.socket.readyState === WebSocket.OPEN
        )
      ) {
        return;
      }

      const connectionId = ++state.connectionId;

      let socket;

      console.log(
        `[WINDOW WS] Connecting Django Window ${normalizedWindowId}:`,
        WS_URL
      );

      try {
        socket = new WebSocket(WS_URL);
        state.socket = socket;
      } catch (error) {
        console.error(
          `[WINDOW WS] Failed to create socket for Window ${normalizedWindowId}:`,
          error
        );

        state.socket = null;
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (!isCurrentConnection(connectionId)) {
          socket.close();
          return;
        }

        state.reconnectCount = 0;

        console.log(
          `[WINDOW WS] Connected to Django Window ${normalizedWindowId}`
        );

        try {
          const rendererPid = getCurrentWindowPid();

          if (rendererPid === null) {
            console.error(
              `[WINDOW WS] No valid renderer PID for Django Window ${normalizedWindowId}`
            );

            socket.close();
            return;
          }

          console.log("sending processor", rendererPid);

          // Send the Django database ID and the actual OS renderer PID separately.
          const connectionMessage = {
            type: "window_client_connected",
            window_id: normalizedWindowId,
            pid: rendererPid,
            role,
          };

          socket.send(JSON.stringify(connectionMessage));

          console.log(
            "[WINDOW WS] Sent renderer PID:",
            connectionMessage
          );

          // Preserve the existing initial request.
          socket.send(
            JSON.stringify({
              type: "get_windows",
              window_id: normalizedWindowId,
            })
          );
        } catch (error) {
          console.error(
            `[WINDOW WS] Initial request failed for Window ${normalizedWindowId}:`,
            error
          );

          socket.close();
        }
      };

      socket.onmessage = (event) => {
        if (!isCurrentConnection(connectionId)) {
          return;
        }

        try {
          const data = JSON.parse(event.data);

          console.log(
            `[WINDOW WS] Message for Window ${normalizedWindowId}:`,
            data
          );

          // Close the Electron window when is_active is false.
          // The PID identifies the renderer process to close.
          if (
            data.is_active === false &&
            Number.isInteger(Number(data.pid)) &&
            Number(data.pid) > 0
          ) {
            const targetPid = Number(data.pid);

            console.log(
              `[WINDOW WS] Closing window ID ${data.id}, PID ${targetPid}`
            );

            if (
              typeof window !== "undefined" &&
              window.electronAPI?.closeWindowByPid
            ) {
              window.electronAPI.closeWindowByPid(targetPid);
            } else {
              console.error(
                "[WINDOW WS] closeWindowByPid is not available in preload."
              );
            }

            return;
          }

          switch (data.type) {
            case "connection_established":
              console.log(
                "[WINDOW WS] Connection established:",
                data
              );
              break;

            case "windows_list":
              if (!Array.isArray(data.windows)) {
                console.error(
                  "[WINDOW WS] Invalid windows_list response:",
                  data
                );
                break;
              }

              console.log(
                `[WINDOW WS] Received ${data.windows.length} window records`
              );
              break;

            case "window_created":
              console.log(
                "[WINDOW WS] Backend window created:",
                data.window ?? data
              );
              break;

            case "add_window":
              console.log(
                "[WINDOW WS] Backend add_window event:",
                data.window ?? data
              );
              break;

            case "resolution_changed": {
              const window = data.window;

              const targetWindowId =
                window?.window_id ??
                window?.id ??
                data.window_id;

              const properties =
                window?.properties ??
                data.properties;

              if (
                targetWindowId == null ||
                !properties ||
                typeof properties !== "object" ||
                Array.isArray(properties)
              ) {
                console.error(
                  "[WINDOW WS] Invalid resolution_changed message:",
                  data
                );
                break;
              }

              state.callback(
                properties,
                Number(targetWindowId)
              );
              break;
            }

            case "window_update": {
              const properties = data.properties;

              const targetWindowId =
                data.window_id ??
                data.window?.window_id ??
                data.window?.id ??
                data.id;

              if (
                targetWindowId == null ||
                !properties ||
                typeof properties !== "object" ||
                Array.isArray(properties)
              ) {
                console.error(
                  "[WINDOW WS] Invalid window_update message:",
                  data
                );
                break;
              }

              state.callback(
                properties,
                Number(targetWindowId)
              );
              break;
            }

            case "error":
              console.error(
                `[WINDOW WS] Backend error for Window ${normalizedWindowId}:`,
                data.message ?? data
              );
              break;

            default:
              console.log(
                "[WINDOW WS] Unhandled message:",
                data.type,
                data
              );
          }
        } catch (error) {
          console.error(
            `[WINDOW WS] Failed to process message for Window ${normalizedWindowId}:`,
            error
          );
        }
      };

      socket.onerror = (error) => {
        console.error(
          `[WINDOW WS] Socket error for Window ${normalizedWindowId}:`,
          error
        );

        try {
          if (
            socket.readyState === WebSocket.CONNECTING ||
            socket.readyState === WebSocket.OPEN
          ) {
            socket.close();
          }
        } catch (closeError) {
          console.error(
            "[WINDOW WS] Error while closing failed socket:",
            closeError
          );
        }

        scheduleReconnect();
      };

      socket.onclose = (event) => {
        if (state.socket === socket) {
          state.socket = null;
        }

        if (!isCurrentConnection(connectionId)) {
          return;
        }

        console.warn(
          `[WINDOW WS] Disconnected Window ${normalizedWindowId}:`,
          {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          }
        );

        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (
        state.manuallyStopped ||
        state.reconnectTimer !== null ||
        connections.get(normalizedWindowId) !== state
      ) {
        return;
      }

      state.reconnectCount += 1;

      const delay = Math.min(
        INITIAL_RECONNECT_DELAY *
          Math.pow(2, state.reconnectCount - 1),
        MAX_RECONNECT_DELAY
      );

      console.warn(
        `[WINDOW WS] Retry ${state.reconnectCount} for Window ${normalizedWindowId} in ${delay / 1000}s`
      );

      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        connect();
      }, delay);
    }

    connect();

    return () => stopWindowSocket(normalizedWindowId);
  }

  export function stopWindowSocket(windowId) {
    const normalizedWindowId = Number(windowId);
    const state = connections.get(normalizedWindowId);

    if (!state) {
      return;
    }

    state.manuallyStopped = true;
    state.connectionId += 1;

    if (state.reconnectTimer !== null) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    const socket = state.socket;
    state.socket = null;

    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      if (
        socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN
      ) {
        socket.close();
      }
    }

    connections.delete(normalizedWindowId);

    console.log(
      `[WINDOW WS] Stopped Window ${normalizedWindowId}; reconnection disabled.`
    );
  }

  export function sendWindowSocketMessage(message, windowId) {
    const normalizedWindowId = Number(windowId);
    const state = connections.get(normalizedWindowId);
    const socket = state?.socket;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn(
        `[WINDOW WS] Cannot send to Window ${normalizedWindowId}: socket is not connected.`
      );

      return false;
    }

    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(
        `[WINDOW WS] Send failed for Window ${normalizedWindowId}:`,
        error
      );

      return false;
    }
  }

  export function isWindowSocketConnected(windowId) {
    const state = connections.get(Number(windowId));

    return Boolean(
      state?.socket &&
      state.socket.readyState === WebSocket.OPEN
    );
  }