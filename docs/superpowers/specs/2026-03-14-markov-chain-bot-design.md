# Markov Chain IRC Bot — Design Spec

**Date:** 2026-03-14
**Project:** pantsman (IRC bot on irc.esper.net / #selectbutton)

---

## Overview

Extend the existing minimal IRC bot (`pantsman.js`) with an order-1 Markov chain engine. The bot learns from channel messages, persists its corpus across restarts, and replies either when addressed by name or randomly based on a configurable probability.

---

## Architecture

Two files:

- **`markov.js`** — self-contained Markov chain module. Owns the chain data structure, corpus load/save, training, and generation. No external dependencies.
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

**`markov.train(text)`**
Splits text on whitespace. Walks consecutive word pairs, appending each successor into `chain[word]`. Ignores empty strings.

**`markov.generate(maxWords)`**
Picks a random key from the chain as the start word. Iterates: at each word, pick a random entry from `chain[word]`. Stops when the current word has no successors or `maxWords` is reached. Returns the generated string. Returns `null` if the chain is empty.

**`markov.load(filePath)`**
Reads and JSON-parses the corpus file. On missing file or parse error, logs a warning and starts with an empty chain.

**`markov.save(filePath)`**
Serializes the chain object to JSON and writes to `filePath`.

---

## Bot Logic (`pantsman.js`)

**Startup:** call `markov.load(config.corpusFile)`.

**On each `message` event:**
1. Skip if `from === config.botName` (avoid self-feedback loops).
2. Call `markov.train(message)`.
3. Check if the message starts with or contains the bot's name:
   - Yes → generate and send reply (always).
   - No → roll `Math.random() < config.replyChance`; if true, generate and send reply.
4. If `generate()` returns `null` (empty corpus), skip the reply silently.

**Shutdown:** hook `process.on('SIGINT')` and `process.on('SIGTERM')` to call `markov.save(config.corpusFile)` before exiting.

---

## Configuration (`config/default.json`)

Add three keys:

| Key | Type | Description |
|---|---|---|
| `replyChance` | float (0–1) | Probability of an unprompted reply (e.g. `0.05` = 5%) |
| `corpusFile` | string | Path to the JSON corpus file (e.g. `"./corpus.json"`) |
| `maxWords` | integer | Max words in a generated message (e.g. `30`) |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Corpus file missing on load | Start with empty chain, no error thrown |
| Corpus file contains invalid JSON | Log warning, start with empty chain |
| `generate()` called on empty chain | Return `null`, bot stays silent |
| Bot receives its own message | Skip training and reply entirely |

---

## Out of Scope

- Pre-loaded text corpus (bot learns exclusively from live chat)
- Order > 1 Markov chain
- Persistent message history beyond the chain structure
- Tests (project is small enough for manual verification)
