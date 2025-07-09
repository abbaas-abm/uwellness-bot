// app.js

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // For making HTTP requests to WhatsApp API
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- 1. Load Environment Variables ---
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000; // Use PORT from .env or default to 3000

// Basic validation for critical variables
if (!WHATSAPP_TOKEN || !GEMINI_API_KEY || !PHONE_NUMBER_ID || !VERIFY_TOKEN) {
    console.error("Error: Missing one or more required environment variables.");
    console.error("Ensure WHATSAPP_TOKEN, GEMINI_API_KEY, PHONE_NUMBER_ID, and VERIFY_TOKEN are set.");
    process.exit(1);
}

// --- 2. Initialize Gemini Model ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });

// --- 3. Express App Setup ---
const app = express();
app.use(bodyParser.json()); // For parsing JSON webhook payloads

// --- 4. Webhook Verification (GET request) ---
// This endpoint is hit by Meta when you set up your webhook in the WhatsApp Business Manager
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
            res.sendStatus(403); // Forbidden
        }
    } else {
        console.log('Webhook verification FAILED: Missing mode or token.');
        res.sendStatus(400); // Bad Request
    }
});

// --- 5. Handle Incoming WhatsApp Messages (POST request) ---
// This endpoint receives actual message events from WhatsApp
app.post('/webhook', async (req, res) => {
    const body = req.body;

    // Check if the webhook event is from a WhatsApp Business Account and contains messages
    if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry) {
            for (const change of entry.changes) {
                if (change.field === 'messages') {
                    const messages = change.value.messages;
                    const contacts = change.value.contacts;

                    if (messages && messages.length > 0) {
                        for (const message of messages) {
                            if (message.type === 'text') {
                                const userPhoneNumber = message.from; // Phone number of the user who sent the message
                                const userText = message.text.body; // The actual text message

                                console.log(`Received message from ${userPhoneNumber}: "${userText}"`);

                                // --- Integrate with Gemini API (simplified: current chat only) ---
                                try {
                                    // Send only the current user's message to Gemini
                                    const geminiResponse = await geminiModel.generateContent(userText);
                                    const aiResponseText = geminiResponse.response.text();
                                    
                                    console.log(`Gemini responded: "${aiResponseText}"`);

                                    // --- Send AI's response back to WhatsApp ---
                                    await sendMessageToWhatsApp(userPhoneNumber, aiResponseText);

                                } catch (error) {
                                    console.error("Error communicating with Gemini or sending WhatsApp message:", error);
                                    await sendMessageToWhatsApp(userPhoneNumber, "Sorry, I couldn't process that. An internal error occurred.");
                                }
                            }
                            // You can add handling for other message types (image, video, etc.) here
                            // For simplicity, this example only processes 'text' messages.
                        }
                    }
                }
            }
        }
    }
    // Always respond with 200 OK to WhatsApp to acknowledge receipt of the webhook event
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
    console.log(`WhatsApp webhook URL: http://your-public-url:${PORT}/webhook`);
    console.log("Make sure to configure this URL in your Meta App Dashboard.");
});