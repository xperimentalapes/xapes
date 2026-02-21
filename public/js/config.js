/**
 * Project config — edit this file for your project.
 * All site copy, logos, and URLs are driven from here.
 */
window.MNK3YS_CONFIG = {
  projectName: 'XapeLabz',
  tagline: 'XapeLabz',
  logoUrl: 'assets/logo.png',

  social: {
    x: 'https://x.com/xapelabz',
    discord: 'https://discord.com/invite/35DEdHwuYR',
  },
  shopUrl: '',

  token: {
    name: 'Your Token',
    symbol: 'XMA',
    menuLabel: '$XMA token',
    logoUrl: 'assets/logo.png',
    menuIconUrl: 'assets/coins-svgrepo-com.svg',
    priceLabel: 'Your Token (TKN / USD)',
    chartLabel: 'TKN / USD — 15m',
    summaryText: 'Your project token. Verify holdings in the dashboard.',
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

  holderPortalUrl: '',
  endpoints: { holdings: '/api/holdings', discordAuth: '/api/discord/auth' },
  discordConnectUrl: '',
  tokenMint: '',
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
