let btnTimeout = null;

document.getElementById('loadBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const btn = document.getElementById('loadBtn');

  try {
    btn.disabled = true;
    status.className = 'status';
    status.textContent = '⏳ Loading images from Google Drive...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('drive.google.com')) {
      status.className = 'status error';
      status.textContent = '❌ Please open a Google Drive folder first';
      btn.disabled = false;
      return;
    }

    // Use chrome.scripting.executeScript for Manifest V3
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Safety timeout: re-enable button after 30s if no status update
    if (btnTimeout) clearTimeout(btnTimeout);
    btnTimeout = setTimeout(() => {
      btn.disabled = false;
      if (!status.textContent.startsWith('✓') && !status.textContent.startsWith('❌')) {
        status.className = 'status error';
        status.textContent = '❌ Timeout — no response from page. Please refresh and try again.';
      }
    }, 30000);

  } catch (error) {
    status.className = 'status error';
    status.textContent = '❌ Error: ' + error.message;
    btn.disabled = false;
  }
});

// Listen for status updates from content script (via background)
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'scanStatusUpdate') {
    const status = document.getElementById('status');
    const btn = document.getElementById('loadBtn');
    status.textContent = request.text;

    // Clear safety timeout since we got a response
    if (btnTimeout) { clearTimeout(btnTimeout); btnTimeout = null; }

    if (request.text.startsWith('❌')) {
      status.className = 'status error';
      btn.disabled = false;
    } else if (request.text.startsWith('✓')) {
      status.className = 'status success';
      setTimeout(() => { btn.disabled = false; }, 1000);
    } else {
      status.className = 'status';
    }
  }
});