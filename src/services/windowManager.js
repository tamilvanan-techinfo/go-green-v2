/**
 * Apply backend window properties to an Electron BrowserWindow.
 *
 * Supported property names include:
 * x, y, width, height, fullscreen, always_on_top,
 * alwaysOnTop, resizable, movable, visible,
 * menu_bar_visible, menuBarVisible, opacity.
 */

export function applyWindowProperties(mainWindow, properties = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.warn("[WARN] Cannot update a destroyed window");
    return false;
  }

  const getProperty = (camelCase, snakeCase) => {
    if (properties[camelCase] !== undefined) {
      return properties[camelCase];
    }

    return properties[snakeCase];
  };

  const currentBounds = mainWindow.getBounds();

  const x = getProperty("x", "x");
  const y = getProperty("y", "y");
  const width = getProperty("width", "width");
  const height = getProperty("height", "height");

  const fullscreen = getProperty("fullscreen", "fullscreen");

  const alwaysOnTop = getProperty(
    "alwaysOnTop",
    "always_on_top"
  );

  const resizable = getProperty("resizable", "resizable");
  const movable = getProperty("movable", "movable");
  const minimizable = getProperty("minimizable", "minimizable");
  const maximizable = getProperty("maximizable", "maximizable");
  const visible = getProperty("visible", "visible");

  const menuBarVisible = getProperty(
    "menuBarVisible",
    "menu_bar_visible"
  );

  const autoHideMenuBar = getProperty(
    "autoHideMenuBar",
    "auto_hide_menu_bar"
  );

  const opacity = getProperty("opacity", "opacity");

  const bounds = {
    x: x !== undefined ? Number(x) : currentBounds.x,
    y: y !== undefined ? Number(y) : currentBounds.y,
    width:
      width !== undefined
        ? Number(width)
        : currentBounds.width,
    height:
      height !== undefined
        ? Number(height)
        : currentBounds.height,
  };

  // Reject invalid geometry rather than passing NaN to Electron.
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width < 1 ||
    bounds.height < 1
  ) {
    console.error("[ERROR] Invalid window bounds:", bounds);
    return false;
  }

  console.log("[DEBUG] Applying window properties:", {
    bounds,
    fullscreen,
    alwaysOnTop,
    visible,
  });

  try {
    // Apply geometry before fullscreen when entering normal window mode.
    if (fullscreen !== true) {
      mainWindow.setBounds(bounds);
    }

    if (fullscreen !== undefined) {
      mainWindow.setFullScreen(Boolean(fullscreen));
    }

    if (resizable !== undefined) {
      mainWindow.setResizable(Boolean(resizable));
    }

    if (movable !== undefined) {
      mainWindow.setMovable(Boolean(movable));
    }

    if (minimizable !== undefined) {
      mainWindow.setMinimizable(Boolean(minimizable));
    }

    if (maximizable !== undefined) {
      mainWindow.setMaximizable(Boolean(maximizable));
    }

    if (menuBarVisible !== undefined) {
      mainWindow.setMenuBarVisibility(Boolean(menuBarVisible));
    }

    if (autoHideMenuBar !== undefined) {
      mainWindow.autoHideMenuBar = Boolean(autoHideMenuBar);
    }

    if (opacity !== undefined) {
      const value = Number(opacity);

      if (Number.isFinite(value)) {
        mainWindow.setOpacity(
          Math.max(0, Math.min(1, value))
        );
      }
    }

    if (properties.title !== undefined) {
      mainWindow.setTitle(String(properties.title));
    }

    if (properties.skipTaskbar !== undefined) {
      mainWindow.setSkipTaskbar(
        Boolean(properties.skipTaskbar)
      );
    }

    if (properties.closable !== undefined) {
      mainWindow.setClosable(Boolean(properties.closable));
    }

    if (properties.kiosk !== undefined) {
      mainWindow.setKiosk(Boolean(properties.kiosk));
    }

    if (properties.minimized === true) {
      mainWindow.minimize();
    } else if (properties.minimized === false) {
      mainWindow.restore();
    }

    if (properties.maximized === true) {
      mainWindow.maximize();
    } else if (properties.maximized === false) {
      mainWindow.unmaximize();
    }

    if (alwaysOnTop !== undefined) {
      mainWindow.setAlwaysOnTop(Boolean(alwaysOnTop));
    }

    if (visible === true) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      } else {
        mainWindow.show();
      }
    } else if (visible === false) {
      mainWindow.hide();
    }

    if (properties.focus === true) {
      mainWindow.focus();
    }

    console.log(
      "[DEBUG] Window properties applied. Current bounds:",
      mainWindow.getBounds()
    );

    return true;
  } catch (error) {
    console.error("[ERROR] Failed to apply window properties:", error);
    return false;
  }
}