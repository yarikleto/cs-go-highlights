const { BrowserWindow } = require('electron');

function isDisposedFrameError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes('Render frame was disposed')
    || message.includes('Object has been destroyed');
}

function sendToEventWindow(event, channel, data) {
  const sender = event?.sender;

  if (!sender || sender.isDestroyed()) {
    return false;
  }

  const window = BrowserWindow.fromWebContents(sender);

  if (!window || window.isDestroyed()) {
    return false;
  }

  try {
    const frame = sender.mainFrame;

    if (!frame || frame.isDestroyed() || frame.detached) {
      return false;
    }

    frame.send(channel, data);
    return true;
  } catch (error) {
    // The renderer can be replaced between the checks above and send(), for
    // example while the window is closing or Vite reloads it in development.
    if (isDisposedFrameError(error)) {
      return false;
    }

    throw error;
  }
}

module.exports = {
  sendToEventWindow,
};
