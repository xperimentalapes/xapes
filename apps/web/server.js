/**
 * XapeLabz — Express server with Discord OAuth2 login
 * Serves static site and provides /api/discord/* routes.
 *
 * Required env: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET
 * Optional: BASE_URL — fallback when Host header is missing (local scripts only).
 * Discord OAuth redirect URI must be derived from the request host so login works on
 * every deployed domain (e.g. www.xapelabz.com vs xapes.vercel.app). Register each
 * full callback URL in the Discord Developer Portal.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieSession = require('cookie-session');
const cookieParser = require('cookie-parser');
const axios = require('axios');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'xapes-session-secret-change-in-production';
const DEFAULT_BASE_URL = (process.env.BASE_URL || 'http://localhost:' + PORT).replace(/\/$/, '');

/** Public site origin for this request (Vercel: x-forwarded-*). Used for Discord redirect_uri. */
function publicOrigin(req) {
  const xfProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = xfProto || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  return DEFAULT_BASE_URL;
}

const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/users/@me';
const SCOPES = 'identify';

const { getCollectionsMarketData } = require('../../lib/marketplace/collections');
const { buildHoldersLeaderboard } = require('../../lib/holder/holders-leaderboard');

const BLUNA_TOKEN_MINT = process.env.XMA_TOKEN_MINT || process.env.BLUNA_TOKEN_MINT || process.env.TOKEN_MINT || 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
const BLUNA_DECIMALS = parseInt(process.env.BLUNA_DECIMALS || '6', 10);

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
  console.warn('Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET. Set them in .env to enable Discord login.');
}

app.use(cookieParser());
// Discord interactions: must verify Ed25519 signature against raw body (before express.json).
app.post(
  '/api/discord/interactions',
  express.raw({ type: 'application/json', limit: '1mb' }),
  require('../../lib/discord/express-interactions')
);
app.use(express.json());
const SESSION_COOKIE_SECURE =
  process.env.COOKIE_SECURE === '1' ||
  (process.env.COOKIE_SECURE !== '0' && (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'));
app.use(
  cookieSession({
    name: 'xapes_session',
    keys: [SESSION_SECRET],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  })
);

app.use(express.static(path.join(__dirname)));

// Serve game pages from repo public/; roulette with no-store so updates show immediately
const publicDir = path.join(__dirname, '..', '..', 'public');
if (require('fs').existsSync(publicDir)) {
  app.get('/roulette', function (req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(publicDir, 'roulette.html'));
  });
  app.get('/roulette.html', function (req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(publicDir, 'roulette.html'));
  });
  app.get('/coinflip', function (req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(publicDir, 'coinflip.html'));
  });
  app.get('/coinflip.html', function (req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(publicDir, 'coinflip.html'));
  });
  app.use(express.static(publicDir));
}

// Avoid 404 for favicon (browsers request it automatically)
app.get('/favicon.ico', function (req, res) {
  res.status(204).end();
});

// ——— Coin Flip API (handlers in lib/coinflip/ to stay under Vercel 12-function limit) ———
const coinflipDir = path.join(__dirname, '..', '..', 'lib', 'coinflip');
function useCoinflipHandler(handler) {
  return function (req, res) {
    handler(req, res).catch(function (err) {
      console.error('Coinflip API error:', err);
      if (!res.headersSent) res.status(500).json({ error: err.message || 'Server error' });
    });
  };
}
if (require('fs').existsSync(coinflipDir)) {
  try {
    app.get('/api/coinflip-state', useCoinflipHandler(require(path.join(coinflipDir, 'coinflip-state.js'))));
    app.get('/api/coinflip-stats', useCoinflipHandler(require(path.join(coinflipDir, 'coinflip-stats.js'))));
    app.post('/api/coinflip-flip', useCoinflipHandler(require(path.join(coinflipDir, 'coinflip-flip.js'))));
    app.post('/api/coinflip-purchase', useCoinflipHandler(require(path.join(coinflipDir, 'coinflip-purchase.js'))));
    app.post('/api/coinflip-collect', useCoinflipHandler(require(path.join(coinflipDir, 'coinflip-collect.js'))));
    app.post('/api/coinflip-confirm-collect', useCoinflipHandler(require(path.join(coinflipDir, 'coinflip-confirm-collect.js'))));
  } catch (e) {
    console.warn('Coinflip API routes not loaded:', e.message);
  }
}

