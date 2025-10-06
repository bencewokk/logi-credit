const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the website directory
app.use(express.static(path.join(__dirname)));

// Parse JSON bodies
app.use(express.json());

// Admin credentials (in production, these should be in environment variables)
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    res.json({
      success: true,
      message: 'Sikeres bejelentkezés',
      token: 'authenticated',
      user: {
        username: username,
        role: 'admin'
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Hibás felhasználónév vagy jelszó'
    });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Sikeres kijelentkezés'
  });
});

// Authentication middleware for protected routes
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader === 'Bearer authenticated') {
    next();
  } else {
    res.status(401).json({
      success: false,
      message: 'Unauthorized access'
    });
  }
}

// Protected API endpoints
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      username: 'admin',
      role: 'admin',
      loginTime: new Date().toISOString()
    }
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

app.listen(PORT, () => {
  console.log(`🚀 Logi Credit szerver fut a http://localhost:${PORT} címen`);
  console.log(`📋 Admin belépés: admin/admin123`);
  console.log(`🏠 Home page: http://localhost:${PORT}/home/`);
});