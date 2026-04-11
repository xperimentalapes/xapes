const app = require('../../server');

module.exports = (req, res) => {
  const q = (req.url || '').includes('?') ? '?' + (req.url || '').split('?').slice(1).join('?') : '';
  req.url = '/api/discord/callback' + q;
  return app(req, res);
};
