/**
 * SCRAPER.JS
 * Contains all core logic for Selenium web scraping and Twilio messaging.
 */
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const twilio = require('twilio');
const dotenv = require('dotenv');
// CRITICAL LOCAL FIX: The 'chromedriver' package provides the executable path on Windows
const localChromedriver = require('chromedriver'); 

// Load environment variables immediately in case server.js failed to load them
dotenv.config();

// --- Configuration: Reading from Environment Variables ---
const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_NUMBER,
    TWILIO_JOIN_CODE
} = process.env;

// Determine if running locally (for pathing)
const IS_LOCAL = process.env.NODE_ENV !== 'production';

// CRITICAL FIX: Define driver and binary paths conditionally
// Local Path (Windows): Uses the path found by the 'chromedriver' package.
// Cloud Path (Linux): Uses the standard path in the Puppeteer container.
const CHROMEDRIVER_PATH = IS_LOCAL ? localChromedriver.path : '/usr/bin/google-chrome';
const CHROME_BINARY_PATH = IS_LOCAL ? undefined : '/usr/bin/google-chrome';


const TWILIO_CLIENT = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// --- Helper Functions ---

async function sendWhatsAppMessage(to_number, message) {
    if (!TWILIO_CLIENT) {
        console.error("Twilio client not initialized. Check environment variables.");
        return { success: false, error: "Twilio not configured." };
    }
    try {
        await TWILIO_CLIENT.messages.create({
            from: TWILIO_WHATSAPP_NUMBER,
            body: message,
            to: `whatsapp:${to_number}`
        });
        console.log(`WhatsApp message sent successfully to ${to_number}`);
        return { success: true };
    } catch (e) {
        console.error(`Failed to send WhatsApp message to ${to_number}:`, e.message);
        return { success: false, error: e.message };
    }
}

function formatWhatsAppMessage(data) {
    const statusEmojis = { "Present": "✅ Present", "Absent": "❌ Absent" };
    let messageBody = `📚 *Daily Attendance Report* 📚\n\n`;
    messageBody += `✅ Total Attendance: *${data.total_percentage || 'N/A'}*\n\n`;
    messageBody += "*Subject-wise Breakdown:*\n";
    
    for (const subject of data.subjects) {
        const statusText = statusEmojis[subject.status] || subject.status;
        messageBody += `- ${subject.subject}: ${statusText}\n`;
    }
    return messageBody;
}

/**
 * Core scraping logic. Uses asynchronous Node.js style.
 */
async function getAttendanceData(username, password) {
    let driver;
    try {
        const chromeOptions = new chrome.Options();
        
        // Set necessary arguments for headless execution
        chromeOptions.addArguments(
            '--headless', 
            '--disable-gpu', 
            '--no-sandbox', 
            '--window-size=1920,1080',
            '--disable-dev-shm-usage'
        );
        
        // CRITICAL FIX: Explicitly set the binary path for stability on cloud (Render)
        if (!IS_LOCAL) {
            chromeOptions.setChromeBinaryPath(CHROME_BINARY_PATH);
        }

        // Build the ServiceBuilder instance pointing to the correct driver executable
        const service = new chrome.ServiceBuilder(CHROMEDRIVER_PATH);
        
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(chromeOptions)
            // Pass the ServiceBuilder instance directly
            .setChromeService(service) 
            .build();

        await driver.get("https://login.vardhaman.org/");
        await driver.wait(until.elementLocated(By.name('txtuser')), 30000);

        // 1. Login
        await driver.findElement(By.name('txtuser')).sendKeys(username);
        await driver.findElement(By.name('txtpass')).sendKeys(password);
        await driver.findElement(By.name('btnLogin')).click();
        
        await driver.sleep(3000); // ASYNC sleep

        // 2. Handle Pop-up 
        try {
            const popupCloseBtn = await driver.wait(
                until.elementLocated(By.xpath('//*[@id="ctl00_ContentPlaceHolder1_PopupCTRLMain_Image2"]')), 
                5000 
            );
            await popupCloseBtn.click();
            console.log("Pop-up closed.");
        } catch (e) {
            console.log("No pop-up detected.");
        }

        await driver.sleep(3000); // ASYNC sleep

        // 3. Click Attendance Button
        const attendanceBtn = await driver.wait(
            until.elementLocated(By.xpath('//*[@id="ctl00_ContentPlaceHolder1_divAttendance"]/div[3]/a/div[2]')),
            10000
        );
        await attendanceBtn.click();
        
        await driver.sleep(5000); // ASYNC sleep

        // 4. Extract Total Percentage
        let totalPercentage = 'N/A';
        try {
            const totalElement = await driver.wait(
                until.elementLocated(By.css('.attendance-count')), 
                10000
            );
            totalPercentage = await totalElement.getText();
        } catch (e) {
            console.warn("Could not find total attendance percentage.");
        }

        // 5. Extract Subject Details
        const subjectItems = await driver.findElements(By.css(".atten-sub.bus-stops ul li"));
        const attendanceList = [];

        for (let item of subjectItems) {
            const subject = await item.findElement(By.tagName("h5")).getText();
            const timeSlot = await item.findElement(By.css(".stp-detail p.text-primary")).getText();
            const faculty = await item.findElement(By.css(".fac-status p.text-primary")).getText();
            const statusElement = await item.findElement(By.css(".fac-status .status"));
            const status = await statusElement.getText();
            
            attendanceList.push({ subject, timeSlot, faculty, status });
        }

        return { subjects: attendanceList, total_percentage: totalPercentage };

    } catch (e) {
        console.error("Scraping failed:", e);
        return { error: e.message || "Scraping failed due to an element timeout or WebDriver error." };
    } finally {
        if (driver) {
            await driver.quit();
        }
    }
}

module.exports = {
    getAttendanceData,
    sendWhatsAppMessage,
    formatWhatsAppMessage
};
