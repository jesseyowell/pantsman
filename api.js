var express = require('express');
var config = require('config');
var markov = require('./markov');
var sdk = require('@restlessai/sdk')(process.env.RESTLESS_KEY);

var app = express();

// SDK first, so it captures every request. This API has no auth, so
// there is no credential to mask and no owner to attribute.
app.use(sdk.setup(function() {
    return { apiKey: sdk.mask(undefined) };
}));

app.use(express.json());

app.get('/generate', function (req, res) {
    var maxWords = parseInt(req.query.maxWords, 10) || config.maxWords;
    var text = markov.generate(maxWords);
    if (text === null) {
        return res.status(503).json({ error: 'corpus is empty' });
    }
    res.json({ text: text });
});

app.post('/train', function (req, res) {
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
