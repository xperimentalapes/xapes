use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_lang::solana_program::hash::{hash, Hash};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod slot_machine {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        game_state.authority = ctx.accounts.authority.key();
        game_state.total_spins = 0;
        game_state.total_volume = 0;
        game_state.is_paused = false;
        msg!("Slot machine initialized");
        Ok(())
    }

    pub fn spin(ctx: Context<Spin>, bet_amount: u64) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        
        // Check if game is paused
        require!(!game_state.is_paused, SlotMachineError::GamePaused);
        
        // Validate bet amount (minimum 1 token, maximum 1000 tokens)
        require!(bet_amount >= 1_000_000, SlotMachineError::BetTooSmall); // 1 token with 6 decimals
        require!(bet_amount <= 1_000_000_000, SlotMachineError::BetTooLarge); // 1000 tokens
        
        // Transfer tokens from player to game
        let cpi_accounts = Transfer {
            from: ctx.accounts.player_token_account.to_account_info(),
            to: ctx.accounts.game_token_account.to_account_info(),
            authority: ctx.accounts.player.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, bet_amount)?;

        // Generate random result using multiple entropy sources
        let recent_blockhash = ctx.accounts.clock.recent_blockhash;
        let result = generate_slot_result(
            ctx.accounts.player.key(),
            recent_blockhash,
            game_state.total_spins,
        );
        
        // Calculate payout based on result
        let payout = calculate_payout(result, bet_amount);
        
        msg!("Spin result: [{}, {}, {}]", result[0], result[1], result[2]);
        msg!("Bet: {}, Payout: {}", bet_amount, payout);
        
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
            
            msg!("Payout sent: {}", payout);
        }

        game_state.total_spins = game_state.total_spins.checked_add(1).unwrap();
        game_state.total_volume = game_state.total_volume.checked_add(bet_amount).unwrap();
        
        Ok(())
    }

    pub fn pause_game(ctx: Context<PauseGame>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        require!(
            ctx.accounts.authority.key() == game_state.authority,
            SlotMachineError::Unauthorized
        );
        game_state.is_paused = true;
        msg!("Game paused");
        Ok(())
    }

    pub fn resume_game(ctx: Context<ResumeGame>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        require!(
            ctx.accounts.authority.key() == game_state.authority,
            SlotMachineError::Unauthorized
        );
        game_state.is_paused = false;
        msg!("Game resumed");
        Ok(())
    }

    fn generate_slot_result(
        player: Pubkey,
        recent_blockhash: Hash,
        game_nonce: u64,
    ) -> [u8; 3] {
        // Combine multiple entropy sources for better randomness
        let mut data = Vec::new();
        data.extend_from_slice(&player.to_bytes());
        data.extend_from_slice(&recent_blockhash.to_bytes());
        data.extend_from_slice(&game_nonce.to_le_bytes());
        
        let hash_result = hash(&data);
        let hash_bytes = hash_result.to_bytes();
        
        // Generate 3 numbers between 0-9
        [
            hash_bytes[0] % 10,
            hash_bytes[1] % 10,
            hash_bytes[2] % 10,
        ]
    }

    fn calculate_payout(result: [u8; 3], bet: u64) -> u64 {
        // Payout structure:
        // Three 7s: 100x
        // Three of a kind (any): 10x
        // Two 7s: 5x
        // Two of a kind: 2x
        // Otherwise: 0
        
        let is_three_sevens = result[0] == 7 && result[1] == 7 && result[2] == 7;
        let is_three_kind = result[0] == result[1] && result[1] == result[2];
        let is_two_sevens = (result[0] == 7 && result[1] == 7) 
            || (result[1] == 7 && result[2] == 7)
            || (result[0] == 7 && result[2] == 7);
        let is_two_kind = result[0] == result[1] 
            || result[1] == result[2] 
            || result[0] == result[2];
        
        if is_three_sevens {
            bet.checked_mul(100).unwrap_or(0)
        } else if is_three_kind {
            bet.checked_mul(10).unwrap_or(0)
        } else if is_two_sevens {
            bet.checked_mul(5).unwrap_or(0)
        } else if is_two_kind {
            bet.checked_mul(2).unwrap_or(0)
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
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct PauseGame<'info> {
    #[account(
        seeds = [b"game_state"],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResumeGame<'info> {
    #[account(
        seeds = [b"game_state"],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,
    pub authority: Signer<'info>,
}

#[account]
pub struct GameState {
    pub authority: Pubkey,
    pub total_spins: u64,
    pub total_volume: u64,
    pub is_paused: bool,
}

impl GameState {
    pub const LEN: usize = 32 + 8 + 8 + 1; // authority + total_spins + total_volume + is_paused
}

#[error_code]
pub enum SlotMachineError {
    #[msg("Game is currently paused")]
    GamePaused,
    #[msg("Bet amount is too small (minimum 1 token)")]
    BetTooSmall,
    #[msg("Bet amount is too large (maximum 1000 tokens)")]
    BetTooLarge,
    #[msg("Unauthorized action")]
    Unauthorized,
}
