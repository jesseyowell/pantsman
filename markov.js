var fs = require('fs');
var path = require('path');

var chain = {};

function train(text) {
    var words = text.split(/\s+/).filter(function(w) { return w.length > 0; });
    for (var i = 0; i < words.length - 1; i++) {
        var word = words[i];
        var next = words[i + 1];
        if (!chain[word]) chain[word] = [];
        chain[word].push(next);
    }
}

function generate(maxWords) {
    var keys = Object.keys(chain);
    if (keys.length === 0) return null;
    var word = keys[Math.floor(Math.random() * keys.length)];
    var result = [word];
    while (result.length < maxWords) {
        var nexts = chain[word];
        if (!nexts || nexts.length === 0) break;
        word = nexts[Math.floor(Math.random() * nexts.length)];
        result.push(word);
    }
    return result.join(' ');
}

function load(filePath) {
    var resolved = path.resolve(__dirname, filePath);
    try {
        var data = fs.readFileSync(resolved, 'utf8');
        chain = JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT' || e instanceof SyntaxError) {
            console.log('markov: warning: could not load corpus (' + e.message + '), starting fresh');
            chain = {};
        } else {
            throw e;
        }
    }
}

function save(filePath) {
    var resolved = path.resolve(__dirname, filePath);
    try {
        fs.writeFileSync(resolved, JSON.stringify(chain));
    } catch (e) {
        console.log('markov: error saving corpus:', e.message);
    }
}

module.exports = { train: train, generate: generate, load: load, save: save };
