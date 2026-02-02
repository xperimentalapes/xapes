#!/bin/bash

echo "🎰 XMA Slot Machine Setup"
echo "========================="
echo ""

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust not found. Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    source $HOME/.cargo/env
else
    echo "✅ Rust is installed"
fi

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo "❌ Solana CLI not found. Installing..."
    sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
else
    echo "✅ Solana CLI is installed"
fi

# Check if Anchor is installed
if ! command -v anchor &> /dev/null; then
    echo "❌ Anchor not found. Installing..."
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
    avm install latest
    avm use latest
else
    echo "✅ Anchor is installed"
fi

# Generate program keypair if it doesn't exist
if [ ! -f "target/deploy/slot_machine-keypair.json" ]; then
    echo "🔑 Generating new program keypair..."
    mkdir -p target/deploy
    solana-keygen new -o target/deploy/slot_machine-keypair.json --no-bip39-passphrase
    PROGRAM_ID=$(solana address -k target/deploy/slot_machine-keypair.json)
    echo "✅ Generated program ID: $PROGRAM_ID"
    echo ""
    echo "⚠️  IMPORTANT: Update the following files with this program ID:"
    echo "   - Anchor.toml (line with slot_machine = ...)"
    echo "   - programs/slot-machine/src/lib.rs (declare_id! macro)"
    echo "   - app/src/components/SlotMachine.jsx (SLOT_MACHINE_PROGRAM_ID)"
else
    PROGRAM_ID=$(solana address -k target/deploy/slot_machine-keypair.json)
    echo "✅ Program ID: $PROGRAM_ID"
fi

echo ""
echo "📦 Installing Node.js dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update program ID in Anchor.toml and lib.rs"
echo "2. Update XMA_TOKEN_MINT in SlotMachine.jsx"
echo "3. Run: anchor build"
echo "4. Run: anchor deploy (on devnet first!)"
