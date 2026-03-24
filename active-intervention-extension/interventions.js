// === INTERVENTION ENGINE ===

const Interventions = {
  currentLevel: 0,
  isActive: false,

  // Level 1: Grayscale (Subtle)
  applyGrayscale() {
    if (this.currentLevel >= 1) return;
    document.body.classList.add('ai-grayscale');
    this.currentLevel = 1;
    this.logIntervention('grayscale');
  },

  // Level 2: Blur (Moderate)
  applyBlur() {
    if (this.currentLevel >= 2) return;
    document.body.classList.remove('ai-grayscale');
    document.body.classList.add('ai-blur');
    this.currentLevel = 2;
    this.logIntervention('blur');
  },

  // Level 3: Heavy blur + click to reveal (Aggressive)
  applyHeavyBlur() {
    if (this.currentLevel >= 3) return;
    document.body.classList.add('ai-heavy-blur');
    
    // Add click-to-reveal overlay
    const overlay = document.createElement('div');
    overlay.className = 'ai-reveal-overlay';
    overlay.innerHTML = `
      <div class="ai-reveal-text">
        <div>⚠️ You've been here for a while</div>
        <div style="font-size: 16px; margin-top: 10px; opacity: 0.8;">
          Click anywhere to reveal (you'll need to click again in 30 seconds)
        </div>
      </div>
    `;
    
    overlay.addEventListener('click', () => {
      this.temporarilyReveal(30000); // 30 seconds
    });
    
    document.body.appendChild(overlay);
    this.currentLevel = 3;
    this.logIntervention('heavy-blur');
  },

  // Special: Video delay gate (for YouTube, etc.)
  applyVideoDelay() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (video.dataset.aiDelayed) return;
      
      video.dataset.aiDelayed = 'true';
      video.pause();
      
      const gate = document.createElement('div');
      gate.className = 'ai-delay-gate';
      gate.innerHTML = `
        <div class="ai-delay-timer">5</div>
        <div class="ai-delay-message">Taking a moment to think... Is this worth your time?</div>
      `;
      
      document.body.appendChild(gate);
      
      let countdown = 5;
      const timer = setInterval(() => {
        countdown--;
        gate.querySelector('.ai-delay-timer').textContent = countdown;
        if (countdown <= 0) {
          clearInterval(timer);
          gate.remove();
          video.play();
        }
      }, 1000);
    });
    
    this.logIntervention('video-delay');
  },

  // Special: Move distracting buttons
  moveButtons() {
    const buttonSelectors = [
      '[data-testid="like"]',
      '[data-testid="retweet"]',
      'button[aria-label*="like" i]',
      'button[aria-label*="retweet" i]',
      '.ytp-next-button',
      '#related',
      '[data-testid="primaryColumn"] [role="button"]'
    ];
    
    buttonSelectors.forEach(selector => {
      const buttons = document.querySelectorAll(selector);
      buttons.forEach(btn => {
        if (btn.dataset.aiMoved) return;
        btn.dataset.aiMoved = 'true';
        btn.style.setProperty('--random-x', (Math.random() - 0.5).toFixed(2));
        btn.style.setProperty('--random-y', (Math.random() - 0.5).toFixed(2));
        btn.classList.add('ai-button-moved');
      });
    });
    
    this.logIntervention('button-move');
  },

  // Temporarily reveal content
  temporarilyReveal(duration) {
    document.body.classList.remove('ai-heavy-blur', 'ai-blur', 'ai-grayscale');
    const overlay = document.querySelector('.ai-reveal-overlay');
    if (overlay) overlay.remove();
    
    setTimeout(() => {
      this.applyHeavyBlur();
    }, duration);
  },

  // Remove all interventions
  clear() {
    document.body.classList.remove('ai-grayscale', 'ai-blur', 'ai-heavy-blur');
    document.querySelectorAll('.ai-reveal-overlay, .ai-delay-gate').forEach(el => el.remove());
    this.currentLevel = 0;
  },

  // Log for analytics (only when intervention is active)
  logIntervention(type) {
    try {
      chrome.runtime.sendMessage({
        type: 'INTERVENTION_APPLIED',
        interventionType: type,
        url: window.location.href,
        timestamp: Date.now()
      }).catch(() => {
        // Background script might not be ready, ignore
      });
    } catch (e) {
      // Ignore errors in development
    }
  },

  // Main trigger based on classification
  apply(classification) {
    const level = classification.interventionLevel || 0;
    
    // If intervention level is 0, clear any existing interventions
    if (level === 0) {
      this.clear();
      return;
    }

    // If not a distracting category and no intervention level, clear
    if (classification.category !== 'distracting' && level === 0) {
      this.clear();
      return;
    }
    
    switch(level) {
      case 1:
        this.applyGrayscale();
        break;
      case 2:
        this.applyBlur();
        this.moveButtons();
        break;
      case 3:
        this.applyHeavyBlur();
        this.moveButtons();
        if (classification.type === 'video' || classification.type === 'shorts') {
          this.applyVideoDelay();
        }
        break;
    }
  }
};