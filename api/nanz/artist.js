const { proxy } = require('../../lib/nanz-proxy');
module.exports = (req, res) => proxy(req, res, 'artist');
