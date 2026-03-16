var irc = require('irc');
var config = require('config');
var markov = require('./markov');

markov.load(config.corpusFile);

var bot = new irc.Client(config.server, config.botName, {
    channels: config.channels
});

bot.addListener('message', function(from, to, message, raw) {
    // ignore DMs (to === our nick)
    if (to.toLowerCase() === config.botName.toLowerCase()) return;
    // ignore our own messages
    if (from.toLowerCase() === config.botName.toLowerCase()) return;

    markov.train(message);

    var reply = null;
    if (message.toLowerCase().indexOf(config.botName.toLowerCase()) !== -1) {
        reply = markov.generate(config.maxWords);
    } else if (Math.random() < config.replyChance) {
        reply = markov.generate(config.maxWords);
    }

    if (reply !== null) {
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
