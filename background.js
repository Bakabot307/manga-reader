console.log('Background script loaded');

let storedImages = [];
let storedTitle = '';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openReader') {
    storedImages = request.images;
    storedTitle = request.title || '';
    chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
    sendResponse({ success: true });
  }

  if (request.action === 'getImages') {
    sendResponse({ images: storedImages, title: storedTitle });
  }

  // Forward scan status from content script to popup
  if (request.action === 'scanStatus') {
    chrome.runtime.sendMessage({ action: 'scanStatusUpdate', text: request.text }).catch(() => { });
  }
});