// ——— Holder verify: wallet link + Discord roles (Supabase + bot) ———
const holderDir = path.join(__dirname, '..', '..', 'lib', 'holder');
function useHolderHandler(mod) {
  return function (req, res) {
    Promise.resolve(mod(req, res)).catch(function (err) {
      console.error('Holder API error:', err);
      if (!res.headersSent) res.status(500).json({ error: err.message || 'Server error' });
    });
  };
}
if (fs.existsSync(path.join(holderDir, 'link-wallet.js'))) {
  try {
    const linkWallet = require(path.join(holderDir, 'link-wallet.js'));
    const verifyRoles = require(path.join(holderDir, 'verify-roles.js'));
    app.post('/api/holder/link-wallet', useHolderHandler(linkWallet));
    app.post('/api/holder/verify', useHolderHandler(verifyRoles));
    app.post('/api/holder-link-wallet', useHolderHandler(linkWallet));
    app.post('/api/holder-verify', useHolderHandler(verifyRoles));
  } catch (e) {
    console.warn('Holder API routes not loaded:', e.message);
  }
}

// ——— Discord OAuth: start ———
app.get('/api/discord/auth', function (req, res) {
  if (!DISCORD_CLIENT_ID) {
    return res.redirect('/?discord=not_configured');
  }
  const state = Math.random().toString(36).slice(2);
  const redirectUri = publicOrigin(req) + '/api/discord/callback';
  req.session.discordState = state;
  req.session.discordOauthRedirectUri = redirectUri;
  const qs = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state: state,
  });
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, DISCORD_AUTH_URL + '?' + qs.toString());
});

// ——— Discord OAuth: callback ———
app.get('/api/discord/callback', async function (req, res) {
  const { code, state } = req.query;
  const savedState = req.session.discordState;
  const redirectUri =
    req.session.discordOauthRedirectUri || publicOrigin(req) + '/api/discord/callback';
  delete req.session.discordOauthRedirectUri;

  if (!code || state !== savedState) {
    delete req.session.discordState;
    console.warn('Discord OAuth callback: bad state or missing code', {
      hasCode: !!code,
      stateMatch: state === savedState,
    });
    return res.redirect('/?discord=error');
  }
  delete req.session.discordState;

  if (!DISCORD_CLIENT_SECRET) {
    return res.redirect('/?discord=error');
  }

  try {
    const tokenRes = await axios.post(
      DISCORD_TOKEN_URL,
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        validateStatus: () => true,
      }
    );

    if (tokenRes.status !== 200 || !tokenRes.data.access_token) {
      console.warn('Discord token exchange failed', tokenRes.status, tokenRes.data, 'redirect_uri was', redirectUri);
      return res.redirect('/?discord=error');
    }

    const userRes = await axios.get(DISCORD_USER_URL, {
      headers: { Authorization: 'Bearer ' + tokenRes.data.access_token },
      validateStatus: () => true,
    });

    if (userRes.status !== 200 || !userRes.data.id) {
      return res.redirect('/?discord=error');
    }

    const user = userRes.data;
    req.session.discord = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator === '0' ? '' : user.discriminator,
      avatar: user.avatar,
      global_name: user.global_name || user.username,
    };
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, '/?discord=connected');
  } catch (err) {
    console.warn('Discord callback error', err.message);
    return res.redirect('/?discord=error');
  }
});

// ——— Current Discord user ———
app.get('/api/discord/me', function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  if (!req.session || !req.session.discord) {
    return res.json({ connected: false });
  }
  res.json({ connected: true, user: req.session.discord });
});

