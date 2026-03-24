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
        lastVideoId = currentVideoId;
      }
    }, 1000);
  },

  classifyCurrentPage() {
    const url = window.location.href;
    this.sessionData.url = url;
    
    // Initialize video start time if not set
    if (!this.sessionData.videoStartTime) {
      this.sessionData.videoStartTime = Date.now();
    }
    if (!this.sessionData.sessionStartTime) {
      this.sessionData.sessionStartTime = Date.now();
    }

    // Check if it's educational content first
    const educationalMatch = this.EDUCATIONAL_PATTERNS.find(p => p.pattern.test(url));
    if (educationalMatch) {
      return {
        category: 'productive',
        type: educationalMatch.type,
        confidence: 0.05,
        reason: `Educational content: ${educationalMatch.type}`
      };
    }

    // Special handling for YouTube
    if (url.includes('youtube.com')) {
      // If it's a short, it's potentially distracting
      if (url.includes('/shorts/')) {
        return {
          category: 'distracting',
          type: 'shorts',
          confidence: 0.9,
          reason: 'YouTube Shorts are highly distracting'
        };
      }

      // Regular watch page - check if educational
      if (url.includes('watch?v=')) {
        if (this.sessionData.isEducational) {
          return {
            category: 'productive',
            type: 'educational_video',
            confidence: 0.1,
            reason: 'Educational video content'
          };
        }
        // Non-educational video - neutral until watched too long
        return {
          category: 'neutral',
          type: 'video',
          confidence: 0.5,
          reason: 'Regular YouTube video (not flagged as distraction until watched for time)'
        };
      }

      // YouTube homepage/browsing
      return {
        category: 'neutral',
        type: 'video_browsing',
        confidence: 0.6,
        reason: 'YouTube browsing (not watching video)'
      };
    }

    // Check if it's social media (highly distracting)
    const socialMatch = this.SOCIAL_PATTERNS.find(p => p.pattern.test(url));
    if (socialMatch) {
      return {
        category: 'distracting',
        type: socialMatch.type,
        confidence: socialMatch.weight,
        reason: `${socialMatch.type} - known distraction source`
      };
    }

    // Default: neutral
    return {
      category: 'neutral',
      confidence: 0.5,
      reason: 'No pattern match'
    };
  },

  analyzeBehavior() {
    const videoWatchTime = Date.now() - this.sessionData.videoStartTime;
    const timeOnSite = Date.now() - this.sessionData.sessionStartTime;
    
    // Calculate "mindless scrolling" score
    const scrollRate = this.sessionData.scrollCount / (timeOnSite / 60000); // per minute
    const isDoomScrolling = scrollRate > 10 && this.sessionData.scrollCount > 50;

    // Get base classification
    const baseClassification = this.classifyCurrentPage();

    // === INTERVENTION LOGIC ===
    
    // Rule 1: Educational content never triggers intervention
    if (baseClassification.type === 'educational_video' || baseClassification.category === 'productive') {
      return {
        ...baseClassification,
        interventionLevel: 0,
        behavior: { videoWatchTime, timeOnSite }
      };
    }

    // Rule 2: YouTube Shorts - intervene only after 1+ minute of watching
    if (baseClassification.type === 'shorts') {
      let level = 0;
      if (videoWatchTime > 60000) level = 1;      // 1 minute: grayscale
      if (videoWatchTime > 300000) level = 2;     // 5 minutes: blur
      if (videoWatchTime > 600000) level = 3;     // 10 minutes: heavy blur
      
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

    // Rule 3: Regular non-educational videos - very weak intervention
    if (baseClassification.type === 'video' && videoWatchTime > 3600000) { // 1 hour
      return {
        ...baseClassification,
        interventionLevel: 1,
        behavior: { videoWatchTime, timeOnSite }
      };
    }

    // Rule 4: Social media - strong intervention on doom scrolling
    if (baseClassification.category === 'distracting') {
      let level = 0;
      if (isDoomScrolling) level = 2;             // Immediate blur for doom scrolling
      if (timeOnSite > 600000 && !isDoomScrolling) level = 1;  // 10 min of normal scrolling
      if (timeOnSite > 1200000) level = 2;        // 20 minutes
      
      return {
        ...baseClassification,
        interventionLevel: level,
        behavior: { scrollRate, isDoomScrolling, timeOnSite }
      };
    }

    // Default: no intervention
    return {
      ...baseClassification,
      interventionLevel: 0,
      behavior: { videoWatchTime, timeOnSite }
    };
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Classifier.init());
} else {
  Classifier.init();
}