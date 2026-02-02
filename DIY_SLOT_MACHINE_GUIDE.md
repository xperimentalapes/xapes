# DIY Onchain Slot Machine - Complete Implementation Guide

## Budget: $0 (except deployment ~$200-500 SOL)

## Prerequisites & Learning Path

### Phase 0: Learning (2-4 weeks)

#### 1. Solana Basics (Week 1)
- **Free Resources**:
  - [Solana Cookbook](https://solanacookbook.com/) - Start here
  - [Solana Development Course](https://www.soldev.app/course) - Free course
  - [Solana Documentation](https://docs.solana.com/)
  
- **Key Concepts to Learn**:
  - Accounts, Programs, Transactions
  - PDAs (Program Derived Addresses)
  - Token Program (SPL)
  - Rent and fees

#### 2. Rust Programming (Week 1-2)
- **Free Resources**:
  - [Rust Book](https://doc.rust-lang.org/book/) - Official guide
  - [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
  - Practice: [Rustlings](https://github.com/rust-lang/rustlings)

- **Focus Areas**:
  - Ownership, borrowing
  - Error handling
  - Structs and enums
  - Pattern matching

#### 3. Anchor Framework (Week 2)
- **Free Resources**:
  - [Anchor Book](https://www.anchor-lang.com/docs/intro)
  - [Anchor Examples](https://github.com/coral-xyz/anchor/tree/master/examples)
  - [Anchor YouTube Tutorials](https://www.youtube.com/results?search_query=anchor+solana+tutorial)

- **Key Concepts**:
  - Accounts struct
  - Instructions
  - Constraints
  - Error codes

#### 4. Web3 Frontend (Week 3-4)
- **Free Resources**:
  - [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)
  - [@solana/wallet-adapter](https://github.com/solana-labs/wallet-adapter)
  - [Phantom Wallet Integration Guide](https://docs.phantom.app/)

- **Libraries**:
  - `@solana/web3.js` - Core library
  - `@solana/wallet-adapter-react` - React hooks
  - `@solana/spl-token` - Token operations

## Implementation Plan

### Phase 1: Simple Slot Machine (MVP) - 4-6 weeks

#### Step 1: Set Up Development Environment

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Install Node.js dependencies
npm install @solana/web3.js @solana/wallet-adapter-base @solana/wallet-adapter-react @solana/spl-token
```

#### Step 2: Create Anchor Project

```bash
anchor init slot-machine
cd slot-machine
```

#### Step 3: Smart Contract Structure

**File: `programs/slot-machine/src/lib.rs`**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("YourProgramIDHere");

#[program]
pub mod slot_machine {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        game_state.authority = ctx.accounts.authority.key();
        game_state.total_spins = 0;
        Ok(())
    }

    pub fn spin(ctx: Context<Spin>, bet_amount: u64) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        
        // Transfer tokens from player to game
        let cpi_accounts = Transfer {
            from: ctx.accounts.player_token_account.to_account_info(),
            to: ctx.accounts.game_token_account.to_account_info(),
            authority: ctx.accounts.player.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, bet_amount)?;

        // Generate random result (simplified - see security notes)
        let result = generate_slot_result(ctx.accounts.player.key(), game_state.total_spins);
        
        // Calculate payout
        let payout = calculate_payout(result, bet_amount);
        
        if payout > 0 {
            // Transfer winnings back to player
            let seeds = &[
                b"game_state",
                &[ctx.bumps.game_state],
            ];
            let signer = &[&seeds[..]];
            
            let cpi_accounts = Transfer {
                from: ctx.accounts.game_token_account.to_account_info(),
                to: ctx.accounts.player_token_account.to_account_info(),
                authority: ctx.accounts.game_state.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(
                cpi_program,
                cpi_accounts,
                signer,
            );
            token::transfer(cpi_ctx, payout)?;
        }

        game_state.total_spins += 1;
        Ok(())
    }

    fn generate_slot_result(player: Pubkey, nonce: u64) -> [u8; 3] {
        // WARNING: This is a simplified RNG - see security section
        // In production, use more secure methods
        let mut result = [0u8; 3];
        let seed = player.to_bytes();
        
        for i in 0..3 {
            result[i] = ((seed[i] as u64 + nonce + i as u64) % 10) as u8;
        }
        result
    }

    fn calculate_payout(result: [u8; 3], bet: u64) -> u64 {
        // Simple payout structure
        if result[0] == result[1] && result[1] == result[2] {
            // Three of a kind - 10x payout
            bet * 10
        } else if result[0] == result[1] || result[1] == result[2] {
            // Two of a kind - 2x payout
            bet * 2
        } else {
            0
        }
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GameState::LEN,
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Spin<'info> {
    #[account(
        seeds = [b"game_state"],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut)]
    pub player_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub game_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct GameState {
    pub authority: Pubkey,
    pub total_spins: u64,
}

impl GameState {
    pub const LEN: usize = 32 + 8; // authority + total_spins
}
```

#### Step 4: Frontend Integration

**File: `app/src/components/SlotMachine.jsx`**

```javascript
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';
import { Program, AnchorProvider } from '@project-serum/anchor';

export default function SlotMachine() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const spin = async () => {
    if (!publicKey) {
      alert('Please connect your wallet');
      return;
    }

    try {
      // 1. Get program ID
      const programId = new PublicKey('YOUR_PROGRAM_ID');
      
      // 2. Get token accounts
      const xmaMint = new PublicKey('YOUR_XMA_TOKEN_MINT');
      const playerTokenAccount = await getAssociatedTokenAddress(
        xmaMint,
        publicKey
      );
      
      // 3. Get game state PDA
      const [gameStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state')],
        programId
      );
      
      // 4. Get game token account
      const gameTokenAccount = await getAssociatedTokenAddress(
        xmaMint,
        gameStatePDA,
        true
      );

      // 5. Build and send transaction
      const betAmount = 1000000; // 1 XMA token (6 decimals)
      
      // Create instruction using Anchor
      const provider = new AnchorProvider(connection, wallet, {});
      const program = new Program(idl, programId, provider);
      
      const tx = await program.methods
        .spin(new BN(betAmount))
        .accounts({
          gameState: gameStatePDA,
          player: publicKey,
          playerTokenAccount: playerTokenAccount,
          gameTokenAccount: gameTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log('Transaction:', tx);
      alert('Spin complete! Check your wallet.');
    } catch (error) {
      console.error('Error:', error);
      alert('Transaction failed: ' + error.message);
    }
  };

  return (
    <div className="slot-machine">
      <h2>XMA Slot Machine</h2>
      <div className="reels">
        {/* Slot machine UI */}
      </div>
      <button onClick={spin}>Spin (1 XMA)</button>
    </div>
  );
}
```

### Phase 2: Security Improvements - 2-3 weeks

#### Critical Security Considerations

1. **Random Number Generation**
   - Current implementation is NOT secure
   - Options:
     - Use recent blockhash + player signature
     - Implement commit-reveal scheme
     - Use Switchboard VRF (oracle service)
     - Use Pyth Network for randomness

2. **Access Control**
   - Ensure only authorized can call admin functions
   - Use PDA seeds properly
   - Validate all account constraints

3. **Integer Overflow**
   - Use checked math operations
   - Validate bet amounts
   - Check payout calculations

4. **Reentrancy Protection**
   - Solana programs are single-threaded (less risk)
   - Still validate state changes

#### Improved RNG Example

```rust
use anchor_lang::solana_program::hash::{hash, Hash};

fn generate_slot_result(
    player: Pubkey,
    recent_blockhash: Hash,
    game_nonce: u64,
) -> [u8; 3] {
    // Combine multiple entropy sources
    let mut data = Vec::new();
    data.extend_from_slice(&player.to_bytes());
    data.extend_from_slice(&recent_blockhash.to_bytes());
    data.extend_from_slice(&game_nonce.to_le_bytes());
    
    let hash_result = hash(&data);
    let hash_bytes = hash_result.to_bytes();
    
    [
        hash_bytes[0] % 10,
        hash_bytes[1] % 10,
        hash_bytes[2] % 10,
    ]
}
```

### Phase 3: Testing - 2 weeks

#### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;

    #[test]
    fn test_payout_calculation() {
        // Test three of a kind
        assert_eq!(calculate_payout([7, 7, 7], 1000), 10000);
        
        // Test two of a kind
        assert_eq!(calculate_payout([5, 5, 3], 1000), 2000);
        
        // Test no match
        assert_eq!(calculate_payout([1, 2, 3], 1000), 0);
    }
}
```

#### Integration Tests

```javascript
// tests/slot-machine.test.js
describe('Slot Machine', () => {
  it('should allow player to spin', async () => {
    // Test implementation
  });
  
  it('should pay out correctly', async () => {
    // Test payout logic
  });
});
```

### Phase 4: Deployment - 1 week

#### Deploy to Devnet (Free)

```bash
# Build program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Get program ID
solana address -k target/deploy/slot_machine-keypair.json
```

#### Deploy to Mainnet

```bash
# Switch to mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Airdrop SOL for deployment (devnet only)
# For mainnet, you need real SOL

# Deploy
anchor deploy --provider.cluster mainnet

# Cost: ~2-3 SOL (~$200-500)
```

## Free Tools & Resources

### Development Tools
- **Anchor Framework**: Free, open source
- **Solana CLI**: Free
- **Rust**: Free
- **VS Code + Rust Analyzer**: Free extension
- **Solana Explorer**: Free blockchain explorer

### Testing
- **Devnet**: Free for testing
- **Local Validator**: Free local testing
- **Anchor Test Framework**: Built-in

### Learning Resources
- All documentation: Free
- YouTube tutorials: Free
- Community Discord: Free support
- Stack Overflow: Free Q&A

## Security Checklist (MUST DO)

Before deploying to mainnet:

- [ ] Code review by experienced Solana developer (find in Discord)
- [ ] Test all edge cases
- [ ] Test with small amounts first
- [ ] Implement proper RNG (not the simple example)
- [ ] Add rate limiting
- [ ] Add maximum bet limits
- [ ] Add pause/emergency stop function
- [ ] Document all functions
- [ ] Test on devnet extensively
- [ ] Start with small mainnet deployment
- [ ] Monitor for unusual activity

## Realistic Timeline

- **Learning Phase**: 2-4 weeks (part-time)
- **Development**: 4-6 weeks (part-time)
- **Security & Testing**: 2-3 weeks
- **Deployment**: 1 week
- **Total**: 9-14 weeks (part-time)

If working full-time: 4-6 weeks total

## Cost Breakdown

- **Development**: $0 (your time)
- **Tools**: $0 (all free)
- **Testing**: $0 (devnet is free)
- **Deployment**: ~2-3 SOL (~$200-500)
- **Total**: ~$200-500

## Risks & Mitigation

### Risk 1: Security Vulnerabilities
- **Mitigation**: 
  - Start with small amounts
  - Get code review from Solana Discord
  - Use well-tested patterns
  - Deploy to devnet first

### Risk 2: RNG Manipulation
- **Mitigation**: 
  - Use multiple entropy sources
  - Consider using Switchboard VRF
  - Implement commit-reveal if needed

### Risk 3: Economic Exploitation
- **Mitigation**: 
  - Set maximum bet limits
  - Ensure house edge is sustainable
  - Monitor for unusual patterns

## Next Steps

1. **Week 1**: Complete Solana basics course
2. **Week 2**: Learn Rust basics
3. **Week 3**: Learn Anchor framework
4. **Week 4**: Build first simple program
5. **Week 5+**: Start slot machine development

## Community Resources

- **Solana Discord**: https://discord.gg/solana
- **Anchor Discord**: https://discord.gg/anchorlang
- **Solana Stack Exchange**: https://solana.stackexchange.com/
- **r/solana**: Reddit community

## Code Templates & Examples

### Useful Anchor Examples
- [Token Swap](https://github.com/coral-xyz/anchor/tree/master/examples/token-swap)
- [Tic Tac Toe](https://github.com/coral-xyz/anchor/tree/master/examples/tic-tac-toe)
- [Pyth Oracle](https://github.com/coral-xyz/anchor/tree/master/examples/pyth)

### Frontend Examples
- [Solana Wallet Adapter Examples](https://github.com/solana-labs/wallet-adapter/tree/master/packages/starter)
- [React + Solana Template](https://github.com/solana-labs/dapp-scaffold)

## Final Notes

**This is a significant undertaking**, but completely doable with:
- Dedication to learning
- Time investment (100-200 hours)
- Careful attention to security
- Starting small and testing thoroughly

**Start with devnet, test extensively, then deploy small amounts to mainnet first.**

Good luck! 🎰
