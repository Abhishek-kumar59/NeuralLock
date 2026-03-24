// === POPUP CONTROLLER ===

document.addEventListener('DOMContentLoaded', async () => {
  const pauseBtn = document.getElementById('pause-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const siteCategory = document.getElementById('site-category');
  const interventionLevel = document.getElementById('intervention-level');
  const distractionCount = document.getElementById('distraction-count');
  const timeSaved = document.getElementById('time-saved');

  // Initialize stats display
  async function loadStats() {
    const stats = await chrome.storage.local.get(['distractionCount', 'timeSaved', 'isPaused']);
    distractionCount.textContent = stats.distractionCount || 0;
    timeSaved.textContent = (stats.timeSaved || 0) + 'm';

    // Update button visibility
    if (stats.isPaused) {      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'block';
    } else {
      pauseBtn.style.display = 'block';
      resumeBtn.style.display = 'none';
    }
  }

  // Load initial stats
  await loadStats();

  async function sendMessageToContent(tab, message) {
    if (!tab || !tab.id || !tab.url) return null;

    const isHttp = /^https?:\/\//i.test(tab.url);
    if (!isHttp) {
      return null;
    }

    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      // Try to inject content scripts if not yet active
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['classifier.js', 'interventions.js', 'content.js']
        });

        // After injection, send again
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch (err) {
        return null;
      }
    }
  }

  // Get current tab status and update periodically
  async function updateStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      siteCategory.className = 'badge badge-neutral';
      siteCategory.textContent = 'No Tab';
      interventionLevel.textContent = 'None';
      return;
    }

    const response = await sendMessageToContent(tab, { type: 'GET_STATUS' });
    if (response) {
      updateUI(response);
      return;
    }

    siteCategory.className = 'badge badge-neutral';
    siteCategory.textContent = 'Not Active';
    interventionLevel.textContent = 'None';
  }

  // Update status immediately and then every 2 seconds
  await updateStatus();
  setInterval(updateStatus, 2000);

  // Button handlers
  pauseBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      alert('No active tab found');
      return;
    }

    const response = await sendMessageToContent(tab, { type: 'PAUSE_INTERVENTIONS' });
    if (!response) {
      siteCategory.className = 'badge badge-neutral';
      siteCategory.textContent = 'Not Active';
      interventionLevel.textContent = 'None';
      return;
    }

    await chrome.storage.local.set({ isPaused: true });
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'block';
  });

  resumeBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      alert('No active tab found');
      return;
    }

    const response = await sendMessageToContent(tab, { type: 'RESUME_INTERVENTIONS' });
    if (!response) {
      siteCategory.className = 'badge badge-neutral';
      siteCategory.textContent = 'Not Active';
      interventionLevel.textContent = 'None';
      return;
    }

    await chrome.storage.local.set({ isPaused: false });
    resumeBtn.style.display = 'none';
    pauseBtn.style.display = 'block';
  });

  function updateUI(status) {
    // Update button states based on paused status
    if (status.paused) {
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'block';
    } else {
      pauseBtn.style.display = 'block';
      resumeBtn.style.display = 'none';
    }

    // Update category badge with color
    const cat = status.classification?.category || 'neutral';
    siteCategory.className = `badge badge-${cat}`;
    siteCategory.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    
    // Update intervention level text
    const level = status.classification?.interventionLevel || 0;
    const levelText = ['None', 'Grayscale', 'Blur', 'Heavy Blur'][level] || 'None';
    interventionLevel.textContent = levelText;
  }

  // Listen for messages from background script to update stats
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'STATS_UPDATED') {
      loadStats();
      sendResponse({ received: true });
    }
  });

  // API Key handling
  const apiKeyInput = document.getElementById('api-key-input');
  const saveApiKeyBtn = document.getElementById('save-api-key');

  // Load saved API key
  async function loadApiKey() {
    const result = await chrome.storage.local.get(['openaiApiKey']);
    if (result.openaiApiKey) {
      apiKeyInput.value = result.openaiApiKey;
    }
  }

  // Save API key
  saveApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      alert('Please enter a valid OpenAI API key');
      return;
    }

    await chrome.storage.local.set({ openaiApiKey: apiKey });
    alert('API key saved successfully!');
  });

  // Load API key on popup open
  loadApiKey();
});