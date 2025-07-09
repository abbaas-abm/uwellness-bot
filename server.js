// app.js

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- 1. Load Environment Variables ---
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000; // Render defaults to 10000, ensure your Render env var is PORT=10000

// Basic validation for critical variables
if (!WHATSAPP_TOKEN || !GEMINI_API_KEY || !PHONE_NUMBER_ID || !VERIFY_TOKEN) {
    console.error("Error: Missing one or more required environment variables.");
    console.error("Ensure WHATSAPP_TOKEN, GEMINI_API_KEY, PHONE_NUMBER_ID, and VERIFY_TOKEN are set.");
    process.exit(1);
}

// --- 2. Initialize Gemini Model with gemini-1.5-flash ---
// THIS IS THE KEY CHANGE: model name set to "gemini-1.5-flash"
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY, { apiVersion: "v1beta" }); // Keep apiVersion for robustness
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


// --- 3. Express App Setup ---
const app = express();
app.use(bodyParser.json());

// --- 4. Webhook Verification (GET request) ---
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('Webhook VERIFIED');
            res.status(200).send(challenge);
        } else {
            console.log('Webhook verification FAILED: Token mismatch or invalid mode.');
            res.sendStatus(403);
        }
    } else {
        console.log('Webhook verification FAILED: Missing mode or token.');
        res.sendStatus(400);
    }
});

// --- 5. Handle Incoming WhatsApp Messages (POST request) ---
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry) {
            for (const change of entry.changes) {
                if (change.field === 'messages') {
                    const messages = change.value.messages;
                    if (messages && messages.length > 0) {
                        for (const message of messages) {
                            if (message.type === 'text') {
                                const userPhoneNumber = message.from;
                                const userText = message.text.body;

                                console.log(`Received message from ${userPhoneNumber}: "${userText}"`);

                                try {
                                    // Use the gemini-1.5-flash model
                                    const geminiResponse = await geminiModel.generateContent(userText);
                                    const aiResponseText = geminiResponse.response.text();

                                    console.log(`Gemini responded: "${aiResponseText}"`);

                                    await sendMessageToWhatsApp(userPhoneNumber, aiResponseText);

                                } catch (error) {
                                    console.error("Error communicating with Gemini or sending WhatsApp message:", error);
                                    if (error.status === 404) {
                                        console.error("This 404 error usually means the model is not found or supported for the API version/method.");
                                        console.error("Double-check model name, API key, and especially access/availability for gemini-1.5-flash.");
                                    }
                                    await sendMessageToWhatsApp(userPhoneNumber, "Sorry, I couldn't process that. An internal error occurred.");
                                }
                            }
                        }
                    } else {
                        console.log("No text message object found or message is not of type 'text'.");
                    }
                }
            }
        }
    }
    res.status(200).send('EVENT_RECEIVED');
});

// --- Function to Send Message Back to WhatsApp ---
async function sendMessageToWhatsApp(toPhoneNumber, messageText) {
    try {
        const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
        const headers = {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
        };
        const data = {
            messaging_product: "whatsapp",
            to: toPhoneNumber,
            type: "text",
            text: {
                body: messageText
            }
        };

        await axios.post(url, data, { headers });
        console.log(`Message sent to ${toPhoneNumber}: "${messageText}"`);
    } catch (error) {
        console.error(`Failed to send message to ${toPhoneNumber}:`, error.response ? error.response.data : error.message);
    }
}


// --- 6. Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
    console.log(`WhatsApp webhook URL: https://uwellness-bot.onrender.com/webhook`); // Your Render URL
    console.log("Make sure to configure this URL in your Meta App Dashboard.");
});