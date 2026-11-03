
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import started from "electron-squirrel-startup";
import fs from "node:fs";
import http from "node:http";
import express from "express";
import { DatabaseSync } from "node:sqlite";

import { startWindowSocket } from "./services/windowSocket.js";
import { startScreenSocket } from "./services/screenSocket.js";
import { applyWindowProperties } from "./services/windowManager.js";
import IndividualParticipantCache from "./cacheService/IndividualParicipentCache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (started) {
  app.quit();
}

app.disableHardwareAcceleration();

let db = null;
let participantCache = null;
let mainWindow = null;
let httpServer = null;
let stopScreenSocket = null;

const stopWindowSockets = new Map();
const electronWindows = new Map();
const windowScreenIds = new Map();

const DISPLAY_HTTP_PORT = 1029;

/* -------------------------------------------------------------------------- */
/* Database                                                                    */
/* -------------------------------------------------------------------------- */

function getDatabasePath() {
  return path.join(app.getPath("userData"), "data", "cache.db");
}

function ensureDatabaseFile() {
  const dbPath = getDatabasePath();
  const directory = path.dirname(dbPath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return dbPath;
}

function initDatabase() {
  const dbPath = ensureDatabaseFile();

  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  console.log("[DEBUG] Connected to SQLite:", dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS individual_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER,
      screen_name TEXT NOT NULL,
      cycle TEXT NOT NULL,
      total_voltage REAL NOT NULL,
      total_amperage REAL NOT NULL,
      total_power REAL NOT NULL,
      participant_name TEXT NOT NULL,
      profile_image TEXT,
      participant_voltage REAL NOT NULL,
      participant_amperage REAL NOT NULL,
      participant_power REAL NOT NULL,
      ts REAL NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  participantCache = new IndividualParticipantCache(db);

  console.log("[DEBUG] SQLite initialized successfully");
}

function registerIPC() {
  ipcMain.handle("participant:save", async (_event, data) => {
    try {
      return await participantCache.save(data);
    } catch (error) {
      console.error("[ERROR] participant:save failed:", error);
      throw error;
    }
  });

  ipcMain.handle("participant:getByCycle", async (_event, cycle) => {
    return participantCache.getByCycle(cycle);
  });

  ipcMain.handle("participant:delete", async (_event, cycle) => {
    return participantCache.deleteByCycle(cycle);
  });

  ipcMain.handle("participant:getAll", async () => {
    return participantCache.getAll();
  });

ipcMain.handle("close-window-by-pid", async (_event, pid) => {
  const targetPid = Number(pid);

  if (!Number.isInteger(targetPid) || targetPid <= 0) {
    return {
      success: false,
      message: "Invalid PID",
    };
  }

  const windows = BrowserWindow.getAllWindows();

  const targetWindow = windows.find(
    (win) => win.webContents.getOSProcessId() === targetPid
  );

  if (!targetWindow) {
    console.warn(`[WINDOW] No Electron window found for PID ${targetPid}`);

    return {
      success: false,
      message: `Window not found for PID ${targetPid}`,
    };
  }

  console.log(`[WINDOW] Closing Electron window with PID ${targetPid}`);

  targetWindow.destroy();

  return {
    success: true,
    pid: targetPid,
  };
});
// ipcMain.on("close-window-by-pid", (_event, pid) => {
//   const targetWindow = BrowserWindow.getAllWindows().find(
//     (win) => win.webContents.getOSProcessId() === Number(pid)
//   );

//   if (targetWindow && !targetWindow.isDestroyed()) {
//     console.log(`[WINDOW] Closing window with PID ${pid}`);
//     targetWindow.destroy();
//   } else {
//     console.warn(`[WINDOW] No window found for PID ${pid}`);
//   }
// });
}

/* -------------------------------------------------------------------------- */
/* Local HTTP server                                                           */
/* -------------------------------------------------------------------------- */

function startDisplayHttpServer() {
  return new Promise((resolve, reject) => {
    const rendererDir = path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}`
    );

    const indexPath = path.join(rendererDir, "index.html");
    const expressApp = express();

    expressApp.use(express.static(rendererDir));

    expressApp.use((_req, res) => {
      res.sendFile(indexPath, (error) => {
        if (error) {
          console.error("[ERROR] Failed to serve renderer:", error);

          if (!res.headersSent) {
            res.status(500).send("Renderer could not be loaded");
          }
        }
      });
    });

    httpServer = http.createServer(expressApp);

    httpServer.once("error", (error) => {
      console.error("[ERROR] Display HTTP server failed:", error);
      reject(error);
    });

    httpServer.listen(DISPLAY_HTTP_PORT, "127.0.0.1", () => {
      console.log(
        `[DEBUG] Display server running at http://127.0.0.1:${DISPLAY_HTTP_PORT}`
      );

      resolve();
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Backend API and IDs                                                         */
/* -------------------------------------------------------------------------- */

function getWindowsApiUrl() {
  return "http://localhost:8000/screens/windows/?role=client";
}

async function fetchWindowsFromBackend() {
  const endpoint = getWindowsApiUrl();

  console.log("[DEBUG] Fetching window definitions:", endpoint);

  try {
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(
        `Windows API returned ${response.status} ${response.statusText}`
      );
    }

    const windows = await response.json();

    if (!Array.isArray(windows)) {
      throw new Error("Windows API response must be a JSON array");
    }

    console.log(`[DEBUG] Received ${windows.length} windows`);

    return windows;
  } catch (error) {
    console.error("[ERROR] Could not fetch windows:", error);
    return [];
  }
}

function getBackendWindowId(windowData) {
  const value = windowData?.id ?? windowData?.window_id;

  if (value === undefined || value === null || value === "") {
    return null;
  }

  const windowId = Number(value);

  return Number.isInteger(windowId) && windowId > 0
    ? windowId
    : null;
}

function getDjangoScreenId(windowData) {
  const value =
    windowData?.active_screen_details?.id ??
    windowData?.active_screen_details?.screen_id ??
    windowData?.activee_screen_id ??
    windowData?.screen_id;

  if (value === undefined || value === null || value === "") {
    return null;
  }

  const screenId = Number(value);

  return Number.isInteger(screenId) && screenId > 0
    ? screenId
    : null;
}

function getRendererUrl(screenPath) {
  const routeValue = String(screenPath || "/");

  const route = routeValue.startsWith("/")
    ? routeValue
    : `/${routeValue}`;

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const baseUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL.replace(/\/+$/, "");
    return `${baseUrl}${route}`;
  }

  return `http://127.0.0.1:${DISPLAY_HTTP_PORT}${route}`;
}

/* -------------------------------------------------------------------------- */
/* Developer tools                                                             */
/* -------------------------------------------------------------------------- */

function installDevToolsShortcuts(electronWindow, windowId) {
  electronWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") {
      return;
    }

    const key = String(input.key || "").toLowerCase();

    const isDevToolsShortcut =
      (input.control && input.shift && key === "i") ||
      key === "f12";

    if (!isDevToolsShortcut) {
      return;
    }

    event.preventDefault();

    if (electronWindow.webContents.isDevToolsOpened()) {
      electronWindow.webContents.closeDevTools();
    } else {
      electronWindow.webContents.openDevTools({ mode: "detach" });
    }

    console.log(
      `[DEBUG] DevTools shortcut triggered for window ${windowId}`
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Window WebSocket management                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Start a WebSocket for a Django Window ID and supply the PID getter
 * for the corresponding Electron BrowserWindow.
 *
 * The PID is obtained when the WebSocket opens, so it can be refreshed
 * if the renderer process changes before a later reconnection.
 */
function ensureWindowSocketForWindow(windowId) {
  const normalizedWindowId = Number(windowId);

  if (
    !Number.isInteger(normalizedWindowId) ||
    normalizedWindowId <= 0
  ) {
    console.warn("[WARN] Invalid Django Window ID:", windowId);
    return;
  }

  if (stopWindowSockets.has(normalizedWindowId)) {
    console.log(
      `[DEBUG] Window WebSocket already started for Django Window ${normalizedWindowId}`
    );
    return;
  }

  const electronWindow = electronWindows.get(normalizedWindowId);

  if (!electronWindow || electronWindow.isDestroyed()) {
    console.warn(
      `[WARN] Cannot start WebSocket: Electron window for Django ID ${normalizedWindowId} is unavailable`
    );
    return;
  }

  // This is a getter, not a fixed PID. It retrieves the current renderer PID.
  const getRendererPid = () => {
    if (electronWindow.isDestroyed()) {
      return null;
    }

    const pid = electronWindow.webContents.getOSProcessId();

    return Number.isInteger(pid) && pid > 0 ? pid : null;
  };

  console.log(
    `[DEBUG] Starting WebSocket for Django Window ${normalizedWindowId}`,
    {
      rendererPid: getRendererPid(),
      mainProcessPid: process.pid,
    }
  );

  try {
    const stop = startWindowSocket(
      handleWindowSocketUpdate,
      normalizedWindowId,
      "client",
      getRendererPid
    );

    stopWindowSockets.set(normalizedWindowId, stop);
  } catch (error) {
    console.error(
      `[ERROR] Could not start WebSocket for Django Window ${normalizedWindowId}:`,
      error
    );
  }
}

function startWindowWebSockets(windows) {
  const windowIds = new Set();

  for (const windowData of windows) {
    const windowId = getBackendWindowId(windowData);

    if (windowId !== null) {
      windowIds.add(windowId);
    }
  }

  if (windowIds.size === 0) {
    console.warn(
      "[WARN] No backend Window IDs found. Window WebSockets were not started."
    );
    return;
  }

  for (const windowId of windowIds) {
    ensureWindowSocketForWindow(windowId);
  }
}

function stopWindowSocketForWindow(windowId) {
  const normalizedWindowId = Number(windowId);
  const stop = stopWindowSockets.get(normalizedWindowId);

  if (!stop) {
    return;
  }

  try {
    stop();
  } catch (error) {
    console.error(
      `[ERROR] Failed to stop Window WebSocket ${normalizedWindowId}:`,
      error
    );
  }

  stopWindowSockets.delete(normalizedWindowId);
}

/* -------------------------------------------------------------------------- */
/* Close window                                                                */
/* -------------------------------------------------------------------------- */

function closeElectronWindow(windowId) {
  const normalizedWindowId = Number(windowId);

  if (
    !Number.isInteger(normalizedWindowId) ||
    normalizedWindowId <= 0
  ) {
    console.error("[CLOSE WINDOW] Invalid Window ID:", windowId);
    return false;
  }

  const electronWindow = electronWindows.get(normalizedWindowId);

  if (!electronWindow || electronWindow.isDestroyed()) {
    console.warn(
      `[CLOSE WINDOW] Window ${normalizedWindowId} is not open`
    );

    electronWindows.delete(normalizedWindowId);
    windowScreenIds.delete(normalizedWindowId);
    stopWindowSocketForWindow(normalizedWindowId);

    return false;
  }

  console.log(
    `[CLOSE WINDOW] Closing Electron window ${normalizedWindowId}`
  );

  try {
    electronWindow.close();
    return true;
  } catch (error) {
    console.error(
      `[CLOSE WINDOW] Failed to close window ${normalizedWindowId}:`,
      error
    );

    return false;
  }
}

function getCloseWindowId(message) {
  const candidates = [
    message?.window_id,
    message?.windowId,
    message?.window?.id,
    message?.window?.window_id,
    message?.payload?.window_id,
    message?.payload?.id,
    message?.data?.window_id,
    message?.data?.windowId,
    message?.data?.window?.id,
    message?.data?.window?.window_id,
    message?.data?.id,
    message?.id,
  ];

  return candidates.find(
    (value) => value !== undefined && value !== null && value !== ""
  );
}

function handleCloseWindowMessage(message, fallbackWindowId = null) {
  const type = String(
    message?.type ?? message?.data?.type ?? ""
  ).toLowerCase();

  if (type !== "close_window") {
    return false;
  }

  const windowId =
    getCloseWindowId(message) ?? fallbackWindowId;

  if (windowId === undefined || windowId === null || windowId === "") {
    console.error(
      "[CLOSE WINDOW] Received close signal without a Window ID:",
      message
    );

    return true;
  }

  closeElectronWindow(windowId);
  return true;
}

/* -------------------------------------------------------------------------- */
/* Create Electron windows                                                     */
/* -------------------------------------------------------------------------- */

async function createElectronWindow(windowData) {
  const windowId = getBackendWindowId(windowData);
  const name = windowData?.name;
  const config = windowData?.position_details;
  const activeScreen = windowData?.active_screen_details;
  const screenId = getDjangoScreenId(windowData);

  if (windowId === null) {
    console.error(
      "[ERROR] Cannot create an Electron window without a valid backend Window ID:",
      windowData
    );

    return null;
  }

  if (!config || !activeScreen?.path) {
    console.error(
      `[ERROR] Window ${windowId} is missing position_details or active_screen_details.path`
    );

    return null;
  }

  const screenPath = String(activeScreen.path);
  const existingWindow = electronWindows.get(windowId);

  if (existingWindow && !existingWindow.isDestroyed()) {
  console.log(
    `[DEBUG] Electron window ${windowId} already exists. Showing it.`
  );

  if (existingWindow.isMinimized()) {
    existingWindow.restore();
  }

  if (!existingWindow.isVisible()) {
    existingWindow.show();
  }

  existingWindow.focus();

  return existingWindow;
}

  const opacityValue = Number(config.opacity ?? 1);

  const opacity = Number.isFinite(opacityValue)
    ? Math.max(0, Math.min(1, opacityValue))
    : 1;

  const options = {
    x: Number(config.x ?? 0),
    y: Number(config.y ?? 0),
    width: Math.max(1, Number(config.width ?? 1920)),
    height: Math.max(1, Number(config.height ?? 1080)),

    fullscreen: Boolean(config.fullscreen),
    resizable: config.resizable !== false,
    movable: config.movable !== false,
    minimizable: config.minimizable !== false,
    maximizable: config.maximizable !== false,

    show: config.visible !== false,
    opacity,

    autoHideMenuBar: config.auto_hide_menu_bar !== false,
    title: name || `Window ${windowId}`,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,

      additionalArguments: [
        `--current-window-id=${String(windowId)}`,
        `--assigned-screen-path=${encodeURIComponent(screenPath)}`,
        `--assigned-screen-id=${screenId ?? ""}`,
      ],
    },
  };

  console.log(`[DEBUG] Creating Electron window ${windowId}:`, {
    name,
    djangoWindowId: windowId,
    screenId,
    screenPath,
    bounds: {
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
    },
  });

  const electronWindow = new BrowserWindow(options);

  electronWindows.set(windowId, electronWindow);

  if (screenId !== null) {
    windowScreenIds.set(windowId, screenId);
  }

  electronWindow.setAlwaysOnTop(Boolean(config.always_on_top));
  electronWindow.setMenuBarVisibility(Boolean(config.menu_bar_visible));

  if (!mainWindow) {
    mainWindow = electronWindow;
  }

  electronWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`[WARN] Blocked child window from ${windowId}:`, url);
    return { action: "deny" };
  });

  electronWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[ERROR] Renderer load failed for window ${windowId}:`, {
        errorCode,
        errorDescription,
        validatedURL,
      });
    }
  );

  installDevToolsShortcuts(electronWindow, windowId);

  electronWindow.on("closed", () => {
    console.log(`[DEBUG] Window ${windowId} closed`);

    if (electronWindows.get(windowId) === electronWindow) {
      electronWindows.delete(windowId);
      windowScreenIds.delete(windowId);
      stopWindowSocketForWindow(windowId);
    }

    if (mainWindow === electronWindow) {
      mainWindow = electronWindows.values().next().value ?? null;
    }
  });

  try {
    const rendererUrl = getRendererUrl(screenPath);

    console.log(`[DEBUG] Loading window ${windowId} URL:`, rendererUrl);

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      electronWindow.webContents.openDevTools({ mode: "detach" });
    }

    await electronWindow.loadURL(rendererUrl);

    // Log the actual renderer PID after the page has loaded.
    const rendererPid = electronWindow.webContents.getOSProcessId();

    console.log(
      `[DEBUG] Window ${windowId} loaded successfully.`,
      {
        djangoWindowId: windowId,
        rendererPid,
        mainProcessPid: process.pid,
        bounds: electronWindow.getBounds(),
      }
    );

    return electronWindow;
  } catch (error) {
    console.error(`[ERROR] Could not load window ${windowId}:`, error);

    if (!electronWindow.isDestroyed()) {
      electronWindow.destroy();
    }

    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Handle window-control WebSocket updates                                     */
/* -------------------------------------------------------------------------- */

function handleWindowSocketUpdate(properties, windowId) {
  if (handleCloseWindowMessage(properties, windowId)) {
    return;
  }

  if (windowId === undefined || windowId === null) {
    console.warn(
      "[WARN] Ignoring update because the backend Window ID is missing"
    );

    return;
  }

  const normalizedWindowId = Number(windowId);
  const targetWindow = electronWindows.get(normalizedWindowId);

  if (!targetWindow || targetWindow.isDestroyed()) {
    console.warn(
      `[WARN] No Electron window found for Django Window ID ${normalizedWindowId}`
    );

    return;
  }

  console.log(
    `[DEBUG] Applying update to Window ${normalizedWindowId}:`,
    properties
  );

  applyWindowProperties(targetWindow, properties);
}

/* -------------------------------------------------------------------------- */
/* Create windows from Django                                                  */
/* -------------------------------------------------------------------------- */

async function createWindowsFromBackend() {
  const windows = await fetchWindowsFromBackend();

  if (windows.length === 0) {
    console.warn("[WARN] No windows available from the backend");
    return [];
  }

  for (const windowData of windows) {
    try {
      await createElectronWindow(windowData);
    } catch (error) {
      console.error(
        `[ERROR] Failed to create backend window ${windowData?.id}:`,
        error
      );
    }
  }

  console.log(
    `[DEBUG] Electron windows currently open: ${electronWindows.size}`
  );

  return windows;
}

/* -------------------------------------------------------------------------- */
/* Normalize socket creation messages                                          */
/* -------------------------------------------------------------------------- */

function normalizeSocketWindowData(message) {
  console.log("[SCREEN WS] Normalizing received message:", message);

  // Handle a direct backend window configuration.
  // This object is not a WebSocket event and has no `type`.
  if (
    message &&
    typeof message === "object" &&
    message.position_details &&
    message.active_screen_details
  ) {
    console.log("[SCREEN WS] Received a backend window configuration.");

    return {
      ...message,

      // Keep backend Window ID as the Electron window key.
      window_id: Number(message.id),

      // Explicitly map screen configuration.
      screen_id: Number(message.active_screen_details.id),
      screen_path: message.active_screen_details.path,

      // Preserve position and dimensions.
      position_details: message.position_details,
      active_screen_details: message.active_screen_details,
    };
  }

  // Keep your existing event-based normalization below this point.
  const type = String(message?.type ?? "").toLowerCase();

  console.log("[SCREEN WS] Normalizing event type:", type);

  // Keep your existing switch(type) or other event handling here.
  // ...
}

/* -------------------------------------------------------------------------- */
/* Handle screen WebSocket messages                                            */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/* Screen WebSocket helpers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Support flat and nested event formats:
 *
 * { type: "add_window", data: { id: 10, ... } }
 * { type: "add_window", window: { id: 10, ... } }
 * { type: "show_window", id: 10, is_active: true }
 */
function getScreenEventPayload(message) {
  const outer = message ?? {};

  const payload =
    outer.window ??
    outer.data?.window ??
    outer.data ??
    outer.payload ??
    outer;

  return {
    ...payload,
    type: outer.type ?? payload.type,
    id:
      payload.id ??
      payload.window_id ??
      outer.window_id ??
      outer.id,
    is_active:
      payload.is_active ??
      outer.is_active,
  };
}

/**
 * Get a complete window configuration using the existing API.
 */
async function getBackendWindowConfiguration(windowId) {
  const windows = await fetchWindowsFromBackend();

  return (
    windows.find(
      (item) => getBackendWindowId(item) === Number(windowId)
    ) ?? null
  );
}

/**
 * Display an already-created Electron window.
 */
function showExistingElectronWindow(windowId) {
  const normalizedId = Number(windowId);
  const existingWindow = electronWindows.get(normalizedId);

  if (!existingWindow || existingWindow.isDestroyed()) {
    return false;
  }

  if (existingWindow.isMinimized()) {
    existingWindow.restore();
  }

  if (!existingWindow.isVisible()) {
    existingWindow.show();
  }

  existingWindow.focus();

  console.log(
    `[SCREEN WS] Existing Electron window ${normalizedId} is visible.`
  );

  ensureWindowSocketForWindow(normalizedId);

  return true;
}

/**
 * Create a window when it does not exist, or show it when it does.
 */
async function createOrShowWindow(windowId, suppliedData = null) {
  const normalizedId = Number(windowId);

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    console.error("[SCREEN WS] Invalid Window ID:", windowId);
    return false;
  }

  // Reuse the currently open Electron window.
  if (showExistingElectronWindow(normalizedId)) {
    return true;
  }

  // The event may contain only an ID, so fetch the full configuration.
  let fullWindowData = suppliedData;

  let normalizedData = fullWindowData
    ? normalizeSocketWindowData(fullWindowData)
    : null;

  if (!normalizedData) {
    fullWindowData =
      await getBackendWindowConfiguration(normalizedId);

    if (!fullWindowData) {
      console.error(
        `[SCREEN WS] Backend configuration not found for Window ${normalizedId}.`
      );

      return false;
    }

    normalizedData =
      normalizeSocketWindowData(fullWindowData);
  }

  if (!normalizedData) {
    console.error(
      `[SCREEN WS] Could not normalize configuration for Window ${normalizedId}.`,
      fullWindowData
    );

    return false;
  }

  const actualId = getBackendWindowId(normalizedData);

  if (actualId !== normalizedId) {
    console.error("[SCREEN WS] Window ID mismatch:", {
      expected: normalizedId,
      received: actualId,
    });

    return false;
  }

  const createdWindow = await createElectronWindow(normalizedData);

  if (!createdWindow) {
    console.error(
      `[SCREEN WS] Could not create Electron window ${normalizedId}.`
    );

    return false;
  }

  if (!createdWindow.isDestroyed()) {
    if (createdWindow.isMinimized()) {
      createdWindow.restore();
    }

    if (!createdWindow.isVisible()) {
      createdWindow.show();
    }

    createdWindow.focus();
  }

  ensureWindowSocketForWindow(normalizedId);

  console.log(
    `[SCREEN WS] Window ${normalizedId} is ready. Open windows: ${electronWindows.size}`
  );

  return true;
}

/* -------------------------------------------------------------------------- */
/* Handle screen WebSocket events                                              */
/* -------------------------------------------------------------------------- */

async function handleScreenSocketMessage(message) {
  console.log("[SCREEN WS] Received:", message);

  // --------------------------------------------------
  // 1. Read event type from the outermost message
  // --------------------------------------------------
  const type = String(
    message?.type ??
    message?.data?.type ??
    ""
  ).toLowerCase();

  // --------------------------------------------------
  // 2. Unwrap nested data until we reach the window
  //    configuration.
  // --------------------------------------------------
  let event = message;

  while (
    event?.data &&
    typeof event.data === "object" &&
    !Array.isArray(event.data)
  ) {
    event = event.data;
  }

  // --------------------------------------------------
  // 3. Extract backend Window ID
  // --------------------------------------------------
  const windowId = Number(
    event?.id ??
    event?.window_id ??
    event?.windowId
  );

  console.log(
    "[SCREEN WS] Received event:",
    type,
    event
  );

  // --------------------------------------------------
  // 4. Handle close_window
  //
  // Close the Electron window matching the backend ID.
  // --------------------------------------------------
  if (type === "close_window") {
    if (
      !Number.isInteger(windowId) ||
      windowId <= 0
    ) {
      console.error(
        "[SCREEN WS] Invalid Window ID for close_window:",
        message
      );
      return;
    }

    console.log(
      `[SCREEN WS] Received close_window event. Closing Electron window ${windowId}.`
    );

    closeElectronWindow(windowId);
    return;
  }

  // --------------------------------------------------
  // 5. Validate Window ID for other events
  // --------------------------------------------------
  if (
    !Number.isInteger(windowId) ||
    windowId <= 0
  ) {
    console.error(
      "[SCREEN WS] Invalid Window ID:",
      message
    );
    return;
  }

  // --------------------------------------------------
  // 6. Handle show_window
  //
  // is_active = false -> close Electron window
  // is_active = true  -> show existing or create
  // --------------------------------------------------
  if (type === "show_window") {
    const isActive = event?.is_active;

    if (isActive === false) {
      console.log(
        `[SCREEN WS] Window ${windowId} is inactive. Closing Electron window.`
      );

      closeElectronWindow(windowId);
      return;
    }

    if (isActive === true) {
      console.log(
        `[SCREEN WS] Window ${windowId} is active. Showing existing window or creating it.`
      );

      try {
        await createOrShowWindow(windowId, event);
      } catch (error) {
        console.error(
          `[SCREEN WS] Failed to show Window ${windowId}:`,
          error
        );
      }

      return;
    }

    console.warn(
      `[SCREEN WS] show_window has no valid is_active value for Window ${windowId}:`,
      event
    );

    return;
  }

  // --------------------------------------------------
  // 7. Handle add_window / create_window
  // --------------------------------------------------
  if (
    type === "add_window" ||
    type === "create_window" ||
    type === "create_window_signal" ||
    type === "window_created"
  ) {
    console.log(
      `[SCREEN WS] Creating Electron window ${windowId}.`
    );

    try {
      await createOrShowWindow(windowId, event);
    } catch (error) {
      console.error(
        `[SCREEN WS] Failed to create Window ${windowId}:`,
        error
      );
    }

    return;
  }

  // --------------------------------------------------
  // 8. Handle other event types
  // --------------------------------------------------
  console.log(
    `[SCREEN WS] Ignoring event "${type}".`
  );
}

/* -------------------------------------------------------------------------- */
/* Screen WebSocket startup                                                    */
/* -------------------------------------------------------------------------- */

function startScreenWebSocket() {
  if (stopScreenSocket) {
    console.log("[SCREEN WS] Already started.");
    return;
  }

  console.log("[SCREEN WS] Starting screen creation listener.");

  stopScreenSocket = startScreenSocket(handleScreenSocketMessage);
}

/* -------------------------------------------------------------------------- */
/* Electron startup                                                            */
/* -------------------------------------------------------------------------- */

app.whenReady().then(async () => {
  try {
    initDatabase();
    registerIPC();

    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await startDisplayHttpServer();
    }

    const windows = await createWindowsFromBackend();

    startWindowWebSockets(windows);
    startScreenWebSocket();
  } catch (error) {
    console.error("[ERROR] Application startup failed:", error);
  }
});

/* -------------------------------------------------------------------------- */
/* macOS activation                                                            */
/* -------------------------------------------------------------------------- */

app.on("activate", async () => {
  if (electronWindows.size === 0) {
    const windows = await createWindowsFromBackend();

    startWindowWebSockets(windows);
    startScreenWebSocket();
  }
});

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                     */
/* -------------------------------------------------------------------------- */

function cleanupApplication() {
  if (stopScreenSocket) {
    try {
      stopScreenSocket();
      stopScreenSocket = null;
    } catch (error) {
      console.error("[ERROR] Failed to stop Screen WebSocket:", error);
    }
  }

  for (const stop of stopWindowSockets.values()) {
    try {
      stop();
    } catch (error) {
      console.error("[ERROR] Failed to stop Window WebSocket:", error);
    }
  }

  stopWindowSockets.clear();

  if (httpServer) {
    httpServer.close((error) => {
      if (error) {
        console.error("[ERROR] Failed to close HTTP server:", error);
      } else {
        console.log("[DEBUG] HTTP server closed");
      }
    });

    httpServer = null;
  }

  if (db) {
    try {
      db.close();
      db = null;
      participantCache = null;

      console.log("[DEBUG] SQLite connection closed");
    } catch (error) {
      console.error("[ERROR] Failed to close SQLite:", error);
    }
  }
}

app.on("before-quit", cleanupApplication);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
