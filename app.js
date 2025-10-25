// app.js
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const Player = require('./models/Player');
const mongoose = require('mongoose');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// Middleware Setup
// =======================
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// =======================
// Request Tracker - Prevent Duplicate Submissions
// =======================
const requestTracker = new Map();

// Clean up old request tracker entries every hour
setInterval(() => {
    const oneHourAgo = Date.now() - 3600000; // 1 hour in milliseconds
    let cleanedCount = 0;
    
    for (const [key, timestamp] of requestTracker.entries()) {
        if (timestamp < oneHourAgo) {
            requestTracker.delete(key);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[CLEANUP] Removed ${cleanedCount} old request tracker entries. Current size: ${requestTracker.size}`);
    }
}, 3600000); // Run every hour

// =======================
// TIMEZONE UTILITY - Get consistent date string in IST
// =======================
function getTodayIST() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().split('T')[0]; // YYYY-MM-DD format
}

function getYesterdayIST() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const yesterday = new Date(now.getTime() + istOffset - 86400000); // Subtract 24 hours
    return yesterday.toISOString().split('T')[0];
}

// =======================
// Rank-based Core Tasks Configuration
// =======================
function getRankConfig_Core_tasks(rank) {
    const configs_tasks = {
        E: { pushUp: 40, squats: 50, core: 50, plank: 2 },
        D: { pushUp: 60, squats: 80, core: 80, plank: 4 },
        C: { pushUp: 100, squats: 150, core: 150, plank: 8 },
        B: { pushUp: 120, squats: 180, core: 180, plank: 10 },
        A: { pushUp: 160, squats: 250, core: 250, plank: 10 },
        S: { pushUp: 200, squats: 300, core: 300, plank: 15 },
        S1: { pushUp: 250, squats: 350, core: 350, plank: 20 },
        S2: { pushUp: 300, squats: 400, core: 400, plank: 25 },
        S3: { pushUp: 400, squats: 500, core: 500, plank: 30 }
    };
    return configs_tasks[rank] || configs_tasks.E;
}

// =======================
// Rank-based Eye Tasks Configuration
// =======================
function getRankConfig_Eye_tasks(rank) {
    const configs_Eye_tasks_No_Of_times = {
        E: { focusFarAndNear: 5, RubHand: 5, RotateEyes: 3, FocusOnNoseAndForehead: 3 },
        D: { focusFarAndNear: 5, RubHand: 5, RotateEyes: 3, FocusOnNoseAndForehead: 3 },
        C: { focusFarAndNear: 5, RubHand: 6, RotateEyes: 3, FocusOnNoseAndForehead: 4 },
        B: { focusFarAndNear: 6, RubHand: 7, RotateEyes: 3, FocusOnNoseAndForehead: 5 },
        A: { focusFarAndNear: 7, RubHand: 8, RotateEyes: 4, FocusOnNoseAndForehead: 6 },
        S: { focusFarAndNear: 8, RubHand: 10, RotateEyes: 5, FocusOnNoseAndForehead: 7 },
        S1: { focusFarAndNear: 10, RubHand: 15, RotateEyes: 7, FocusOnNoseAndForehead: 10 },
        S2: { focusFarAndNear: 15, RubHand: 20, RotateEyes: 10, FocusOnNoseAndForehead: 15 },
        S3: { focusFarAndNear: 20, RubHand: 30, RotateEyes: 15, FocusOnNoseAndForehead: 20 }
    };
    return configs_Eye_tasks_No_Of_times[rank] || configs_Eye_tasks_No_Of_times.E;
}

// =======================
// EXP for Core Exercises
// =======================
function getCoreExpForRank(rank) {
    const rankExpMap = {
        E: { pushUp: 400, squats: 400, core: 400, plank: 200, Total: 1400 },
        D: { pushUp: 600, squats: 640, core: 640, plank: 400, Total: 2280 },
        C: { pushUp: 700, squats: 750, core: 750, plank: 600, Total: 2800 },
        B: { pushUp: 840, squats: 900, core: 900, plank: 750, Total: 3390 },
        A: { pushUp: 960, squats: 1250, core: 1250, plank: 700, Total: 4160 },
        S: { pushUp: 1300, squats: 1500, core: 1500, plank: 1200, Total: 5500 },
        S1: { pushUp: 1500, squats: 2100, core: 2100, plank: 1300, Total: 7000 },
        S2: { pushUp: 4500, squats: 4000, core: 4000, plank: 4500, Total: 17000 },
        S3: { pushUp: 6000, squats: 7000, core: 7000, plank: 15000, Total: 35000 }
    };
    return rankExpMap[rank] || rankExpMap.E;
}

// =======================
// EXP for Eye Exercises
// =======================
function getEyeExpForRank(rank) {
    const rankExpMap = {
        E: { RotateEyes: 280, focusFarAndNear: 280, FocusOnNoseAndForehead: 280, RubHand: 280, Total: 1400 },
        D: { RotateEyes: 456, focusFarAndNear: 456, FocusOnNoseAndForehead: 456, RubHand: 456, Total: 2280 },
        C: { RotateEyes: 560, focusFarAndNear: 560, FocusOnNoseAndForehead: 560, RubHand: 560, Total: 2800 },
        B: { RotateEyes: 678, focusFarAndNear: 678, FocusOnNoseAndForehead: 678, RubHand: 678, Total: 3390 },
        A: { RotateEyes: 832, focusFarAndNear: 832, FocusOnNoseAndForehead: 832, RubHand: 832, Total: 4160 },
        S: { RotateEyes: 1100, focusFarAndNear: 1100, FocusOnNoseAndForehead: 1100, RubHand: 1100, Total: 5500 },
        S1: { RotateEyes: 1400, focusFarAndNear: 1400, FocusOnNoseAndForehead: 1400, RubHand: 1400, Total: 7000 },
        S2: { RotateEyes: 3400, focusFarAndNear: 3400, FocusOnNoseAndForehead: 3400, RubHand: 3400, Total: 17000 },
        S3: { RotateEyes: 7000, focusFarAndNear: 7000, FocusOnNoseAndForehead: 7000, RubHand: 7000, Total: 35000 }
    };
    return rankExpMap[rank] || rankExpMap.E;
}

// =======================
// Rank Thresholds
// =======================
function getRankThresholds() {
    return {
        'D': 20000,
        'C': 70000,
        'B': 150000,
        'A': 250000,
        'S': 400000,
        'S1': 600000,
        'S2': 850000,
        'S3': 1500000,
        'Shadow Monarch': 30000000
    };
}

// =======================
// Calculate XP needed for next rank
// =======================
function getXpForNextRank(currentRank, currentExp) {
    const thresholds = getRankThresholds();
    const ranks = ['E', 'D', 'C', 'B', 'A', 'S', 'S1', 'S2', 'S3'];
    
    const currentIndex = ranks.indexOf(currentRank);
    
    if (currentIndex === -1 || currentIndex === ranks.length - 1) {
        return 0;
    }
    
    const nextRank = ranks[currentIndex + 1];
    return thresholds[nextRank] || 0;
}

// =======================
// Daily Reset & EXP Deduction Functions
// =======================

// =======================
// Calculate Days Between Two Dates
// =======================
function calculateMissedDays(lastActiveDate, today) {
    if (!lastActiveDate) {
        return 0; // No previous activity recorded
    }

    const lastActive = new Date(lastActiveDate);
    const currentDate = new Date(today);
    
    // Calculate difference in days
    const diffTime = currentDate - lastActive;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // If they were active today, no deduction
    if (diffDays === 0) {
        return 0;
    }
    
    // Return number of missed days (excluding today)
    // Example: lastActive = Oct 22, today = Oct 25
    // diffDays = 3, but they missed Oct 23 and Oct 24 = 2 days
    return Math.max(0, diffDays - 1);
}

async function checkAndResetDaily(user) {
    const today = getTodayIST();
    const lastResetDate = user.lastResetDate || null;

    if (lastResetDate !== today) {
        
        // Calculate number of days missed
        const missedDays = calculateMissedDays(user.lastActiveDate, today);
        
        if (missedDays > 0) {
            // Deduct XP for each missed day
            for (let i = 0; i < missedDays; i++) {
                await deductDailyExperience(user);
            }
            console.log(`[DASHBOARD RESET] XP deducted for ${missedDays} missed day(s): ${user.email}`);
        }

        user.Core_Task_Completed = false;
        user.Eye_Task_Completed = false;
        user.Daily_Quest_Progress = {
            core: { core1: false, core2: false, core3: false, core4: false },
            eye: { eye1: false, eye2: false, eye3: false, eye4: false }
        };
        user.lastResetDate = today;
        
        await user.save();
        return true;
    }

    return false;
}



async function deductDailyExperience(user) {
    try {
        const coreRank = user.rank_Core || 'E';
        const eyeRank = user.rank_Eye || 'E';

        const coreExpToDeduct = getCoreExpForRank(coreRank).Total;
        const eyeExpToDeduct = getEyeExpForRank(eyeRank).Total;

        user.Core_Exp = Math.max(0, user.Core_Exp - coreExpToDeduct);
        user.Eye_Exp = Math.max(0, user.Eye_Exp - eyeExpToDeduct);

        console.log(`[EXP DEDUCTION] User: ${user.email}`);
        console.log(`  Core XP deducted: -${coreExpToDeduct} (New: ${user.Core_Exp})`);
        console.log(`  Eye XP deducted: -${eyeExpToDeduct} (New: ${user.Eye_Exp})`);
        
        // Check if ranks need to be downgraded
        await checkRankDowngrade(user, 'Core');
        await checkRankDowngrade(user, 'Eye');
        
        await user.save();
        
    } catch (err) {
        console.error('[ERROR] Deduct Daily Experience:', err);
    }
}


async function checkRankDowngrade(user, type) {
    const expField = type === 'Core' ? 'Core_Exp' : 'Eye_Exp';
    const rankField = type === 'Core' ? 'rank_Core' : 'rank_Eye';
    const userExp = user[expField];
    const currentRank = user[rankField];
    
    const rankThresholds = getRankThresholds();
    
    let newRank = 'E';
    
    // Check from highest to lowest
    if (userExp >= rankThresholds['Shadow Monarch']) {
        newRank = type === 'Core' ? 'Shadow Monarch' : 'Shadow Eye';
    } else if (userExp >= rankThresholds.S3) {
        newRank = 'S3';
    } else if (userExp >= rankThresholds.S2) {
        newRank = 'S2';
    } else if (userExp >= rankThresholds.S1) {
        newRank = 'S1';
    } else if (userExp >= rankThresholds.S) {
        newRank = 'S';
    } else if (userExp >= rankThresholds.A) {
        newRank = 'A';
    } else if (userExp >= rankThresholds.B) {
        newRank = 'B';
    } else if (userExp >= rankThresholds.C) {
        newRank = 'C';
    } else if (userExp >= rankThresholds.D) {
        newRank = 'D';
    }
    
    if (newRank !== currentRank) {
        console.log(`[RANK DOWNGRADE] ${type}: ${currentRank} → ${newRank}`);
        user[rankField] = newRank;
    }
}

// =======================
// Midnight Daily Reset Job
// =======================
cron.schedule('0 0 * * *', async () => {
    try {
        console.log('[MIDNIGHT RESET] Running daily reset at midnight IST...');
        
        const today = getTodayIST();
        
        const users = await Player.find({ lastResetDate: { $ne: today } });
        
        for (const user of users) {
            
            // Calculate missed days for this user
            const missedDays = calculateMissedDays(user.lastActiveDate, today);
            
            if (missedDays > 0) {
                // Deduct XP for each missed day
                for (let i = 0; i < missedDays; i++) {
                    await deductDailyExperience(user);
                }
                console.log(`[MIDNIGHT RESET] XP deducted for ${missedDays} missed day(s): ${user.email}`);
            } else {
                console.log(`[MIDNIGHT RESET] No deduction for active user: ${user.email}`);
            }
            
            user.Core_Task_Completed = false;
            user.Eye_Task_Completed = false;
            user.Daily_Quest_Progress = {
                core: { core1: false, core2: false, core3: false, core4: false },
                eye: { eye1: false, eye2: false, eye3: false, eye4: false }
            };
            user.lastResetDate = today;
            
            await user.save();
        }
        
        console.log(`[MIDNIGHT RESET] Completed for ${users.length} users`);
        
    } catch (err) {
        console.error('[ERROR] Midnight reset failed:', err);
    }
}, {
    timezone: "Asia/Kolkata"
});

// =======================
// Middleware — Require Auth
// =======================
function requireAuth(req, res, next) {
    const token = req.cookies.token;
    if (!token) {
        return res.render('sessionTimeout');
    }

    try {
        const decoded = jwt.verify(token, "secretKey");
        req.user = decoded;
        next();
    } catch (err) {
        return res.render('sessionTimeout');
    }
}

// =======================
// Middleware — Prevent Duplicate Requests
// =======================
function preventDuplicateRequest(req, res, next) {
    const key = `${req.user?.id}-${req.path}`;
    const now = Date.now();
    
    if (requestTracker.has(key)) {
        const lastRequestTime = requestTracker.get(key);
        if (now - lastRequestTime < 3000) {
            return res.status(429).json({ error: "Request too soon, please wait" });
        }
    }
    
    requestTracker.set(key, now);
    next();
}

// =======================
// ROUTES
// =======================

// Home Route
app.get('/', (req, res) => {
    res.clearCookie("token");
    res.render('index');
});

// Sign In Page
app.get('/signin', (req, res) => {
    res.render('signin');
});

// Login Page
app.get('/login', (req, res) => {
    res.clearCookie("token");
    res.render('login');
});

// =======================
// Register Route
// =======================
app.post('/register', async (req, res) => {
    try {
        const { name, email, password, age } = req.body;
        
        if (!name || !email || !password || !age) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const existingUser = await Player.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const today = getTodayIST();

        const createdPlayer = await Player.create({
            name,
            email,
            password: hashedPassword,
            age,
            rank_Core: 'E',
            rank_Eye: 'E',
            Core_Exp: 0,
            Eye_Exp: 0,
            Core_Task_Completed: false,
            Eye_Task_Completed: false,
            Daily_Quest_Progress: {
                core: { core1: false, core2: false, core3: false, core4: false },
                eye: { eye1: false, eye2: false, eye3: false, eye4: false }
            },
            lastActiveDate: today,
            lastResetDate: today
        });

        const token = jwt.sign(
            {
                id: createdPlayer._id,
                name,
                email,
                age,
                rank: createdPlayer.rank_Core || "E",
                Eye_Exp: createdPlayer.Eye_Exp || 0,
                Core_Exp: createdPlayer.Core_Exp || 0
            },
            "secretKey"
        );

        res.cookie("token", token, { httpOnly: true });
        return res.status(200).json({ 
            message: "Registration successful", 
            redirectUrl: "/login" 
        });

    } catch (err) {
        console.error('[ERROR] Registration:', err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// =======================
// Login Route
// =======================
app.post('/loggedin', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await Player.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: "Player not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid password" });
        }

        const token = jwt.sign(
            {
                id: user._id,
                name: user.name,
                email: user.email,
                age: user.age,
                rank: user.rank_Core || "E",
                Eye_Exp: user.Eye_Exp || 0,
                Core_Exp: user.Core_Exp || 0
            },
            "secretKey"
        );

        res.cookie("token", token, { httpOnly: true });
        return res.redirect('/dashboard');

    } catch (err) {
        console.error('[ERROR] Login:', err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// =======================
// Dashboard Route
// =======================
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const user = await Player.findOne({ email: req.user.email });

        if (!user) {
            return res.status(404).render('sessionTimeout');
        }

        // Check and perform daily reset if needed (includes XP deduction for inactive users)
        await checkAndResetDaily(user);

        // NOW update lastActiveDate AFTER the reset check
        const today = getTodayIST();
        user.lastActiveDate = today;
        await user.save();

        // Get rank configurations and XP data
        const Core_data = getRankConfig_Core_tasks(user.rank_Core);
        const Eye_data = getRankConfig_Eye_tasks(user.rank_Eye);
        const Core_Exp = getCoreExpForRank(user.rank_Core);
        const Eye_Exp = getEyeExpForRank(user.rank_Eye);

        const coreXpForNext = getXpForNextRank(user.rank_Core, user.Core_Exp);
        const eyeXpForNext = getXpForNextRank(user.rank_Eye, user.Eye_Exp);

        Core_data.currentRank = user.rank_Core;
        Core_data.currentXP = user.Core_Exp;
        Core_data.xpForNextRank = coreXpForNext;

        Eye_data.currentRank = user.rank_Eye;
        Eye_data.currentXP = user.Eye_Exp;
        Eye_data.xpForNextRank = eyeXpForNext;

        const questProgress = user.Daily_Quest_Progress || {
            core: { core1: false, core2: false, core3: false, core4: false },
            eye: { eye1: false, eye2: false, eye3: false, eye4: false }
        };

        res.render('dashboard', { 
            user, 
            Core_data, 
            Eye_data, 
            Core_Exp, 
            Eye_Exp, 
            questProgress,
            Core_Task_Completed: user.Core_Task_Completed,
            Eye_Task_Completed: user.Eye_Task_Completed
        });

    } catch (err) {
        console.error('[ERROR] Dashboard:', err);
        res.status(500).send("Server Error");
    }
});

// =======================
// Logout Route
// =======================
app.get("/logout", (req, res) => {
    res.clearCookie('token');
    res.render("index");
});

// =======================
// Save Quest Progress Route
// =======================
app.post('/saveQuestProgress', requireAuth, async (req, res) => {
    try {
        const { questType, progress } = req.body;

        if (!questType || !progress) {
            return res.status(400).json({ error: "Missing questType or progress" });
        }

        const user = await Player.findOne({ email: req.user.email });
        if (!user) {
            return res.status(400).json({ error: "Player not found" });
        }

        if (!user.Daily_Quest_Progress) {
            user.Daily_Quest_Progress = {
                core: { core1: false, core2: false, core3: false, core4: false },
                eye: { eye1: false, eye2: false, eye3: false, eye4: false }
            };
        }

        user.Daily_Quest_Progress[questType] = { 
            ...user.Daily_Quest_Progress[questType], 
            ...progress 
        };
        await user.save();

        res.status(200).json({ message: "Quest progress saved" });

    } catch (err) {
        console.error('[ERROR] Save Quest Progress:', err);
        res.status(500).json({ error: "Server Error" });
    }
});

// =======================
// Get Quest Progress Route
// =======================
app.get('/getQuestProgress', requireAuth, async (req, res) => {
    try {
        const user = await Player.findOne({ email: req.user.email });
        if (!user) {
            return res.status(400).json({ error: "Player not found" });
        }

        const questProgress = user.Daily_Quest_Progress || {
            core: { core1: false, core2: false, core3: false, core4: false },
            eye: { eye1: false, eye2: false, eye3: false, eye4: false }
        };

        res.status(200).json({
            ...questProgress,
            coreCompleted: user.Core_Task_Completed || false,
            eyeCompleted: user.Eye_Task_Completed || false
        });

    } catch (err) {
        console.error('[ERROR] Get Quest Progress:', err);
        res.status(500).json({ error: "Server Error" });
    }
});

// =======================
// Core Progress Route
// =======================
app.post('/Core_Progress', requireAuth, preventDuplicateRequest, async (req, res) => {
    try {
        const user = await Player.findOne({ email: req.user.email });
        if (!user) {
            return res.status(400).json({ error: "Player not found" });
        }

        // Check database flag FIRST to prevent race conditions
        if (user.Core_Task_Completed) {
            return res.status(400).json({ error: "Core task already completed today" });
        }

        const userRank = user.rank_Core;
        const coreExpGained = getCoreExpForRank(userRank).Total;

        user.Core_Exp += coreExpGained;

        const rankThresholds = getRankThresholds();

        // Check rank upgrade (using >= to properly handle exact thresholds)
        if (user.Core_Exp >= 30000000) {
            user.rank_Core = "Shadow Monarch";
        } else if (user.Core_Exp >= rankThresholds.S3) {
            user.rank_Core = 'S3';
        } else if (user.Core_Exp >= rankThresholds.S2) {
            user.rank_Core = 'S2';
        } else if (user.Core_Exp >= rankThresholds.S1) {
            user.rank_Core = 'S1';
        } else if (user.Core_Exp >= rankThresholds.S) {
            user.rank_Core = 'S';
        } else if (user.Core_Exp >= rankThresholds.A) {
            user.rank_Core = 'A';
        } else if (user.Core_Exp >= rankThresholds.B) {
            user.rank_Core = 'B';
        } else if (user.Core_Exp >= rankThresholds.C) {
            user.rank_Core = 'C';
        } else if (user.Core_Exp >= rankThresholds.D) {
            user.rank_Core = 'D';
        } else {
            user.rank_Core = 'E';
        }

        user.Core_Task_Completed = true;

        // Reset quest progress
        if (!user.Daily_Quest_Progress) {
            user.Daily_Quest_Progress = {
                core: { core1: false, core2: false, core3: false, core4: false },
                eye: { eye1: false, eye2: false, eye3: false, eye4: false }
            };
        }
        user.Daily_Quest_Progress.core = { 
            core1: false, 
            core2: false, 
            core3: false, 
            core4: false 
        };

        await user.save();

        console.log(`[CORE PROGRESS] User: ${user.email} | Rank: ${user.rank_Core} | XP: ${user.Core_Exp}`);

        res.status(200).json({ 
            message: "Core progress updated successfully", 
            exp: user.Core_Exp,
            rank: user.rank_Core
        });

    } catch (err) {
        console.error('[ERROR] Core Progress:', err);
        res.status(500).json({ error: "Server Error" });
    }
});

// =======================
// Eye Progress Route
// =======================
app.post('/Eye_Progress', requireAuth, preventDuplicateRequest, async (req, res) => {
    try {
        const user = await Player.findOne({ email: req.user.email });
        if (!user) {
            return res.status(400).json({ error: "Player not found" });
        }

        // Check database flag FIRST to prevent race conditions
        if (user.Eye_Task_Completed) {
            return res.status(400).json({ error: "Eye task already completed today" });
        }

        const userRank = user.rank_Eye;
        const eyeExpGained = getEyeExpForRank(userRank).Total;

        user.Eye_Exp += eyeExpGained;

        const rankThresholds = getRankThresholds();

        // Check rank upgrade (using >= to properly handle exact thresholds)
        if (user.Eye_Exp >= 30000000) {
            user.rank_Eye = "Shadow Eye";
        } else if (user.Eye_Exp >= rankThresholds.S3) {
            user.rank_Eye = 'S3';
        } else if (user.Eye_Exp >= rankThresholds.S2) {
            user.rank_Eye = 'S2';
        } else if (user.Eye_Exp >= rankThresholds.S1) {
            user.rank_Eye = 'S1';
        } else if (user.Eye_Exp >= rankThresholds.S) {
            user.rank_Eye = 'S';
        } else if (user.Eye_Exp >= rankThresholds.A) {
            user.rank_Eye = 'A';
        } else if (user.Eye_Exp >= rankThresholds.B) {
            user.rank_Eye = 'B';
        } else if (user.Eye_Exp >= rankThresholds.C) {
            user.rank_Eye = 'C';
        } else if (user.Eye_Exp >= rankThresholds.D) {
            user.rank_Eye = 'D';
        } else {
            user.rank_Eye = 'E';
        }

        user.Eye_Task_Completed = true;

        // Reset quest progress
        if (!user.Daily_Quest_Progress) {
            user.Daily_Quest_Progress = {
                core: { core1: false, core2: false, core3: false, core4: false },
                eye: { eye1: false, eye2: false, eye3: false, eye4: false }
            };
        }
        user.Daily_Quest_Progress.eye = { 
            eye1: false, 
            eye2: false, 
            eye3: false, 
            eye4: false 
        };

        await user.save();

        console.log(`[EYE PROGRESS] User: ${user.email} | Rank: ${user.rank_Eye} | XP: ${user.Eye_Exp}`);

        res.status(200).json({ 
            message: "Eye progress updated successfully", 
            exp: user.Eye_Exp,
            rank: user.rank_Eye
        });

    } catch (err) {
        console.error('[ERROR] Eye Progress:', err);
        res.status(500).json({ error: "Server Error" });
    }
});

// =======================
// Start Server
// =======================
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});