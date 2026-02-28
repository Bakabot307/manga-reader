console.log('Content script running...');

if (window.__mangaReaderActive) {
  console.log('Content script already running, skipping');
} else {
  window.__mangaReaderActive = true;

  function sendStatus(text) {
    chrome.runtime.sendMessage({ action: 'scanStatus', text }).catch(() => { });
  }

  sendStatus('📖 Scanning folder...');

  function findAllScrollables() {
    const results = [];
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      const overflow = style.overflow + style.overflowY;
      if ((overflow.includes('auto') || overflow.includes('scroll')) &&
        el.scrollHeight > el.clientHeight + 50) {
        results.push(el);
      }
    });
    results.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return results;
  }

  function scrollElementToBottom(el) {
    const big = 999999;
    el.scrollTop = big;
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
    el.dispatchEvent(new WheelEvent('wheel', {
      deltaY: 1000, bubbles: true, cancelable: true
    }));
  }

  async function scrollToLoadAll() {
    let lastCount = 0;
    let stableRounds = 0;

    while (stableRounds < 4) {
      const scrollables = findAllScrollables();
      console.log(`Found ${scrollables.length} scrollable elements`);

      for (const el of scrollables) {
        scrollElementToBottom(el);
      }

      window.scrollTo(0, 999999);
      document.documentElement.scrollTop = 999999;
      document.body.scrollTop = 999999;
      window.dispatchEvent(new Event('scroll'));

      await new Promise(r => setTimeout(r, 800));

      const count = document.querySelectorAll('[data-id]').length;
      sendStatus(`📖 Loading... (${count} files found)`);
      console.log(`After scroll: ${count} [data-id] elements, stableRounds=${stableRounds}`);

      if (count === lastCount) {
        stableRounds++;
      } else {
        stableRounds = 0;
        lastCount = count;
      }
    }

    // Scroll back to top
    const scrollables = findAllScrollables();
    for (const el of scrollables) {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 400));
  }

  async function run() {
    const scrollables = findAllScrollables();
    console.log('Scrollable elements found:');
    scrollables.forEach((el, i) => {
      console.log(`  [${i}] ${el.tagName} class="${el.className.slice(0, 60)}" scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight}`);
    });

    await scrollToLoadAll();

    const fileElements = document.querySelectorAll('[data-id]');
    console.log('Total [data-id] elements after scroll:', fileElements.length);

    const images = [];
    const seenIds = new Set();

    fileElements.forEach((el) => {
      const dataId = el.getAttribute('data-id');
      const label = el.getAttribute('aria-label') || el.innerText || '';
      if (seenIds.has(dataId)) return;
      if (dataId && label && label.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
        seenIds.add(dataId);
        let imgSrc = '';
        const imgTag = el.querySelector('img[src*="lh3"]');
        if (imgTag && imgTag.src) {
          imgSrc = imgTag.src;
        } else {
          imgSrc = `https://lh3.google.com/u/0/d/${dataId}=w1920`;
        }
        const filename = label.match(/_\d+\.\w+/) ? label.match(/_\d+\.\w+/)[0] : label.split(' ')[0];
        images.push({ id: dataId, src: imgSrc, label: filename });
      }
    });

    images.sort((a, b) => {
      const numA = parseInt(a.label.match(/\d+/)?.[0] || 0);
      const numB = parseInt(b.label.match(/\d+/)?.[0] || 0);
      return numA - numB;
    });

    console.log(`Found ${images.length} images`);

    if (images.length === 0) {
      sendStatus('❌ No images found!');
      window.__mangaReaderActive = false;
      return;
    }

    sendStatus(`✓ Found ${images.length} images, opening reader...`);

    const title = document.title.replace(/\s*-\s*Google Drive\s*$/, '').trim() || 'Manga Reader';
    chrome.runtime.sendMessage({ action: 'openReader', images, title }).catch((err) => {
      sendStatus('❌ Error opening reader: ' + err.message);
      window.__mangaReaderActive = false;
    });
  }

  run();
}