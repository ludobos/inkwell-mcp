// Inkwell Web Clipper — Content script
// Extracts page metadata and selected text

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getSelection') {
    const selection = window.getSelection()?.toString()?.trim() ?? '';

    // Also extract page metadata
    const meta = {
      selection,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content ?? '',
      publishedDate: (
        document.querySelector('meta[property="article:published_time"]')?.content ??
        document.querySelector('time[datetime]')?.getAttribute('datetime') ??
        ''
      ),
      author: (
        document.querySelector('meta[name="author"]')?.content ??
        document.querySelector('meta[property="article:author"]')?.content ??
        ''
      ),
    };

    sendResponse(meta);
  }
  return true;
});