// ——— Logout ———
app.post('/api/discord/logout', function (req, res) {
  delete req.session.discord;
  res.json({ ok: true });
});

app.get('/api/discord/logout', function (req, res) {
  delete req.session.discord;
  res.redirect('/');
});

// ——— Discord → XMA rewards (session; Supabase + optional treasury key) ———
const xmaRewards = require('../../lib/discord/xma-rewards');
app.get('/api/discord-rewards/status', function (req, res) {
  xmaRewards.handleStatus(req, res).catch(function (e) {
    console.error('discord-rewards/status', e);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  });
});
app.get('/api/discord-rewards/meta', function (req, res) {
  xmaRewards.handlePublicMeta(req, res).catch(function (e) {
    console.error('discord-rewards/meta', e);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  });
});
app.post('/api/discord-rewards/claim', function (req, res) {
  xmaRewards.handleClaim(req, res).catch(function (e) {
    console.error('discord-rewards/claim', e);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  });
});

// ——— Cron jobs (cron-job.org → vercel.json rewrite → dashboard → these routes) ———
require('../../lib/cron/register-routes').registerCronRoutes(app);
require('../../lib/casino/register-routes').registerCasinoRoutes(app);

// ——— Discord user by ID (for team section; requires bot token) ———
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_BOT_TOKEN) {
  console.warn('DISCORD_BOT_TOKEN not set — Team section will show placeholder avatars. Add a Bot token from Discord Developer Portal to fetch Discord usernames and avatars.');
}
app.get('/api/discord/user/:id', async function (req, res) {
  const id = req.params.id;
  if (!id || !DISCORD_BOT_TOKEN) {
    return res.status(503).json({ error: 'Discord bot not configured' });
  }
  try {
    const userRes = await axios.get('https://discord.com/api/v10/users/' + encodeURIComponent(id), {
      headers: { Authorization: 'Bot ' + DISCORD_BOT_TOKEN },
      validateStatus: () => true,
    });
    if (userRes.status !== 200 || !userRes.data.id) {
      if (userRes.status === 401) {
        console.warn('Discord API 401 for user ' + id + ' — check DISCORD_BOT_TOKEN is correct and has no extra spaces/quotes.');
      } else if (userRes.status === 404) {
        console.warn('Discord API 404 for user ' + id + ' — user ID may be wrong or bot cannot see this user.');
      } else {
        console.warn('Discord API returned ' + userRes.status + ' for user ' + id);
      }
      return res.status(404).json({ error: 'User not found' });
    }
    const u = userRes.data;
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      id: u.id,
      username: u.username,
      global_name: u.global_name || u.username,
      avatar: u.avatar,
      discriminator: u.discriminator,
    });
  } catch (err) {
    console.warn('Discord user fetch error', err.message);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// ——— Live prices (Jupiter): SOL + Blunana USD; cache 60s ———
const SOL_MINT = 'So11111111111111111111111111111111111111112';
let pricesCache = { data: null, ts: 0 };
const PRICES_CACHE_MS = 60 * 1000;

function parseJupiterPrices(data) {
  const out = { solUsd: null, blunanaUsd: null, blunanaPerSol: null };
  if (!data || typeof data !== 'object') return out;
  const d = typeof data.data === 'object' && data.data !== null ? data.data : data;
  const sol = d[SOL_MINT];
  const blunana = d[BLUNA_TOKEN_MINT];
  const solP = sol?.price ?? sol?.usdPrice;
  const bluP = blunana?.price ?? blunana?.usdPrice;
  if (solP != null) out.solUsd = Number(solP);
  if (bluP != null) {
    out.blunanaUsd = Number(bluP);
    if (out.solUsd && out.solUsd > 0) out.blunanaPerSol = out.blunanaUsd / out.solUsd;
  }
  return out;
}

app.get('/api/prices', async function (req, res) {
  const now = Date.now();
  if (pricesCache.data && now - pricesCache.ts < PRICES_CACHE_MS) {
    return res.json(pricesCache.data);
  }
  const out = { solUsd: null, blunanaUsd: null, blunanaPerSol: null };
  const ids = [SOL_MINT, BLUNA_TOKEN_MINT].join(',');
  const urls = [
    'https://api.jup.ag/price/v3?ids=' + encodeURIComponent(ids),
    'https://lite-api.jup.ag/price/v3?ids=' + encodeURIComponent(ids),
  ];
  for (const url of urls) {
    try {
      const r = await axios.get(url, {
        timeout: 8000,
        validateStatus: () => true,
        headers: { Accept: 'application/json' },
      });
      if (r.status === 200 && r.data) {
        const parsed = parseJupiterPrices(r.data);
        if (parsed.solUsd != null) out.solUsd = parsed.solUsd;
        if (parsed.blunanaUsd != null) out.blunanaUsd = parsed.blunanaUsd;
        if (parsed.blunanaPerSol != null) out.blunanaPerSol = parsed.blunanaPerSol;
        if (out.blunanaUsd != null) break;
      }
    } catch (e) {
      console.warn('Prices fetch failed', url, e.message);
    }
  }
  // Fallback: DexScreener token-pairs if Jupiter didn't return Blunana price
  if (out.blunanaUsd == null) {
    try {
      const dsRes = await axios.get(
        'https://api.dexscreener.com/token-pairs/v1/solana/' + encodeURIComponent(BLUNA_TOKEN_MINT),
        { timeout: 6000, validateStatus: () => true, headers: { Accept: 'application/json' } }
      );
      if (dsRes.status === 200 && Array.isArray(dsRes.data) && dsRes.data.length > 0) {
        const priceUsd = dsRes.data[0].priceUsd;
        if (priceUsd != null && priceUsd !== '') {
          out.blunanaUsd = Number(priceUsd);
          if (out.solUsd != null && out.solUsd > 0) out.blunanaPerSol = out.blunanaUsd / out.solUsd;
        }
      }
    } catch (e) {
      console.warn('DexScreener fallback failed', e.message);
    }
  }
  if (out.solUsd != null && out.blunanaUsd != null && out.blunanaPerSol == null && out.solUsd > 0) {
    out.blunanaPerSol = out.blunanaUsd / out.solUsd;
  }
  // Enrich with DexScreener: 24h change, liquidity, volume, market cap (DEXTools-style)
  try {
    const dsRes = await axios.get(
      'https://api.dexscreener.com/token-pairs/v1/solana/' + encodeURIComponent(BLUNA_TOKEN_MINT),
      { timeout: 6000, validateStatus: () => true, headers: { Accept: 'application/json' } }
    );
    if (dsRes.status === 200 && Array.isArray(dsRes.data) && dsRes.data.length > 0) {
      const pairs = dsRes.data.filter(function (p) {
        return p.priceUsd != null && p.priceUsd !== '' && (p.liquidity?.usd ?? 0) > 0;
      });
      const best = pairs.sort(function (a, b) { return (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0); })[0];
      if (best) {
        if (out.blunanaUsd == null && best.priceUsd != null) {
          out.blunanaUsd = Number(best.priceUsd);
          if (out.solUsd != null && out.solUsd > 0) out.blunanaPerSol = out.blunanaUsd / out.solUsd;
        }
        const pc = best.priceChange;
        if (pc != null && typeof pc.h24 === 'number') out.priceChange24h = pc.h24;
        if (best.liquidity?.usd != null) out.liquidityUsd = Number(best.liquidity.usd);
        if (best.volume?.h24 != null) out.volume24hUsd = Number(best.volume.h24);
        if (best.marketCap != null) out.marketCapUsd = Number(best.marketCap);
        if (best.fdv != null) out.fdvUsd = Number(best.fdv);
      }
    }
  } catch (e) {
    console.warn('DexScreener enrichment failed', e.message);
  }
  pricesCache = { data: out, ts: now };
  res.json(out);
});

// ——— Token OHLC (Birdeye, XMA mint); optional BIRDEYE_API_KEY ———
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const OHLC_CACHE_MS = 2 * 60 * 1000;
let ohlcCache = { data: null, ts: 0 };

async function tokenOhlcHandler(req, res) {
  const type = (req.query.type || '15m').toLowerCase().replace(/\s/g, '');
  const validType = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d'].includes(type) ? type : '15m';
  if (!BIRDEYE_API_KEY) {
    return res.json({ success: false, data: { items: [] }, message: 'Chart requires BIRDEYE_API_KEY in server .env' });
  }
  const now = Math.floor(Date.now() / 1000);
  const cacheKey = validType;
  if (ohlcCache.data && ohlcCache.type === cacheKey && now * 1000 - ohlcCache.ts < OHLC_CACHE_MS) {
    return res.json(ohlcCache.data);
  }
  const timeTo = now;
  const timeFrom = now - 7 * 24 * 60 * 60;
  try {
    const r = await axios.get(
      'https://public-api.birdeye.so/defi/v3/ohlcv',
      {
        params: {
          address: BLUNA_TOKEN_MINT,
          type: validType,
          time_from: timeFrom,
          time_to: timeTo,
          currency: 'usd',
        },
        timeout: 10000,
        validateStatus: () => true,
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'Accept': 'application/json',
        },
      }
    );
    if (r.status !== 200 || !r.data?.data?.items) {
      ohlcCache = { data: { success: false, data: { items: [] } }, ts: Date.now(), type: cacheKey };
      return res.json(ohlcCache.data);
    }
    const payload = { success: true, data: { items: r.data.data.items } };
    ohlcCache = { data: payload, ts: Date.now(), type: cacheKey };
    res.json(payload);
  } catch (e) {
    console.warn('Birdeye OHLC failed', e.message);
    res.json({ success: false, data: { items: [] }, message: e.message || 'OHLC fetch failed' });
  }
}

