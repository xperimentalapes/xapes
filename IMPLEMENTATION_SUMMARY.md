# Database & Leaderboard Implementation Summary

## What Was Implemented

### 1. Database Setup (Supabase)
- **Schema**: Created `players` and `game_history` tables
- **API Endpoints**: 
  - `/api/save-game` - Saves game data after each spin
  - `/api/load-player` - Loads player data on page load
  - `/api/leaderboard` - Returns leaderboard data
  - Updated `/api/collect` - Clears unclaimed rewards after collection

### 2. Frontend Integration
- **Auto-save**: Game data automatically saved after each spin
- **Auto-load**: Player data (including unclaimed rewards) loaded when wallet connects
- **Persistent rewards**: Unclaimed rewards persist across page refreshes
- **Database sync**: Collect function updates database to clear rewards

### 3. Leaderboard (Ready for UI)
- **API endpoint**: `/api/leaderboard?sortBy=spins|won|winRate&limit=100`
- **Sorting options**:
  - `spins` - Total number of spins played
  - `won` - Total coins won
  - `winRate` - Win percentage (won/wagered * 100)

## Setup Required

### 1. Create Supabase Account
1. Go to https://supabase.com
2. Sign up and create a new project
3. Get your credentials from Project Settings > API

### 2. Set Environment Variables in Vercel
Add these to your Vercel project:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your service_role key (keep secret!)
- `SUPABASE_ANON_KEY` - Your anon public key (optional, for future frontend use)

### 3. Run Database Schema
1. Go to Supabase SQL Editor
2. Run the SQL from `database/schema.sql`
3. This creates the tables and indexes

### 4. Install Dependencies
The `@supabase/supabase-js` package has been added to `package.json`. Vercel will install it automatically on deploy.

## How It Works

### Saving Game Data
After each spin, the frontend calls `/api/save-game` with:
- Wallet address
- Spin cost
- Result symbols (array of 3)
- Win amount
- Unclaimed rewards (totalWon)

The API:
1. Upserts player data (creates or updates)
2. Increments total spins, total won, total wagered
3. Updates unclaimed rewards
4. Saves game history entry

### Loading Player Data
When wallet connects, frontend calls `/api/load-player`:
- Returns player stats
- Restores `totalWon` from `unclaimedRewards` in database
- Player can continue where they left off

### Collecting Rewards
When player collects:
1. Transaction is created and sent
2. On success, `/api/collect` clears `unclaimed_rewards` to 0 in database
3. Frontend also clears `totalWon` to 0

## Next Steps: Leaderboard UI

To add the leaderboard UI, you'll need to:

1. **Add HTML** to `slots.html`:
```html
<button id="leaderboard-btn" class="btn">Leaderboard</button>
<div id="leaderboard-modal" class="leaderboard-modal">
    <div class="leaderboard-content">
        <h2>Leaderboard</h2>
        <div class="leaderboard-sort">
            <button data-sort="spins">Most Spins</button>
            <button data-sort="won">Most Won</button>
            <button data-sort="winRate">Best Win %</button>
        </div>
        <div id="leaderboard-list"></div>
    </div>
</div>
```

2. **Add JavaScript** to `slots.js`:
```javascript
async function loadLeaderboard(sortBy = 'spins') {
    const response = await fetch(`/api/leaderboard?sortBy=${sortBy}&limit=100`);
    const data = await response.json();
    // Display in UI
}
```

3. **Add CSS** to `slots.css` for styling

## Testing

1. Connect wallet
2. Play a spin
3. Check Supabase dashboard - should see player entry
4. Refresh page - unclaimed rewards should restore
5. Collect rewards - database should clear unclaimed rewards

## Notes

- Database operations are non-blocking (game continues if save fails)
- Errors are logged but don't interrupt gameplay
- Unclaimed rewards are stored in database, so they persist across sessions
- Leaderboard API is ready - just needs UI implementation
