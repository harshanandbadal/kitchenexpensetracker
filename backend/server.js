require('dotenv').config({ path: '../.env' });
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Serve static files from the parent directory (frontend)
app.use(express.static(path.join(__dirname, '..')));

// ===================== MongoDB Connection =====================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Atlas connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// ===================== Schemas & Models =====================

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  totalBudget: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Expense Schema
const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  item: { type: String, required: true },
  amount: { type: Number, required: true },
  quantity: { type: String, required: true },
  mode: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Expense = mongoose.model('Expense', expenseSchema);

// ===================== Auth Middleware =====================
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// ===================== Auth Routes =====================

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already registered.' });
      }
      return res.status(400).json({ error: 'Username already taken.' });
    }

    const user = new User({ username, email, password });
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: { id: user._id, username: user.username, email: user.email, totalBudget: user.totalBudget }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful!',
      token,
      user: { id: user._id, username: user.username, email: user.email, totalBudget: user.totalBudget }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// Get current user profile
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      totalBudget: req.user.totalBudget
    }
  });
});

// ===================== Budget Routes =====================

// Set budget
app.put('/api/budget/set', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (amount === undefined || isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: 'Please provide a valid budget amount.' });
    }
    req.user.totalBudget = amount;
    await req.user.save();
    res.json({ message: 'Budget updated.', totalBudget: req.user.totalBudget });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Add money to budget
app.put('/api/budget/add', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (amount === undefined || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Please provide a valid amount to add.' });
    }
    req.user.totalBudget += amount;
    await req.user.save();
    res.json({ message: 'Money added to budget.', totalBudget: req.user.totalBudget });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ===================== Expense Routes =====================

// Get all expenses for the logged-in user
app.get('/api/expenses', authMiddleware, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user._id }).sort({ date: 1, createdAt: 1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Add a new expense
app.post('/api/expenses', authMiddleware, async (req, res) => {
  try {
    const { date, item, amount, quantity, mode } = req.body;
    if (!date || !item || !amount || !quantity || !mode) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const expense = new Expense({
      userId: req.user._id,
      date,
      item,
      amount: parseFloat(amount),
      quantity,
      mode
    });
    await expense.save();
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Delete an expense
app.delete('/api/expenses/:id', authMiddleware, async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    res.json({ message: 'Expense deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Clear all expenses for the logged-in user
app.delete('/api/expenses', authMiddleware, async (req, res) => {
  try {
    await Expense.deleteMany({ userId: req.user._id });
    req.user.totalBudget = 0;
    await req.user.save();
    res.json({ message: 'All data cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ===================== Catch-all: Serve frontend =====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// ===================== Start Server =====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Frontend available at http://localhost:${PORT}/login.html`);
});
