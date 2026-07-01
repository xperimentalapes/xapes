const path = require('path');

function useCasinoHandler(handler) {
  return function (req, res) {
    Promise.resolve(handler(req, res)).catch(function (err) {
      console.error('Casino API error:', err);
      if (!res.headersSent) {
        res.status(err.status || 500).json({ error: err.message || 'Server error' });
      }
    });
  };
}

function registerCasinoRoutes(app) {
  const dir = path.join(__dirname, 'handlers');
  const h = useCasinoHandler;

  app.get('/api/casino/buy-tiers', h(require(path.join(dir, 'buy-tiers.js'))));
  app.post('/api/spin-slots', h(require(path.join(dir, 'spin-slots.js'))));
  app.post('/api/spin-roulette', h(require(path.join(dir, 'spin-roulette.js'))));
  app.post('/api/record-game-purchase', h(require(path.join(dir, 'record-game-purchase.js'))));
  app.post('/api/collect', h(require(path.join(dir, 'collect.js'))));
  app.post('/api/confirm-collect', h(require(path.join(dir, 'confirm-collect.js'))));
  app.get('/api/load-player', h(require(path.join(dir, 'load-player.js'))));
  app.get('/api/leaderboard', h(require(path.join(dir, 'leaderboard.js'))));
  app.get('/api/game-stats', h(require(path.join(dir, 'game-stats.js'))));
  app.post('/api/save-game', h(require(path.join(dir, 'save-game.js'))));
}

module.exports = { registerCasinoRoutes };
