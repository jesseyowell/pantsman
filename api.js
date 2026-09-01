var crypto = require('crypto');
var express = require('express');
var config = require('config');
var markov = require('./markov');
// Redact `text` from captured bodies: it carries the Markov corpus, in both
// the /generate response and the /train request. Restless gets the traffic
// shape, not what the bot says.
var sdk = require('@restlessai/sdk')(process.env.RESTLESS_KEY, {
    redact: { bodyKeys: ['text'] }
});

var app = express();
app.disable('x-powered-by');

// SDK first, so it captures every request. The only credential here is the
// optional API_TOKEN bearer token, so there is no owner to attribute.
app.use(sdk.setup(function() {
    return { apiKey: sdk.mask(undefined) };
}));

// /train payloads are chat-message sized; anything huge is abuse.
app.use(express.json({ limit: '64kb' }));

// Gate mutating routes behind a bearer token when API_TOKEN is set.
// With no token configured the route stays open — acceptable only because
// the server binds to localhost by default (see docs/deploy.md).
function requireToken(req, res, next) {
    var token = process.env.API_TOKEN;
    if (!token) return next();
    var header = Buffer.from(req.headers.authorization || '');
    var expected = Buffer.from('Bearer ' + token);
    if (header.length === expected.length && crypto.timingSafeEqual(header, expected)) {
        return next();
    }
    res.status(401).json({ error: 'invalid or missing token' });
}

app.get('/generate', function (req, res) {
    var maxWords = parseInt(req.query.maxWords, 10) || config.maxWords;
    var text = markov.generate(maxWords);
    if (text === null) {
        return res.status(503).json({ error: 'corpus is empty' });
    }
    res.json({ text: text });
});

app.post('/train', requireToken, function (req, res) {
    var text = req.body && req.body.text;
    if (typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'text is required' });
    }
    markov.train(text);
    res.status(204).end();
});

app.get('/stats', function (req, res) {
    res.json(markov.stats());
});

// Express-only: lets the SDK group crashes by throw site. Must be last.
app.use(sdk.errorHandler);

module.exports = app;
