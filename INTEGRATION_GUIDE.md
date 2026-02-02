# Slot Machine Integration Guide

## Adding Slot Machine to Your Website

### Step 1: Install Wallet Adapter Dependencies

Add to your main project's `package.json`:

```json
{
  "dependencies": {
    "@solana/wallet-adapter-base": "^0.9.23",
    "@solana/wallet-adapter-react": "^0.15.35",
    "@solana/wallet-adapter-react-ui": "^0.9.35",
    "@solana/wallet-adapter-wallets": "^0.19.32",
    "@solana/web3.js": "^1.87.6",
    "@solana/spl-token": "^0.3.9",
    "@project-serum/anchor": "^0.29.0"
  }
}
```

Then run: `npm install`

### Step 2: Set Up Wallet Provider

Create `app/src/WalletProvider.jsx`:

```jsx
import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

export default function WalletContextProvider({ children }) {
  const network = WalletAdapterNetwork.Devnet; // Change to Mainnet for production
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

### Step 3: Wrap Your App

In your main `index.html` or App component:

```jsx
import WalletContextProvider from './WalletProvider';
import SlotMachine from './slot-machine/app/src/components/SlotMachine';
import './slot-machine/app/src/components/SlotMachine.css';

function App() {
  return (
    <WalletContextProvider>
      {/* Your existing site content */}
      
      {/* Add slot machine section */}
      <section id="slot-machine" className="slot-machine-section">
        <div className="container">
          <SlotMachine />
        </div>
      </section>
    </WalletContextProvider>
  );
}
```

### Step 4: Add Navigation Link

Update your navigation in `index.html`:

```html
<nav class="navbar">
  <!-- existing links -->
  <a href="#slot-machine">Play</a>
</nav>
```

### Step 5: Update SlotMachine Component

Before using, update these in `SlotMachine.jsx`:

1. **Program ID**: Replace with your deployed program ID
2. **XMA Token Mint**: Replace with your actual XMA token mint address
3. **Network**: Update to mainnet when ready

### Step 6: Style Integration

The slot machine uses CSS variables from your main site. Make sure these are defined in your `styles.css`:

```css
:root {
  --bg-card: #111118;
  --bg-darker: #050508;
  --border-color: #1F1F2E;
  --text-primary: #FFFFFF;
  --text-secondary: #A0A0B0;
  --primary-color: #8B5CF6;
  --gradient-1: linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%);
}
```

## Testing Checklist

- [ ] Wallet connects successfully
- [ ] XMA balance displays correctly
- [ ] Bet amount input works
- [ ] Spin button is enabled/disabled correctly
- [ ] Transaction submits successfully
- [ ] Results display correctly
- [ ] Payouts are received
- [ ] Game state updates

## Production Checklist

- [ ] Deploy program to mainnet
- [ ] Update program ID in frontend
- [ ] Update XMA token mint address
- [ ] Change network to mainnet
- [ ] Test with small amounts first
- [ ] Get code review from Solana community
- [ ] Monitor for issues
- [ ] Set up error tracking
