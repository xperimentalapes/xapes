/**
 * Project config — edit this file for your project.
 * All site copy, logos, and URLs are driven from here.
 */
window.XAPES_CONFIG = {
  projectName: 'XapeLabz',
  tagline: 'XapeLabz',
  logoUrl: 'assets/logo.png',

  social: {
    x: 'https://x.com/xapelabz',
    discord: 'https://discord.com/invite/35DEdHwuYR',
  },
  shopUrl: '',

  token: {
    name: 'XMA',
    symbol: 'XMA',
    menuLabel: '$XMA token',
    logoUrl: 'assets/logo.png',
    menuIconUrl: 'assets/coins-svgrepo-com.svg',
    priceLabel: '$XMA (XMA / USD)',
    chartLabel: 'XMA / USD',
    summaryText: 'Your project token. Verify holdings in the dashboard.',
    /** Shown in $XMA section; also used for Solscan link when set */
    tokenMint: 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP',
    dextoolsUrl: 'https://www.dextools.io/app/solana/pair-explorer/HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP',
    pumpFunUrl: 'https://pump.fun/coin/HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP',
  },

  /**
   * Discord → XMA rewards (amounts are XMA-only in the UI).
   * Server env overrides via /api/discord-rewards/meta (accrualRates, dailyAccrualCapXma).
   */
  xmaDiscordRewards: {
    claimThresholdXma: 1000000,
    maxQualifyingMessagesPer15m: 5,
    minMessageChars: 10,
    maxQualifyingMessagesPer24h: 250,
    xmaPerQualifyingMessage: 300,
    xmaPerReaction: 200,
    xmaPerVoiceMinute: 100,
    maxXmaAccrualPer24h: 100000,
    dailyAccrualTimezoneLabel: 'America/New_York (ET)',
  },

  hero: {
    title: 'XapeLabz',
    tagline: '',
    subtitle: 'Xperimental Mutant Apes is the OG Solana NFT project, representing the collective rise of the community.',
    description: "We're building something special on Solana.\nJoin us as we continue to grow and evolve.",
    backgroundImage: 'assets/hero-bg.png',
    backgroundImagePortrait: 'assets/hero-bg-portrait.png',
  },

  footerCopy: 'XapeLabz',
  partnersLead: 'Platforms and tools integrated with this project.',
  partnersPlaceholder: 'Adding soon',
  royalCasinoUrl: 'https://xapes.vercel.app/casino', // Direct link to Royal Casino (external); leave empty to hide menu item
  slottoUrl: 'https://slotto.gg',

  holdingsLabels: {
    token: '$XMA',
    totalNfts: 'NFTs',
    nfts: 'NFTs',
  },
  holdersLead: 'Top holders by token and NFT collections.',
  holdersSortOptions: {
    total: 'Total',
    nfts: 'NFTs',
    token: '$XMA',
  },
  /** Platform / treasury wallets shown with a coloured label in the holders table */
  knownHolderAccounts: [
    {
      wallet: 'vzhnsQKtF3iBJVTYMfeNPMFDYd2VsfgDijsWa2xfJNq',
      label: 'pump.fun',
      kind: 'pumpfun',
    },
    {
      walletPrefix: '1BW',
      label: 'Magic Eden',
      kind: 'magiceden',
    },
  ],

  holderPortalUrl: '',
  endpoints: { holdings: '/api/holdings', discordAuth: '/api/discord/auth' },
  discordConnectUrl: '',
  collections: {},

  team: [
    {
      discordId: '1023391537498963978',
      xProfileUrl: 'https://x.com/GK_OF_XAPELABZ',
      description: 'Founder/project lead',
    },
    {
      discordId: '443298281007874048',
      xProfileUrl: 'https://x.com/cheeze541',
      description: 'Co-founder',
    },
    {
      discordId: '369215556848582657',
      xProfileUrl: 'https://x.com/ryzeldan',
      description: 'Co-founder',
    },
    {
      discordId: '931160720261939230',
      xProfileUrl: 'https://x.com/BUXDAO',
      description: 'Lead dev',
    },
  ],
};
