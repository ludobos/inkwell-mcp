# Browser Extension (Web Clipper)

Chrome Extension MV3 for saving sources to your Inkwell MCP server.

## Install (Development)

1. Open Chrome > `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` directory

## Setup

1. Click the Inkwell extension icon
2. Click "Settings"
3. Enter your server URL:
   - Local: `http://localhost:3000` (if running HTTP server)
   - Remote: `https://your-worker.workers.dev/message`
4. Enter API key if auth is enabled

## Usage

1. Browse to any article/page you want to save
2. Optionally highlight relevant text
3. Press **Ctrl+Shift+S** (or **Cmd+Shift+S** on Mac) or click the extension icon
4. The popup shows pre-filled title and any selected text
5. Add tags, choose type, add notes
6. Click "Save Source"

The source appears in `list_sources` via MCP.

## Note

The extension sends JSON-RPC requests directly to your MCP server's HTTP endpoint. For local stdio-only mode, you'll need to set up an HTTP proxy (future feature).
