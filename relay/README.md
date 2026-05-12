# Vault Operator Relay -- Setup Guide

A lightweight relay server that makes your Obsidian vault accessible from AI assistants like Claude, ChatGPT, Cursor, and any MCP-compatible tool.

## How it works

```
AI Assistant  -->  HTTPS  -->  This Relay (Cloudflare)  <--  WebSocket  <--  Vault Operator Plugin
(claude.ai,                    (always reachable)                           (your computer)
 ChatGPT, etc.)
```

The relay is a thin proxy. It receives requests from AI assistants and forwards them to your Vault Operator plugin via WebSocket. No data is stored on the relay.

---

## Setup (10 minutes)

### Step 1: Create a Cloudflare account

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Enter your email and password
3. On the "How would you like to get started?" screen, select **"Build and scale apps globally"**
4. You'll land on the Cloudflare Dashboard

### Step 2: Enable Workers Paid plan

The relay uses Durable Objects which require the Workers Paid plan ($5/month).

1. In the Cloudflare Dashboard, click **"Workers & Pages"** in the left sidebar
2. Click **"Plans"** (or you may see a banner about upgrading)
3. Select **"Workers Paid"** ($5/month)
4. Enter payment details and confirm

### Step 3: Install the Cloudflare CLI

Open a terminal and run:

```bash
npm install -g wrangler
```

Then log in to your Cloudflare account:

```bash
npx wrangler login
```

This opens a browser window. Click **"Allow"** to authorize.

### Step 4: Deploy the relay

```bash
# Clone the Vault Operator repository
git clone https://github.com/pssah4/vault-operator
cd vault-operator/relay

# Install dependencies
npm install

# Deploy to Cloudflare
npx wrangler deploy
```

After deployment, you'll see a URL like:
```
https://obsilo-relay.<your-account>.workers.dev
```

Copy this URL -- you'll need it in Step 6.

### Step 5: Set the relay token

In Obsidian, go to **Vault Operator Settings > Connections > Remote access** and click **"Generate"** to create a token.

Copy the token, then set it in your Cloudflare Worker:

```bash
npx wrangler secret put RELAY_TOKEN
```

Paste the token when prompted and press Enter.

### Step 6: Configure Vault Operator

In Obsidian, go to **Vault Operator Settings > Connections > Remote access**:

1. Toggle **"Enable remote access"** on
2. Paste the **relay URL** from Step 4
3. The **token** should already be filled in from Step 5
4. Click **"Connect"**

Status should show "Connected".

### Step 7: Add to your AI assistant

Copy your relay URL and add it as a connector:

**claude.ai:**
1. Go to [claude.ai](https://claude.ai) > Settings > Connectors
2. Click "Add custom connector"
3. Name: `Vault Operator`
4. URL: paste your relay URL
5. Click "Add"

**ChatGPT:**
1. Go to ChatGPT > Settings > Apps
2. Enable Developer Mode
3. Add connector with your relay URL

**Cursor / Windsurf:**
1. Open MCP server settings
2. Add remote server
3. Paste your relay URL

---

## Cost

- Cloudflare Workers Paid: **$5/month flat**
- The relay uses Durable Objects with Hibernation -- no additional cost while idle
- Typical usage (a few hundred requests/day) stays well within included limits

## Security

- All requests require a Bearer token (shared secret between Vault Operator and the relay)
- TLS encryption enforced by Cloudflare
- No data stored on the relay (pure forwarding)
- You control the relay on your own Cloudflare account

## Troubleshooting

**"Plugin not connected" error:**
- Make sure Obsidian is running with Vault Operator's remote access enabled
- Check that the relay URL and token match in both Vault Operator Settings and Cloudflare

**"Unauthorized" error:**
- The token in Vault Operator Settings must exactly match the RELAY_TOKEN in Cloudflare
- Re-run `npx wrangler secret put RELAY_TOKEN` with the correct token

**Relay URL not working:**
- Make sure you selected Workers Paid plan (Durable Objects require it)
- Try `npx wrangler deploy` again
- Check `npx wrangler tail` for error logs
