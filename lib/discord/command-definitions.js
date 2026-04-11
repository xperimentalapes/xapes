/**
 * Guild slash command definitions (Discord API v10).
 * Register with: npm run register-discord-commands
 */
const optionalMemberOption = {
  type: 6,
  name: 'member',
  description: 'Another server member (admins only)',
  required: false,
};

module.exports = [
  {
    name: 'my_nfts',
    description: 'Your linked wallets: NFT counts (apes, crowns, cowboys, burn squad)',
    dm_permission: false,
    options: [optionalMemberOption],
  },
  {
    name: 'my_wallets',
    description: 'Solana wallets linked to your Discord',
    dm_permission: false,
    options: [optionalMemberOption],
  },
  {
    name: 'my_xma',
    description: 'Total $XMA balance across your linked wallets',
    dm_permission: false,
    options: [optionalMemberOption],
  },
  {
    name: 'my_casino',
    description: 'Casino activity: slots, roulette spins & chest purchases',
    dm_permission: false,
    options: [optionalMemberOption],
  },
  {
    name: 'help',
    description: 'XapeLabz bot commands',
    dm_permission: false,
  },
  {
    name: 'nft',
    description: 'Look up the NFT whose metadata name is XMA #N (type the number N only)',
    dm_permission: false,
  },
];
