const express = require('express');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
// NOTE: Do not hard-code credentials here. Set MONGODB_URI in your environment (Render/localhost).
const MONGODB_URI = process.env.MONGODB_URI;

// Fail fast instead of buffering operations for 10s+ when DB is down.
mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', 0);

if (!MONGODB_URI) {
  console.warn('⚠️  MONGODB_URI is not set. Database-backed endpoints will be unavailable.');
} else {
  mongoose
    .connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000
    })
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch(err => console.error('❌ MongoDB connection error:', err));
}

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

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

async function resolveCurrentDbUser(session) {
  if (!session) return null;
  const query = session.email
    ? { $or: [{ email: session.email }, { username: session.username }] }
    : { username: session.username };
  return User.findOne(query);
}

// Transaction Schema (user-to-user transfers)
const transactionSchema = new mongoose.Schema({
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: 'HUF' },
  note: { type: String, trim: true, maxlength: 140 },
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

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

  // If DB is down, fail fast with a clear message (prevents buffering timeouts -> 500).
  if (!isDbConnected()) {
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: 'Az adatbázis jelenleg nem elérhető. Próbáld újra később.'
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

    // Common DB connectivity error patterns (Atlas whitelist, network issues, etc.)
    const errorMessage = String(error && (error.message || error));
    const isDbConnectivityIssue =
      error?.name === 'MongooseServerSelectionError' ||
      /buffering timed out/i.test(errorMessage) ||
      /Could not connect to any servers/i.test(errorMessage);

    if (isDbConnectivityIssue) {
      return res.status(503).json({
        success: false,
        code: 'DB_UNAVAILABLE',
        message: 'Az adatbázis jelenleg nem elérhető. Próbáld újra később.'
      });
    }

    // Duplicate key (race condition between findOne + save)
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0];
      const friendly =
        duplicateField === 'username'
          ? 'Ez a felhasználónév már foglalt'
          : duplicateField === 'email'
            ? 'Ez az email cím már regisztrálva van'
            : 'A megadott adatokkal már létezik felhasználó';

      return res.status(400).json({
        success: false,
        code: 'DUPLICATE',
        message: friendly
      });
    }

    return res.status(500).json({
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

  if (!isDbConnected()) {
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: 'Az adatbázis jelenleg nem elérhető. Próbáld újra később.'
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
    const errorMessage = String(error && (error.message || error));
    const isDbConnectivityIssue =
      error?.name === 'MongooseServerSelectionError' ||
      /buffering timed out/i.test(errorMessage) ||
      /Could not connect to any servers/i.test(errorMessage);

    if (isDbConnectivityIssue) {
      return res.status(503).json({
        success: false,
        code: 'DB_UNAVAILABLE',
        message: 'Az adatbázis jelenleg nem elérhető. Próbáld újra később.'
      });
    }

    return res.status(500).json({
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

// List users (for selecting transaction recipients)
app.get('/api/users', requireAuth, async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: 'Az adatbázis jelenleg nem elérhető. Próbáld újra később.'
    });
  }

  try {
    const currentUser = await resolveCurrentDbUser(req.user);
    const query = currentUser ? { _id: { $ne: currentUser._id } } : {};
    const users = await User.find(query)
      .select('username email role createdAt')
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('❌ Users list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Szerverhiba történt'
    });
  }
});

// Create a transaction (transfer) between users
app.post('/api/transactions/transfer', requireAuth, async (req, res) => {
  const { to, amount, note } = req.body || {};

  if (!isDbConnected()) {
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: 'Az adatbázis jelenleg nem elérhető. Próbáld újra később.'
    });
  }

  const numericAmount = Number(amount);
  if (!to || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Hibás tranzakció adatok (címzett és pozitív összeg kötelező)'
    });
  }

  try {
    const sender = await resolveCurrentDbUser(req.user);
    if (!sender) {
      return res.status(403).json({
        success: false,
        message: 'A tranzakció indításához helyi (regisztrált) felhasználó szükséges.'
      });
    }

    const recipient = await User.findOne({
      $or: [{ username: String(to).trim() }, { email: String(to).trim().toLowerCase() }]
    });

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Címzett felhasználó nem található'
      });
    }

    if (String(sender._id) === String(recipient._id)) {
      return res.status(400).json({
        success: false,
        message: 'Nem küldhetsz tranzakciót saját magadnak'
      });
    }

    const tx = await Transaction.create({
      fromUser: sender._id,
      toUser: recipient._id,
      amount: Math.round(numericAmount),
      currency: 'HUF',
      note: typeof note === 'string' ? note.trim().slice(0, 140) : undefined
    });

    return res.status(201).json({
      success: true,
      transactionId: tx._id,
      message: 'Tranzakció létrehozva'
    });
  } catch (error) {
    console.error('❌ Transfer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Szerverhiba történt'
    });
  }
});

// List current user's transactions (sent + received)
app.get('/api/transactions', requireAuth, async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: 'Az adatbázis jelenleg nem elérhető. Próbáld újra később.'
    });
  }

  try {
    const currentUser = await resolveCurrentDbUser(req.user);
    if (!currentUser) {
      return res.status(403).json({
        success: false,
        message: 'A tranzakciók megtekintéséhez helyi (regisztrált) felhasználó szükséges.'
      });
    }

    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));

    const transactions = await Transaction.find({
      $or: [{ fromUser: currentUser._id }, { toUser: currentUser._id }]
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('fromUser', 'username email')
      .populate('toUser', 'username email');

    return res.json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('❌ Transactions list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Szerverhiba történt'
    });
  }
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
  });
}

module.exports = app;