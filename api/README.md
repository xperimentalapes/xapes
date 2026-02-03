# API Endpoints

## `/api/collect`

Collects winnings from the treasury wallet to the user's wallet.

### Request
- Method: `POST`
- Body:
  ```json
  {
    "userWallet": "user_wallet_address",
    "amount": 1000.5
  }
  ```

### Response
- Success (200):
  ```json
  {
    "transaction": "base64_encoded_transaction"
  }
  ```
- Error (400/500):
  ```json
  {
    "error": "Error message"
  }
  ```

### Environment Variables Required
- `TREASURY_PRIVATE_KEY`: JSON array of the treasury wallet's private key bytes
  - Example: `[1,2,3,4,5,...]` (64 numbers total)
  - Set this in Vercel project settings > Environment Variables

### Security Notes
- The treasury private key is stored as an environment variable in Vercel
- Never commit the actual private key to git
- The API signs transactions on behalf of the treasury wallet
- Consider rate limiting and additional validation in production
