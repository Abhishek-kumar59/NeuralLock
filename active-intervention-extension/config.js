// Configuration file - DO NOT COMMIT THIS FILE
// Copy your .env values here for the extension to use

const CONFIG = {
  OPENAI_API_KEY: 'YOUR_OPENAI_API_KEY'
};

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else if (typeof self !== 'undefined') {
  self.CONFIG = CONFIG; // For service workers
} else {
  window.CONFIG = CONFIG; // For content scripts
}