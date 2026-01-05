document.addEventListener('DOMContentLoaded',()=>{
  console.log('Logi Credit starter site loaded')
  
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
})

/**
 * Check if user is authenticated and redirect to login if not
 */
function checkAuthentication() {
  const currentPage = window.location.pathname;
  const isLoginPage = currentPage.includes('login.html');
  const authToken = localStorage.getItem('authToken');
  
  // Check if token is valid (old format or new format with timestamp)
  const isAuthenticated = authToken && (
    authToken === 'authenticated' || 
    authToken.startsWith('authenticated_') || 
    authToken.startsWith('google_auth_')
  );
  
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
  const isAuthenticated = authToken && (
    authToken === 'authenticated' || 
    authToken.startsWith('authenticated_') || 
    authToken.startsWith('google_auth_')
  );
  
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
  return localStorage.getItem('authToken') === 'authenticated';
}

/**
 * Get current user name
 */
function getCurrentUser() {
  return localStorage.getItem('userName');
}
