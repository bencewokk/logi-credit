// Logi Credit - Theme Manager
// Revolut-style multi-theme system with settings modal

(function() {
  const THEME_KEY = 'logi-credit-theme';

  const THEMES = [
    {
      id: 'light',
      name: 'Világos',
      emoji: '☀️',
      preview: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #00d4aa 100%)',
      accent: '#00d4aa'
    },
    {
      id: 'dark',
      name: 'Sötét',
      emoji: '🌙',
      preview: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 50%, #7c3aed 100%)',
      accent: '#7c3aed'
    },
    {
      id: 'ocean',
      name: 'Óceán',
      emoji: '🌊',
      preview: 'linear-gradient(135deg, #0a1628 0%, #0f2038 50%, #00b4d8 100%)',
      accent: '#00b4d8'
    },
    {
      id: 'midnight',
      name: 'Éjfél',
      emoji: '🔮',
      preview: 'linear-gradient(135deg, #000000 0%, #10002b 50%, #4361ee 100%)',
      accent: '#4361ee'
    },
    {
      id: 'rosegold',
      name: 'Rózsaarany',
      emoji: '🌸',
      preview: 'linear-gradient(135deg, #fef6f0 0%, #fdf0e8 50%, #f093fb 100%)',
      accent: '#e8a87c'
    },
    {
      id: 'neon',
      name: 'Neon',
      emoji: '⚡',
      preview: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a28 40%, #00ff87 70%, #ff00e5 100%)',
      accent: '#00ff87'
    }
  ];

  // Get saved theme or default to system preference
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && THEMES.find(t => t.id === saved)) return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  // Apply theme to document
  function applyTheme(themeId) {
    if (!THEMES.find(t => t.id === themeId)) themeId = 'light';
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem(THEME_KEY, themeId);

    // Update toggle button
    const theme = THEMES.find(t => t.id === themeId);
    const toggleBtn = document.querySelector('.theme-toggle');
    if (toggleBtn && theme) {
      toggleBtn.textContent = '🎨';
      toggleBtn.title = 'Témák';
    }

    // Update active swatch in modal
    document.querySelectorAll('.theme-swatch').forEach(el => {
      el.classList.toggle('active', el.dataset.theme === themeId);
    });

    // Persist to server if logged in
    persistThemeToServer(themeId);
  }

  // Cycle to next theme
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const idx = THEMES.findIndex(t => t.id === current);
    const next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next.id);
  }

  // Persist theme preference to server (fire-and-forget)
  function persistThemeToServer(themeId) {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ theme: themeId })
    }).catch(() => {}); // silent fail
  }

  // Load theme from server on login
  async function loadThemeFromServer() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch('/api/user/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.theme && THEMES.find(t => t.id === data.theme)) {
          applyTheme(data.theme);
        }
      }
    } catch (e) { /* silent */ }
  }

  // Build and inject theme modal into the DOM
  function injectThemeModal() {
    if (document.getElementById('theme-settings-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'theme-settings-modal';
    overlay.className = 'theme-modal-overlay';
    overlay.innerHTML = `
      <div class="theme-modal">
        <div class="theme-modal-header">
          <span class="theme-modal-title">🎨 Téma beállítások</span>
          <button class="theme-modal-close" onclick="closeThemeModal()">&times;</button>
        </div>
        <div class="theme-grid">
          ${THEMES.map(t => `
            <button class="theme-swatch${t.id === getPreferredTheme() ? ' active' : ''}" data-theme="${t.id}" onclick="window.setTheme('${t.id}')">
              <div class="theme-swatch-preview" style="background:${t.preview}"></div>
              <div class="theme-swatch-info">
                <span class="theme-swatch-name">${t.emoji} ${t.name}</span>
                <span class="theme-swatch-check">✓</span>
              </div>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeThemeModal();
    });

    document.body.appendChild(overlay);
  }

  function openThemeModal() {
    injectThemeModal();
    const modal = document.getElementById('theme-settings-modal');
    if (modal) {
      modal.style.display = 'flex';
      // Trigger animation
      requestAnimationFrame(() => modal.classList.add('open'));
    }
  }

  function closeThemeModal() {
    const modal = document.getElementById('theme-settings-modal');
    if (modal) {
      modal.classList.remove('open');
      setTimeout(() => { modal.style.display = 'none'; }, 250);
    }
  }

  // Initialize
  function init() {
    const theme = getPreferredTheme();
    applyTheme(theme);

    // Bind theme toggle button to open modal
    const toggleBtn = document.querySelector('.theme-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = '🎨';
      toggleBtn.title = 'Témák';
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openThemeModal();
      });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeThemeModal();
    });

    // Try to load server-side theme preference
    loadThemeFromServer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Apply theme immediately to prevent FOUC
  const theme = getPreferredTheme();
  document.documentElement.setAttribute('data-theme', theme);

  // Export for manual use
  window.toggleTheme = toggleTheme;
  window.setTheme = applyTheme;
  window.openThemeModal = openThemeModal;
  window.closeThemeModal = closeThemeModal;
})();
