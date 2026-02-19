// Inkwell Web Clipper — Background service worker
// Handles badge updates and quick-save via keyboard shortcut

chrome.commands.onCommand.addListener(async (command) => {
  if (command === '_execute_action') {
    // The popup opens automatically via the manifest command.
    // This handler is for future quick-save (no popup) functionality.
  }
});

// Update badge when source is saved
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.action === 'sourceSaved') {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#4a90d9' });

    // Clear badge after 2 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2000);
  }
});
