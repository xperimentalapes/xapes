import React, { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import { Program, AnchorProvider, BN } from '@project-serum/anchor';
import idl from '../../idl/slot_machine.json';

const SLOT_MACHINE_PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');
const XMA_TOKEN_MINT = new PublicKey('YOUR_XMA_TOKEN_MINT_HERE'); // Replace with actual XMA token mint

export default function SlotMachine() {
  const { publicKey, wallet, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState([0, 0, 0]);
  const [payout, setPayout] = useState(0);
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState(1); // Default 1 token
  const [gameState, setGameState] = useState(null);

  const getProvider = useCallback(() => {
    if (!wallet || !connection) return null;
    return new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
  }, [connection, wallet]);

  const getProgram = useCallback(() => {
    const provider = getProvider();
    if (!provider) return null;
    return new Program(idl, SLOT_MACHINE_PROGRAM_ID, provider);
  }, [getProvider]);

  // Fetch player balance
  const fetchBalance = useCallback(async () => {
    if (!publicKey) return;
    
    try {
      const tokenAccount = await getAssociatedTokenAddress(
        XMA_TOKEN_MINT,
        publicKey
      );
      const account = await getAccount(connection, tokenAccount);
      setBalance(Number(account.amount) / 1_000_000); // Assuming 6 decimals
    } catch (error) {
      console.error('Error fetching balance:', error);
      setBalance(0);
    }
  }, [publicKey, connection]);

  // Fetch game state
  const fetchGameState = useCallback(async () => {
    const program = getProgram();
    if (!program) return;

    try {
      const [gameStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state')],
        SLOT_MACHINE_PROGRAM_ID
      );

      const state = await program.account.gameState.fetch(gameStatePDA);
      setGameState({
        totalSpins: state.totalSpins.toNumber(),
        totalVolume: state.totalVolume.toNumber() / 1_000_000,
        isPaused: state.isPaused,
      });
    } catch (error) {
      console.error('Error fetching game state:', error);
    }
  }, [getProgram]);

  useEffect(() => {
    if (publicKey) {
      fetchBalance();
      fetchGameState();
      const interval = setInterval(() => {
        fetchBalance();
        fetchGameState();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [publicKey, fetchBalance, fetchGameState]);

  const spin = async () => {
    if (!publicKey || !wallet) {
      alert('Please connect your wallet');
      return;
    }

    if (spinning) return;

    const program = getProgram();
    if (!program) {
      alert('Program not initialized');
      return;
    }

    try {
      setSpinning(true);
      
      // Get accounts
      const [gameStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state')],
        SLOT_MACHINE_PROGRAM_ID
      );

      const playerTokenAccount = await getAssociatedTokenAddress(
        XMA_TOKEN_MINT,
        publicKey
      );

      const gameTokenAccount = await getAssociatedTokenAddress(
        XMA_TOKEN_MINT,
        gameStatePDA,
        true
      );

      // Convert bet amount to token amount (6 decimals)
      const betAmountLamports = betAmount * 1_000_000;

      // Build transaction
      const tx = await program.methods
        .spin(new BN(betAmountLamports))
        .accounts({
          gameState: gameStatePDA,
          player: publicKey,
          playerTokenAccount: playerTokenAccount,
          gameTokenAccount: gameTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SystemProgram.programId, // Clock sysvar
        })
        .rpc();

      console.log('Transaction signature:', tx);

      // Wait for confirmation
      await connection.confirmTransaction(tx, 'confirmed');

      // Animate reels (simplified - in production, parse result from transaction logs)
      animateReels();

      // Refresh balance and game state
      await fetchBalance();
      await fetchGameState();

      alert('Spin complete! Check transaction: ' + tx);
    } catch (error) {
      console.error('Error spinning:', error);
      alert('Transaction failed: ' + error.message);
    } finally {
      setSpinning(false);
    }
  };

  const animateReels = () => {
    // Simple animation - in production, parse actual result from transaction
    const reels = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        reels[i] = Math.floor(Math.random() * 10);
        setResult([...reels]);
      }, (i + 1) * 500);
    }
  };

  if (!publicKey) {
    return (
      <div className="slot-machine-container">
        <div className="slot-machine">
          <h2>XMA Slot Machine</h2>
          <p>Please connect your wallet to play</p>
        </div>
      </div>
    );
  }

  return (
    <div className="slot-machine-container">
      <div className="slot-machine">
        <h2>🎰 XMA Slot Machine</h2>
        
        {gameState?.isPaused && (
          <div className="alert alert-warning">
            Game is currently paused
          </div>
        )}

        <div className="balance-info">
          <p>Your XMA Balance: <strong>{balance.toFixed(2)}</strong></p>
        </div>

        <div className="bet-controls">
          <label>
            Bet Amount (XMA):
            <input
              type="number"
              min="1"
              max="1000"
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
              disabled={spinning || gameState?.isPaused}
            />
          </label>
        </div>

        <div className="reels-container">
          <div className="reels">
            <div className="reel">{result[0]}</div>
            <div className="reel">{result[1]}</div>
            <div className="reel">{result[2]}</div>
          </div>
        </div>

        {payout > 0 && (
          <div className="payout">
            <h3>🎉 You won {payout.toFixed(2)} XMA!</h3>
          </div>
        )}

        <button
          className="spin-button"
          onClick={spin}
          disabled={spinning || gameState?.isPaused || balance < betAmount}
        >
          {spinning ? 'Spinning...' : `Spin (${betAmount} XMA)`}
        </button>

        {gameState && (
          <div className="game-stats">
            <p>Total Spins: {gameState.totalSpins}</p>
            <p>Total Volume: {gameState.totalVolume.toFixed(2)} XMA</p>
          </div>
        )}
      </div>
    </div>
  );
}
