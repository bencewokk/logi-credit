// Logi Credit - Theme Manager
// Handles dark/light mode switching

(function() {
  const THEME_KEY = 'logi-credit-theme';
  
  // Get saved theme or default to system preference
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
  
  // Apply theme to document
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    
    // Update toggle button icon
    const toggleBtn = document.querySelector('.theme-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
      toggleBtn.title = theme === 'dark' ? 'Világos mód' : 'Sötét mód';
    }
  }
  
  // Toggle between themes
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }
  
  // Initialize on page load
  function init() {
    const theme = getPreferredTheme();
    applyTheme(theme);
    
    // Add click handler to toggle button
    const toggleBtn = document.querySelector('.theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
    }
  }
  
  // Run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Also apply theme immediately to prevent flash
  const theme = getPreferredTheme();
  document.documentElement.setAttribute('data-theme', theme);
  
  // Export for manual use
  window.toggleTheme = toggleTheme;
  window.setTheme = applyTheme;
})();
