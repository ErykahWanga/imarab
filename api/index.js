const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// ==================== INITIALIZATION ====================
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'imara_dev_secret_change_this_in_production';
const DATA_FILE = path.join(__dirname, 'data.json');

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: ['http://localhost:5173', 'https://*.vercel.app', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ==================== DATA STORAGE ====================
let data = {
  users: [],
  checkins: [],
  journals: [],
  habits: [],
  habitCompletions: [],
  moodEntries: [],
  achievements: [],
  userAchievements: [],
  selfCareActivities: [],
  challenges: [],
  userChallenges: [],
  reminders: [],
  communityPosts: [],
  postReplies: [],
  themes: [],
  lastSave: new Date().toISOString()
};

// Load data from file
const loadData = async () => {
  try {
    const fileData = await fs.readFile(DATA_FILE, 'utf8');
    data = JSON.parse(fileData);
    console.log('✅ Data loaded from file');
  } catch (error) {
    console.log('Starting with fresh data');
    await initializeDefaultData();
  }
};

// Save data to file
const saveData = async () => {
  try {
    data.lastSave = new Date().toISOString();
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
};

// Auto-save every 30 seconds
setInterval(saveData, 30000);

// Initialize default data
const initializeDefaultData = async () => {
  // Default achievements
  data.achievements = [
    {
      id: 'first_checkin',
      title: 'Getting Started',
      description: 'Complete your first daily check-in',
      icon: '🎯',
      points: 10,
      category: 'consistency',
      color: 'blue'
    },
    {
      id: 'streak_3',
      title: 'Three Day Streak',
      description: 'Check in for 3 consecutive days',
      icon: '⚡',
      points: 25,
      category: 'consistency',
      color: 'green'
    },
    {
      id: 'streak_7',
      title: 'Weekly Warrior',
      description: 'Check in for 7 consecutive days',
      icon: '📅',
      points: 50,
      category: 'consistency',
      color: 'purple'
    },
    {
      id: 'first_journal',
      title: 'Reflective Soul',
      description: 'Write your first journal entry',
      icon: '📖',
      points: 15,
      category: 'awareness',
      color: 'amber'
    },
    {
      id: 'first_post',
      title: 'Storyteller',
      description: 'Share your first community post',
      icon: '💬',
      points: 20,
      category: 'community',
      color: 'pink'
    }
  ];

  // Default challenges
  data.challenges = [
    {
      id: 'hydration_7',
      title: '7-Day Hydration Challenge',
      description: 'Drink 8 glasses of water daily for a week',
      category: 'wellness',
      duration: 7,
      points: 50,
      icon: '💧',
      color: 'blue',
      isActive: true
    },
    {
      id: 'gratitude_week',
      title: 'Gratitude Week',
      description: 'Share one thing you\'re grateful for each day',
      category: 'mindfulness',
      duration: 7,
      points: 40,
      icon: '🙏',
      color: 'green',
      isActive: true
    }
  ];

  await saveData();
};

// ==================== UTILITY FUNCTIONS ====================
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const getAnonymousName = () => {
  const adjectives = ['Calm', 'Quiet', 'Gentle', 'Steady', 'Brave', 'Kind', 'Wise', 'Patient'];
  const nouns = ['Oak', 'River', 'Mountain', 'Star', 'Cloud', 'Stone', 'Wind', 'Light'];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
};

const formatDate = (date = new Date()) => date.toISOString().split('T')[0];

const calculateStreak = (userId) => {
  const userCheckins = data.checkins
    .filter(c => c.userId === userId)
    .map(c => c.date)
    .sort()
    .reverse();

  if (userCheckins.length === 0) return 0;

  let streak = 1;
  let currentDate = new Date(userCheckins[0]);
  
  for (let i = 1; i < userCheckins.length; i++) {
    const checkinDate = new Date(userCheckins[i]);
    const diffDays = Math.floor((currentDate - checkinDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      streak++;
      currentDate = checkinDate;
    } else {
      break;
    }
  }
  
  return streak;
};

// Achievement helper
const awardAchievement = async (userId, achievementId) => {
  const achievement = data.achievements.find(a => a.id === achievementId);
  if (!achievement) return;

  const alreadyAwarded = data.userAchievements.find(ua => 
    ua.userId === userId && ua.achievementId === achievementId
  );
  
  if (alreadyAwarded) return;

  const userAchievement = {
    id: generateId(),
    userId,
    achievementId,
    unlockedAt: new Date().toISOString(),
    progress: 100,
    isUnlocked: true
  };

  data.userAchievements.push(userAchievement);

  // Update user stats
  const user = data.users.find(u => u.id === userId);
  if (user) {
    user.stats.totalPoints += achievement.points;
    user.stats.achievements += 1;
  }

  await saveData();
  return userAchievement;
};

// ==================== AUTH MIDDLEWARE ====================
const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = data.users.find(u => u.id === decoded.id);
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ==================== HEALTH & INFO ====================
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'IMARA Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    stats: {
      users: data.users.length,
      checkins: data.checkins.length,
      journals: data.journals.length,
      posts: data.communityPosts.length
    }
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    app: 'IMARA Wellness Platform',
    version: '1.0.0',
    features: [
      'Daily Check-ins',
      'Journaling',
      'Habit Tracking',
      'Mood Tracking',
      'Community Posts',
      'Achievements',
      'Challenges',
      'Self-Care Planning',
      'Reminders'
    ]
  });
});

