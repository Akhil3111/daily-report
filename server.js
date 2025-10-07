/**
 * SERVER.JS
 * Sets up the Express server, MongoDB connection, and API routes.
 */
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { getAttendanceData, sendWhatsAppMessage, formatWhatsAppMessage } = require('./scraper');

// Load environment variables from .env file (for local development)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000; 
const MONGO_URI = process.env.MONGO_URI;

// Middleware
app.use(bodyParser.json());

// --- MongoDB Connection ---
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000 // 10 seconds timeout
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB connection error:", err));

// --- MongoDB Schema (User and Credentials) ---
const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    whatsapp: { type: String, required: true },
    data: { type: Object, default: {} },
    lastUpdated: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// --- API Routes ---

// 1. Initial Scrape and Registration Endpoint
app.post('/api/scrape', async (req, res) => {
    const { userId, username, password, whatsapp } = req.body;

    if (!userId || !username || !password || !whatsapp) {
        return res.status(400).json({ error: 'Missing required fields: userId, username, password, or whatsapp number.' });
    }

    try {
        // --- A. Save/Update credentials in MongoDB ---
        await User.updateOne(
            { userId: userId },
            { $set: { username, password, whatsapp } },
            { upsert: true }
        );

        // --- B. Perform the immediate scrape ---
        const scrapedData = await getAttendanceData(username, password);

        if (scrapedData.error) {
            return res.status(500).json({ error: scrapedData.error });
        }
        
        // --- C. Send Instant WhatsApp Report & Opt-in Instruction ---
        const reportMessage = formatWhatsAppMessage(scrapedData);
        
        const joinCode = process.env.TWILIO_JOIN_CODE || 'join-code'; 
        const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'your_twilio_number';
        const optInMessage = `\n\n📢 *IMPORTANT: Daily reports will FAIL unless you first send the code "${joinCode}" to ${twilioNumber}.*`;

        const { success, error } = await sendWhatsAppMessage(whatsapp, reportMessage + optInMessage);

        res.json({
            message: "Credentials saved. Immediate report sent (check your WhatsApp for opt-in instructions).",
            data: scrapedData,
            whatsappSuccess: success,
            optInInstruction: optInMessage
        });

    } catch (e) {
        console.error('Server error during scrape/save:', e);
        res.status(500).json({ error: 'An internal server error occurred during processing.' });
    }
});

// 2. Automation Route (Used by a Cloud Scheduler/Cron Job)
app.post('/api/automate', async (req, res) => {
    try {
        console.log('Starting automated daily attendance check for all users...');
        const users = await User.find({});
        
        if (users.length === 0) {
            return res.json({ message: 'No registered users found.' });
        }

        const results = [];
        for (const user of users) {
            console.log(`Processing user: ${user.userId}`);
            
            const scrapedData = await getAttendanceData(user.username, user.password);

            if (scrapedData.error) {
                console.error(`Skipping report for ${user.userId} due to scrape error: ${scrapedData.error}`);
                results.push({ userId: user.userId, status: 'Scrape Failed', error: scrapedData.error });
                continue;
            }

            await User.updateOne(
                { userId: user.userId },
                { $set: { data: scrapedData, lastUpdated: new Date() } }
            );

            const reportMessage = formatWhatsAppMessage(scrapedData);
            const { success, error } = await sendWhatsAppMessage(user.whatsapp, reportMessage);
            
            results.push({ userId: user.userId, status: success ? 'Report Sent' : 'Twilio Failed', error });
        }

        res.json({ message: 'Daily checks complete.', results });

    } catch (e) {
        console.error('Automation error:', e);
        res.status(500).json({ error: 'Automation failed.' });
    }
});

// --- Serve static files (React frontend) ---
// This is the correct, simpler way to serve the static frontend (index.html).
// Express will now look in the 'public' directory for every request not caught above.
// --- Health check route for Render ---
app.get('/api/scrape-status', (req, res) => {
  res.status(200).json({ status: 'Server running and healthy' });
});

app.use(express.static(path.join(__dirname, 'public')));


// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}. Connect to MongoDB: ${mongoose.connection.readyState === 1 ? 'Yes' : 'No'}`);
});
