document.addEventListener('DOMContentLoaded',()=>{
  console.log('Logi Credit starter site loaded')

  // If OAuth callback redirected to a page with ?token=..., persist it
  // before running auth checks so we don't immediately bounce back to /login.html.
  hydrateAuthFromUrl();
  
  // Authentication check
  checkAuthentication();
  
  // Simple helper: highlight nav link for current page
  const links = document.querySelectorAll('header nav a')
  links.forEach(a=>{
    if(a.getAttribute('href')===window.location.pathname.split('/').pop()){
      a.style.textDecoration='underline'
    }
  })
  
  // Add logout functionality if user is authenticated
  addLogoutFunctionality();
  
  // Update user name if displayed
  updateUserName();

  // Render git version in the footer (commit + date)
  renderBuildInfo();
})

function isValidAuthToken(token) {
  return !!(token && (
    token === 'authenticated' ||
    token.startsWith('authenticated_') ||
    token.startsWith('google_auth_')
  ));
}

function hydrateAuthFromUrl() {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (!token || !isValidAuthToken(token)) return;

    localStorage.setItem('authToken', token);

    // Remove token from the URL for cleanliness (and to avoid leaking it via screenshots/copies).
    url.searchParams.delete('token');
    if (url.searchParams.get('google_auth') === 'success') {
      url.searchParams.delete('google_auth');
    }
    window.history.replaceState({}, document.title, url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash);
  } catch (e) {
    // Non-fatal: if URL parsing fails, fall back to existing localStorage behavior.
    console.warn('Failed to hydrate auth token from URL:', e);
  }
}

async function renderBuildInfo() {
  // Avoid duplicate insertion
  if (document.getElementById('build-info')) return;

  let version;
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    version = await res.json();
  } catch {
    return;
  }

  const commit = (version && version.commit) ? String(version.commit) : 'unknown';
  const rawDate = (version && version.date) ? String(version.date) : '';
  const date = rawDate ? rawDate.slice(0, 10) : '';
  const text = date ? `Version: ${commit} (${date})` : `Version: ${commit}`;

  // login.html uses a custom footer element
  const loginFooter = document.querySelector('.footer-text');
  if (loginFooter) {
    const span = document.createElement('span');
    span.id = 'build-info';
    span.textContent = ` • ${commit}${date ? ` • ${date}` : ''}`;
    loginFooter.appendChild(span);
    return;
  }

  let footer = document.querySelector('footer');
  if (!footer) {
    // Create a simple footer for pages that don't have one (e.g. people pages)
    footer = document.createElement('footer');
    const container = document.createElement('div');
    container.className = 'container';
    footer.appendChild(container);
    document.body.appendChild(footer);
  }

  const container = footer.querySelector('.container') || footer;
  const p = document.createElement('p');
  p.id = 'build-info';
  p.style.margin = '6px 0 0 0';
  p.textContent = text;
  container.appendChild(p);
}

/**
 * Check if user is authenticated and redirect to login if not
 */
function checkAuthentication() {
  const currentPage = window.location.pathname;
  const isLoginPage = currentPage.includes('login.html');
  const authToken = localStorage.getItem('authToken');
  
  // Check if token is valid (old format or new format with timestamp)
  const isAuthenticated = isValidAuthToken(authToken);
  
  // If not on login page and not authenticated, redirect to login
  if (!isLoginPage && !isAuthenticated) {
    window.location.href = '/login.html';
    return false;
  }
  
  // If on login page and authenticated, redirect to home
  if (isLoginPage && isAuthenticated) {
    window.location.href = '/home/';
    return false;
  }
  
  return true;
}

/**
 * Add logout button and functionality to navigation
 */
function addLogoutFunctionality() {
  const authToken = localStorage.getItem('authToken');
  const isAuthenticated = isValidAuthToken(authToken);
  
  if (isAuthenticated) {
    const nav = document.querySelector('header nav');
    // Avoid duplicates: some pages already render their own logout button.
    const pageAlreadyHasLogout =
      document.getElementById('logoutButton') ||
      (nav && nav.querySelector('.logout-btn'));

    if (nav && !pageAlreadyHasLogout) {
      const logoutButton = document.createElement('a');
      logoutButton.href = '#';
      logoutButton.textContent = 'Kijelentkezés';
      logoutButton.id = 'logoutButton';
      logoutButton.style.color = '#dc2626';
      logoutButton.style.marginLeft = '16px';
      
      logoutButton.addEventListener('click', function(e) {
        e.preventDefault();
        logout();
      });
      
      nav.appendChild(logoutButton);
    }
  }
}

/**
 * Update user name display
 */
function updateUserName() {
  const userName = localStorage.getItem('userName');
  const userNameElement = document.getElementById('user-name');
  
  if (userNameElement && userName) {
    userNameElement.textContent = userName;
  }
}

/**
 * Logout function
 */
function logout() {
  // Call server logout endpoint
  const authToken = localStorage.getItem('authToken');
  if (authToken) {
    fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    }).catch(err => console.error('Logout error:', err));
  }
  
  // Clear authentication data
  localStorage.removeItem('authToken');
  localStorage.removeItem('userName');
  localStorage.removeItem('loginTime');
  
  // Redirect to login page with absolute path
  window.location.href = '/login.html';
}

/**
 * Get authentication status
 */
function isAuthenticated() {
  return isValidAuthToken(localStorage.getItem('authToken'));
}

/**
 * Get current user name
 */
function getCurrentUser() {
  return localStorage.getItem('userName');
}
