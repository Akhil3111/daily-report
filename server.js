/**
 * SERVER.JS
 * Express server with optional MongoDB. Scraping + WhatsApp works without DB.
 */
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { getAttendanceData, sendWhatsAppMessage, formatWhatsAppMessage } = require('./scraper');

// Load .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;

// Middleware
app.use(bodyParser.json());

// --- MongoDB Connection (Optional) ---
let dbConnected = false;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    }).then(() => {
        console.log('MongoDB connected');
        dbConnected = true;
    }).catch(err => {
        console.error('MongoDB connection failed. Proceeding without DB:', err.message);
        dbConnected = false;
    });
}

// --- MongoDB Schema (Optional) ---
let User;
if (dbConnected) {
    const UserSchema = new mongoose.Schema({
        username: { type: String, required: true },
        password: { type: String, required: true },
        whatsapp: { type: String, required: true },
        data: { type: Object, default: {} },
        lastUpdated: { type: Date, default: Date.now }
    });
    User = mongoose.model('User', UserSchema);
}

// --- Health check route for Render ---
app.get('/api/scrape-status', (req, res) => {
    res.status(200).json({ status: 'Server running and healthy' });
});

// --- Scrape and send WhatsApp route ---
app.post('/api/scrape', async (req, res) => {
    const { username, password, whatsapp } = req.body;

    if (!username || !password || !whatsapp) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1️⃣ Scrape attendance
        const scrapedData = await getAttendanceData(username, password);

        if (scrapedData.error) {
            return res.status(500).json({ error: scrapedData.error });
        }

        // 2️⃣ Send WhatsApp report
        const reportMessage = formatWhatsAppMessage(scrapedData);
        await sendWhatsAppMessage(whatsapp, reportMessage);

        // 3️⃣ Save to DB only if connected
        if (dbConnected) {
            try {
                await User.updateOne(
                    { username },
                    { $set: { username, password, whatsapp, data: scrapedData, lastUpdated: new Date() } },
                    { upsert: true }
                );
            } catch (dbErr) {
                console.error("DB save failed, continuing without DB:", dbErr.message);
            }
        }

        res.json({ message: "Scraped and WhatsApp sent successfully", data: scrapedData });

    } catch (err) {
        console.error("Unexpected error:", err);
        res.status(500).json({ error: "Scrape failed" });
    }
});

// --- Automation route for cron/daily jobs ---
app.post('/api/automate', async (req, res) => {
    try {
        console.log('Starting automated daily attendance check...');

        let users = [];
        if (dbConnected) {
            users = await User.find({});
        }

        if (!dbConnected || users.length === 0) {
            console.log('No DB users found. Automation can run with manual test data if needed.');
            return res.json({ message: 'No registered users. Automation skipped.' });
        }

        const results = [];
        for (const user of users) {
            const scrapedData = await getAttendanceData(user.username, user.password);

            if (scrapedData.error) {
                console.error(`Scrape failed for ${user.username}: ${scrapedData.error}`);
                results.push({ username: user.username, status: 'Scrape Failed', error: scrapedData.error });
                continue;
            }

            // Update DB if connected
            if (dbConnected) {
                try {
                    await User.updateOne(
                        { username: user.username },
                        { $set: { data: scrapedData, lastUpdated: new Date() } }
                    );
                } catch (dbErr) {
                    console.error(`DB update failed for ${user.username}: ${dbErr.message}`);
                }
            }

            const reportMessage = formatWhatsAppMessage(scrapedData);
            const { success, error } = await sendWhatsAppMessage(user.whatsapp, reportMessage);
            results.push({ username: user.username, status: success ? 'Report Sent' : 'Twilio Failed', error });
        }

        res.json({ message: 'Daily automation complete.', results });

    } catch (err) {
        console.error('Automation error:', err);
        res.status(500).json({ error: 'Automation failed.' });
    }
});

// --- Serve frontend static files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Start server ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
