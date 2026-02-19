// Inkwell Web Clipper — Popup logic

document.addEventListener('DOMContentLoaded', async () => {
  const titleInput = document.getElementById('title');
  const typeSelect = document.getElementById('type');
  const tagsInput = document.getElementById('tags');
  const notesInput = document.getElementById('notes');
  const selectionInput = document.getElementById('selection');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    titleInput.value = tab.title || '';

    // Auto-detect type from URL
    const url = tab.url || '';
    if (url.includes('youtube.com') || url.includes('vimeo.com')) {
      typeSelect.value = 'video';
    } else if (url.includes('twitter.com') || url.includes('x.com') || url.includes('linkedin.com')) {
      typeSelect.value = 'social';
    }
  }

  // Get selected text from content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });
    if (response?.selection) {
      selectionInput.value = response.selection;
    }
  } catch {
    // Content script may not be loaded
  }

  // Save button handler
  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
      const { serverUrl, apiKey } = await chrome.storage.sync.get(['serverUrl', 'apiKey']);

      if (!serverUrl) {
        showStatus('error', 'Configure server URL in settings first');
        return;
      }

      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'save_source',
          arguments: {
            url: tab.url,
            title: titleInput.value.trim(),
            type: typeSelect.value,
            description: notesInput.value.trim() || undefined,
            key_quotes: selectionInput.value.trim() || undefined,
          },
        },
      };

      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.error) {
        showStatus('error', data.error.message);
      } else {
        const result = JSON.parse(data.result?.content?.[0]?.text ?? '{}');
        if (result.duplicate) {
          showStatus('success', 'Already saved!');
        } else {
          showStatus('success', 'Source saved!');
        }
      }
    } catch (err) {
      showStatus('error', `Failed: ${err.message}`);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Source';
    }
  });

  // Settings link
  document.getElementById('settings-link').addEventListener('click', (e) => {
    e.preventDefault();
    const currentUrl = document.getElementById('settings-link').textContent;
    if (currentUrl === 'Settings') {
      showSettings();
    }
  });

  function showStatus(type, message) {
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
    if (type === 'success') {
      setTimeout(() => window.close(), 1500);
    }
  }

  async function showSettings() {
    const { serverUrl, apiKey } = await chrome.storage.sync.get(['serverUrl', 'apiKey']);

    document.body.innerHTML = `
      <h1>Settings</h1>
      <div class="field">
        <label>Server URL</label>
        <input type="text" id="server-url" value="${serverUrl || ''}" placeholder="http://localhost:3000 or https://your-worker.workers.dev">
      </div>
      <div class="field">
        <label>API Key (optional)</label>
        <input type="password" id="api-key" value="${apiKey || ''}" placeholder="ink_live_...">
      </div>
      <button id="save-settings">Save Settings</button>
      <div id="status" class="status"></div>
    `;

    document.getElementById('save-settings').addEventListener('click', async () => {
      const newUrl = document.getElementById('server-url').value.trim();
      const newKey = document.getElementById('api-key').value.trim();
      await chrome.storage.sync.set({ serverUrl: newUrl, apiKey: newKey });
      const s = document.getElementById('status');
      s.className = 'status success';
      s.textContent = 'Settings saved!';
      setTimeout(() => window.close(), 1000);
    });
  }
});
