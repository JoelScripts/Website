const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for your domain
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:8000',
    'http://flyingwithjoel.co.uk',
    'https://flyingwithjoel.co.uk',
    'http://www.flyingwithjoel.co.uk',
    'https://www.flyingwithjoel.co.uk',
    'https://joelscripts.github.io'
];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

// Store Twitch credentials securely
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN;
const TWITCH_CHANNEL_NAME = 'Flyingwithjoel';

// Helper function to fetch from Twitch API
async function fetchTwitch(endpoint, options = {}) {
    const headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${TWITCH_OAUTH_TOKEN}`,
        ...options.headers
    };

    const response = await fetch(`https://api.twitch.tv/helix${endpoint}`, {
        ...options,
        headers
    });

    if (!response.ok) {
        throw new Error(`Twitch API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

// Get user ID
async function getUserId() {
    const data = await fetchTwitch(`/users?login=${TWITCH_CHANNEL_NAME}`);
    return data.data[0].id;
}

// Endpoint: Keep-alive ping (prevents Render free tier spin-down)
app.get('/api/ping', (req, res) => {
    res.json({ status: 'Backend is alive ✈️' });
});

// Endpoint: Get live status
app.get('/api/live-status', async (req, res) => {
    try {
        const data = await fetchTwitch(`/streams?user_login=${TWITCH_CHANNEL_NAME}`);
        res.json({
            isLive: data.data && data.data.length > 0,
            data: data.data[0] || null
        });
    } catch (error) {
        console.error('Error fetching live status:', error);
        res.status(500).json({ error: 'Failed to fetch live status' });
    }
});

// Endpoint: Get follower count
app.get('/api/followers', async (req, res) => {
    try {
        const userId = await getUserId();
        const data = await fetchTwitch(`/channels/followers?broadcaster_id=${userId}`);
        res.json({
            followerCount: data.total
        });
    } catch (error) {
        console.error('Error fetching followers:', error);
        res.status(500).json({ error: 'Failed to fetch followers' });
    }
});

// Endpoint: Get schedule
app.get('/api/schedule', async (req, res) => {
    try {
        const userId = await getUserId();
        const data = await fetchTwitch(`/schedule?broadcaster_id=${userId}&first=25`);
        res.json(data);
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
