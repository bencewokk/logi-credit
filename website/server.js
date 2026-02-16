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
  // For Google OAuth users we don't store a password.
  password: { type: String, required: function () { return (this.provider || 'local') === 'local'; }, minlength: 6 },
  provider: { type: String, default: 'local', enum: ['local', 'google'] },
  name: { type: String, trim: true },
  picture: { type: String, trim: true },
  googleId: { type: String, trim: true },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  balance: { type: Number, default: 100000 }, // Starting balance in HUF
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
  fromUser:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUser:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromAccount:    { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
  toAccount:      { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
  amount:         { type: Number, required: true, min: 0.01 },
  originalAmount: { type: Number },          // amount in sender's currency
  currency:       { type: String, default: 'HUF' },
  fromCurrency:   { type: String },
  toCurrency:     { type: String },
  exchangeRate:   { type: Number },
  type:           { type: String, default: 'transfer', enum: ['transfer', 'exchange'] },
  note:           { type: String, trim: true, maxlength: 140 },
  createdAt:      { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Bank Account Schema (multi-currency accounts per user)
const SUPPORTED_CURRENCIES = [
  'HUF','EUR','USD','GBP','CHF','CZK','PLN','RON','SEK','NOK','DKK',
  'JPY','CNY','AUD','CAD','NZD','TRY','BRL','INR','KRW','MXN','ZAR',
  'SGD','HKD','THB','ILS','AED','SAR','RUB','BGN','HRK','ISK'
];

const bankAccountSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountNumber: { type: String, required: true, trim: true },
  bankName:      { type: String, trim: true, default: 'Logi Bank' },
  currency:      { type: String, required: true, enum: SUPPORTED_CURRENCIES, default: 'HUF' },
  balance:       { type: Number, default: 0 },
  isDefault:     { type: Boolean, default: false },
  createdAt:     { type: Date, default: Date.now }
});

bankAccountSchema.index({ user: 1, currency: 1 });
bankAccountSchema.index({ accountNumber: 1 }, { unique: true });

const BankAccount = mongoose.model('BankAccount', bankAccountSchema);

// --- Exchange Rate Service (ExchangeRate-API, 15-min cache) ---
const exchangeRateCache = new Map(); // key = baseCurrency, value = { rates, fetchedAt }
const EXCHANGE_RATE_TTL = 15 * 60 * 1000; // 15 minutes

function generateAccountNumber() {
  // Generate IBAN-like number: HU + 2 check + 24 digits
  const digits = () => Math.floor(Math.random() * 10);
  let num = 'HU';
  for (let i = 0; i < 26; i++) num += digits();
  return num;
}

async function fetchExchangeRates(baseCurrency = 'USD') {
  const cached = exchangeRateCache.get(baseCurrency);
  if (cached && (Date.now() - cached.fetchedAt) < EXCHANGE_RATE_TTL) {
    return cached.rates;
  }

  try {
    const resp = await axios.get(`https://open.er-api.com/v6/latest/${baseCurrency}`);
    if (resp.data && resp.data.result === 'success') {
      const rates = resp.data.rates;
      exchangeRateCache.set(baseCurrency, { rates, fetchedAt: Date.now() });
      return rates;
    }
    throw new Error('API returned non-success');
  } catch (err) {
    console.error(`❌ Exchange rate fetch error (${baseCurrency}):`, err.message);
    // Return stale cache if available
    if (cached) return cached.rates;
    return null;
  }
}

async function convertAmount(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return { converted: amount, rate: 1 };
  const rates = await fetchExchangeRates(fromCurrency);
  if (!rates || !rates[toCurrency]) {
    throw new Error(`Árfolyam nem elérhető: ${fromCurrency} → ${toCurrency}`);
  }
  const rate = rates[toCurrency];
  return { converted: Math.round(amount * rate * 100) / 100, rate };
}

async function ensureDefaultBankAccount(userId, startingBalance = 100000) {
  const existing = await BankAccount.findOne({ user: userId });
  if (!existing) {
    const account = new BankAccount({
      user: userId,
      accountNumber: generateAccountNumber(),
      bankName: 'Logi Bank',
      currency: 'HUF',
      balance: startingBalance,
      isDefault: true
    });
    await account.save();
    return account;
  }
  return existing;
}

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

async function createUniqueUsernameFromEmail(email) {
  const base = String(email || '').trim().toLowerCase();
  if (!base) return `user_${Date.now()}`;

  // Prefer using the email itself as username.
  let candidate = base;
  for (let i = 0; i < 5; i++) {
    const exists = await User.exists({ username: candidate });
    if (!exists) return candidate;
    candidate = `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return `${base}_${Date.now()}`;
}

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

    // Create default HUF bank account for new user
    await ensureDefaultBankAccount(newUser._id, 100000);
    
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
    
    // Prevent password-login for Google-only accounts
    if ((user.provider || 'local') !== 'local') {
      return res.status(400).json({
        success: false,
        message: 'Ez a fiók Google bejelentkezéssel használható.'
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

    // Persist (or update) user in MongoDB for long-term storage.
    // If DB is unavailable, we still allow an in-memory login.
    let dbUser = null;
    if (isDbConnected()) {
      dbUser = await User.findOne({ email: userInfo.email });
      if (!dbUser) {
        const username = await createUniqueUsernameFromEmail(userInfo.email);
        dbUser = new User({
          username,
          email: userInfo.email,
          provider: 'google',
          name: userInfo.name,
          picture: userInfo.picture,
          googleId: userInfo.sub,
          role: 'user',
          lastLogin: new Date()
        });
      } else {
        dbUser.provider = 'google';
        dbUser.name = userInfo.name;
        dbUser.picture = userInfo.picture;
        dbUser.googleId = userInfo.sub;
        dbUser.lastLogin = new Date();
      }
      await dbUser.save();

      // Ensure default bank account exists for Google OAuth user
      await ensureDefaultBankAccount(dbUser._id, 100000);
    }

    // Create session
    const token = 'google_auth_' + Date.now();
    sessions.set(token, {
      username: dbUser?.username || userInfo.email,
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture,
      role: dbUser?.role || 'user',
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

// Get current user info from database (with balance)
app.get('/api/user/me', requireAuth, async (req, res) => {
  if (!isDbConnected()) {
    // Return session user if DB unavailable
    return res.json({
      success: true,
      user: req.user
    });
  }

  try {
    const dbUser = await resolveCurrentDbUser(req.user);
    if (!dbUser) {
      return res.json({
        success: true,
        user: req.user
      });
    }

    // Ensure bank accounts exist (migration for legacy users)
    await ensureDefaultBankAccount(dbUser._id, dbUser.balance || 100000);
    const bankAccounts = await BankAccount.find({ user: dbUser._id }).sort({ isDefault: -1, createdAt: 1 });

    return res.json({
      success: true,
      user: {
        _id: dbUser._id,
        username: dbUser.username,
        email: dbUser.email,
        name: dbUser.name,
        picture: dbUser.picture,
        role: dbUser.role,
        balance: dbUser.balance || 0,
        bankAccounts: bankAccounts,
        createdAt: dbUser.createdAt
      }
    });
  } catch (error) {
    console.error('❌ User/me error:', error);
    return res.status(500).json({
      success: false,
      message: 'Szerverhiba történt'
    });
  }
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

// Create a transaction (transfer) between users — multi-currency support
app.post('/api/transactions/transfer', requireAuth, async (req, res) => {
  const { to, amount, note, fromAccountId } = req.body || {};

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

    // Resolve sender's bank account
    let senderAccount;
    if (fromAccountId) {
      senderAccount = await BankAccount.findOne({ _id: fromAccountId, user: sender._id });
    }
    if (!senderAccount) {
      senderAccount = await BankAccount.findOne({ user: sender._id, isDefault: true });
    }
    if (!senderAccount) {
      // Migration: create default account from legacy balance
      senderAccount = await ensureDefaultBankAccount(sender._id, sender.balance || 100000);
    }

    // Resolve recipient's bank account (prefer same currency, else default)
    let recipientAccount = await BankAccount.findOne({ user: recipient._id, currency: senderAccount.currency });
    if (!recipientAccount) {
      recipientAccount = await BankAccount.findOne({ user: recipient._id, isDefault: true });
    }
    if (!recipientAccount) {
      recipientAccount = await ensureDefaultBankAccount(recipient._id, recipient.balance || 100000);
    }

    const transferAmount = Math.round(numericAmount * 100) / 100;

    // Check sender has enough balance
    if (senderAccount.balance < transferAmount) {
      return res.status(400).json({
        success: false,
        message: `Nincs elég egyenleged. Egyenleg: ${senderAccount.balance.toLocaleString('hu-HU')} ${senderAccount.currency}`
      });
    }

    // Convert if different currencies
    let receivedAmount = transferAmount;
    let exchangeRate = 1;
    const fromCurrency = senderAccount.currency;
    const toCurrency = recipientAccount.currency;

    if (fromCurrency !== toCurrency) {
      const conversion = await convertAmount(transferAmount, fromCurrency, toCurrency);
      receivedAmount = conversion.converted;
      exchangeRate = conversion.rate;
    }

    // Update bank account balances
    senderAccount.balance -= transferAmount;
    recipientAccount.balance += receivedAmount;

    await senderAccount.save();
    await recipientAccount.save();

    // Also sync legacy user.balance (sum of all accounts in HUF equivalent)
    const senderAccounts = await BankAccount.find({ user: sender._id });
    let senderTotalHuf = 0;
    for (const acc of senderAccounts) {
      if (acc.currency === 'HUF') {
        senderTotalHuf += acc.balance;
      } else {
        try {
          const conv = await convertAmount(acc.balance, acc.currency, 'HUF');
          senderTotalHuf += conv.converted;
        } catch { senderTotalHuf += 0; }
      }
    }
    sender.balance = Math.round(senderTotalHuf);
    await sender.save();

    const tx = await Transaction.create({
      fromUser: sender._id,
      toUser: recipient._id,
      fromAccount: senderAccount._id,
      toAccount: recipientAccount._id,
      amount: receivedAmount,
      originalAmount: transferAmount,
      currency: toCurrency,
      fromCurrency,
      toCurrency,
      exchangeRate,
      type: 'transfer',
      note: typeof note === 'string' ? note.trim().slice(0, 140) : undefined
    });

    return res.status(201).json({
      success: true,
      transactionId: tx._id,
      message: fromCurrency !== toCurrency
        ? `Tranzakció sikeres! ${transferAmount} ${fromCurrency} → ${receivedAmount.toLocaleString('hu-HU')} ${toCurrency} (árfolyam: ${exchangeRate.toFixed(4)})`
        : 'Tranzakció sikeres!',
      newBalance: senderAccount.balance,
      newBalanceCurrency: senderAccount.currency,
      exchangeRate: fromCurrency !== toCurrency ? exchangeRate : undefined
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

// =============================================
// BANK ACCOUNT ENDPOINTS
// =============================================

// List current user's bank accounts
app.get('/api/bank-accounts', requireAuth, async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, code: 'DB_UNAVAILABLE', message: 'Az adatbázis jelenleg nem elérhető.' });
  }

  try {
    const currentUser = await resolveCurrentDbUser(req.user);
    if (!currentUser) {
      return res.status(403).json({ success: false, message: 'Regisztrált felhasználó szükséges.' });
    }

    // Ensure at least one account exists (migration for existing users)
    await ensureDefaultBankAccount(currentUser._id, currentUser.balance || 100000);

    const accounts = await BankAccount.find({ user: currentUser._id }).sort({ isDefault: -1, createdAt: 1 });
    return res.json({ success: true, accounts });
  } catch (error) {
    console.error('❌ Bank accounts list error:', error);
    return res.status(500).json({ success: false, message: 'Szerverhiba történt' });
  }
});

// Add a new bank account
app.post('/api/bank-accounts', requireAuth, async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, code: 'DB_UNAVAILABLE', message: 'Az adatbázis jelenleg nem elérhető.' });
  }

  const { currency, bankName, accountNumber } = req.body || {};
  const cur = String(currency || 'HUF').toUpperCase();

  if (!SUPPORTED_CURRENCIES.includes(cur)) {
    return res.status(400).json({ success: false, message: `Nem támogatott valuta: ${cur}` });
  }

  try {
    const currentUser = await resolveCurrentDbUser(req.user);
    if (!currentUser) {
      return res.status(403).json({ success: false, message: 'Regisztrált felhasználó szükséges.' });
    }

    // Max 10 accounts per user
    const count = await BankAccount.countDocuments({ user: currentUser._id });
    if (count >= 10) {
      return res.status(400).json({ success: false, message: 'Maximum 10 bankszámla hozható létre.' });
    }

    const isFirst = count === 0;
    const accNum = accountNumber ? String(accountNumber).trim() : generateAccountNumber();

    const account = new BankAccount({
      user: currentUser._id,
      accountNumber: accNum,
      bankName: bankName ? String(bankName).trim() : 'Logi Bank',
      currency: cur,
      balance: 0,
      isDefault: isFirst
    });

    await account.save();
    return res.status(201).json({ success: true, account, message: 'Bankszámla sikeresen létrehozva!' });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'Ez a számlaszám már létezik.' });
    }
    console.error('❌ Bank account create error:', error);
    return res.status(500).json({ success: false, message: 'Szerverhiba történt' });
  }
});

// Update a bank account (set default, rename)
app.put('/api/bank-accounts/:id', requireAuth, async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, code: 'DB_UNAVAILABLE', message: 'Az adatbázis jelenleg nem elérhető.' });
  }

  try {
    const currentUser = await resolveCurrentDbUser(req.user);
    if (!currentUser) {
      return res.status(403).json({ success: false, message: 'Regisztrált felhasználó szükséges.' });
    }

    const account = await BankAccount.findOne({ _id: req.params.id, user: currentUser._id });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Bankszámla nem található.' });
    }

    const { bankName, isDefault } = req.body || {};
    if (bankName !== undefined) account.bankName = String(bankName).trim();
    if (isDefault === true) {
      // Unset other defaults
      await BankAccount.updateMany({ user: currentUser._id }, { isDefault: false });
      account.isDefault = true;
    }

    await account.save();
    return res.json({ success: true, account });
  } catch (error) {
    console.error('❌ Bank account update error:', error);
    return res.status(500).json({ success: false, message: 'Szerverhiba történt' });
  }
});

// Delete a bank account (only if balance is 0 and not the only account)
app.delete('/api/bank-accounts/:id', requireAuth, async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, code: 'DB_UNAVAILABLE', message: 'Az adatbázis jelenleg nem elérhető.' });
  }

  try {
    const currentUser = await resolveCurrentDbUser(req.user);
    if (!currentUser) {
      return res.status(403).json({ success: false, message: 'Regisztrált felhasználó szükséges.' });
    }

    const account = await BankAccount.findOne({ _id: req.params.id, user: currentUser._id });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Bankszámla nem található.' });
    }

    if (account.balance > 0) {
      return res.status(400).json({ success: false, message: 'Nem törölhető: az egyenleg nem nulla!' });
    }

    const count = await BankAccount.countDocuments({ user: currentUser._id });
    if (count <= 1) {
      return res.status(400).json({ success: false, message: 'Az utolsó bankszámla nem törölhető.' });
    }

    const wasDefault = account.isDefault;
    await BankAccount.deleteOne({ _id: account._id });

    // If deleted was default, make another one default
    if (wasDefault) {
      const other = await BankAccount.findOne({ user: currentUser._id });
      if (other) {
        other.isDefault = true;
        await other.save();
      }
    }

    return res.json({ success: true, message: 'Bankszámla törölve.' });
  } catch (error) {
    console.error('❌ Bank account delete error:', error);
    return res.status(500).json({ success: false, message: 'Szerverhiba történt' });
  }
});

// =============================================
// EXCHANGE RATE ENDPOINTS
// =============================================

// Get current exchange rates
app.get('/api/exchange-rates', requireAuth, async (req, res) => {
  const base = String(req.query.base || 'HUF').toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(base)) {
    return res.status(400).json({ success: false, message: `Nem támogatott valuta: ${base}` });
  }

  try {
    const rates = await fetchExchangeRates(base);
    if (!rates) {
      return res.status(503).json({ success: false, message: 'Árfolyam adatok nem elérhetők. Próbáld újra később.' });
    }

    // Filter to only supported currencies
    const filteredRates = {};
    SUPPORTED_CURRENCIES.forEach(c => {
      if (rates[c] !== undefined) filteredRates[c] = rates[c];
    });

    return res.json({
      success: true,
      base,
      rates: filteredRates,
      supportedCurrencies: SUPPORTED_CURRENCIES
    });
  } catch (error) {
    console.error('❌ Exchange rates error:', error);
    return res.status(500).json({ success: false, message: 'Szerverhiba történt' });
  }
});

// Get supported currencies list
app.get('/api/currencies', requireAuth, (req, res) => {
  return res.json({ success: true, currencies: SUPPORTED_CURRENCIES });
});

// Convert between own bank accounts
app.post('/api/exchange/convert', requireAuth, async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, code: 'DB_UNAVAILABLE', message: 'Az adatbázis jelenleg nem elérhető.' });
  }

  const { fromAccountId, toAccountId, amount } = req.body || {};
  const numericAmount = Number(amount);

  if (!fromAccountId || !toAccountId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Hiányzó vagy hibás adatok (fromAccountId, toAccountId, amount).' });
  }

  try {
    const currentUser = await resolveCurrentDbUser(req.user);
    if (!currentUser) {
      return res.status(403).json({ success: false, message: 'Regisztrált felhasználó szükséges.' });
    }

    const fromAccount = await BankAccount.findOne({ _id: fromAccountId, user: currentUser._id });
    const toAccount = await BankAccount.findOne({ _id: toAccountId, user: currentUser._id });

    if (!fromAccount || !toAccount) {
      return res.status(404).json({ success: false, message: 'Bankszámla nem található.' });
    }

    if (String(fromAccount._id) === String(toAccount._id)) {
      return res.status(400).json({ success: false, message: 'A forrás és cél számla nem lehet ugyanaz.' });
    }

    const transferAmount = Math.round(numericAmount * 100) / 100;

    if (fromAccount.balance < transferAmount) {
      return res.status(400).json({
        success: false,
        message: `Nincs elég egyenleg. Elérhető: ${fromAccount.balance.toLocaleString('hu-HU')} ${fromAccount.currency}`
      });
    }

    const { converted, rate } = await convertAmount(transferAmount, fromAccount.currency, toAccount.currency);

    fromAccount.balance -= transferAmount;
    toAccount.balance += converted;

    await fromAccount.save();
    await toAccount.save();

    // Log as exchange transaction
    const tx = await Transaction.create({
      fromUser: currentUser._id,
      toUser: currentUser._id,
      fromAccount: fromAccount._id,
      toAccount: toAccount._id,
      amount: converted,
      originalAmount: transferAmount,
      currency: toAccount.currency,
      fromCurrency: fromAccount.currency,
      toCurrency: toAccount.currency,
      exchangeRate: rate,
      type: 'exchange',
      note: `Valutaváltás: ${transferAmount} ${fromAccount.currency} → ${converted.toLocaleString('hu-HU')} ${toAccount.currency}`
    });

    // Sync legacy user.balance
    const allAccounts = await BankAccount.find({ user: currentUser._id });
    let totalHuf = 0;
    for (const acc of allAccounts) {
      if (acc.currency === 'HUF') {
        totalHuf += acc.balance;
      } else {
        try { const c = await convertAmount(acc.balance, acc.currency, 'HUF'); totalHuf += c.converted; } catch { /* skip */ }
      }
    }
    currentUser.balance = Math.round(totalHuf);
    await currentUser.save();

    return res.json({
      success: true,
      message: `Sikeresen váltottál ${transferAmount} ${fromAccount.currency} → ${converted.toLocaleString('hu-HU')} ${toAccount.currency}`,
      exchangeRate: rate,
      fromBalance: fromAccount.balance,
      toBalance: toAccount.balance,
      transactionId: tx._id
    });
  } catch (error) {
    console.error('❌ Exchange convert error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Szerverhiba történt' });
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