app.get('/api/xma-ohlc', tokenOhlcHandler);
app.get('/api/blunana-ohlc', tokenOhlcHandler); // legacy alias

// ——— Verify: wallet XMA balance + NFT count per collection ———
const getWalletHoldings = require(path.join(__dirname, '..', '..', 'lib', 'holder', 'wallet-holdings.js')).getWalletHoldings;
app.get('/api/verify', async function (req, res) {
  const wallet = (req.query.wallet || '').trim();
  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet' });
  }
  try {
    const out = await getWalletHoldings(wallet);
    const { collectionItems, ...rest } = out;
    res.json(rest);
  } catch (e) {
    console.warn('Verify failed', e.message);
    res.json({
      blunana: 0,
      blunanaFormatted: '0',
      mnk3ysCount: 0,
      zmb3ysCount: 0,
      totalNfts: 0,
    });
  }
});

// ——— Collections (Magic Eden + Helius/Supabase fallbacks) ———
app.get('/api/collections', async function (req, res) {
  try {
    const payload = await getCollectionsMarketData();
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    res.json(payload);
  } catch (e) {
    console.warn('/api/collections failed', e.message);
    res.status(500).json({ collections: [], error: 'Failed to load collections' });
  }
});

// ——— Holders table (token + NFT), sort by total | token | nfts ———
app.get('/api/holders', async function (req, res) {
  try {
    const sortBy = (req.query.sort || 'total').toLowerCase();
    const payload = await buildHoldersLeaderboard({ sort: sortBy });
    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    res.json(payload);
  } catch (e) {
    console.warn('/api/holders failed', e.message);
    res.status(500).json({ holders: [], sort: 'total', error: 'Failed to load holders' });
  }
});

// On Vercel, do not listen; the app is used by api/[[...path]].js
if (process.env.VERCEL !== '1') {
  app.listen(PORT, function () {
    console.log('XapeLabz server at http://localhost:' + PORT);
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      console.log('Discord login disabled: set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env');
    } else {
      console.log(
        'Discord OAuth: add each site callback to the Dev Portal, e.g.',
        DEFAULT_BASE_URL + '/api/discord/callback',
        '(and your custom domains with the same path)'
      );
    }
  });
}

module.exports = app;
