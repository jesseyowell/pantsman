// This part is from davidwash.name/nodejs-irc

var irc = require('irc');
var config = require('config');
var bot = new irc.Client(config.server, config.botName, {
	channels: config.channels
});

// expand this to markov functionality

bot.addListener('message', function (from, to, message) {
    console.log(from + ' => ' + to + ': ' + message);
});

bot.addListener('message', function(from, to, text, message) {
	bot.say(config.channels[0] == 'pantsman', "wat");
});

bot.addListener('error', function(message) {
    console.log('error: ', message);
});
