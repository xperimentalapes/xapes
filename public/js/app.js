/**
 * Project dashboard — config-driven template for NFT/token projects.
 * All project-specific copy and URLs come from window.XAPES_CONFIG (js/config.js).
 */

(function () {
  'use strict';

  const BREAKPOINT = 900;
  const CONFIG = window.XAPES_CONFIG || { holderPortalUrl: '', endpoints: {}, discordConnectUrl: '' };
  const BASE_PATH = '';
  const PORTAL_URL = (CONFIG.holderPortalUrl || '').replace(/\/$/, '');
  const HOLDINGS_ENDPOINT = PORTAL_URL && CONFIG.endpoints?.holdings ? PORTAL_URL + CONFIG.endpoints.holdings : '';

  /** From GET /api/discord-rewards/status when logged in; falls back to config. */
  var serverClaimThresholdXma = null;
  var rewardsTreasuryConfigured = true;
  var lastDiscordRewardsStatus = null;
  var grantCountdownTimer = null;

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** Match server `nextMidnightIsoInTimeZone` for offline countdown fallback. */
  function nextMidnightMsInTimeZone(timeZone) {
    var now = Date.now();
    var t = Math.floor(now / 1000) * 1000 + 1000;
    var end = t + 26 * 3600 * 1000;
    while (t <= end) {
      var d = new Date(t);
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(d);
      var h = parts.find(function (p) {
        return p.type === 'hour';
      }).value;
      var m = parts.find(function (p) {
        return p.type === 'minute';
      }).value;
      var s = parts.find(function (p) {
        return p.type === 'second';
      }).value;
      if (h === '00' && m === '00' && s === '00') return t;
      t += 1000;
    }
    return now + 24 * 3600 * 1000;
  }

  function scheduleGrantCountdown(isoOrNull) {
    var el = document.getElementById('xma-grant-countdown');
    if (!el) return;
    if (grantCountdownTimer != null) {
      clearInterval(grantCountdownTimer);
      grantCountdownTimer = null;
    }
    var targetMs;
    if (isoOrNull) {
      targetMs = new Date(isoOrNull).getTime();
      if (!isFinite(targetMs)) isoOrNull = null;
    }
    if (!isoOrNull) {
      targetMs = nextMidnightMsInTimeZone('America/New_York');
    }
    function tick() {
      var left = targetMs - Date.now();
      if (left <= 0) {
        el.textContent = '00:00:00';
        if (grantCountdownTimer != null) {
          clearInterval(grantCountdownTimer);
          grantCountdownTimer = null;
        }
        loadDiscordRewardsMetaPublic();
        return;
      }
      var totalSec = Math.floor(left / 1000);
      var h = Math.floor(totalSec / 3600);
      var m = Math.floor((totalSec % 3600) / 60);
      var sec = totalSec % 60;
      el.textContent = pad2(h) + ':' + pad2(m) + ':' + pad2(sec);
    }
    tick();
    grantCountdownTimer = setInterval(tick, 1000);
  }

  function applyDiscordRewardsMetaFields(meta) {
    if (!meta || typeof meta !== 'object') return;
    var rates = meta.accrualRates;
    if (rates && typeof rates === 'object') {
      var cm = document.getElementById('xma-cap-messages');
      var cr = document.getElementById('xma-cap-reactions');
      var cv = document.getElementById('xma-cap-voice');
      if (cm != null && rates.message != null && rates.message !== '') {
        cm.textContent = '(' + rates.message + ' XMA)';
      }
      if (cr != null && rates.reaction != null && rates.reaction !== '') {
        cr.textContent = '(' + rates.reaction + ' XMA)';
      }
      if (cv != null && rates.voiceMinute != null && rates.voiceMinute !== '') {
        cv.textContent = '(' + rates.voiceMinute + ' XMA/min)';
      }
    } else {
      var caps = meta.displayCaps;
      if (caps && typeof caps === 'object') {
        var cm2 = document.getElementById('xma-cap-messages');
        var cr2 = document.getElementById('xma-cap-reactions');
        var cv2 = document.getElementById('xma-cap-voice');
        if (cm2 != null && caps.messages != null && caps.messages !== '') {
          cm2.textContent = '(' + caps.messages + ')';
        }
        if (cr2 != null && caps.reactions != null && caps.reactions !== '') {
          cr2.textContent = '(' + caps.reactions + ')';
        }
        if (cv2 != null && caps.voiceMinutes != null && caps.voiceMinutes !== '') {
          cv2.textContent = '(' + caps.voiceMinutes + ')';
        }
      }
    }
    var lbl = document.getElementById('xma-grant-countdown-label');
    var resetLbl = meta.nextResetLabel || meta.nextGrantLabel;
    if (lbl != null && resetLbl) {
      lbl.textContent = resetLbl;
    }
    var nextReset = meta.nextDailyResetAt || meta.nextDailyGrantAt;
    if (nextReset) {
      scheduleGrantCountdown(nextReset);
    } else {
      scheduleGrantCountdown(null);
    }
  }

  function applyDiscordRewardsMetaFromConfigFallback() {
    var r = CONFIG.xmaDiscordRewards || {};
    applyDiscordRewardsMetaFields({
      accrualRates: {
        message: r.xmaPerQualifyingMessage,
        reaction: r.xmaPerReaction,
        voiceMinute: r.xmaPerVoiceMinute,
      },
      nextResetLabel: 'Next daily reset (ET)',
      nextDailyResetAt: null,
    });
  }

  function loadDiscordRewardsMetaPublic() {
    fetch(window.location.origin + '/api/discord-rewards/meta', { credentials: 'omit' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (data && typeof data === 'object') {
          applyDiscordRewardsMetaFields(data);
        } else {
          applyDiscordRewardsMetaFromConfigFallback();
        }
      })
      .catch(function () {
        applyDiscordRewardsMetaFromConfigFallback();
      });
  }

  function updateXmaClaimButtonState() {
    var rewardsCfg = CONFIG.xmaDiscordRewards || {};
    var thCfg = Number(rewardsCfg.claimThresholdXma);
    if (!isFinite(thCfg) || thCfg < 0) thCfg = 0;
    var threshold =
      serverClaimThresholdXma != null && isFinite(serverClaimThresholdXma) && serverClaimThresholdXma >= 0
        ? serverClaimThresholdXma
        : thCfg;
    var balEl = document.getElementById('xma-unclaimed-balance');
    var btn = document.getElementById('xma-claim-btn');
    if (!btn || !balEl) return;
    var bal = parseFloat(String(balEl.textContent).replace(/,/g, '').trim(), 10);
    if (!isFinite(bal)) bal = 0;
    var canClaim = bal >= threshold && rewardsTreasuryConfigured;
    btn.disabled = !canClaim;
    btn.setAttribute('aria-disabled', canClaim ? 'false' : 'true');
    if (!rewardsTreasuryConfigured) {
      btn.title = 'Rewards treasury is not configured on the server';
    } else if (!canClaim && threshold > 0) {
      btn.title = 'Reach ' + threshold.toLocaleString('en-US') + ' unclaimed XMA to claim';
    } else {
      btn.title = '';
    }
  }

  // ----- Apply project config to DOM (template: brand, hero, token, footer, etc.) -----
  function applyProjectConfig() {
    var c = CONFIG;
    var projectName = c.projectName || 'Project';
    var logoUrl = c.logoUrl || 'assets/logo.png';
    var social = c.social || {};
    var token = c.token || {};
    var hero = c.hero || {};
    var tokenSymbol = (token.symbol || 'Token').toUpperCase();

    document.title = projectName + ' — NFT & Token';

    // Hero
    var heroTitle = document.getElementById('hero-title');
    if (heroTitle) heroTitle.textContent = hero.title || projectName;
    var heroSub = document.getElementById('hero-subtitle');
    if (heroSub) heroSub.textContent = hero.subtitle || hero.tagline || '';
    var heroDesc = document.getElementById('hero-description');
    if (heroDesc) heroDesc.textContent = hero.description || '';

    // Dashboard brand
    var dashTitle = document.querySelector('.dashboard__title');
    if (dashTitle) dashTitle.textContent = projectName;
    var dashLogos = document.querySelectorAll('.dashboard__logo-img, .footer__logo');
    dashLogos.forEach(function (img) { if (img && logoUrl) img.src = logoUrl; });
    var logoAlt = document.querySelector('.dashboard__logo-img');
    if (logoAlt) logoAlt.alt = projectName;

    // Token menu icon (nav only): coins icon
    var tokenMenuIcons = document.querySelectorAll('.dashboard__token-menu-icon, .dashboard-bottom__token-menu-icon');
    var tokenMenuIconUrl = token.menuIconUrl || token.logoUrl;
    tokenMenuIcons.forEach(function (img) { if (img && tokenMenuIconUrl) img.src = tokenMenuIconUrl; });
    // Token thumb (section title etc): project logo
    var tokenThumbs = document.querySelectorAll('.section__thumb, .panel__thumb');
    tokenThumbs.forEach(function (img) { if (img && token.logoUrl) img.src = token.logoUrl; });
    var tokenLabelText = token.menuLabel || tokenSymbol;
    var tokenLabels = document.querySelectorAll('[data-config="token-label"]');
    tokenLabels.forEach(function (el) { el.textContent = tokenLabelText; });

    // Social links (sticky + footer)
    var socialXEls = document.querySelectorAll('[data-config="social-x"], .footer__link-x');
    socialXEls.forEach(function (a) { if (social.x) a.href = social.x; });
    var socialDiscordEls = document.querySelectorAll('[data-config="social-discord"], .footer__link-discord');
    socialDiscordEls.forEach(function (a) { if (social.discord) a.href = social.discord; });

    // Token section
    var tokenPriceLabel = document.getElementById('tokenomics-price-label');
    if (tokenPriceLabel && token.priceLabel) tokenPriceLabel.textContent = token.priceLabel;
    var tokenChartLabel = document.getElementById('tokenomics-chart-label');
    if (tokenChartLabel) {
      var chartName = (token.name || token.symbol || 'Token').trim();
      tokenChartLabel.textContent = chartName + ' / USD';
    }
    var mint = (token.tokenMint || '').trim();
    if (mint) {
      var contractEl = document.getElementById('tokenomics-contract');
      if (contractEl) contractEl.textContent = mint;
      var solscan = document.getElementById('tokenomics-link-solscan');
      if (solscan) solscan.href = 'https://solscan.io/token/' + encodeURIComponent(mint);
      var dex = document.getElementById('tokenomics-link-dextools');
      var dexUrl = (token.dextoolsUrl || '').trim();
      if (dex && dexUrl) dex.href = dexUrl;
      var trade = document.getElementById('tokenomics-link-trade');
      var tradeUrl = (token.pumpFunUrl || 'https://pump.fun/coin/' + mint).trim();
      if (trade && tradeUrl) trade.href = tradeUrl;
    }
    var chartHint = document.getElementById('xma-chart-hint');
    if (chartHint) {
      var dexLink = (token.dextoolsUrl || '').trim();
      var tradeLink = (token.pumpFunUrl || (mint ? 'https://pump.fun/coin/' + mint : '')).trim();
      chartHint.innerHTML =
        '14-day price preview only. '
        + (dexLink ? '<a href="' + dexLink + '" target="_blank" rel="noopener">View full chart on DEXTools</a>' : 'View full chart on DEXTools')
        + (tradeLink ? ' · <a href="' + tradeLink + '" target="_blank" rel="noopener">Trade on pump.fun</a>' : '')
        + '.';
    }
    var rewardsCfg = c.xmaDiscordRewards || {};
    var claimHint = document.getElementById('xma-claim-hint');
    if (claimHint && rewardsCfg.claimThresholdXma != null) {
      var thNum = Number(rewardsCfg.claimThresholdXma);
      var thStr = isFinite(thNum) ? thNum.toLocaleString('en-US') : String(rewardsCfg.claimThresholdXma);
      claimHint.textContent =
        'Claimable balance settles nightly (~00:35 ET). Claim unlocks when unclaimed balance reaches ' + thStr + ' XMA or more.';
    }
    var engNote = document.getElementById('xma-engagement-note');
    if (engNote) {
      engNote.textContent =
        'Pending today is credited from engagement batches (~every 10 min). It becomes claimable after nightly settlement. Per-user cap: 100,000 XMA/day (ET). Messages need at least 10 characters; up to 5 qualifying per 15 minutes and 250 per 24 hours.';
    }

    // Optional shop link (sidebar)
    var shopUrl = c.shopUrl;
    var shopLink = document.querySelector('[data-config="shop-link"]');
    if (shopLink) {
      if (shopUrl) { shopLink.href = shopUrl; shopLink.style.display = ''; }
      else { shopLink.style.display = 'none'; }
    }

    // Footer
    var footerCopyText = document.getElementById('footer-copy-text');
    if (footerCopyText) footerCopyText.textContent = c.footerCopy || projectName;

    // Partners
    var partnersLead = document.getElementById('partners-lead');
    if (partnersLead) partnersLead.textContent = c.partnersLead || 'Partners.';
    var partnersPlaceholder = document.getElementById('partners-placeholder');
    if (partnersPlaceholder) partnersPlaceholder.textContent = c.partnersPlaceholder || 'Adding soon';

    // Royal Casino (external link in desktop + mobile menu)
    var royalCasinoUrl = (c.royalCasinoUrl || '').trim();
    var royalCasinoSide = document.getElementById('dashboard-link-royal-casino');
    var royalCasinoPanel = document.getElementById('panel-link-royal-casino');
    if (royalCasinoSide) {
      royalCasinoSide.href = royalCasinoUrl || '#';
      royalCasinoSide.style.display = royalCasinoUrl ? '' : 'none';
    }
    if (royalCasinoPanel) {
      royalCasinoPanel.href = royalCasinoUrl || '#';
      royalCasinoPanel.style.display = royalCasinoUrl ? '' : 'none';
    }
    var heroCasinoCta = document.getElementById('hero-casino-cta');
    if (heroCasinoCta) {
      heroCasinoCta.href = royalCasinoUrl || '#';
      heroCasinoCta.style.display = royalCasinoUrl ? '' : 'none';
    }

    var slottoUrl = (c.slottoUrl || '').trim();
    var slottoSide = document.getElementById('dashboard-link-slotto');
    var slottoPanel = document.getElementById('panel-link-slotto');
    if (slottoSide) {
      slottoSide.href = slottoUrl || '#';
      slottoSide.style.display = slottoUrl ? '' : 'none';
    }
    if (slottoPanel) {
      slottoPanel.href = slottoUrl || '#';
      slottoPanel.style.display = slottoUrl ? '' : 'none';
    }

    // Holders labels (sidebar + mobile panel key labels)
    var labels = c.holdingsLabels || {};
    ['token', 'totalNfts', 'nfts'].forEach(function (key) {
      if (!labels[key]) return;
      document.querySelectorAll('[data-holdings-key="' + key + '"]').forEach(function (el) {
        el.textContent = labels[key];
      });
    });
    var holdersLead = document.getElementById('holders-lead');
    if (holdersLead && c.holdersLead) holdersLead.textContent = c.holdersLead;
    var sortOpts = c.holdersSortOptions || {};
    ['total', 'nfts', 'token'].forEach(function (value) {
      var opt = document.querySelector('#holders-sort option[value="' + value + '"]');
      if (opt && sortOpts[value]) opt.textContent = sortOpts[value];
    });
    var thToken = document.querySelector('.holders-table th[data-col="token"]');
    if (thToken && (labels.token || sortOpts.token)) thToken.textContent = labels.token || sortOpts.token;
    var thNfts = document.querySelector('.holders-table th[data-col="nfts"]');
    if (thNfts && (labels.nfts || sortOpts.nfts)) thNfts.textContent = labels.nfts || sortOpts.nfts;

    updateXmaClaimButtonState();
  }
  applyProjectConfig();
  loadDiscordRewardsMetaPublic();

  window.XAPES_UI = window.XAPES_UI || {};
  window.XAPES_UI.setDiscordRewardsUnclaimedXma = function (amount) {
    var el = document.getElementById('xma-unclaimed-balance');
    if (!el) return;
    var s = String(amount != null ? amount : '0').trim().replace(/,/g, '');
    var n = parseFloat(s, 10);
    if (isFinite(n)) {
      el.textContent = n.toLocaleString('en-US', { maximumFractionDigits: 6 });
    } else {
      el.textContent = s || '0';
    }
    updateXmaClaimButtonState();
  };

  // ----- Section highlighting -----
  const navLinks = document.querySelectorAll('[data-section]');
  const sections = document.querySelectorAll('.section');
  var navScrollInProgress = false;
  var navScrollTargetId = null;

  function setActiveSection(sectionId) {
    navLinks.forEach(function (link) {
      const id = link.getAttribute('data-section');
      link.classList.toggle('dashboard__link--active', id === sectionId);
      link.classList.toggle('dashboard-bottom__item--active', id === sectionId);
    });
  }

  function getSectionIdFromHash() {
    const hash = window.location.hash.slice(1);
    return hash || 'home';
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    navScrollInProgress = true;
    navScrollTargetId = id;
    window.history.replaceState(null, '', '#' + id);
    setActiveSection(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (id === 'xma' && document.body.classList.contains('discord-connected')) {
      refreshDiscordRewardsPanel();
    }
    setTimeout(function () {
      navScrollInProgress = false;
      navScrollTargetId = null;
    }, 1200);
  }

  var fromLegacyBlunanaHash = window.location.hash === '#blunana';
  if (fromLegacyBlunanaHash) {
    window.history.replaceState(null, '', '#xma');
  }

  navLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      const sectionId = link.getAttribute('data-section');
      if (sectionId && link.getAttribute('href')?.startsWith('#')) {
        e.preventDefault();
        scrollToSection(sectionId);
      }
    });
  });

  window.addEventListener('hashchange', function () {
    if (!navScrollInProgress) setActiveSection(getSectionIdFromHash());
  });

  const observer = new IntersectionObserver(
    function (entries) {
      if (navScrollInProgress) return;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        if (id) {
          setActiveSection(id);
          if (window.location.hash !== '#' + id) {
            window.history.replaceState(null, '', '#' + id);
          }
        }
      });
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
  );
  sections.forEach(function (section) {
    if (section.id) observer.observe(section);
  });
  setActiveSection(getSectionIdFromHash());
  if (fromLegacyBlunanaHash) scrollToSection('xma');

  // ----- Wallet (Solana) -----
  function setBtnText(btn, text) {
    if (!btn) return;
    var textSpan = btn.querySelector('.btn__text');
    if (textSpan) textSpan.textContent = text;
    else btn.textContent = text;
  }

  function truncateWallet(addr) {
    if (!addr || addr.length < 10) return addr || 'Connected';
    return addr.slice(0, 4) + '…' + addr.slice(-4);
  }

  function walletPickerIconClass(name) {
    if (name === 'Phantom') return 'wallet-picker__icon--phantom';
    if (name === 'Solflare') return 'wallet-picker__icon--solflare';
    return 'wallet-picker__icon--generic';
  }

  function getDetectedWallets() {
    var list = [];
    if (window.phantom?.solana?.isPhantom) {
      list.push({ name: 'Phantom', provider: window.phantom.solana });
    }
    if (window.solflare?.isSolflare) {
      list.push({ name: 'Solflare', provider: window.solflare });
    }
    if (window.solana && !list.some(function (w) { return w.provider === window.solana; })) {
      var label = window.solana.isPhantom ? 'Phantom' : window.solana.isSolflare ? 'Solflare' : 'Solana';
      list.push({ name: label, provider: window.solana });
    }
    return list;
  }

  function getSolanaProvider() {
    var wallets = getDetectedWallets();
    var connected = wallets.filter(function (w) { return w.provider.publicKey; });
    if (connected.length) return connected[0].provider;
    if (wallets.length) return wallets[0].provider;
    return null;
  }

  function getWalletPublicKey() {
    var provider = getSolanaProvider();
    return provider && provider.publicKey ? provider.publicKey.toString() : null;
  }

  function isWalletConnected() {
    return !!getWalletPublicKey();
  }

  function setWalletConnected(connected) {
    document.body.classList.toggle('wallet-connected', connected);
    var pk = getWalletPublicKey();
    var walletLabel = pk ? truncateWallet(pk) : null;
    document.querySelectorAll('#btn-connect-wallet, #btn-connect-wallet-mobile').forEach(function (btn) {
      setBtnText(btn, walletLabel || btn.dataset.label || 'Connect');
    });
    if (typeof syncVerifyModalState === 'function') syncVerifyModalState();
  }

  function resetDiscordRewardsUI() {
    serverClaimThresholdXma = null;
    rewardsTreasuryConfigured = true;
    lastDiscordRewardsStatus = null;
    var dash = '—';
    var msgEl = document.getElementById('xma-eng-messages');
    var rEl = document.getElementById('xma-eng-reactions');
    var vEl = document.getElementById('xma-eng-voice');
    if (msgEl) msgEl.textContent = dash;
    if (rEl) rEl.textContent = dash;
    if (vEl) vEl.textContent = dash;
    var claimedEl = document.getElementById('xma-claimed-today');
    if (claimedEl) claimedEl.textContent = dash;
    var pendingEl = document.getElementById('xma-pending-today');
    if (pendingEl) pendingEl.textContent = dash;
    if (window.XAPES_UI && typeof window.XAPES_UI.setDiscordRewardsUnclaimedXma === 'function') {
      window.XAPES_UI.setDiscordRewardsUnclaimedXma(0);
    }
    updateXmaClaimButtonState();
  }

  function formatXmaDisplayAmount(raw) {
    if (raw == null || raw === '') return '0';
    var s = String(raw).trim().replace(/,/g, '');
    var n = parseFloat(s, 10);
    if (isFinite(n)) {
      return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
    }
    return String(raw);
  }

  /** Prefer server pendingTodayXma; else estimate from counts × rates. */
  function computeTodaysClaimDisplay(data) {
    if (!data || typeof data !== 'object') return '0';
    if (data.pendingTodayXma != null && String(data.pendingTodayXma).trim() !== '') {
      return formatXmaDisplayAmount(data.pendingTodayXma);
    }
    if (data.todaysClaimXma != null && String(data.todaysClaimXma).trim() !== '') {
      return formatXmaDisplayAmount(data.todaysClaimXma);
    }
    var r = data.accrualRates;
    if (!r || typeof r !== 'object') {
      var cfg = CONFIG.xmaDiscordRewards || {};
      r = {
        message: cfg.xmaPerQualifyingMessage,
        reaction: cfg.xmaPerReaction,
        voiceMinute: cfg.xmaPerVoiceMinute,
      };
    }
    var rm = Number(r.message);
    var rr = Number(r.reaction);
    var rv = Number(r.voiceMinute);
    var cap = Number(data.dailyAccrualCapXma);
    if (!isFinite(cap) || cap <= 0) {
      cap = Number((CONFIG.xmaDiscordRewards || {}).maxXmaAccrualPer24h);
      if (!isFinite(cap) || cap <= 0) cap = 100000;
    }
    if (isFinite(rm) && isFinite(rr) && isFinite(rv)) {
      var msgs = Math.max(
        0,
        Number(data.messagesToday != null ? data.messagesToday : data.messages24h) || 0
      );
      var reacts = Math.max(
        0,
        Number(data.reactionsToday != null ? data.reactionsToday : data.reactions24h) || 0
      );
      var vm = Math.max(
        0,
        Number(data.voiceMinutesToday != null ? data.voiceMinutesToday : data.voiceMinutes24h) || 0
      );
      var raw = rm * msgs + rr * reacts + rv * vm;
      if (!isFinite(raw) || raw < 0) raw = 0;
      var capped = Math.min(raw, cap);
      var trimmed = capped.toFixed(6).replace(/\.?0+$/, '');
      return formatXmaDisplayAmount(trimmed || '0');
    }
    var fallback = data.todaysClaimXma != null ? data.todaysClaimXma : data.claimedXmaToday;
    return fallback != null ? formatXmaDisplayAmount(fallback) : '0';
  }

  function computeTodaysEstimateDisplay(data) {
    if (!data || typeof data !== 'object') return '0';
    if (data.todaysClaimXma != null && String(data.todaysClaimXma).trim() !== '') {
      return formatXmaDisplayAmount(data.todaysClaimXma);
    }
    var r = data.accrualRates;
    if (!r || typeof r !== 'object') {
      var cfg = CONFIG.xmaDiscordRewards || {};
      r = {
        message: cfg.xmaPerQualifyingMessage,
        reaction: cfg.xmaPerReaction,
        voiceMinute: cfg.xmaPerVoiceMinute,
      };
    }
    var rm = Number(r.message);
    var rr = Number(r.reaction);
    var rv = Number(r.voiceMinute);
    var cap = Number(data.dailyAccrualCapXma);
    if (!isFinite(cap) || cap <= 0) {
      cap = Number((CONFIG.xmaDiscordRewards || {}).maxXmaAccrualPer24h);
      if (!isFinite(cap) || cap <= 0) cap = 100000;
    }
    if (isFinite(rm) && isFinite(rr) && isFinite(rv)) {
      var msgs = Math.max(
        0,
        Number(data.messagesToday != null ? data.messagesToday : data.messages24h) || 0
      );
      var reacts = Math.max(
        0,
        Number(data.reactionsToday != null ? data.reactionsToday : data.reactions24h) || 0
      );
      var vm = Math.max(
        0,
        Number(data.voiceMinutesToday != null ? data.voiceMinutesToday : data.voiceMinutes24h) || 0
      );
      var raw = rm * msgs + rr * reacts + rv * vm;
      if (!isFinite(raw) || raw < 0) raw = 0;
      var capped = Math.min(raw, cap);
      var trimmed = capped.toFixed(6).replace(/\.?0+$/, '');
      return formatXmaDisplayAmount(trimmed || '0');
    }
    return '0';
  }

  function refreshDiscordRewardsPanel() {
    if (!document.body.classList.contains('discord-connected')) return;
    fetch(window.location.origin + '/api/discord-rewards/status', { credentials: 'include' })
      .then(function (res) {
        if (res.status === 401) {
          resetDiscordRewardsUI();
          return null;
        }
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || typeof data !== 'object') return;
        lastDiscordRewardsStatus = data;
        if (typeof data.claimThresholdXma === 'number' && isFinite(data.claimThresholdXma)) {
          serverClaimThresholdXma = data.claimThresholdXma;
        }
        rewardsTreasuryConfigured = data.rewardsTreasuryConfigured !== false;
        var msgEl = document.getElementById('xma-eng-messages');
        var rEl = document.getElementById('xma-eng-reactions');
        var vEl = document.getElementById('xma-eng-voice');
        if (msgEl) {
          var mToday = data.messagesToday != null ? data.messagesToday : data.messages24h;
          msgEl.textContent = String(mToday != null ? mToday : '—');
        }
        if (rEl) {
          var rToday = data.reactionsToday != null ? data.reactionsToday : data.reactions24h;
          rEl.textContent = String(rToday != null ? rToday : '—');
        }
        if (vEl) {
          var vm = data.voiceMinutesToday != null ? data.voiceMinutesToday : data.voiceMinutes24h;
          vEl.textContent =
            vm != null && isFinite(Number(vm)) ? String(Number(Number(vm).toFixed(2))) : String(vm != null ? vm : '—');
        }
        applyDiscordRewardsMetaFields(data);
        var pendingTodayEl = document.getElementById('xma-pending-today');
        if (pendingTodayEl) {
          pendingTodayEl.textContent = computeTodaysClaimDisplay(data);
        }
        var claimedTodayEl = document.getElementById('xma-claimed-today');
        if (claimedTodayEl) {
          claimedTodayEl.textContent = computeTodaysEstimateDisplay(data);
        }
        var engNoteEl = document.getElementById('xma-engagement-note');
        if (engNoteEl) {
          engNoteEl.textContent =
            'Pending today is credited from engagement batches (~every 10 min). It becomes claimable after nightly settlement. Per-user cap: 100,000 XMA/day (ET). Messages need at least 10 characters; up to 5 qualifying per 15 minutes and 250 per 24 hours.';
        }
        if (window.XAPES_UI && typeof window.XAPES_UI.setDiscordRewardsUnclaimedXma === 'function') {
          window.XAPES_UI.setDiscordRewardsUnclaimedXma(data.unclaimedXma);
        }
        updateXmaClaimButtonState();
      })
      .catch(function () {});
  }

  function openLinkedWalletPicker(addresses) {
    return new Promise(function (resolve, reject) {
      if (!addresses || !addresses.length) {
        reject(new Error('No linked wallets'));
        return;
      }
      if (addresses.length === 1) {
        resolve(addresses[0]);
        return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'wallet-picker';
      wrap.setAttribute('aria-hidden', 'false');
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.innerHTML =
        '<div class="wallet-picker__backdrop" data-act="close"></div>' +
        '<div class="wallet-picker__box">' +
        '<div class="wallet-picker__head">' +
        '<h2 class="wallet-picker__title" id="xma-linked-wallet-title">Claim to linked wallet</h2>' +
        '<button type="button" class="wallet-picker__close" data-act="close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="wallet-picker__list" id="xma-linked-wallet-list"></div>' +
        '</div>';
      var list = wrap.querySelector('#xma-linked-wallet-list');
      function cleanup(result) {
        wrap.remove();
        if (result) resolve(result);
        else reject(new Error('Cancelled'));
      }
      wrap.addEventListener('click', function (ev) {
        if (ev.target.getAttribute('data-act') === 'close') cleanup(null);
      });
      addresses.forEach(function (addr) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wallet-picker__btn';
        btn.textContent = addr.length > 12 ? addr.slice(0, 6) + '…' + addr.slice(-6) : addr;
        btn.title = addr;
        btn.addEventListener('click', function () {
          cleanup(addr);
        });
        list.appendChild(btn);
      });
      document.body.appendChild(wrap);
    });
  }

  function postHolderLinkWallet() {
    if (!document.body.classList.contains('discord-connected')) return Promise.resolve();
    var w = getWalletPublicKey();
    if (!w) return Promise.resolve();
    return fetch(window.location.origin + '/api/holder-link-wallet', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: w }),
    })
      .then(function () {
        refreshDiscordRewardsPanel();
      })
      .catch(function () {});
  }

  function connectWithProvider(provider) {
    return provider.connect({ onlyIfTrusted: false })
      .then(function () {
        setWalletConnected(true);
        hideHoldings();
        postHolderLinkWallet();
      })
      .catch(function (err) {
        if (err.code !== 4001) console.warn('Wallet connect error', err);
        throw err;
      });
  }

  var walletPicker = document.getElementById('wallet-picker');
  var walletPickerBackdrop = document.getElementById('wallet-picker-backdrop');
  var walletPickerClose = document.getElementById('wallet-picker-close');
  var walletPickerList = document.getElementById('wallet-picker-list');

  function openWalletPicker() {
    if (!walletPicker || !walletPickerList) return Promise.reject();
    return new Promise(function (resolve, reject) {
      function showList(wallets) {
        if (!wallets.length) {
          alert('No Solana wallet extension detected. Install or enable Phantom, Solflare, or another Solana wallet in this browser.');
          reject(new Error('No provider'));
          return;
        }
        walletPickerList.innerHTML = '';
        wallets.forEach(function (w) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'wallet-picker__btn';
          btn.innerHTML =
            '<span class="wallet-picker__icon ' + walletPickerIconClass(w.name) + '" aria-hidden="true"></span>' +
            '<span class="wallet-picker__name">' + w.name + '</span>';
          btn.addEventListener('click', function () {
            closeWalletPicker();
            connectWithProvider(w.provider)
              .then(function () {
                if (walletPicker._resolve) walletPicker._resolve();
                walletPicker._resolve = null;
              })
              .catch(function () {});
          });
          walletPickerList.appendChild(btn);
        });
        walletPicker.setAttribute('aria-hidden', 'false');
        walletPicker._resolve = resolve;
      }
      setTimeout(function () {
        var wallets = getDetectedWallets();
        showList(wallets);
      }, 120);
    });
  }

  function closeWalletPicker() {
    if (walletPicker) walletPicker.setAttribute('aria-hidden', 'true');
    if (walletPicker && walletPicker._resolve) {
      walletPicker._resolve();
      walletPicker._resolve = null;
    }
  }

  function connectWallet() {
    return openWalletPicker();
  }

  (function initWalletListener() {
    getDetectedWallets().forEach(function (w) {
      if (w.provider && typeof w.provider.on === 'function') {
        w.provider.on('accountChanged', function (pk) {
          if (pk) {
            setWalletConnected(true);
            postHolderLinkWallet();
          } else setWalletConnected(false);
          hideHoldings();
        });
      }
    });
    if (getWalletPublicKey()) setWalletConnected(true);
  })();

  document.getElementById('btn-connect-wallet')?.addEventListener('click', connectWallet);
  document.getElementById('btn-connect-wallet-mobile')?.addEventListener('click', connectWallet);
  walletPickerBackdrop?.addEventListener('click', closeWalletPicker);
  walletPickerClose?.addEventListener('click', closeWalletPicker);

  // ----- Holdings UI -----
  const holdingsPanels = document.querySelectorAll('.holdings');

  function showHoldings(data) {
    var blunana = data && data.blunanaFormatted != null ? data.blunanaFormatted : (data && data.blunana != null ? String(data.blunana) : '—');
    var totalNfts = data && data.totalNfts != null ? String(data.totalNfts) : '—';
    [
      [document.getElementById('holdings-xma'), document.getElementById('holdings-xma-mobile')],
      [document.getElementById('holdings-total-nfts'), document.getElementById('holdings-total-nfts-mobile')],
    ].forEach(function (pair, i) {
      var val = [blunana, totalNfts][i];
      if (pair[0]) pair[0].textContent = val;
      if (pair[1]) pair[1].textContent = val;
    });
    holdingsPanels.forEach(function (panel) {
      panel.classList.remove('holdings--hidden');
      panel.classList.add('holdings--visible');
    });
  }

  function hideHoldings() {
    holdingsPanels.forEach(function (panel) {
      panel.classList.add('holdings--hidden');
      panel.classList.remove('holdings--visible');
    });
  }

  function setVerifyLoading(loading) {
    var btns = document.querySelectorAll('#btn-verify, #btn-verify-panel, #hero-verify-cta, #verify-modal-btn-verify');
    btns.forEach(function (btn) {
      if (!btn) return;
      btn.disabled = loading;
      var defaultLabel = btn.dataset.label || 'Verify holdings';
      setBtnText(btn, loading ? 'Checking…' : defaultLabel);
    });
  }

  function fetchVerifyHoldings(walletAddress) {
    var url = window.location.origin + '/api/verify?wallet=' + encodeURIComponent(walletAddress);
    return fetch(url, { credentials: 'include' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data) return data;
        if (HOLDINGS_ENDPOINT) {
          var portalUrl = HOLDINGS_ENDPOINT + (HOLDINGS_ENDPOINT.indexOf('?') >= 0 ? '&' : '?') + 'wallet=' + encodeURIComponent(walletAddress);
          return fetch(portalUrl, { method: 'GET', credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
              if (!d) return null;
              return {
                blunanaFormatted: d.token != null ? String(d.token) : '0',
                mutantApesCount: 0,
                mnk3ysCount: 0,
                zmb3ysCount: 0,
                totalNfts: d.nfts != null ? d.nfts : 0,
              };
            });
        }
        return null;
      });
  }

  function isDiscordConnected() {
    return document.body.classList.contains('discord-connected');
  }

  function verifyWithRoles(walletAddress) {
    return fetch(window.location.origin + '/api/holder-verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: walletAddress }),
    }).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  /** Fallback labels if API omits rolesAddedNamed (matches seed_discord_roles_xapes.sql). */
  var DISCORD_ROLE_ID_LABELS = {
    '1377593419723046952': 'Xape Holder',
    '1380162518072164383': 'Xape God',
    '1388338739297648640': 'Mutant',
    '1456871093351747604': 'Royal Family',
    '1463993881392709693': 'Cowboy DAO',
    '1491281476367552642': 'Burn Squad',
    '1457517122581168252': '$XMA holder',
    '1457516956985852017': '$XMA whale',
  };

  function roleLabelForDiscordId(id) {
    var s = String(id);
    return DISCORD_ROLE_ID_LABELS[s] || 'Discord role';
  }

  function doVerify(onComplete) {
    var wallet = getWalletPublicKey();
    if (!wallet) return;
    setVerifyLoading(true);

    function finish(dataForHoldings, modalPayload, sessionVerified) {
      setVerifyLoading(false);
      showHoldings(dataForHoldings || {});
      if (sessionVerified) setVerifySuccessInModal();
      if (typeof onComplete === 'function') onComplete(modalPayload || {});
    }

    verifyWithRoles(wallet)
      .then(function (result) {
        if (result.ok && result.body && !result.body.error) {
          var body = result.body;
          finish(body, body, body.rolesSynced === true);
          return;
        }
        if (result.body && result.body.error && result.status === 401) {
          finish(
            {},
            { error: true, message: result.body.error || 'Discord login required.', rolesSynced: false },
            false
          );
          return;
        }
        return fetchVerifyHoldings(wallet).then(function (data) {
          finish(
            data || {},
            Object.assign(
              { rolesSynced: false, message: 'Verify service returned an error. Holdings were updated if possible.' },
              data || {}
            ),
            false
          );
        });
      })
      .catch(function (err) {
        console.warn('Verify failed', err);
        return fetchVerifyHoldings(wallet)
          .then(function (data) {
            finish(
              data || {},
              Object.assign(
                { rolesSynced: false, message: 'Network error. Holdings were updated if possible.' },
                data || {}
              ),
              false
            );
          })
          .catch(function () {
            finish({}, { rolesSynced: false, message: 'Could not load holdings. Try again.' }, false);
          });
      });
  }

  // ----- Verify modal (3 steps) -----
  var verifyModal = document.getElementById('verify-modal');
  var verifyModalBackdrop = document.getElementById('verify-modal-backdrop');
  var verifyModalClose = document.getElementById('verify-modal-close');
  var verifyModalBtnDiscord = document.getElementById('verify-modal-btn-discord');
  var verifyModalDiscordConnected = document.getElementById('verify-modal-discord-connected');
  var verifyModalDiscordAvatar = document.getElementById('verify-modal-discord-avatar');
  var verifyModalDiscordUsername = document.getElementById('verify-modal-discord-username');
  var verifyModalBtnWallet = document.getElementById('verify-modal-btn-wallet');
  var verifyModalWalletConnected = document.getElementById('verify-modal-wallet-connected');
  var verifyModalWalletAddress = document.getElementById('verify-modal-wallet-address');
  var verifyModalBtnVerify = document.getElementById('verify-modal-btn-verify');
  var verifyModalSuccess = document.getElementById('verify-modal-success');
  var heroVerifyActions = document.getElementById('hero-verify-actions');
  var hasVerifiedThisSession = false;

  var verifyResultModal = document.getElementById('verify-result-modal');
  var verifyResultModalBackdrop = document.getElementById('verify-result-modal-backdrop');
  var verifyResultModalClose = document.getElementById('verify-result-modal-close');
  var verifyResultModalOk = document.getElementById('verify-result-modal-ok');

  function closeVerifyResultModal() {
    if (verifyResultModal) verifyResultModal.setAttribute('aria-hidden', 'true');
  }

  function showVerifyResultModal(d) {
    if (!verifyResultModal) return;
    var titleEl = document.getElementById('verify-result-modal-title');
    var statusEl = document.getElementById('verify-result-modal-status');
    var msgEl = document.getElementById('verify-result-modal-message');
    var rolesBlock = document.getElementById('verify-result-roles-block');
    var addedWrap = document.getElementById('verify-result-added-wrap');
    var removedWrap = document.getElementById('verify-result-removed-wrap');
    var addedList = document.getElementById('verify-result-added-list');
    var removedList = document.getElementById('verify-result-removed-list');

    var authErr = !!(d && d.error);
    var notInGuild = !!(d && d.notInGuild);
    var msg = d && d.message ? String(d.message) : '';
    var discordFail = msg.indexOf('Could not reach Discord') >= 0;
    var skipRoles =
      msg.indexOf('not configured') >= 0 ||
      msg.indexOf('No active role') >= 0 ||
      msg.indexOf('Could not load role rules') >= 0;
    var rolesSynced = !!(d && d.rolesSynced);

    var addedNamed = (d && d.rolesAddedNamed) || [];
    var removedNamed = (d && d.rolesRemovedNamed) || [];
    if ((!addedNamed || !addedNamed.length) && d && d.rolesAdded && d.rolesAdded.length) {
      addedNamed = d.rolesAdded.map(function (id) {
        return { id: id, name: roleLabelForDiscordId(id) };
      });
    }
    if ((!removedNamed || !removedNamed.length) && d && d.rolesRemoved && d.rolesRemoved.length) {
      removedNamed = d.rolesRemoved.map(function (id) {
        return { id: id, name: roleLabelForDiscordId(id) };
      });
    }

    var hasDelta = addedNamed.length > 0 || removedNamed.length > 0;

    if (titleEl) {
      if (authErr) titleEl.textContent = 'Sign in required';
      else if (notInGuild || discordFail) titleEl.textContent = 'Verification incomplete';
      else if (skipRoles) titleEl.textContent = 'Holdings updated';
      else if (rolesSynced) titleEl.textContent = 'Verification successful';
      else titleEl.textContent = 'Verification';
    }

    if (statusEl) {
      statusEl.className = 'verify-result-modal__status';
      if (authErr) {
        statusEl.classList.add('verify-result-modal__status--error');
        statusEl.textContent = 'Discord is not connected.';
      } else if (notInGuild) {
        statusEl.classList.add('verify-result-modal__status--warning');
        statusEl.textContent = 'Join the Discord server to sync roles.';
      } else if (discordFail) {
        statusEl.classList.add('verify-result-modal__status--warning');
        statusEl.textContent = 'Could not reach Discord to update roles.';
      } else if (skipRoles) {
        statusEl.classList.add('verify-result-modal__status--info');
        statusEl.textContent = 'Wallet linked; role sync was skipped.';
      } else if (rolesSynced) {
        statusEl.classList.add('verify-result-modal__status--success');
        statusEl.textContent = hasDelta ? 'Your Discord roles were updated.' : 'Your Discord roles are already up to date.';
      } else {
        statusEl.classList.add('verify-result-modal__status--info');
        statusEl.textContent = msg || 'Verification finished.';
      }
    }

    if (msgEl) {
      if (authErr) {
        msgEl.hidden = false;
        msgEl.textContent = d.message || 'Connect Discord first, then verify again.';
      } else if (msg && (notInGuild || discordFail || skipRoles)) {
        msgEl.hidden = false;
        msgEl.textContent = msg;
      } else if (msg && !rolesSynced && !hasDelta) {
        msgEl.hidden = false;
        msgEl.textContent = msg;
      } else {
        msgEl.hidden = true;
        msgEl.textContent = '';
      }
    }

    var showRoles = rolesSynced && !notInGuild && !discordFail && !authErr && hasDelta;
    if (rolesBlock) rolesBlock.hidden = !showRoles;
    if (addedWrap && addedList) {
      var showAdded = showRoles && addedNamed.length > 0;
      addedWrap.hidden = !showAdded;
      addedList.innerHTML = showAdded
        ? addedNamed
            .map(function (x) {
              return '<li>' + escapeHtml(x.name || roleLabelForDiscordId(x.id)) + '</li>';
            })
            .join('')
        : '';
    }
    if (removedWrap && removedList) {
      var showRemoved = showRoles && removedNamed.length > 0;
      removedWrap.hidden = !showRemoved;
      removedList.innerHTML = showRemoved
        ? removedNamed
            .map(function (x) {
              return '<li>' + escapeHtml(x.name || roleLabelForDiscordId(x.id)) + '</li>';
            })
            .join('')
        : '';
    }

    verifyResultModal.setAttribute('aria-hidden', 'false');
  }

  function openVerifyModal() {
    if (!verifyModal) return;
    closeVerifyResultModal();
    verifyModal.setAttribute('aria-hidden', 'false');
    syncVerifyModalState();
  }

  function closeVerifyModal() {
    if (verifyModal) verifyModal.setAttribute('aria-hidden', 'true');
  }

  function getDiscordAvatarUrl(user) {
    if (!user || !user.id) return '';
    if (user.avatar) {
      var ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
      return 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.' + ext;
    }
    return 'https://cdn.discordapp.com/embed/avatars/' + (parseInt(user.discriminator, 10) % 5) + '.png';
  }

  function syncVerifyModalState() {
    var discordOk = isDiscordConnected();
    var walletOk = !!getWalletPublicKey();

    if (verifyModalBtnDiscord) {
      verifyModalBtnDiscord.hidden = !!discordOk;
      verifyModalBtnDiscord.disabled = false;
    }
    if (verifyModalDiscordConnected) {
      verifyModalDiscordConnected.hidden = !discordOk;
      if (discordOk && discordUser) {
        if (verifyModalDiscordAvatar) {
          verifyModalDiscordAvatar.src = getDiscordAvatarUrl(discordUser);
          verifyModalDiscordAvatar.alt = (discordUser.global_name || discordUser.username) || 'Discord';
        }
        if (verifyModalDiscordUsername) {
          verifyModalDiscordUsername.textContent = discordUser.global_name || discordUser.username || 'Connected';
        }
      }
    }

    if (verifyModalBtnWallet) {
      verifyModalBtnWallet.disabled = !discordOk;
      verifyModalBtnWallet.hidden = !!walletOk;
    }
    if (verifyModalWalletConnected) {
      verifyModalWalletConnected.hidden = !walletOk;
      if (walletOk && verifyModalWalletAddress) {
        var addr = getWalletPublicKey();
        verifyModalWalletAddress.textContent = addr ? (addr.slice(0, 4) + '…' + addr.slice(-4)) : '';
      }
    }

    if (verifyModalBtnVerify) {
      verifyModalBtnVerify.disabled = !discordOk || !walletOk;
      verifyModalBtnVerify.hidden = hasVerifiedThisSession;
    }
    if (verifyModalSuccess) {
      verifyModalSuccess.hidden = !hasVerifiedThisSession;
    }
    if (heroVerifyActions) {
      heroVerifyActions.classList.toggle('hero-home__actions--verified', hasVerifiedThisSession);
    }
  }

  function setVerifySuccessInModal() {
    hasVerifiedThisSession = true;
    if (heroVerifyActions) heroVerifyActions.classList.add('hero-home__actions--verified');
    if (verifyModalBtnVerify) verifyModalBtnVerify.hidden = true;
    if (verifyModalSuccess) verifyModalSuccess.hidden = false;
  }

  document.getElementById('btn-verify')?.addEventListener('click', openVerifyModal);
  document.getElementById('btn-verify-panel')?.addEventListener('click', function () {
    closeMobilePanel();
    openVerifyModal();
  });
  document.getElementById('hero-verify-cta')?.addEventListener('click', function () {
    if (window.innerWidth < 900) openMobilePanel();
    openVerifyModal();
  });

  if (verifyModalBackdrop) verifyModalBackdrop.addEventListener('click', closeVerifyModal);
  if (verifyModalClose) verifyModalClose.addEventListener('click', closeVerifyModal);

  if (verifyModalBtnDiscord) {
    verifyModalBtnDiscord.addEventListener('click', function () {
      window.location.href = getDiscordAuthUrl();
    });
  }

  if (verifyModalBtnWallet) {
    verifyModalBtnWallet.addEventListener('click', function () {
      if (verifyModalBtnWallet.disabled) return;
      connectWallet().then(syncVerifyModalState).catch(function () {});
    });
  }

  if (verifyModalBtnVerify) {
    verifyModalBtnVerify.addEventListener('click', function () {
      if (verifyModalBtnVerify.disabled) return;
      doVerify(function (d) {
        showVerifyResultModal(d);
      });
    });
  }

  if (verifyResultModalBackdrop) verifyResultModalBackdrop.addEventListener('click', closeVerifyResultModal);
  if (verifyResultModalClose) verifyResultModalClose.addEventListener('click', closeVerifyResultModal);
  if (verifyResultModalOk) verifyResultModalOk.addEventListener('click', closeVerifyResultModal);

  // ----- Discord login -----
  var discordUser = null;

  function getDiscordAuthUrl() {
    if (CONFIG.discordConnectUrl && (CONFIG.discordConnectUrl.startsWith('http://') || CONFIG.discordConnectUrl.startsWith('https://'))) {
      return CONFIG.discordConnectUrl;
    }
    return window.location.origin + '/api/discord/auth';
  }

  function setDiscordUI(connected, userOrUsername) {
    if (!connected) {
      resetDiscordRewardsUI();
    }
    document.body.classList.toggle('discord-connected', !!connected);
    if (connected && userOrUsername != null) {
      discordUser = typeof userOrUsername === 'object' ? userOrUsername : { global_name: userOrUsername, username: userOrUsername };
    } else {
      discordUser = null;
    }
    var name = discordUser && (discordUser.global_name || discordUser.username);
    var btnSidebar = document.getElementById('btn-connect-discord');
    var btnMobile = document.getElementById('btn-connect-discord-mobile');
    var wrapSidebar = document.getElementById('discord-connected-sidebar');
    var wrapMobile = document.getElementById('discord-connected-mobile');
    if (btnSidebar) {
      btnSidebar.hidden = !!connected;
      setBtnText(btnSidebar, btnSidebar.dataset.label || 'Login');
      btnSidebar.title = 'Login with Discord';
      btnSidebar.dataset.discordConnected = connected ? '1' : '0';
    }
    if (btnMobile) {
      btnMobile.hidden = !!connected;
      setBtnText(btnMobile, btnMobile.dataset.label || 'Login');
      btnMobile.title = 'Login with Discord';
      btnMobile.dataset.discordConnected = connected ? '1' : '0';
    }
    if (wrapSidebar) {
      wrapSidebar.hidden = !connected;
      if (connected && discordUser) {
        var avSidebar = document.getElementById('discord-avatar-sidebar');
        var nameSidebar = document.getElementById('discord-username-sidebar');
        if (avSidebar) avSidebar.src = getDiscordAvatarUrl(discordUser);
        if (avSidebar) avSidebar.alt = name || 'Discord';
        if (nameSidebar) nameSidebar.textContent = name || 'Connected';
      }
    }
    if (wrapMobile) {
      wrapMobile.hidden = !connected;
      if (connected && discordUser) {
        var avMobile = document.getElementById('discord-avatar-mobile');
        var nameMobile = document.getElementById('discord-username-mobile');
        if (avMobile) avMobile.src = getDiscordAvatarUrl(discordUser);
        if (avMobile) avMobile.alt = name || 'Discord';
        if (nameMobile) nameMobile.textContent = name || 'Connected';
      }
    }
    syncVerifyModalState();
  }

  function fetchDiscordMe() {
    return fetch(window.location.origin + '/api/discord/me', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data && data.connected && data.user) {
          setDiscordUI(true, data.user);
          postHolderLinkWallet();
          refreshDiscordRewardsPanel();
          return data.user;
        }
        setDiscordUI(false);
        return null;
      })
      .catch(function () {
        setDiscordUI(false);
        return null;
      });
  }

  function connectDiscord() {
    if (document.body.classList.contains('discord-connected')) {
      logoutDiscord();
      return;
    }
    window.location.href = getDiscordAuthUrl();
  }

  function logoutDiscord() {
    fetch(window.location.origin + '/api/discord/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function () {
        setDiscordUI(false);
      })
      .catch(function () {
        setDiscordUI(false);
      });
  }

  document.getElementById('btn-connect-discord')?.addEventListener('click', function (e) {
    e.preventDefault();
    if (document.body.classList.contains('discord-connected')) logoutDiscord();
    else window.location.href = getDiscordAuthUrl();
  });
  document.getElementById('btn-connect-discord-mobile')?.addEventListener('click', function (e) {
    e.preventDefault();
    if (document.body.classList.contains('discord-connected')) logoutDiscord();
    else window.location.href = getDiscordAuthUrl();
  });
  document.getElementById('btn-discord-logout-sidebar')?.addEventListener('click', function (e) {
    e.preventDefault();
    logoutDiscord();
  });
  document.getElementById('btn-discord-logout-mobile')?.addEventListener('click', function (e) {
    e.preventDefault();
    logoutDiscord();
  });

  document.getElementById('xma-claim-btn')?.addEventListener('click', function () {
    if (!document.body.classList.contains('discord-connected')) {
      alert('Connect Discord first.');
      return;
    }
    var st = lastDiscordRewardsStatus;
    if (!st) {
      refreshDiscordRewardsPanel();
      alert('Loading rewards data — try again in a moment.');
      return;
    }
    if (!Array.isArray(st.linkedWallets) || !st.linkedWallets.length) {
      alert('Link a Solana wallet while Discord is connected, then try again.');
      return;
    }
    if (!st.rewardsTreasuryConfigured) {
      alert('Claims are not available yet — rewards treasury is not configured.');
      return;
    }
    openLinkedWalletPicker(st.linkedWallets)
      .then(function (addr) {
        return fetch(window.location.origin + '/api/discord-rewards/claim', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: addr }),
        }).then(function (res) {
          return res.json().catch(function () {
            return { error: res.statusText || 'Invalid response' };
          }).then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        });
      })
      .then(function (out) {
        if (!out || !out.body) return;
        if (!out.ok) {
          alert(out.body.error || 'Claim failed (' + out.status + ')');
          return;
        }
        var sig = out.body.signature;
        var msg = 'XMA sent to your wallet.';
        if (sig) msg += '\n\nSignature:\n' + sig;
        alert(msg);
        refreshDiscordRewardsPanel();
      })
      .catch(function (e) {
        if (e && e.message === 'Cancelled') return;
        console.warn('Claim error', e);
      });
  });

  // On load: check Discord session and ?discord= query; reopen verify modal when returning from Discord
  (function onLoadDiscordAndModal() {
    var params = new URLSearchParams(window.location.search);
    var discordParam = params.get('discord');
    if (discordParam === 'connected') {
      openVerifyModal();
    }
    function done() {
      if (discordParam === 'connected' || discordParam === 'error') {
        var cleanUrl = window.location.pathname + (window.location.hash || '') || '/';
        window.history.replaceState(null, '', cleanUrl);
      }
    }
    fetchDiscordMe().then(function (user) {
      if (discordParam === 'connected' && !user) {
        setTimeout(function () {
          fetchDiscordMe().then(done);
        }, 600);
        return;
      }
      done();
    }).catch(done);
  })();

  // ----- Mobile panel -----
  var mobilePanel = document.getElementById('mobile-panel');
  var panelHandle = document.getElementById('panel-handle');

  function openMobilePanel() {
    if (window.innerWidth >= BREAKPOINT) return;
    if (mobilePanel) {
      mobilePanel.classList.remove('panel--hidden');
      mobilePanel.setAttribute('aria-hidden', 'false');
    }
  }

  function closeMobilePanel() {
    if (mobilePanel) {
      mobilePanel.classList.add('panel--hidden');
      mobilePanel.setAttribute('aria-hidden', 'true');
    }
  }

  panelHandle?.addEventListener('click', function () {
    if (mobilePanel?.classList.contains('panel--hidden')) openMobilePanel();
    else closeMobilePanel();
  });

  document.getElementById('btn-more-mobile')?.addEventListener('click', function () {
    if (mobilePanel?.classList.contains('panel--hidden')) openMobilePanel();
    else closeMobilePanel();
  });

  // Close panel when a "more" menu link is clicked (section nav still handled by [data-section] links)
  mobilePanel?.querySelectorAll('.panel__link').forEach(function (link) {
    link.addEventListener('click', closeMobilePanel);
  });

  // ----- Collections API (shared cache for grid + holders) -----
  var collectionsDataPromise = null;
  function fetchCollectionsData() {
    if (!collectionsDataPromise) {
      collectionsDataPromise = fetch(window.location.origin + '/api/collections', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return collectionsDataPromise;
  }

  // ----- Collections embeds (from /api/collections) -----
  var grid = document.getElementById('collections-grid');
  if (grid) {
    fetchCollectionsData()
      .then(function (data) {
        if (!data || !data.collections || !data.collections.length) return;
        grid.innerHTML = '';
        data.collections.forEach(function (c) {
          var card = document.createElement('div');
          card.className = 'card card--nft card--embed';
          var mediaHtml = '';
          var mediaSrc = c.animationUrl || c.image;
          if (mediaSrc) {
            var isGif = /\.gif(\?|$)/i.test(mediaSrc) || (c.animationUrl && !c.image);
            var imgFallback = 'assets/logo.png';
            var imgOnError = ' onerror="this.onerror=null;this.src=\'' + imgFallback + '\'"';
            if (isGif || c.animationUrl) {
              mediaHtml = '<div class="embed__media embed__media--video"><img src="' + escapeHtml(mediaSrc) + '" alt="" loading="lazy"' + imgOnError + ' /></div>';
            } else {
              mediaHtml = '<div class="embed__media"><img src="' + escapeHtml(mediaSrc) + '" alt="" loading="lazy"' + imgOnError + ' /></div>';
            }
          } else {
            mediaHtml = '<div class="embed__media"><img src="assets/logo.png" alt="" loading="lazy" /></div>';
          }
          var desc = (c.description || '').slice(0, 280);
          if ((c.description || '').length > 280) desc += '…';
          var stats = [];
          // Hide obviously wrong supply values (like 1) until upstream APIs return real totals
          if (c.supply != null && Number(c.supply) > 1) stats.push({ label: 'Supply', value: formatNum(c.supply) });
          if (c.listedCount != null) stats.push({ label: 'Listed', value: formatNum(c.listedCount) });
          if (c.floorPriceSol != null) stats.push({ label: 'Floor', value: c.floorPriceSol + ' SOL' });
          if (c.volumeAllSol != null) stats.push({ label: 'Volume', value: c.volumeAllSol + ' SOL' });
          if (c.avgPrice24hrSol != null) stats.push({ label: '24h avg', value: c.avgPrice24hrSol + ' SOL' });
          var statsHtml = stats.length ? '<div class="embed__stats">' + stats.map(function (s) {
            return '<div class="embed__stat"><span class="embed__stat-label">' + escapeHtml(s.label) + '</span><span class="embed__stat-value">' + escapeHtml(s.value) + '</span></div>';
          }).join('') + '</div>' : '';
          var meUrl = c.marketplaceUrl || ('https://magiceden.io/marketplace/' + encodeURIComponent(c.symbol || ''));
          var tensorUrl = c.tensorUrl || ('https://www.tensor.trade/trade/' + encodeURIComponent(c.symbol || ''));
          card.innerHTML =
            mediaHtml +
            '<div class="embed__body">' +
              '<h3 class="card__title">' + escapeHtml(c.name || c.symbol) + '</h3>' +
              (desc ? '<p class="card__text">' + escapeHtml(desc) + '</p>' : '') +
              statsHtml +
              '<div class="collections__actions">' +
                '<a href="' + escapeHtml(meUrl) + '" class="collections__btn" target="_blank" rel="noopener" aria-label="Trade on Magic Eden">' +
                  '<img src="assets/magic-eden.png" alt="Magic Eden" class="collections__btn-img collections__btn-img--me" loading="lazy" />' +
                '</a>' +
                '<a href="' + escapeHtml(tensorUrl) + '" class="collections__btn" target="_blank" rel="noopener" aria-label="Trade on Tensor">' +
                  '<img src="assets/tensor.png" alt="Tensor" class="collections__btn-img" loading="lazy" />' +
                '</a>' +
              '</div>' +
            '</div>';
          grid.appendChild(card);
        });
      })
      .catch(function () {});
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  function formatNum(n) {
    if (n == null) return '—';
    if (typeof n !== 'number') return String(n);
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  function discordAvatarUrlFromUser(u) {
    if (!u || !u.id) return '';
    if (u.avatar) {
      var ext = u.avatar.startsWith('a_') ? 'gif' : 'png';
      return 'https://cdn.discordapp.com/avatars/' + u.id + '/' + u.avatar + '.' + ext;
    }
    return 'https://cdn.discordapp.com/embed/avatars/' + (parseInt(u.discriminator, 10) % 5 || 0) + '.png';
  }

  function xHandleFromUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      var u = new URL(url.indexOf('://') >= 0 ? url : 'https://' + url);
      var path = u.pathname.replace(/^\/+|\/+$/g, '');
      var parts = path.split('/');
      var handle = parts[parts.length - 1];
      return handle ? '@' + handle : '';
    } catch (_) { return ''; }
  }

  // ----- Team (from XAPES_CONFIG.team: xProfileUrl, discordId, description) -----
  var teamGrid = document.getElementById('team-grid');
  if (teamGrid && window.XAPES_CONFIG && Array.isArray(window.XAPES_CONFIG.team) && window.XAPES_CONFIG.team.length > 0) {
    var teamList = window.XAPES_CONFIG.team;
    teamGrid.innerHTML = '';
    teamList.forEach(function (member) {
      var xUrl = member.xProfileUrl || '';
      var discordId = member.discordId || '';
      var description = member.description || '';
      var card = document.createElement('div');
      card.className = 'card card--team';
      var title = '';
      var avatarSrc = '';
      var fetchPromise = discordId
        ? fetch(window.location.origin + '/api/discord/user/' + encodeURIComponent(discordId), { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (u) {
              if (u) {
                title = u.global_name || u.username || '';
                avatarSrc = discordAvatarUrlFromUser(u);
              }
            })
            .catch(function () {})
        : Promise.resolve();
      fetchPromise.then(function () {
        if (!title) title = xHandleFromUrl(xUrl) || 'Team';
        if (!avatarSrc) avatarSrc = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23666" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>');
        var linkAttrs = xUrl ? ' href="' + escapeHtml(xUrl) + '" target="_blank" rel="noopener"' : '';
        var handleDisplay = xHandleFromUrl(xUrl);
        card.innerHTML =
          '<div class="card__avatar-wrap">' +
            '<img class="card__avatar card__avatar--img" src="' + escapeHtml(avatarSrc) + '" alt="" loading="lazy" />' +
          '</div>' +
          '<h3 class="card__title">' + escapeHtml(title) + '</h3>' +
          (handleDisplay ? '<p class="card__meta card__meta--handle"><a class="link link--external" href="' + escapeHtml(xUrl) + '" target="_blank" rel="noopener">' + escapeHtml(handleDisplay) + '</a></p>' : '') +
          (description ? '<p class="card__text">' + escapeHtml(description) + '</p>' : '');
        if (xUrl && !handleDisplay) {
          var titleEl = card.querySelector('.card__title');
          if (titleEl) {
            var wrap = document.createElement('a');
            wrap.href = xUrl;
            wrap.target = '_blank';
            wrap.rel = 'noopener';
            wrap.className = 'link link--external';
            wrap.textContent = titleEl.textContent;
            titleEl.textContent = '';
            titleEl.appendChild(wrap);
          }
        }
      });
      teamGrid.appendChild(card);
    });
  }

  // ----- Holders table (with live $ value from /api/prices) -----
  var holdersTbody = document.getElementById('holders-tbody');
  var holdersSortSelect = document.getElementById('holders-sort');
  if (holdersTbody && holdersSortSelect) {
    function formatUsd(n) {
      if (n == null || isNaN(n)) return '—';
      if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
      if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
      if (n >= 1) return '$' + n.toFixed(2);
      if (n >= 0.01) return '$' + n.toFixed(2);
      return '$' + n.toFixed(4);
    }
    function getKnownHolderAccount(wallet) {
      var accounts = (CONFIG && CONFIG.knownHolderAccounts) || [];
      var w = String(wallet || '');
      for (var i = 0; i < accounts.length; i++) {
        var acc = accounts[i];
        if (acc.wallet && acc.wallet === w) return acc;
        if (
          acc.walletPrefix &&
          w.slice(0, acc.walletPrefix.length).toLowerCase() === String(acc.walletPrefix).toLowerCase()
        ) {
          return acc;
        }
      }
      return null;
    }
    function renderHoldersTable(data, prices, collectionsData, sort) {
        var blunanaUsd = prices.blunanaUsd;
        var solUsd = prices.solUsd;
        var floorByIndex = [];
        if (data && data.floorPriceSol != null) {
          floorByIndex[0] = parseFloat(String(data.floorPriceSol));
        }
        if (collectionsData && collectionsData.collections && Array.isArray(collectionsData.collections)) {
          collectionsData.collections.forEach(function (c, idx) {
            if (c.floorPriceSol != null) floorByIndex[idx] = parseFloat(String(c.floorPriceSol));
          });
        }
        var floorFirstColSol = floorByIndex[0] != null ? floorByIndex[0] : null;
        var floorZmb3ysSol = floorByIndex[1] != null ? floorByIndex[1] : null;
        var solUsdNum = solUsd != null ? Number(solUsd) : null;
        var blunanaUsdNum = blunanaUsd != null ? Number(blunanaUsd) : null;
        if (!data || !data.holders) {
          holdersTbody.innerHTML = '<tr><td colspan="5" class="holders-empty">No data</td></tr>';
          return;
        }
        var holders = data.holders.map(function (h) {
          var tokenBal = h.tokenBalance != null ? Number(h.tokenBalance) : null;
          var col0NftCount = Number(h.mutantApesCount != null ? h.mutantApesCount : h.mnk3ysCount) || 0;
          var col1NftCount = Number(h.zmb3ysCount) || 0;
          var tokenValueUsd = (blunanaUsdNum != null && !isNaN(blunanaUsdNum) && tokenBal != null && !isNaN(tokenBal)) ? tokenBal * blunanaUsdNum : null;
          var nftValueUsd = null;
          if (solUsdNum != null && !isNaN(solUsdNum) && (floorFirstColSol != null || floorZmb3ysSol != null)) {
            var nftSol = col0NftCount * (floorFirstColSol || 0) + col1NftCount * (floorZmb3ysSol || 0);
            nftValueUsd = nftSol * solUsdNum;
          }
          var totalValueUsd = null;
          if (tokenValueUsd != null || nftValueUsd != null) {
            totalValueUsd = (tokenValueUsd != null ? tokenValueUsd : 0) + (nftValueUsd != null ? nftValueUsd : 0);
          }
          var valueUsd = null;
          if (sort === 'total') valueUsd = totalValueUsd;
          else if (sort === 'token') valueUsd = tokenValueUsd;
          else if (sort === 'nfts') valueUsd = nftValueUsd;
          return { h: h, totalValueUsd: totalValueUsd, valueUsd: valueUsd };
        });
        if (sort === 'total') {
          holders.sort(function (a, b) {
            var va = a.totalValueUsd != null ? a.totalValueUsd : -1;
            var vb = b.totalValueUsd != null ? b.totalValueUsd : -1;
            return vb - va;
          });
        }
        var rows = holders.map(function (item, i) {
          var h = item.h;
          var valueUsd = item.valueUsd;
          var walletShort = h.wallet.length > 12 ? h.wallet.slice(0, 4) + '…' + h.wallet.slice(-4) : h.wallet;
          var walletLink = 'https://solscan.io/account/' + encodeURIComponent(h.wallet);
          var discordName = h.discordDisplayName && String(h.discordDisplayName).trim();
          var knownAccount = getKnownHolderAccount(h.wallet);
          var walletCell;
          if (knownAccount) {
            walletCell =
              '<a href="' +
              escapeHtml(walletLink) +
              '" target="_blank" rel="noopener" class="holders-wallet holders-wallet--known holders-wallet--' +
              escapeHtml(knownAccount.kind) +
              '" title="' +
              escapeHtml(h.wallet) +
              '"><span class="holders-known-name holders-known-name--' +
              escapeHtml(knownAccount.kind) +
              '">' +
              escapeHtml(knownAccount.label) +
              '</span><span class="holders-wallet-addr">' +
              escapeHtml(walletShort) +
              '</span></a>';
          } else if (discordName) {
            walletCell =
              '<a href="' +
              escapeHtml(walletLink) +
              '" target="_blank" rel="noopener" class="holders-wallet holders-wallet--linked" title="' +
              escapeHtml(h.wallet) +
              '"><span class="holders-discord-name">' +
              escapeHtml(discordName) +
              '</span><span class="holders-wallet-addr">' +
              escapeHtml(walletShort) +
              '</span></a>';
          } else {
            walletCell =
              '<a href="' +
              escapeHtml(walletLink) +
              '" target="_blank" rel="noopener" class="holders-wallet" title="' +
              escapeHtml(h.wallet) +
              '">' +
              escapeHtml(walletShort) +
              '</a>';
          }
          var valueCell = valueUsd != null ? formatUsd(valueUsd) : '—';
          var rowClass = knownAccount ? ' class="holders-row holders-row--' + escapeHtml(knownAccount.kind) + '"' : '';
          return '<tr' + rowClass + '>' +
            '<td>' + (i + 1) + '</td>' +
            '<td>' + walletCell + '</td>' +
            '<td data-col="token">' + escapeHtml(h.tokenBalanceFormatted || '0') + '</td>' +
            '<td data-col="nfts">' + (h.totalNfts || 0) + '</td>' +
            '<td>' + escapeHtml(valueCell) + '</td>' +
            '</tr>';
        });
        holdersTbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="holders-empty">No holders</td></tr>';
    }
    function loadHolders(sort) {
      sort = sort || 'total';
      var table = document.getElementById('holders-table');
      if (table) table.className = 'holders-table holders-table--sort-' + sort;
      holdersTbody.innerHTML = '<tr><td colspan="5" class="holders-loading">Loading…</td></tr>';
      Promise.all([
        fetch(window.location.origin + '/api/holders?sort=' + encodeURIComponent(sort), { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }),
        fetch(window.location.origin + '/api/prices', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }),
      ]).then(function (arr) {
        var data = arr[0];
        var prices = arr[1] || {};
        renderHoldersTable(data, prices, null, sort);
        fetchCollectionsData().then(function (collectionsData) {
          if (collectionsData) renderHoldersTable(data, prices, collectionsData, sort);
        });
      }).catch(function () {
        holdersTbody.innerHTML = '<tr><td colspan="5" class="holders-empty">Failed to load</td></tr>';
      });
    }
    loadHolders('total');
    holdersSortSelect.addEventListener('change', function () {
      loadHolders(holdersSortSelect.value);
    });
  }

  // ----- Tokenomics: DEXTools-style price + metrics + 15m chart -----
  var priceUsdEl = document.getElementById('tokenomics-price-usd');
  var change24El = document.getElementById('tokenomics-change-24h');
  var priceSolEl = document.getElementById('tokenomics-price-sol');
  var mcapEl = document.getElementById('tokenomics-mcap');
  var liqEl = document.getElementById('tokenomics-liq');
  var volEl = document.getElementById('tokenomics-vol');
  var chartEl = document.getElementById('xma-chart');
  var chartHintEl = document.getElementById('xma-chart-hint');
  var chartWrapEl = document.getElementById('xma-chart-wrap');

  function formatUsd(val) {
    if (val == null || isNaN(val)) return '—';
    if (val === 0) return '$0';
    if (val >= 1e9) return '$' + (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return '$' + (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return '$' + (val / 1e3).toFixed(2) + 'K';
    if (val >= 1) return '$' + val.toFixed(2);
    if (val >= 0.01) return '$' + val.toFixed(4);
    return val < 0.0001 ? '$' + val.toExponential(2) : '$' + val.toFixed(6);
  }

  function formatPrice(val) {
    if (val == null || isNaN(val)) return '—';
    if (val >= 1) return val.toFixed(2);
    if (val >= 0.01) return val.toFixed(4);
    return val < 0.0001 ? val.toExponential(2) : val.toFixed(6);
  }

  if (priceUsdEl || priceSolEl) {
    fetch(window.location.origin + '/api/prices', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) {
        if (!p) return;
        if (priceUsdEl && p.blunanaUsd != null) priceUsdEl.textContent = '$' + formatPrice(p.blunanaUsd);
        if (priceSolEl && p.blunanaPerSol != null) priceSolEl.textContent = formatPrice(p.blunanaPerSol) + ' SOL';
        if (change24El && p.priceChange24h != null) {
          var pc = p.priceChange24h;
          change24El.textContent = (pc >= 0 ? '+' : '') + pc.toFixed(2) + '% 24H';
          change24El.classList.remove('tokenomics__change--pos', 'tokenomics__change--neg');
          change24El.classList.add(pc >= 0 ? 'tokenomics__change--pos' : 'tokenomics__change--neg');
        }
        if (mcapEl) mcapEl.textContent = p.marketCapUsd != null ? formatUsd(p.marketCapUsd) : '—';
        if (liqEl) liqEl.textContent = p.liquidityUsd != null ? formatUsd(p.liquidityUsd) : '—';
        if (volEl) volEl.textContent = p.volume24hUsd != null ? formatUsd(p.volume24hUsd) : '—';
      });
  }

  if (chartEl) {
    fetch(window.location.origin + '/api/xma-ohlc?type=1d&days=14', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var items = (data && data.data && data.data.items) ? data.data.items : [];
        if (items.length === 0) {
          if (chartWrapEl) chartWrapEl.classList.add('tokenomics__chart-wrap--hidden');
          return;
        }
        if (chartWrapEl) chartWrapEl.classList.remove('tokenomics__chart-wrap--hidden');

        var chartLabelEl = document.getElementById('tokenomics-chart-label');
        var cfg = window.XAPES_CONFIG && window.XAPES_CONFIG.token ? window.XAPES_CONFIG.token : {};
        var tokenName = (cfg.name || cfg.symbol || 'Token').trim();
        if (chartLabelEl) chartLabelEl.textContent = tokenName + ' / USD';

        var LWC = window.LightweightCharts;
        if (!LWC) return;

        function toDailyTime(unixTime) {
          var d = new Date(Number(unixTime) * 1000);
          return d.getUTCFullYear() + '-'
            + String(d.getUTCMonth() + 1).padStart(2, '0') + '-'
            + String(d.getUTCDate()).padStart(2, '0');
        }

        function formatChartPrice(price) {
          if (price == null || isNaN(price)) return '';
          if (price >= 1) return price.toFixed(4);
          if (price >= 0.0001) return price.toFixed(8);
          return price.toExponential(2);
        }

        // Dedupe by day — duplicate timestamps break Lightweight Charts setData().
        var candleByDay = {};
        items.forEach(function (c) {
          var time = toDailyTime(c.unix_time);
          var open = Number(c.o);
          var high = Number(c.h);
          var low = Number(c.l);
          var close = Number(c.c);
          if (!time || !isFinite(close)) return;
          if (!isFinite(open)) open = close;
          if (!isFinite(high)) high = close;
          if (!isFinite(low)) low = close;
          candleByDay[time] = { time: time, open: open, high: high, low: low, close: close };
        });
        var candleData = Object.keys(candleByDay).sort().map(function (k) { return candleByDay[k]; });
        if (candleData.length === 0) return;

        function renderChart() {
          chartEl.innerHTML = '';
          var chartWidth = Math.max(chartEl.clientWidth || chartEl.offsetWidth || 320, 200);
          var chart = LWC.createChart(chartEl, {
            layout: { background: { color: 'transparent' }, textColor: '#8b8f9a' },
            grid: { vertLines: { color: '#2a2d38' }, horzLines: { color: '#2a2d38' } },
            width: chartWidth,
            height: 260,
            timeScale: { borderColor: '#2a2d38', timeVisible: true, secondsVisible: false },
            rightPriceScale: {
              borderColor: '#2a2d38',
              scaleMargins: { top: 0.12, bottom: 0.1 },
            },
            localization: { priceFormatter: formatChartPrice },
          });

          var seriesOptions = {
            upColor: '#14b8a6',
            downColor: '#f87171',
            borderVisible: false,
            wickUpColor: '#14b8a6',
            wickDownColor: '#f87171',
            priceFormat: { type: 'price', precision: 10, minMove: 0.0000000001 },
          };

          var series = null;
          if (LWC.CandlestickSeries && typeof chart.addSeries === 'function') {
            series = chart.addSeries(LWC.CandlestickSeries, seriesOptions);
          } else if (typeof chart.addCandlestickSeries === 'function') {
            series = chart.addCandlestickSeries(seriesOptions);
          }
          if (!series) return;

          series.setData(candleData);
          chart.timeScale().fitContent();
          window.addEventListener('resize', function () {
            chart.applyOptions({ width: Math.max(chartEl.clientWidth || chartWidth, 200) });
          });
        }

        requestAnimationFrame(function () {
          requestAnimationFrame(renderChart);
        });
      })
      .catch(function () {
        if (chartWrapEl) chartWrapEl.classList.add('tokenomics__chart-wrap--hidden');
      });
  }
})();
