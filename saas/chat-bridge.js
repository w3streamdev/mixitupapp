#!/usr/bin/env node
/**
 * Lightweight Twitch chat bridge.
 * Connects to Twitch IRC via tmi.js, forwards messages to the SaaS API,
 * and sends replies back to chat.
 *
 * Run: node chat-bridge.js
 */

const tmi = require('tmi.js');

const API_URL = process.env.API_URL || 'https://mixitup-api-dev-958043331506.us-central1.run.app';
const TOKEN = process.env.JWT_TOKEN || '';
const TWITCH_TOKEN = process.env.TWITCH_TOKEN || '';
const CHANNEL = process.env.TWITCH_CHANNEL || 'vybecodez';

if (!TOKEN) {
  console.error('JWT_TOKEN env var required');
  process.exit(1);
}
if (!TWITCH_TOKEN) {
  console.error('TWITCH_TOKEN env var required (Twitch OAuth access token)');
  process.exit(1);
}

const client = new tmi.Client({
  options: { debug: false },
  connection: { reconnect: true, secure: true },
  identity: {
    username: CHANNEL,
    password: `oauth:${TWITCH_TOKEN}`,
  },
  channels: [CHANNEL],
});

client.on('connected', (addr, port) => {
  console.log(`[ChatBridge] Connected to Twitch IRC at ${addr}:${port}`);
  console.log(`[ChatBridge] Listening in #${CHANNEL}`);
});

client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  const username = tags['username'] || tags['display-name'] || 'unknown';
  const displayName = tags['display-name'] || username;
  const userId = tags['user-id'] || '';

  try {
    // Send to our API's chat-trigger endpoint
    const res = await fetch(`${API_URL}/api/v2/commands/chat-trigger`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform: 'twitch',
        userId,
        username,
        displayName,
        message: message.trim(),
      }),
    });

    const data = await res.json();

    if (data.matched && data.premade && data.response) {
      // Pre-made command: send response directly to chat
      await client.say(channel, data.response);
      console.log(`[ChatBridge] ${displayName}: ${message} -> [premade] ${data.response}`);
    } else if (data.matched) {
      // Send chat responses resolved by the API for custom commands
      if (data.chatResponses && data.chatResponses.length > 0) {
        for (const response of data.chatResponses) {
          await client.say(channel, response);
        }
        console.log(`[ChatBridge] ${displayName}: ${message} -> matched command ${data.commandId}, sent ${data.chatResponses.length} chat response(s)`);
      } else {
        console.log(`[ChatBridge] ${displayName}: ${message} -> matched command ${data.commandId} (execution: ${data.executionId}, no chat actions)`);
      }
    }
  } catch (err) {
    console.error(`[ChatBridge] Error processing message from ${displayName}:`, err.message);
  }
});

client.on('disconnected', (reason) => {
  console.log(`[ChatBridge] Disconnected: ${reason}`);
});

client.connect().then(() => {
  console.log('[ChatBridge] w3StreamItUp chat bridge is running!');
}).catch((err) => {
  console.error('[ChatBridge] Failed to connect:', err);
  process.exit(1);
});
