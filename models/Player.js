// models/Player.js
const mongoose = require('mongoose');

// ✅ Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/PlayerfitnessTracker')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// ✅ Define the player schema
const playerSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    age: { 
        type: Number, 
        required: true 
    },
    
    // Rank System
    rank_Core: { 
        type: String, 
        default: "E" 
    },
    rank_Eye: { 
        type: String, 
        default: "E" 
    },
    
    // Experience Points
    Core_Exp: { 
        type: Number, 
        default: 0 
    },
    Eye_Exp: { 
        type: Number, 
        default: 0 
    },
    
    // Daily Task Completion Status
    Core_Task_Completed: { 
        type: Boolean, 
        default: false 
    },
    Eye_Task_Completed: { 
        type: Boolean, 
        default: false 
    },
    
    // Daily Quest Progress - Tracks individual checkbox states
    Daily_Quest_Progress: {
        type: {
            core: {
                core1: { type: Boolean, default: false },
                core2: { type: Boolean, default: false },
                core3: { type: Boolean, default: false },
                core4: { type: Boolean, default: false }
            },
            eye: {
                eye1: { type: Boolean, default: false },
                eye2: { type: Boolean, default: false },
                eye3: { type: Boolean, default: false },
                eye4: { type: Boolean, default: false }
            }
        },
        default: {
            core: { core1: false, core2: false, core3: false, core4: false },
            eye: { eye1: false, eye2: false, eye3: false, eye4: false }
        }
    },
    
    // Date Tracking for Daily Reset Logic
    lastActiveDate: { 
        type: String, 
        default: "" 
    },
    lastResetDate: { 
        type: String, 
        default: "" 
    },
    
    // Account Metadata
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

// ✅ Middleware to update timestamp on save
playerSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// ✅ Export the model
module.exports = mongoose.model('player', playerSchema);