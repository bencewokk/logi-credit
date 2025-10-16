const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;

// Serve static files from the website directory
app.use(express.static(path.join(__dirname)));

// Parse JSON bodies
app.use(express.json());

// Admin credentials (in production, these should be in environment variables)
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

// In-memory session storage (in production, use Redis or database)
const sessions = new Map();

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log('🔑 Login attempt:', { username, password: '***' });
  console.log('🔒 Expected:', { username: ADMIN_CREDENTIALS.username, password: '***' });
  
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    const token = 'authenticated_' + Date.now();
    sessions.set(token, {
      username: username,
      role: 'admin',
      loginTime: new Date().toISOString(),
      provider: 'local'
    });
    
    console.log('✅ Login successful! Token:', token);
    
    res.json({
      success: true,
      message: 'Sikeres bejelentkezés',
      token: token,
      user: {
        username: username,
        role: 'admin'
      }
    });
  } else {
    console.log('❌ Login failed - invalid credentials');
    res.status(401).json({
      success: false,
      message: 'Hibás felhasználónév vagy jelszó'
    });
  }
});

// Google OAuth - Get authorization URL
app.get('/api/auth/google/url', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ].join(' ');
  
  const googleAuthUrl = 
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `access_type=offline&` +
    `prompt=consent`;
  
  res.json({
    success: true,
    url: googleAuthUrl
  });
});

// Google OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    return res.redirect('/login.html?error=' + encodeURIComponent(error));
  }
  
  if (!code) {
    return res.redirect('/login.html?error=no_code');
  }
  
  try {
    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code: code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });
    
    const { access_token, id_token } = tokenResponse.data;
    
    // Get user info
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });
    
    const userInfo = userInfoResponse.data;
    
    // Create session
    const token = 'google_auth_' + Date.now();
    sessions.set(token, {
      username: userInfo.email,
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture,
      role: 'user',
      loginTime: new Date().toISOString(),
      provider: 'google',
      google_id: userInfo.sub
    });
    
    // Redirect to home with token
    res.redirect(`/home/index.html?token=${token}&google_auth=success`);
    
  } catch (error) {
    console.error('Google OAuth error:', error.response?.data || error.message);
    res.redirect('/login.html?error=' + encodeURIComponent('google_auth_failed'));
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    sessions.delete(token);
  }
  
  res.json({
    success: true,
    message: 'Sikeres kijelentkezés'
  });
});

// Authentication middleware for protected routes
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized access - no token'
    });
  }
  
  const token = authHeader.substring(7);
  const session = sessions.get(token);
  
  if (!session) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized access - invalid token'
    });
  }
  
  req.user = session;
  next();
}

// Protected API endpoints
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Catch all handler - redirect to login if not authenticated
app.get('*', (req, res) => {
  // For API routes, return 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // For root path, serve index.html
  if (req.path === '/') {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  
  // For other paths, try to serve the file or redirect to login
  const filePath = path.join(__dirname, req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'login.html'));
    }
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Logi Credit szerver fut a http://localhost:${PORT} címen`);
    console.log(`🏠 Home page: http://localhost:${PORT}/home/`);
    console.log(`🔐 Admin bejelentkezés szükséges`);
  });
}

module.exports = app;