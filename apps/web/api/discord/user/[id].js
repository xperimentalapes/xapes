const app = require('../../../server');

module.exports = (req, res) => {
  const id = req.query.id || (req.url && req.url.split('/').filter(Boolean).pop()?.split('?')[0]);
  const q = (req.url || '').includes('?') ? '?' + (req.url || '').split('?').slice(1).join('?') : '';
  req.url = '/api/discord/user/' + (id || '') + q;
  return app(req, res);
};
