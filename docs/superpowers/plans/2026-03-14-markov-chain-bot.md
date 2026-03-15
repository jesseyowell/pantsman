# Markov Chain IRC Bot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an order-1 Markov chain engine to pantsman so it learns from IRC messages and replies either when addressed or randomly.

**Architecture:** A new `markov.js` module in the project root owns the chain (plain JS object), corpus persistence (sync file I/O), training, and generation. `pantsman.js` is rewritten to load the corpus before connecting, train on each message, and reply based on name-mention or random chance. Config gains three new keys.

**Tech Stack:** Node.js, `irc` npm package, `config` npm package, built-in `fs` and `path` — no new dependencies.

---

## Chunk 1: markov.js module + config + rewired pantsman.js

### Task 1: Add config keys

**Files:**
- Modify: `config/default.json`

- [ ] **Step 1: Update config/default.json**

Replace the file contents with:

```json
{
  "botName": "pantsman",
  "server": "irc.esper.net",
  "channels": ["#selectbutton"],
  "replyChance": 0.05,
  "corpusFile": "./corpus.json",
  "maxWords": 30
}
```

- [ ] **Step 2: Verify it loads without error**

```bash
node -e "var c = require('config'); console.log(c.replyChance, c.corpusFile, c.maxWords);"
```

Expected output: `0.05 ./corpus.json 30`

- [ ] **Step 3: Commit**

```bash
git add config/default.json
git commit -m "feat: add markov config keys (replyChance, corpusFile, maxWords)"
```

---

### Task 2: Create markov.js

**Files:**
- Create: `markov.js`

- [ ] **Step 1: Create markov.js**

```js
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
```

- [ ] **Step 2: Manually verify train and generate**

```bash
node -e "
var m = require('./markov');
m.train('the cat sat on the mat');
m.train('the cat ate the rat');
var out = m.generate(10);
console.log('generated:', out);
console.log('not null:', out !== null);
"
```

Expected: prints a space-separated string of words drawn from the trained input, not null.

- [ ] **Step 3: Manually verify load on missing file**

```bash
node -e "
var m = require('./markov');
m.load('./nonexistent.json');
console.log('generate on empty:', m.generate(10));
"
```

Expected: prints a warning line, then `generate on empty: null`.

- [ ] **Step 4: Manually verify save and reload**

```bash
node -e "
var m = require('./markov');
m.train('hello world foo bar');
m.save('/tmp/test-corpus.json');
delete require.cache[require.resolve('./markov')];
var m2 = require('./markov');
m2.load('/tmp/test-corpus.json');
console.log('after reload:', m2.generate(5));
"
```

Expected: prints a short generated string (not null).

- [ ] **Step 5: Commit**

```bash
git add markov.js
git commit -m "feat: add markov chain module (train, generate, load, save)"
```

---

### Task 3: Rewrite pantsman.js

**Files:**
- Modify: `pantsman.js`

- [ ] **Step 1: Rewrite pantsman.js**

Replace the entire file contents with:

```js
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

bot.addListener('nick', function(message, to, from) {
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
```

- [ ] **Step 2: Verify the file parses without errors**

```bash
node --check pantsman.js
```

Expected: no output (syntax OK).

- [ ] **Step 3: Verify it loads cleanly (no IRC connection needed)**

```bash
node -e "
// Patch irc to avoid actually connecting
require.cache[require.resolve('irc')] = {
    exports: { Client: function() { return { addListener: function(){} }; } }
};
require('./pantsman');
console.log('loaded OK');
"
```

Expected: prints `markov: warning: ...` (no corpus file yet) then `loaded OK`.

- [ ] **Step 4: Commit**

```bash
git add pantsman.js
git commit -m "feat: wire markov chain into irc bot (train on messages, reply by name or random chance)"
```
