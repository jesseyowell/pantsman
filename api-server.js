// Standalone API server — runs the HTTP API without connecting to IRC.

var config = require('config');
var markov = require('./markov');
var api = require('./api');

markov.load(config.corpusFile);

api.listen(config.apiPort, config.apiHost, function() {
    console.log('api listening on ' + config.apiHost + ':' + config.apiPort);
});

function shutdown() {
    markov.save(config.corpusFile);
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);
