// === DISTRACTION CLASSIFIER ===
// Smart heuristics that understand content context

const Classifier = {
  // Educational/Work content that should NOT be intervened
  EDUCATIONAL_PATTERNS: [
    { pattern: /coursera\.org/i, type: 'course', weight: 0.05 },
    { pattern: /khanacademy\.org/i, type: 'course', weight: 0.05 },
    { pattern: /udemy\.com/i, type: 'course', weight: 0.05 },
    { pattern: /edx\.org/i, type: 'course', weight: 0.05 },
    { pattern: /youtube\.com.*education|ted\.com|brilliant\.org/i, type: 'education', weight: 0.1 },
    { pattern: /github\.com|stackoverflow\.com|docs\./i, type: 'coding', weight: 0.05 },
    { pattern: /docs\.google\.com|notion\.so|confluence/i, type: 'work', weight: 0.05 },
  ],

  // Educational YouTube channels (by keywords in title/channel)
  EDUCATIONAL_CHANNELS: [
    /khan\s*academy/i,
    /ted-?ed/i,
    /crash\s*course/i,
    /vsauce/i,
    /kurzgesagt/i,
    /mit\s*opencourseware/i,
    /coursera/i,
    /udemy/i,
    /programiz/i,
    /code\.org/i,
    /freecodec?amp/i,
    /educational/i,
    /tutorial|guide|how.?to|learn/i
  ],

  // Truly distracting sites (social media, infinite scroll)
  SOCIAL_PATTERNS: [
    { pattern: /twitter\.com|x\.com/i, type: 'social', weight: 0.95 },
    { pattern: /reddit\.com/i, type: 'social', weight: 0.9 },
    { pattern: /instagram\.com/i, type: 'social', weight: 0.95 },
    { pattern: /tiktok\.com/i, type: 'shorts', weight: 0.95 },
    { pattern: /facebook\.com/i, type: 'social', weight: 0.85 },
    { pattern: /snapchat\.com/i, type: 'social', weight: 0.9 },
    { pattern: /pinterest\.com/i, type: 'social', weight: 0.85 },
  ],
  
  // Behavioral tracking
  sessionData: {
    url: null,
    videoStartTime: null,
    sessionStartTime: null,
    scrollCount: 0,
    keyPressCount: 0,
    mouseMoveCount: 0,
    lastActivity: Date.now(),
    currentVideoId: null,
    isEducational: false
  },

  init() {
    this.startTracking();
    this.classifyCurrentPage();
  },

  startTracking() {
    // Track scroll behavior
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      this.sessionData.scrollCount++;
      this.sessionData.lastActivity = Date.now();
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => this.analyzeBehavior(), 1000);
    }, { passive: true });

    // Track keyboard activity
    window.addEventListener('keydown', () => {
      this.sessionData.keyPressCount++;
      this.sessionData.lastActivity = Date.now();
    }, { passive: true });

    // Track mouse movement
    window.addEventListener('mousemove', () => {
      this.sessionData.mouseMoveCount++;
    }, { passive: true });

    // Periodic behavior analysis
    setInterval(() => this.analyzeBehavior(), 5000);

    // Special tracking for YouTube videos
    this.trackYouTubeVideo();
  },

  // Detect educational YouTube channels
  isEducationalYouTubeVideo() {
    const pageTitle = document.title || '';
    const channelName = this.getYouTubeChannel();
    
    const combinedText = `${pageTitle} ${channelName}`.toLowerCase();
    
    return this.EDUCATIONAL_CHANNELS.some(pattern => pattern.test(combinedText));
  },

  // Extract YouTube channel name from page
  getYouTubeChannel() {
    try {
      // Try to find channel name in page
      const channelLink = document.querySelector('#channel-name a, yt-formatted-string.title[role="button"]');
      if (channelLink) return channelLink.textContent;
      
      // Fallback to ytInitialData if available
      if (window.ytInitialData?.metadata?.playlistMetadataRenderer?.title) {
        return window.ytInitialData.metadata.playlistMetadataRenderer.title;
      }
    } catch (e) {
      // Ignore errors
    }
    return '';
  },

  // Track YouTube video changes
  trackYouTubeVideo() {
    if (!window.location.href.includes('youtube.com')) return;

    const getVideoId = () => {
      const match = window.location.href.match(/v=([^&\s]+)/);
      return match ? match[1] : null;
    };

    // Check for video changes every second
    let lastVideoId = getVideoId();
    setInterval(() => {
      const currentVideoId = getVideoId();
      if (currentVideoId !== lastVideoId) {
        // Video changed - reset tracking
        this.sessionData.videoStartTime = Date.now();
        this.sessionData.currentVideoId = currentVideoId;
        this.sessionData.isEducational = this.isEducationalYouTubeVideo();
        this.runOpenAIClassification();
        lastVideoId = currentVideoId;
      }
    }, 1000);
  },

  getPageMetadata() {
    const title = document.title || '';
    const description = (document.querySelector('meta[name="description"]') || {}).content || '';
    const isVideoPage = Boolean(document.querySelector('video'));
    const videoElement = document.querySelector('video');
    const currentTime = videoElement ? videoElement.currentTime : 0;

    return {
      title,
      description,
      isVideoPage,
      currentTime,
      url: window.location.href,
      channel: this.getYouTubeChannel()
    };
  },

  async openAIClassify(baseClassification) {
    try {
      // Check if extension context is still valid
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return null;
      }

      const metadata = this.getPageMetadata();
      const payload = {
        type: 'OPENAI_CLASSIFY',
        data: {
          url: metadata.url,
          baseClassification,
          metadata
        }
      };

      const response = await chrome.runtime.sendMessage(payload);
      if (response && response.classification) {
        this.sessionData.openAIResult = {
          ...response.classification,
          url: metadata.url,
          reason: response.classification.reason || 'OpenAI classification'
        };
        return this.sessionData.openAIResult;
      }
    } catch (e) {
      // if API fails or context invalidated, keep local classification.
    }
    return null;
  },

  async runOpenAIClassification() {
    const baseClassification = this.getBaseClassification();
    const aiClass = await this.openAIClassify(baseClassification);
    if (aiClass) {
      this.sessionData.openAIResult = aiClass;
    }
  },

  getBaseClassification() {
    const url = window.location.href;

    const educationalMatch = this.EDUCATIONAL_PATTERNS.find(p => p.pattern.test(url));
    if (educationalMatch) {
      return {
        category: 'productive',
        type: educationalMatch.type,
        confidence: 0.05,
        reason: `Educational content: ${educationalMatch.type}`
      };
    }

    if (url.includes('youtube.com')) {
      if (url.includes('/shorts/')) {
        return {
          category: 'distracting',
          type: 'shorts',
          confidence: 0.9,
          reason: 'YouTube Shorts are highly distracting'
        };
      }
      if (url.includes('watch?v=')) {
        if (this.sessionData.isEducational) {
          return {
            category: 'productive',
            type: 'educational_video',
            confidence: 0.1,
            reason: 'Educational video content'
          };
        }

        // Wait for OpenAI classification before deciding; do not force distracting.
        return {
          category: 'neutral',
          type: 'video',
          confidence: 0.5,
          reason: 'Awaiting OpenAI classification for video content'
        };
      }
      return {
        category: 'neutral',
        type: 'video_browsing',
        confidence: 0.6,
        reason: 'YouTube browsing'
      };
    }

    const socialMatch = this.SOCIAL_PATTERNS.find(p => p.pattern.test(url));
    if (socialMatch) {
      return {
        category: 'distracting',
        type: socialMatch.type,
        confidence: socialMatch.weight,
        reason: `${socialMatch.type} - known distraction source`
      };
    }

    return {
      category: 'neutral',
      confidence: 0.5,
      reason: 'No pattern match'
    };
  },

  async classifyCurrentPage() {
    const url = window.location.href;
    this.sessionData.url = url;

    if (!this.sessionData.videoStartTime) {
      this.sessionData.videoStartTime = Date.now();
    }
    if (!this.sessionData.sessionStartTime) {
      this.sessionData.sessionStartTime = Date.now();
    }

    const baseClassification = this.getBaseClassification();

    // If we already got an OpenAI result for this URL, use it
    if (this.sessionData.openAIResult && this.sessionData.openAIResult.url === url) {
      return this.sessionData.openAIResult;
    }

    // Trigger OpenAI classification in background to take effect on next tick
    if (this.sessionData.openAIPendingUrl !== url) {
      this.sessionData.openAIPendingUrl = url;
      this.runOpenAIClassification();
    }

    // Return base classification while OpenAI evaluation completes
    return baseClassification;
  },

  async analyzeBehavior() {
    const videoWatchTime = Date.now() - this.sessionData.videoStartTime;
    const timeOnSite = Date.now() - this.sessionData.sessionStartTime;
    
    // Calculate "mindless scrolling" score (demo-fast)
    const scrollRate = this.sessionData.scrollCount / (timeOnSite / 60000); // per minute
    const isDoomScrolling = scrollRate > 5 && this.sessionData.scrollCount > 20;

    // Get base classification (may be updated from OpenAI asynchronously)
    const baseClassification = await this.classifyCurrentPage();

    // === INTERVENTION LOGIC ===
    
    // Rule 1: OpenAI/educational/neutral content never triggers intervention
    if (baseClassification.type === 'educational_video' || ['productive','neutral'].includes(baseClassification.category)) {
      return {
        ...baseClassification,
        interventionLevel: 0,
        behavior: { videoWatchTime, timeOnSite }
      };
    }

    // Rule 2: YouTube Shorts - more aggressive for hackathon demo
    if (baseClassification.type === 'shorts') {
      let level = 0;
      if (videoWatchTime > 10000) level = 1;      // 10 seconds: grayscale
      if (videoWatchTime > 30000) level = 2;      // 30 seconds: blur
      if (videoWatchTime > 60000) level = 3;      // 60 seconds: heavy blur
      
      return {
        ...baseClassification,
        interventionLevel: level,
        behavior: {
          videoWatchTime,
          timeOnSite,
          isDoomScrolling
        }
      };
    }

    // Rule 3: Regular non-educational videos - much faster for demo
    if (baseClassification.type === 'video' && videoWatchTime > 300000) { // 5 minutes
      return {
        ...baseClassification,
        interventionLevel: 1,
        behavior: { videoWatchTime, timeOnSite }
      };
    }

    // Rule 3.5: Distracting videos (classified by OpenAI) - intervene based on watch time
    if (baseClassification.category === 'distracting' && baseClassification.type === 'video') {
      let level = 0;
      if (videoWatchTime > 60000) level = 1;      // 1 minute: grayscale
      if (videoWatchTime > 180000) level = 2;     // 3 minutes: blur
      if (videoWatchTime > 300000) level = 3;     // 5 minutes: heavy blur
      
      return {
        ...baseClassification,
        interventionLevel: level,
        behavior: { videoWatchTime, timeOnSite }
      };
    }

    // Rule 4: Social media / distracting sites - graduated intervention
    if (baseClassification.category === 'distracting') {
      let level = 0;
      if (isDoomScrolling) {
        level = 3;                               // Immediate heavy blur for doom scrolling
      } else if (timeOnSite > 90000) {
        level = 3;                               // 1.5 minutes -> heavy blur
      } else if (timeOnSite > 60000) {
        level = 2;                               // 1 minute -> blur
      } else if (timeOnSite > 20000) {
        level = 1;                               // 20 seconds -> grayscale
      }

      return {
        ...baseClassification,
        interventionLevel: level,
        behavior: { scrollRate, isDoomScrolling, timeOnSite }
      };
    }

    // Default: no intervention (neutral or unrecognized content)
    const result = {
      ...baseClassification,
      interventionLevel: 0,
      behavior: { videoWatchTime, timeOnSite }
    };

    // Debug output for tracking why neutral appears
    if (typeof console !== 'undefined') {
      console.debug('[Classifier] Result', result);
    }

    return result;
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Classifier.init());
} else {
  Classifier.init();
}