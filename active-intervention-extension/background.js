// Tracks tab activity and session data
const SESSION_TRACKER = {
  tabs: {},
  
  startSession(tabId, url) {
    this.tabs[tabId] = {
      url,
      startTime: Date.now(),
      interventionApplied: null
    };
  },

  endSession(tabId) {
    if (this.tabs[tabId]) {
      delete this.tabs[tabId];
    }
  },

  recordIntervention(tabId, type) {
    if (this.tabs[tabId]) {
      this.tabs[tabId].interventionApplied = type;
    }
  }
};

// Periodic cleanup of storage to keep it free
setInterval(() => {
  chrome.storage.local.get(['distractionCount', 'timeSaved'], (result) => {
    // Keep only the current stats, clear old session data
    const cleanData = {
      distractionCount: result.distractionCount || 0,
      timeSaved: result.timeSaved || 0,
      lastCleanup: Date.now()
    };
    
    // Clear everything and store only essential data
    chrome.storage.local.clear(() => {
      chrome.storage.local.set(cleanData);
    });
  });
}, 3600000); // Cleanup every hour

// Track when tabs change
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  SESSION_TRACKER.startSession(activeInfo.tabId, tab.url);
  chrome.storage.local.set({
    lastActiveTab: tab.url,
    lastActiveTime: Date.now()
  });
});

// Track when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  SESSION_TRACKER.endSession(tabId);
});

// Listen for intervention reports and update stats
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'INTERVENTION_APPLIED') {
    // Record that an intervention was applied
    SESSION_TRACKER.recordIntervention(sender.tab.id, request.interventionType);
    sendResponse({ received: true });
  }
  
  if (request.type === 'DISTRACTION_DETECTED') {
    // Increment distraction counter
    chrome.storage.local.get(['distractionCount'], (result) => {
      const count = (result.distractionCount || 0) + 1;
      chrome.storage.local.set({ distractionCount: count });
      
      // Estimate time saved (assume ~2 minutes per intervention)
      chrome.storage.local.get(['timeSaved'], (result) => {
        const timeSaved = (result.timeSaved || 0) + 2;
        chrome.storage.local.set({ timeSaved });
        
        // Notify popup to update if it's open
        chrome.runtime.sendMessage({
          type: 'STATS_UPDATED',
          distractionCount: count,
          timeSaved
        }).catch(() => {
          // Popup not open, ignore
        });
      });
    });
    sendResponse({ received: true });
  }
  
  if (request.type === 'STATUS_UPDATE') {
    // Just acknowledge status updates
    sendResponse({ received: true });
  }
});