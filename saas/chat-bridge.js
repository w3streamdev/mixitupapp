#!/usr/bin/env node
const tmi = require('tmi.js');

const API_URL = process.env.API_URL || 'https://w3s.connect3.io';
const JWT = process.env.JWT_TOKEN || '';
const TW_TOKEN = process.env.TWITCH_TOKEN || '';
const CH = process.env.TWITCH_CHANNEL || 'vybecodez';

if (!JWT || !TW_TOKEN) { console.error('JWT_TOKEN and TWITCH_TOKEN required'); process.exit(1); }

const client = new tmi.Client({
  options: { debug: false },
  connection: { reconnect: true, secure: true },
  identity: { username: CH, password: 'oauth:' + TW_TOKEN },
  channels: [CH],
});

client.on('connected', (a, p) => console.log('[Bot] Connected ' + a + ':' + p + ' #' + CH));
client.on('disconnected', (r) => console.log('[Bot] Disconnected: ' + r));

client.on('message', async function(channel, tags, message, self) {
  if (self) return;

  var user = tags['display-name'] || tags['username'] || '?';
  var msgId = tags['id'] || '';
  var msg = message.trim();

  console.log('[Chat] ' + user + ': ' + msg);

  if (!msg.startsWith('!')) return;

  try {
    var res = await fetch(API_URL + '/api/v2/commands/chat-trigger', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + JWT, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'twitch',
        userId: tags['user-id'] || '',
        username: tags['username'] || user,
        displayName: user,
        message: msg,
        messageId: msgId,
      }),
    });

    var data = await res.json();

    if (data.matched && data.premade && data.response) {
      await client.say(channel, data.response);
      console.log('[Bot] -> ' + data.response);
    } else if (data.matched) {
      if (data.chatResponses) {
        for (var i = 0; i < data.chatResponses.length; i++) {
          await client.say(channel, data.chatResponses[i]);
          console.log('[Bot] -> ' + data.chatResponses[i]);
        }
      }
      if (data.deleteMessage && msgId) {
        try { await client.deletemessage(channel, msgId); console.log('[Bot] Deleted msg'); }
        catch(e) { console.log('[Bot] Delete failed: ' + e.message); }
      }
    }
  } catch(e) {
    console.error('[Bot] Error: ' + e.message);
  }
});

client.connect().then(function() {
  console.log('[Bot] w3StreamItUp is live!');
});
