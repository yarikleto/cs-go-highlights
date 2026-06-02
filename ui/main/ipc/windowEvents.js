const { BrowserWindow } = require('electron');

function sendToEventWindow(event, channel, data) {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}

module.exports = {
  sendToEventWindow,
};
