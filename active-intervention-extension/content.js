// === MAIN CONTENT SCRIPT ===
// Bridges classifier and interventions

(function() {
  'use strict';
  
  // Prevent double-injection
  if (window.ACTIVE_INTERVENTION_LOADED) return;
  window.ACTIVE_INTERVENTION_LOADED = true;

  // Debug mode - set to false to disable all console logs
  const DEBUG_MODE = false;
  const log = DEBUG_MODE ? console.log.bind(console, '[Active Intervention]') : () => {};
  log('Loaded');

  // === BLOCK AD TRACKING CORS ERRORS ===
  // Intercept XMLHttpRequest to prevent CORS errors from ad tracking
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    // Block YouTube/Google ad tracking requests that cause CORS errors
    if (typeof url === 'string' && (/pagead|google.*ad|doubleclick|googleadservices/i.test(url))) {
      // Silently block without logging
      return;
    }
    return originalXHROpen.apply(this, [method, url, ...args]);
  };

  // Also intercept fetch requests for the same issue
  const originalFetch = window.fetch;
  window.fetch = function(resource, config) {
    const url = typeof resource === 'string' ? resource : resource.url;
    if (typeof url === 'string' && (/pagead|google.*ad|doubleclick|googleadservices/i.test(url))) {
      // Silently block without logging
      return Promise.resolve(new Response('blocked', { status: 200 }));
    }
    return originalFetch.apply(this, arguments);
  };

  // Check classification every 3 seconds
  let lastDistractionSent = 0;
  let lastClassification = null;
  const trackingInterval = setInterval(() => {
    // Stop execution if extension context is invalidated (e.g. extension reloaded)
    if (!chrome.runtime?.id) {
      clearInterval(trackingInterval);
      return;
    }

    const classification = Classifier.analyzeBehavior();
    
    // Only send status update if classification changed (reduce unnecessary messages)
    if (!lastClassification || 
        lastClassification.category !== classification.category || 
        lastClassification.interventionLevel !== classification.interventionLevel) {
      chrome.runtime.sendMessage({
        type: 'STATUS_UPDATE',
        category: classification.category,
        level: classification.interventionLevel || 0
      }).catch(() => {
        // Background script might not be ready, ignore
      });
    }

    // Apply appropriate intervention
    Interventions.apply(classification);
    
    // Send distraction detected event (only when intervention is active)
    if (classification.category === 'distracting' && classification.interventionLevel > 0) {
      const now = Date.now();
      if (now - lastDistractionSent > 60000) {
        chrome.runtime.sendMessage({
          type: 'DISTRACTION_DETECTED'
        }).catch(() => {
          // Background script might not be ready, ignore
        });
        lastDistractionSent = now;
      }
    }
    
    lastClassification = classification;
  }, 3000);

  // Clear console periodically (every 5 minutes) to keep memory clean
  setInterval(() => {
    if (typeof console.clear === 'function') {
      console.clear();
    }
  }, 300000); // 5 minutes

  // Listen for manual override from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PAUSE_INTERVENTIONS') {
      Interventions.clear();
      window.AI_PAUSED = true;
      sendResponse({ paused: true });
    }
    
    if (request.type === 'RESUME_INTERVENTIONS') {
      window.AI_PAUSED = false;
      sendResponse({ resumed: true });
    }
    
    if (request.type === 'GET_STATUS') {
      sendResponse({
        url: window.location.href,
        classification: Classifier.classifyCurrentPage(),
        paused: window.AI_PAUSED || false
      });
    }
  });
})();