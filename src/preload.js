
import { contextBridge, ipcRenderer } from "electron";

/**
 * APIs exposed safely to the renderer.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  // Participant APIs
  saveParticipant: (data) =>
    ipcRenderer.invoke("participant:save", data),

  getParticipantByCycle: (cycle) =>
    ipcRenderer.invoke("participant:getByCycle", cycle),

  deleteParticipant: (cycle) =>
    ipcRenderer.invoke("participant:delete", cycle),

  getAllParticipants: () =>
    ipcRenderer.invoke("participant:getAll"),

  // Close a renderer window by its OS process ID.
  closeWindowByPid: (pid) =>
    ipcRenderer.invoke("close-window-by-pid", pid),
});

/**
 * Read arguments passed by main.js.
 */
function getArgumentValue(prefix) {
  const argument = process.argv.find((item) =>
    item.startsWith(prefix)
  );

  return argument ? argument.slice(prefix.length) : null;
}

const currentWindowId = getArgumentValue(
  "--current-window-id="
);

const encodedScreenPath = getArgumentValue(
  "--assigned-screen-path="
);

const assignedScreenId = getArgumentValue(
  "--assigned-screen-id="
);

let assignedScreenPath = "/";

try {
  assignedScreenPath = encodedScreenPath
    ? decodeURIComponent(encodedScreenPath)
    : "/";
} catch (error) {
  console.error(
    "[Preload] Failed to decode assigned screen path:",
    error
  );
}

const storageKey = `currentWindowId:${assignedScreenPath}`;

contextBridge.exposeInMainWorld("screenWindowInfo", {
  currentWindowId,
  assignedScreenPath,
  assignedScreenId,
  storageKey,
});

console.log("[Preload] Window information initialized:", {
  currentWindowId,
  assignedScreenPath,
  assignedScreenId,
  storageKey,
});
