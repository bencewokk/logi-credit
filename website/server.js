const express = require('express');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bencewokk_db_user:rCYST066jBQI0P5g@logicredit.xe76mbo.mongodb.net/logicredit?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date }
});

const User = mongoose.model('User', userSchema);

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

// Register endpoint
app.post('/api/register', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  
  console.log('📝 Registration attempt:', { username, email });
  
  // Validation
  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Minden mező kitöltése kötelező'
    });
  }
  
  if (username.length < 3) {
    return res.status(400).json({
      success: false,
      message: 'A felhasználónév legalább 3 karakter hosszú legyen'
    });
  }
  
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'A jelszó legalább 6 karakter hosszú legyen'
    });
  }
  
  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'A jelszavak nem egyeznek'
    });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Érvénytelen email cím'
    });
  }
  
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({
          success: false,
          message: 'Ez a felhasználónév már foglalt'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Ez az email cím már regisztrálva van'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });
    
    await newUser.save();
    
    console.log('✅ User registered successfully:', username);
    
    res.status(201).json({
      success: true,
      message: 'Sikeres regisztráció! Most már bejelentkezhetsz.'
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Szerverhiba történt. Próbáld újra később.'
    });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  console.log('🔑 Login attempt:', { username, password: '***' });
  
  // Check for admin credentials first
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    const token = 'authenticated_' + Date.now();
    sessions.set(token, {
      username: username,
      role: 'admin',
      loginTime: new Date().toISOString(),
      provider: 'local'
    });
    
    console.log('✅ Admin login successful!');
    
    return res.json({
      success: true,
      message: 'Sikeres bejelentkezés',
      token: token,
      user: {
        username: username,
        role: 'admin'
      }
    });
  }
  
  try {
    // Find user in MongoDB
    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    
    if (!user) {
      console.log('❌ Login failed - user not found');
      return res.status(401).json({
        success: false,
        message: 'Hibás felhasználónév vagy jelszó'
      });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log('❌ Login failed - invalid password');
      return res.status(401).json({
        success: false,
        message: 'Hibás felhasználónév vagy jelszó'
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    const token = 'authenticated_' + Date.now();
    sessions.set(token, {
      username: user.username,
      email: user.email,
      role: user.role,
      loginTime: new Date().toISOString(),
      provider: 'local'
    });
    
    console.log('✅ Login successful for user:', user.username);
    
    res.json({
      success: true,
      message: 'Sikeres bejelentkezés',
      token: token,
      user: {
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Szerverhiba történt'
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