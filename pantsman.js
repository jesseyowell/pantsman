// This part is from davidwash.name/nodejs-irc

var irc = require('irc');
var config = require('config');
var markov = require('./markov');
var api = require('./api');

markov.load(config.corpusFile);

var apiServer = api.listen(config.apiPort, config.apiHost, function() {
    console.log('api listening on ' + config.apiHost + ':' + config.apiPort);
});

var bot = new irc.Client(config.server, config.botName, {
    channels: config.channels
});

bot.addListener('message', function(from, to, message, raw) {
    // ignore DMs (to === our nick)
    if (to.toLowerCase() === config.botName.toLowerCase()) return;
    // ignore our own messages
    if (from.toLowerCase() === config.botName.toLowerCase()) return;

    console.log('[' + to + '] <' + from + '> ' + message);
    markov.train(message);

    var reply = null;
    if (message.toLowerCase().indexOf(config.botName.toLowerCase()) !== -1) {
        reply = markov.generate(config.maxWords);
    } else if (Math.random() < config.replyChance) {
        reply = markov.generate(config.maxWords);
    }

    if (reply !== null) {
        console.log('[' + to + '] <' + config.botName + '> ' + reply);
        bot.say(to, reply);
    }
});

bot.addListener('nick', function(oldnick, newnick, channels, message) {
    bot.say(config.channels[0], "wat");
});

bot.addListener('error', function(message) {
    console.log('error: ', message);
});

function shutdown() {
    markov.save(config.corpusFile);
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
