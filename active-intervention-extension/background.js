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

  if (request.type === 'OPENAI_CLASSIFY') {
    (async () => {
      const { url, baseClassification, metadata } = request.data || {};
      try {
        // Get API key from storage
        const result = await chrome.storage.local.get(['openaiApiKey']);
        const apiKey = result.openaiApiKey;

        if (!apiKey) {
          sendResponse({ classification: null, error: 'OpenAI API key not set. Please set it in the extension popup.' });
          return;
        }

        const prompt = `You are a productivity assistant. Given the site URL and metadata, decide if this should be treated as a distraction requiring intervention or as productive/neutral. 

Classify as "productive" if the content is educational, work-related, tutorial, or skill-building.
Classify as "distraction" if the content is entertainment, movies, TV shows, gaming, social media, or leisure activities.
Classify as "neutral" only for ambiguous or non-video content.

URL: ${url}
Base classification: ${JSON.stringify(baseClassification)}
Metadata: ${JSON.stringify(metadata)}

Respond in JSON: { "category": "distraction|productive|neutral", "type": string, "interventionLevel": 0|1|2|3, "reason": string }`;

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: 'You are a fine-grained web distraction classifier.' }, { role: 'user', content: prompt }],
            max_tokens: 200
          })
        });

        const body = await res.json();
        const text = body?.choices?.[0]?.message?.content || '';
        let parsed = null;
        try { parsed = JSON.parse(text.trim()); } catch (err) { parsed = null; }

        if (parsed && parsed.category) {
          sendResponse({ classification: parsed });
        } else {
          sendResponse({ classification: null, error: 'OpenAI parse fail', raw: text });
        }
      } catch (err) {
        sendResponse({ classification: null, error: err.message || 'OpenAI request failed' });
      }
    })();
    return true; // async sendResponse
  }
});