// ==================== AUTH ROUTES ====================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, name, password } = req.body;

    // Validation
    if (!email || !username || !name || !password) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    // Check if user exists
    const existingUser = data.users.find(u => u.email === email || u.username === username);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: existingUser.email === email ? 'Email already registered' : 'Username already taken'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = {
      id: generateId(),
      email,
      username,
      name,
      password: hashedPassword,
      avatar: null,
      bio: '',
      streak: {
        current: 0,
        longest: 0,
        lastCheckIn: null
      },
      stats: {
        totalCheckIns: 0,
        totalJournalEntries: 0,
        totalHabitsCompleted: 0,
        totalMoodEntries: 0,
        totalPoints: 0,
        achievements: 0
      },
      settings: {
        notifications: true,
        emailNotifications: false,
        theme: 'light',
        accentColor: 'amber',
        dailyReminderTime: '09:00'
      },
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };

    data.users.push(user);

    // Create default theme
    data.themes.push({
      id: generateId(),
      userId: user.id,
      theme: 'light',
      accentColor: 'amber',
      fontSize: 'medium',
      reducedMotion: false,
      lastUpdated: new Date().toISOString()
    });

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Remove password from response
    const { password: _, ...userResponse } = user;

    await saveData();
    
    res.status(201).json({
      success: true,
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Find user
    const user = data.users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Update last active
    user.lastActive = new Date().toISOString();

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Remove password from response
    const { password: _, ...userResponse } = user;

    await saveData();
    
    res.json({
      success: true,
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/auth/me', protect, (req, res) => {
  const { password: _, ...userResponse } = req.user;
  res.json({ success: true, user: userResponse });
});

app.put('/api/auth/profile', protect, async (req, res) => {
  try {
    const { name, avatar, bio } = req.body;

    if (name) req.user.name = name;
    if (avatar !== undefined) req.user.avatar = avatar;
    if (bio !== undefined) req.user.bio = bio;

    await saveData();
    
    const { password: _, ...userResponse } = req.user;
    res.json({ success: true, user: userResponse });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.put('/api/auth/settings', protect, async (req, res) => {
  try {
    const { notifications, emailNotifications, theme, accentColor, dailyReminderTime } = req.body;

    if (notifications !== undefined) req.user.settings.notifications = notifications;
    if (emailNotifications !== undefined) req.user.settings.emailNotifications = emailNotifications;
    if (theme) req.user.settings.theme = theme;
    if (accentColor) req.user.settings.accentColor = accentColor;
    if (dailyReminderTime) req.user.settings.dailyReminderTime = dailyReminderTime;

    // Update theme record
    const userTheme = data.themes.find(t => t.userId === req.user.id);
    if (userTheme) {
      if (theme) userTheme.theme = theme;
      if (accentColor) userTheme.accentColor = accentColor;
      userTheme.lastUpdated = new Date().toISOString();
    }

    await saveData();
    
    res.json({ success: true, settings: req.user.settings });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/auth/anonymous-name', protect, (req, res) => {
  res.json({ success: true, anonymousName: getAnonymousName() });
});

// ==================== CHECK-IN ROUTES ====================
app.post('/api/checkins', protect, async (req, res) => {
  try {
    const { sleep, food, focus, mood, notes, tags } = req.body;

    if (!sleep || !food || !focus || !mood) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const today = formatDate();

    // Check if already checked in today
    const existing = data.checkins.find(c => c.userId === req.user.id && c.date === today);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Already checked in today' });
    }

    // Create check-in
    const checkin = {
      id: generateId(),
      userId: req.user.id,
      date: today,
      sleep,
      food,
      focus,
      mood,
      notes: notes || '',
      tags: tags || [],
      createdAt: new Date().toISOString()
    };

    data.checkins.push(checkin);

    // Update user streak
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    if (req.user.streak.lastCheckIn) {
      const lastCheckIn = new Date(req.user.streak.lastCheckIn);
      lastCheckIn.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((todayDate - lastCheckIn) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        req.user.streak.current += 1;
      } else if (diffDays > 1) {
        req.user.streak.current = 1;
      }
    } else {
      req.user.streak.current = 1;
    }

    if (req.user.streak.current > req.user.streak.longest) {
      req.user.streak.longest = req.user.streak.current;
    }

    req.user.streak.lastCheckIn = todayDate;
    req.user.stats.totalCheckIns += 1;

    // Check for achievements
    if (req.user.stats.totalCheckIns === 1) {
      await awardAchievement(req.user.id, 'first_checkin');
    }
    if (req.user.streak.current === 3) {
      await awardAchievement(req.user.id, 'streak_3');
    }
    if (req.user.streak.current === 7) {
      await awardAchievement(req.user.id, 'streak_7');
    }

    await saveData();
    
    res.status(201).json({
      success: true,
      checkIn: checkin
    });

  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/checkins/today', protect, (req, res) => {
  const today = formatDate();
  const checkin = data.checkins.find(c => c.userId === req.user.id && c.date === today);
  
  res.json({
    success: true,
    checkIn: checkin || null,
    hasCheckedInToday: !!checkin
  });
});

app.get('/api/checkins', protect, (req, res) => {
  const { startDate, endDate, limit = 30, page = 1 } = req.query;
  
  let userCheckins = data.checkins.filter(c => c.userId === req.user.id);
  
  // Date filtering
  if (startDate || endDate) {
    userCheckins = userCheckins.filter(c => {
      const checkinDate = new Date(c.date);
      if (startDate && checkinDate < new Date(startDate)) return false;
      if (endDate && checkinDate > new Date(endDate)) return false;
      return true;
    });
  }
  
  // Sorting and pagination
  userCheckins.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  const startIndex = (page - 1) * limit;
  const paginatedCheckins = userCheckins.slice(startIndex, startIndex + parseInt(limit));
  
  res.json({
    success: true,
    checkins: paginatedCheckins,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: userCheckins.length,
      pages: Math.ceil(userCheckins.length / limit)
    }
  });
});

app.get('/api/checkins/stats', protect, (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentCheckins = data.checkins.filter(c => 
    c.userId === req.user.id && 
    new Date(c.date) >= thirtyDaysAgo
  );
  
  const stats = {
    total: recentCheckins.length,
    byMood: {},
    bySleep: {},
    byFood: {},
    byFocus: {},
    streak: req.user.streak.current,
    consistency: recentCheckins.length > 0 ? Math.round((recentCheckins.length / 30) * 100) : 0
  };
  
  // Count occurrences
  recentCheckins.forEach(checkin => {
    stats.byMood[checkin.mood] = (stats.byMood[checkin.mood] || 0) + 1;
    stats.bySleep[checkin.sleep] = (stats.bySleep[checkin.sleep] || 0) + 1;
    stats.byFood[checkin.food] = (stats.byFood[checkin.food] || 0) + 1;
    stats.byFocus[checkin.focus] = (stats.byFocus[checkin.focus] || 0) + 1;
  });
  
  // Convert to percentages
  Object.keys(stats.byMood).forEach(key => {
    stats.byMood[key] = Math.round((stats.byMood[key] / stats.total) * 100);
  });
  
  Object.keys(stats.bySleep).forEach(key => {
    stats.bySleep[key] = Math.round((stats.bySleep[key] / stats.total) * 100);
  });
  
  Object.keys(stats.byFood).forEach(key => {
    stats.byFood[key] = Math.round((stats.byFood[key] / stats.total) * 100);
  });
  
  Object.keys(stats.byFocus).forEach(key => {
    stats.byFocus[key] = Math.round((stats.byFocus[key] / stats.total) * 100);
  });
  
  res.json({ success: true, stats });
});

app.get('/api/checkins/calendar', protect, (req, res) => {
  const { year, month } = req.query;
  const targetYear = parseInt(year) || new Date().getFullYear();
  const targetMonth = parseInt(month) || new Date().getMonth();
  
  const startDate = new Date(targetYear, targetMonth, 1);
  const endDate = new Date(targetYear, targetMonth + 1, 0);
  
  const calendarCheckins = data.checkins.filter(c => {
    const checkinDate = new Date(c.date);
    return c.userId === req.user.id && 
           checkinDate >= startDate && 
           checkinDate <= endDate;
  });
  
  const calendarData = {};
  calendarCheckins.forEach(checkin => {
    calendarData[checkin.date] = {
      mood: checkin.mood,
      sleep: checkin.sleep,
      food: checkin.food,
      focus: checkin.focus
    };
  });
  
  res.json({
    success: true,
    year: targetYear,
    month: targetMonth,
    data: calendarData
  });
});

// ==================== JOURNAL ROUTES ====================
app.post('/api/journal', protect, async (req, res) => {
  try {
    const { content, mood, tags, prompt } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content required' });
    }

    const journal = {
      id: generateId(),
      userId: req.user.id,
      content,
      mood: mood || '',
      tags: tags || [],
      prompt: prompt || '',
      date: formatDate(),
      createdAt: new Date().toISOString(),
      wordCount: content.trim().split(/\s+/).length
    };

    data.journals.push(journal);
    req.user.stats.totalJournalEntries += 1;

    // Award achievement for first journal
    if (req.user.stats.totalJournalEntries === 1) {
      await awardAchievement(req.user.id, 'first_journal');
    }

    await saveData();
    
    res.status(201).json({
      success: true,
      entry: journal
    });

  } catch (error) {
    console.error('Journal error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/journal', protect, (req, res) => {
  const { startDate, endDate, mood, tag, page = 1, limit = 20 } = req.query;
  
  let userJournals = data.journals.filter(j => j.userId === req.user.id);
  
  // Filter by date
  if (startDate || endDate) {
    userJournals = userJournals.filter(j => {
      const journalDate = new Date(j.date);
      if (startDate && journalDate < new Date(startDate)) return false;
      if (endDate && journalDate > new Date(endDate)) return false;
      return true;
    });
  }
  
  // Filter by mood
  if (mood) {
    userJournals = userJournals.filter(j => j.mood === mood);
  }
  
  // Filter by tag
  if (tag) {
    userJournals = userJournals.filter(j => j.tags.includes(tag));
  }
  
  // Sort and paginate
  userJournals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  const startIndex = (page - 1) * limit;
  const paginatedJournals = userJournals.slice(startIndex, startIndex + parseInt(limit));
  
  res.json({
    success: true,
    entries: paginatedJournals,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: userJournals.length,
      pages: Math.ceil(userJournals.length / limit)
    }
  });
});

app.get('/api/journal/stats', protect, (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentJournals = data.journals.filter(j => 
    j.userId === req.user.id && 
    new Date(j.createdAt) >= thirtyDaysAgo
  );
  
  const stats = {
    totalEntries: recentJournals.length,
    entriesByMood: {},
    totalWords: 0,
    averageWords: 0,
    consistency: recentJournals.length > 0 ? Math.round((recentJournals.length / 30) * 100) / 100 : 0
  };
  
  recentJournals.forEach(entry => {
    stats.totalWords += entry.wordCount;
    if (entry.mood) {
      stats.entriesByMood[entry.mood] = (stats.entriesByMood[entry.mood] || 0) + 1;
    }
  });
  
  if (recentJournals.length > 0) {
    stats.averageWords = Math.round(stats.totalWords / recentJournals.length);
  }
  
  // Convert to percentages
  Object.keys(stats.entriesByMood).forEach(key => {
    stats.entriesByMood[key] = Math.round((stats.entriesByMood[key] / recentJournals.length) * 100);
  });
  
  res.json({ success: true, stats });
});

app.get('/api/journal/prompts', (req, res) => {
  const prompts = [
    "What's one small thing you're grateful for today?",
    "What challenged you today, and how did you handle it?",
    "What's something you learned about yourself today?",
    "How did you show yourself kindness today?",
    "What moment brought you peace today?",
    "What's a boundary you honored today?",
    "What's one step you took toward your goals today?",
    "How did you recharge your energy today?",
    "What made you smile today?",
    "What would you tell your past self about today?"
  ];
  
  // Return 5 random prompts
  const shuffled = [...prompts].sort(() => 0.5 - Math.random());
  res.json({ success: true, prompts: shuffled.slice(0, 5) });
});

// ==================== HABIT ROUTES ====================
app.post('/api/habits', protect, async (req, res) => {
  try {
    const { name, emoji, category, reminderTime, frequency } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Habit name required' });
    }

    const habit = {
      id: generateId(),
      userId: req.user.id,
      name,
      emoji: emoji || '✨',
      category: category || 'health',
      frequency: frequency || 'daily',
      reminderTime: reminderTime || null,
      currentStreak: 0,
      longestStreak: 0,
      totalCompletions: 0,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    data.habits.push(habit);
    await saveData();
    
    res.status(201).json({
      success: true,
      habit
    });

  } catch (error) {
    console.error('Habit creation error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/habits', protect, (req, res) => {
  const userHabits = data.habits
    .filter(h => h.userId === req.user.id && h.isActive)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({ success: true, habits: userHabits });
});

app.post('/api/habits/:id/complete', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;
    
    const habit = data.habits.find(h => h.id === id && h.userId === req.user.id);
    if (!habit) {
      return res.status(404).json({ success: false, error: 'Habit not found' });
    }

    const completionDate = date ? new Date(date) : new Date();
    const today = formatDate(completionDate);

    // Check if already completed today
    const existingCompletion = data.habitCompletions.find(
      hc => hc.habitId === id && hc.date === today
    );

    if (existingCompletion) {
      // Toggle completion
      existingCompletion.completed = !existingCompletion.completed;
      
      if (!existingCompletion.completed) {
        habit.totalCompletions = Math.max(0, habit.totalCompletions - 1);
      } else {
        habit.totalCompletions += 1;
      }
    } else {
      // Create new completion
      data.habitCompletions.push({
        id: generateId(),
        habitId: id,
        userId: req.user.id,
        date: today,
        completed: true,
        createdAt: new Date().toISOString()
      });
      
      habit.totalCompletions += 1;
    }

    // Update streak
    const completions = data.habitCompletions
      .filter(hc => hc.habitId === id && hc.completed)
      .map(hc => hc.date)
      .sort()
      .reverse();

    let streak = 0;
    let currentDate = new Date(completions[0] || today);
    
    for (let i = 0; i < completions.length; i++) {
      const compDate = new Date(completions[i]);
      const diffDays = Math.floor((currentDate - compDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays === i) {
        streak++;
      } else {
        break;
      }
    }
    
    habit.currentStreak = streak;
    if (streak > habit.longestStreak) {
      habit.longestStreak = streak;
    }

    req.user.stats.totalHabitsCompleted = data.habitCompletions
      .filter(hc => hc.userId === req.user.id && hc.completed)
      .length;

    await saveData();
    
    res.json({
      success: true,
      habit,
      completed: existingCompletion ? existingCompletion.completed : true
    });

  } catch (error) {
    console.error('Habit completion error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/habits/stats', protect, (req, res) => {
  const userHabits = data.habits.filter(h => h.userId === req.user.id);
  const userCompletions = data.habitCompletions.filter(hc => hc.userId === req.user.id);
  
  const stats = {
    totalHabits: userHabits.length,
    activeHabits: userHabits.filter(h => h.isActive).length,
    totalCompletions: userCompletions.filter(hc => hc.completed).length,
    todayCompletions: userCompletions.filter(hc => 
      hc.completed && hc.date === formatDate()
    ).length,
    completionRate: userHabits.length > 0 ? 
      Math.round((userCompletions.filter(hc => hc.completed).length / userHabits.length) * 100) : 0,
    bestStreak: userHabits.length > 0 ? 
      Math.max(...userHabits.map(h => h.longestStreak)) : 0
  };
  
  res.json({ success: true, stats });
});

// ==================== MOOD ROUTES ====================
app.post('/api/mood', protect, async (req, res) => {
  try {
    const { mood, intensity, notes, triggers } = req.body;

    if (!mood) {
      return res.status(400).json({ success: false, error: 'Mood required' });
    }

    const moodEntry = {
      id: generateId(),
      userId: req.user.id,
      mood,
      intensity: intensity || 5,
      notes: notes || '',
      triggers: triggers || [],
      date: formatDate(),
      createdAt: new Date().toISOString()
    };

    data.moodEntries.push(moodEntry);
    req.user.stats.totalMoodEntries += 1;

    await saveData();
    
    res.status(201).json({
      success: true,
      moodEntry
    });

  } catch (error) {
    console.error('Mood tracking error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/mood', protect, (req, res) => {
  const { startDate, endDate } = req.query;
  
  let userMoods = data.moodEntries.filter(m => m.userId === req.user.id);
  
  if (startDate || endDate) {
    userMoods = userMoods.filter(m => {
      const moodDate = new Date(m.date);
      if (startDate && moodDate < new Date(startDate)) return false;
      if (endDate && moodDate > new Date(endDate)) return false;
      return true;
    });
  }
  
  userMoods.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  res.json({ success: true, moodEntries: userMoods });
});

app.get('/api/mood/stats', protect, (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentMoods = data.moodEntries.filter(m => 
    m.userId === req.user.id && 
    new Date(m.date) >= thirtyDaysAgo
  );
  
  const stats = {
    totalEntries: recentMoods.length,
    moodDistribution: {},
    averageIntensity: 0,
    commonTriggers: {},
    consistency: Math.round((recentMoods.length / 30) * 100)
  };
  
  let totalIntensity = 0;
  recentMoods.forEach(entry => {
    stats.moodDistribution[entry.mood] = (stats.moodDistribution[entry.mood] || 0) + 1;
    totalIntensity += entry.intensity;
    
    entry.triggers.forEach(trigger => {
      stats.commonTriggers[trigger] = (stats.commonTriggers[trigger] || 0) + 1;
    });
  });
  
  if (recentMoods.length > 0) {
    stats.averageIntensity = Math.round(totalIntensity / recentMoods.length);
    
    // Convert to percentages
    Object.keys(stats.moodDistribution).forEach(key => {
      stats.moodDistribution[key] = Math.round((stats.moodDistribution[key] / recentMoods.length) * 100);
    });
  }
  
  res.json({ success: true, stats });
});

// ==================== COMMUNITY ROUTES ====================
app.post('/api/community/posts', protect, async (req, res) => {
  try {
    const { content, isAnonymous = true } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content required' });
    }

    const post = {
      id: generateId(),
      userId: req.user.id,
      content,
      authorName: isAnonymous ? getAnonymousName() : req.user.name,
      isAnonymous,
      likes: [],
      replyCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.communityPosts.push(post);

    // Award achievement for first post
    const userPosts = data.communityPosts.filter(p => p.userId === req.user.id);
    if (userPosts.length === 1) {
      await awardAchievement(req.user.id, 'first_post');
    }

    await saveData();
    
    res.status(201).json({
      success: true,
      post
    });

  } catch (error) {
    console.error('Post creation error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/community/posts', (req, res) => {
  const { limit = 50, page = 1 } = req.query;
  
  const sortedPosts = [...data.communityPosts].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  const startIndex = (page - 1) * limit;
  const paginatedPosts = sortedPosts.slice(startIndex, startIndex + parseInt(limit));
  
  res.json({
    success: true,
    posts: paginatedPosts,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: data.communityPosts.length,
      pages: Math.ceil(data.communityPosts.length / limit)
    }
  });
});

app.post('/api/community/posts/:id/like', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const post = data.communityPosts.find(p => p.id === id);
    
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    const alreadyLiked = post.likes.includes(req.user.id);
    
    if (alreadyLiked) {
      post.likes = post.likes.filter(userId => userId !== req.user.id);
    } else {
      post.likes.push(req.user.id);
    }
    
    post.updatedAt = new Date().toISOString();
    
    await saveData();
    
    res.json({
      success: true,
      liked: !alreadyLiked,
      likeCount: post.likes.length
    });
    
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/community/posts/:id/replies', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, isAnonymous = true } = req.body;
    
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content required' });
    }
    
    const post = data.communityPosts.find(p => p.id === id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    const reply = {
      id: generateId(),
      postId: id,
      userId: req.user.id,
      content,
      authorName: isAnonymous ? getAnonymousName() : req.user.name,
      isAnonymous,
      createdAt: new Date().toISOString()
    };
    
    data.postReplies.push(reply);
    post.replyCount += 1;
    post.updatedAt = new Date().toISOString();
    
    await saveData();
    
    res.status(201).json({
      success: true,
      reply
    });
    
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/community/posts/:id/replies', (req, res) => {
  const { id } = req.params;
  const { limit = 50, page = 1 } = req.query;
  
  const postReplies = data.postReplies
    .filter(r => r.postId === id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  const startIndex = (page - 1) * limit;
  const paginatedReplies = postReplies.slice(startIndex, startIndex + parseInt(limit));
  
  res.json({
    success: true,
    replies: paginatedReplies,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: postReplies.length,
      pages: Math.ceil(postReplies.length / limit)
    }
  });
});

// ==================== ACHIEVEMENT ROUTES ====================
app.get('/api/achievements', (req, res) => {
  res.json({ success: true, achievements: data.achievements });
});

app.get('/api/achievements/user', protect, (req, res) => {
  const userAchievements = data.userAchievements
    .filter(ua => ua.userId === req.user.id)
    .map(ua => {
      const achievement = data.achievements.find(a => a.id === ua.achievementId);
      return { ...ua, achievement };
    });
  
  res.json({ success: true, achievements: userAchievements });
});

// ==================== CHALLENGE ROUTES ====================
app.get('/api/challenges', (req, res) => {
  const activeChallenges = data.challenges.filter(c => c.isActive);
  res.json({ success: true, challenges: activeChallenges });
});

app.post('/api/challenges/:id/join', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const challenge = data.challenges.find(c => c.id === id);
    
    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }
    
    const alreadyJoined = data.userChallenges.find(
      uc => uc.userId === req.user.id && uc.challengeId === id
    );
    
    if (alreadyJoined) {
      return res.status(400).json({ success: false, error: 'Already joined this challenge' });
    }
    
    const userChallenge = {
      id: generateId(),
      userId: req.user.id,
      challengeId: id,
      joinedAt: new Date().toISOString(),
      progress: 0,
      isCompleted: false,
      streak: 0,
      checkIns: []
    };
    
    data.userChallenges.push(userChallenge);
    await saveData();
    
    res.status(201).json({
      success: true,
      userChallenge
    });
    
  } catch (error) {
    console.error('Join challenge error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/challenges/user', protect, (req, res) => {
  const userChallenges = data.userChallenges
    .filter(uc => uc.userId === req.user.id)
    .map(uc => {
      const challenge = data.challenges.find(c => c.id === uc.challengeId);
      return { ...uc, challenge };
    });
  
  res.json({ success: true, challenges: userChallenges });
});

// ==================== SELF-CARE ROUTES ====================
app.post('/api/selfcare', protect, async (req, res) => {
  try {
    const { title, description, category, dayOfWeek, time, duration } = req.body;
    
    if (!title || dayOfWeek === undefined || !time) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const activity = {
      id: generateId(),
      userId: req.user.id,
      title,
      description: description || '',
      category: category || 'selfcare',
      dayOfWeek: parseInt(dayOfWeek),
      time,
      duration: duration || 15,
      isRecurring: true,
      isActive: true,
      priority: 2,
      color: 'blue',
      icon: '❤️',
      completions: [],
      createdAt: new Date().toISOString()
    };
    
    data.selfCareActivities.push(activity);
    await saveData();
    
    res.status(201).json({
      success: true,
      activity
    });
    
  } catch (error) {
    console.error('Self-care activity error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/selfcare', protect, (req, res) => {
  const userActivities = data.selfCareActivities
    .filter(a => a.userId === req.user.id && a.isActive)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  
  res.json({ success: true, activities: userActivities });
});

// ==================== REMINDER ROUTES ====================
app.post('/api/reminders', protect, async (req, res) => {
  try {
    const { title, message, time, daysOfWeek } = req.body;
    
    if (!title || !message || !time) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const reminder = {
      id: generateId(),
      userId: req.user.id,
      title,
      message,
      type: 'custom',
      time,
      daysOfWeek: daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
      isActive: true,
      createdAt: new Date().toISOString()
    };
    
    data.reminders.push(reminder);
    await saveData();
    
    res.status(201).json({
      success: true,
      reminder
    });
    
  } catch (error) {
    console.error('Reminder error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/reminders', protect, (req, res) => {
  const userReminders = data.reminders
    .filter(r => r.userId === req.user.id && r.isActive)
    .sort((a, b) => a.time.localeCompare(b.time));
  
  res.json({ success: true, reminders: userReminders });
});

// ==================== THEME ROUTES ====================
app.get('/api/theme', protect, (req, res) => {
  const theme = data.themes.find(t => t.userId === req.user.id) || {
    theme: 'light',
    accentColor: 'amber',
    fontSize: 'medium',
    reducedMotion: false
  };
  
  res.json({ success: true, theme });
});

app.put('/api/theme', protect, async (req, res) => {
  try {
    const { theme, accentColor, fontSize, reducedMotion } = req.body;
    
    let userTheme = data.themes.find(t => t.userId === req.user.id);
    
    if (!userTheme) {
      userTheme = {
        id: generateId(),
        userId: req.user.id,
        theme: 'light',
        accentColor: 'amber',
        fontSize: 'medium',
        reducedMotion: false,
        lastUpdated: new Date().toISOString()
      };
      data.themes.push(userTheme);
    }
    
    if (theme) userTheme.theme = theme;
    if (accentColor) userTheme.accentColor = accentColor;
    if (fontSize) userTheme.fontSize = fontSize;
    if (reducedMotion !== undefined) userTheme.reducedMotion = reducedMotion;
    
    userTheme.lastUpdated = new Date().toISOString();
    
    // Update user settings as well
    if (theme) req.user.settings.theme = theme;
    if (accentColor) req.user.settings.accentColor = accentColor;
    
    await saveData();
    
    res.json({ success: true, theme: userTheme });
    
  } catch (error) {
    console.error('Theme update error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ==================== STATS ROUTES ====================
app.get('/api/stats', protect, (req, res) => {
  const stats = {
    user: req.user.stats,
    streak: req.user.streak.current,
    longestStreak: req.user.streak.longest,
    totalPoints: req.user.stats.totalPoints,
    achievements: req.user.stats.achievements,
    todayCheckin: !!data.checkins.find(c => 
      c.userId === req.user.id && c.date === formatDate()
    ),
    todayMood: !!data.moodEntries.find(m => 
      m.userId === req.user.id && m.date === formatDate()
    )
  };
  
  res.json({ success: true, stats });
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ==================== START SERVER ====================
const startServer = async () => {
  await loadData();
  
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║          IMARA BACKEND STARTED SUCCESSFULLY       ║
╠═══════════════════════════════════════════════════╣
║  Port: ${PORT}                                           ║
║  Health: http://localhost:${PORT}/health               ║
║  API Base: http://localhost:${PORT}/api               ║
║  Data File: ${DATA_FILE}                 ║
║  Users: ${data.users.length}                                     ║
║  Posts: ${data.communityPosts.length}                                     ║
╚═══════════════════════════════════════════════════╝
    `);
  });
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Saving data before shutdown...');
  await saveData();
  console.log('Data saved. Goodbye!');
  process.exit(0);
});

// Start the server
startServer().catch(console.error);