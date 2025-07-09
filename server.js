// Production-Ready WhatsApp + Gemini AI Chatbot
// Uwellness Bot - Hosted on Render

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// 🌿 Gemini AI Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// 🔐 Environment Variables
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// 🧠 Chat History (Temporary, per user in memory)
const chatHistories = {}; // { '2764xxxxxx': [ { role: 'user', content: '' }, ... ] }

// 📩 Send WhatsApp Text Message
async function sendTextMessage(to, body) {
    try {
        const res = await axios.post(
            `https://graph.facebook.com/v17.0/${PHONE_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body },
            },
            {
                headers: {
                    Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("📤 WhatsApp message sent:", res.data);
    } catch (err) {
        console.error("❌ Failed to send WhatsApp message:", err.response?.data || err.message);
    }
}

// ✅ Webhook Verification (GET)
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    } else {
        return res.sendStatus(403);
    }
});

// 🤖 Handle Incoming Messages (POST)
app.post("/webhook", async (req, res) => {
    console.log("📩 Incoming Webhook Payload:");
    console.log(JSON.stringify(req.body, null, 2));

    // Define userPhone here so it's accessible in the catch block
    let userPhone = null;

    try {
        const messageObj = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!messageObj) {
            console.log("⚠️ No message object found in payload.");
            return res.sendStatus(200);
        }

        userPhone = messageObj.from; // Assign userPhone here
        const userMessage = messageObj.text?.body;

        if (!userMessage) {
            console.log("⚠️ No text body in the message.");
            return res.sendStatus(200);
        }

        console.log(`💬 Message from ${userPhone}: ${userMessage}`);

        // Initialize history if needed
        if (!chatHistories[userPhone]) {
            chatHistories[userPhone] = []; // Start with an empty history array
        }

        // Add user message to history
        chatHistories[userPhone].push({ role: "user", content: userMessage });

        // Use Gemini to generate reply with systemInstruction
        const chat = model.startChat({
            history: chatHistories[userPhone],
            systemInstruction: "You are Uwellness, a caring mental health chatbot for students. Offer emotional support, kind words, and thoughtful responses.",
        });

        // Send the user's actual message to the chat session.
        // The systemInstruction sets the persona for the entire session.
        const result = await chat.sendMessage(userMessage);
        const geminiReply = result.response.text();

        console.log(`🤖 Gemini reply: ${geminiReply}`);

        // Add Gemini's response to history
        chatHistories[userPhone].push({ role: "assistant", content: geminiReply });

        // Send reply back via WhatsApp
        await sendTextMessage(userPhone, geminiReply);

        console.log("✅ Message sent via WhatsApp.");
        res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error handling message:", err.message);
        // Only attempt to send an error message if userPhone is defined
        if (userPhone) {
            await sendTextMessage(userPhone, "Oops! Something went wrong. Please try again later.");
        } else {
            console.error("Could not send error message because userPhone was not defined.");
        }
        res.sendStatus(500);
    }
});

// 🚀 Start Server
app.listen(PORT, () => console.log(`Uwellness bot is running on port ${PORT}`));