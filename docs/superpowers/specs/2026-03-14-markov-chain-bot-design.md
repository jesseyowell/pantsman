# Markov Chain IRC Bot — Design Spec

**Date:** 2026-03-14
**Project:** pantsman (IRC bot on irc.esper.net / #selectbutton)

---

## Overview

Extend the existing minimal IRC bot (`pantsman.js`) with an order-1 Markov chain engine. The bot learns from channel messages, persists its corpus across restarts, and replies either when addressed by name or randomly based on a configurable probability.

---

## Architecture

Two files, both in the project root:

- **`markov.js`** — self-contained Markov chain module. Owns the chain data structure, corpus load/save, training, and generation. No external dependencies beyond Node's built-in `fs` and `path`.
- **`pantsman.js`** — IRC bot entry point. Wires the `irc` client to the Markov module. Handles startup load, per-message train/reply logic, and shutdown save.

---

## Data Structure

The chain is a plain JS object:

```json
{ "word": ["nextWord1", "nextWord2", "nextWord2"] }
```

Words that appear more frequently as successors appear multiple times in the array, giving them proportionally higher selection probability. Stored as JSON on disk.

---

## Module: `markov.js`

All functions are **synchronous** (use `fs.readFileSync` / `fs.writeFileSync`). This keeps the implementation simple and avoids async sequencing issues.

Exported API:

```js
module.exports = { train, generate, load, save };
```

`pantsman.js` invokes:
- `markov.load(config.corpusFile)` on startup
- `markov.train(message)` per message
- `markov.generate(config.maxWords)` to produce a reply
- `markov.save(config.corpusFile)` on shutdown

`config.corpusFile` is a string like `"./corpus.json"`. `load` and `save` resolve it with `path.resolve(__dirname, filePath)`. Since `markov.js` lives in the project root (same directory as `pantsman.js`), `"./corpus.json"` resolves to the project root. The caller (`pantsman.js`) passes `config.corpusFile` unchanged; no resolution happens in `pantsman.js`.

**`markov.train(text)`**
Splits text on whitespace. Walks consecutive word pairs, appending each successor into `chain[word]`. Ignores empty strings. The bot name may appear in messages (e.g. `"pantsman: say something"`) and will be trained into the chain as a regular word — this is intentional and acceptable.

**`markov.generate(maxWords)`**
- `maxWords` is required. Spec assumes it is a positive integer (valid config). Behavior for `0` or negative values is undefined.
- If the chain is empty, returns `null`.
- Picks a start word using uniform random selection over all keys: `keys[Math.floor(Math.random() * keys.length)]`.
- Iterates: at each word, pick a random entry from `chain[word]` using the same method.
- Stops when `maxWords` words have been generated (the primary stop condition — chat-trained chains rarely have terminal nodes) or when the current word has no successors.
- Returns the generated string. A single-word result is acceptable.

**`markov.load(filePath)`**
Synchronously reads and JSON-parses the file at `path.resolve(__dirname, filePath)`. **Replaces** the in-memory chain entirely with the loaded data (does not merge). On `ENOENT` or JSON parse error, logs a warning and sets chain to `{}`. Other errors (e.g. permissions) are allowed to throw.

**`markov.save(filePath)`**
Synchronously serializes the chain to JSON and writes to `path.resolve(__dirname, filePath)`. Since `corpusFile` is `"./corpus.json"` and the project root directory always exists, a missing parent directory is not an expected failure mode — but `save` wraps the write in a try/catch anyway: on any error, logs to console and returns without throwing.

---

## Bot Logic (`pantsman.js`)

**Startup sequence (order matters):**
1. Call `markov.load(config.corpusFile)` — completes synchronously before any IRC connection.
2. Create the `irc.Client` and register listeners.

Config is assumed to be valid (all keys present with correct types). No runtime validation is performed.

**On each `message` event:**

The `irc` package fires: `bot.addListener('message', function(from, to, message, raw) { ... })`.

- `from` — the sender's IRC nick
- `to` — the channel name for channel messages, or the bot's own nick for DMs
- `message` — the message text string
- `raw` — raw IRC message object (unused)

Steps (order matters — skip checks must come before training):
1. If `to.toLowerCase() === config.botName.toLowerCase()` — `to` is the bot's nick, so this is a DM. Skip entirely (no training, no reply). This check is best-effort: if the server has assigned a different nick due to collision (see Out of Scope), DMs will not be detected.
2. If `from.toLowerCase() === config.botName.toLowerCase()` — this is our own message. Skip entirely (no training, no reply).
3. Call `markov.train(message)`. Training happens before reply, so the just-seen words are immediately eligible for output — intentional.
4. Check if `message.toLowerCase()` contains `config.botName.toLowerCase()`:
   - Yes → generate and reply. If `generate(config.maxWords)` returns `null` (cold start, chain still empty), skip silently.
   - No → roll `Math.random() < config.replyChance`; if true, generate and reply (skip silently if `null`).
5. Reply by calling `bot.say(to, generated)`. Because step 1 skips DMs, `to` is always a channel name here.

**Shutdown:**
```js
function shutdown() {
  markov.save(config.corpusFile);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```
Save is synchronous so it completes before `process.exit(0)` is called. The existing `error` listener logs IRC errors but does **not** save the corpus — intentional (see Out of Scope).

---

## Configuration (`config/default.json`)

Add three keys (existing keys `botName`, `server`, `channels` remain unchanged):

| Key | Type | Description |
|---|---|---|
| `replyChance` | float (0–1) | Probability of an unprompted reply (e.g. `0.05` = 5%) |
| `corpusFile` | string | Path to corpus JSON file, relative to `markov.js` (e.g. `"./corpus.json"`) |
| `maxWords` | integer | Max words in a generated message, must be positive (e.g. `30`) |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Corpus file missing on load | Start with empty chain, no error thrown |
| Corpus file contains invalid JSON | Log warning, start with empty chain |
| `generate()` called on empty chain | Return `null`, bot stays silent |
| `generate()` returns a single word | Acceptable — bot says the word |
| Bot receives its own message | Skip training and reply entirely |
| Bot receives a DM | Skip entirely (no training, no reply) — best-effort, see Out of Scope |
| `save()` fails for any reason | Log error, continue running |
| IRC error event fires | Log only (existing behavior), corpus not saved |

---

## Out of Scope

- Pre-loaded text corpus (bot learns exclusively from live chat)
- Order > 1 Markov chain
- Persistent message history beyond the chain structure
- Periodic corpus saves (corpus only flushed on clean `SIGINT`/`SIGTERM`; a crash loses training since last start)
- Saving corpus on IRC errors
- Nick collision handling — if the server assigns a nick different from `config.botName`, DM detection silently fails
- Config validation
- Tests (project is small enough for manual verification)
