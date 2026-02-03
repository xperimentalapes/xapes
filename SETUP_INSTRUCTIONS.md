# Setup Instructions for Slot Machine

## Environment Variables

### Vercel Setup

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add the following variable:

   **Name:** `TREASURY_PRIVATE_KEY`
   
   **Value:** JSON array of the treasury wallet's private key bytes
   
   Example format: `[1,2,3,4,5,...]` (64 numbers total)

### Getting the Treasury Private Key

To get the private key array from a Solana keypair file:

```bash
# If you have the keypair file
solana-keygen pubkey ~/.config/solana/id.json

# To extract the private key array (be careful with this!)
node -e "const fs = require('fs'); const keypair = JSON.parse(fs.readFileSync('path/to/keypair.json')); console.log(JSON.stringify(keypair));"
```

**⚠️ SECURITY WARNING:**
- Never commit the actual private key to git
- Store it securely in Vercel environment variables only
- The private key gives full access to the treasury wallet

## Testing Checklist

### Before Testing:
- [ ] Treasury private key is set in Vercel environment variables
- [ ] Treasury wallet has XMA tokens for payouts
- [ ] Dependencies are installed (`npm install`)

### Test Flow:
1. **Connect Wallet**
   - [ ] Wallet connects successfully
   - [ ] Balance displays correctly

2. **Purchase Spins**
   - [ ] BUY button is enabled when wallet connected
   - [ ] Enter cost per spin and number of spins
   - [ ] Click BUY - transaction should be signed
   - [ ] Spins remaining increases
   - [ ] Balance decreases by total cost

3. **Spin**
   - [ ] SPIN button is enabled when spins > 0
   - [ ] Click SPIN - reels animate
   - [ ] Spins remaining decreases by 1
   - [ ] If win, total won increases

4. **Collect**
   - [ ] COLLECT button is enabled when total won > 0
   - [ ] Click COLLECT - should call API and send transaction
   - [ ] Total won resets to 0
   - [ ] Balance increases by amount collected

## Troubleshooting

### API Errors:
- **"TREASURY_PRIVATE_KEY not set"**: Add the environment variable in Vercel
- **"Treasury key mismatch"**: Verify the private key matches the treasury wallet address
- **"Invalid treasury key configuration"**: Check the JSON format of the private key

### Transaction Errors:
- **"Insufficient funds"**: Treasury wallet needs SOL for transaction fees
- **"Token account not found"**: User or treasury may need to create token account first

## Production Considerations

1. **Rate Limiting**: Add rate limiting to the API endpoint
2. **Validation**: Add additional checks (max amount, user verification, etc.)
3. **Monitoring**: Set up error tracking and logging
4. **Security**: Consider adding API keys or other authentication
5. **Solana Program**: Eventually migrate to on-chain Solana program for better security
