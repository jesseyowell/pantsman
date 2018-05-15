// This part is from davidwash.name/nodejs-irc

var irc = require("irc");

var config = require("./config");

var bot = new irc.Client(config.server, config.botName, {
	channels: config.channels
});

// expand this to markov functionality


bot.addListener("connect", function() {
	bot.handleArrival("connect");
})

bot.addListener("message", function(from, to, text, message) {
	bot.say(config.channels[0], "wat");
});
