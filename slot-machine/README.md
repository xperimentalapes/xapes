# XMA Slot Machine - Quick Start Guide

## Setup Instructions

### 1. Install Dependencies

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Install Node.js dependencies
cd slot-machine
npm install
```

### 2. Generate New Program ID (Important!)

```bash
# Generate new keypair
solana-keygen new -o target/deploy/slot_machine-keypair.json

# Get the program ID
solana address -k target/deploy/slot_machine-keypair.json

# Update Anchor.toml and lib.rs with the new program ID
```

### 3. Update XMA Token Mint

Edit `app/src/components/SlotMachine.jsx` and replace:
```javascript
const XMA_TOKEN_MINT = new PublicKey('YOUR_XMA_TOKEN_MINT_HERE');
```
with your actual XMA token mint address.

### 4. Build the Program

```bash
anchor build
```

### 5. Deploy to Devnet (Testing)

```bash
# Switch to devnet
solana config set --url devnet

# Get some SOL for testing
solana airdrop 2

# Deploy
anchor deploy
```

### 6. Generate IDL for Frontend

After deployment, copy the IDL:
```bash
# The IDL will be in target/idl/slot_machine.json
# Copy it to app/src/idl/slot_machine.json
```

### 7. Initialize the Game

You'll need to call the `initialize` function once to set up the game state.

### 8. Integrate into Main Site

Add the SlotMachine component to your main site:
```jsx
import SlotMachine from './slot-machine/app/src/components/SlotMachine';
import './slot-machine/app/src/components/SlotMachine.css';
```

## Important Notes

1. **Program ID**: You MUST generate a new program ID and update it in both `Anchor.toml` and `lib.rs`
2. **Token Mint**: Update the XMA token mint address in the frontend component
3. **Testing**: Always test on devnet first with small amounts
4. **Security**: Review the RNG implementation before mainnet deployment
5. **Game State**: The initialize function must be called once by the authority

## Next Steps

1. Generate program ID and update files
2. Update XMA token mint address
3. Build and deploy to devnet
4. Test thoroughly
5. Get code review from Solana community
6. Deploy to mainnet with small amounts first
