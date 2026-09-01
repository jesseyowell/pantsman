// Fetches recent original posts from a BlueSky user and trains the markov corpus.
// Usage: node ingest-bluesky.js <handle> [days]
// Default: days=21
//
// The handle is required on purpose: whatever it posts is what the bot will
// say in the channel, so there is no default worth guessing.

var config = require('config');
var markov = require('./markov');

var HANDLE = process.argv[2];
var DAYS = parseInt(process.argv[3], 10) || 21;
var API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';

if (!HANDLE) {
    console.error('usage: node ingest-bluesky.js <handle> [days]');
    process.exit(1);
}

async function fetchPage(cursor) {
    var url = new URL(API);
    url.searchParams.set('actor', HANDLE);
    url.searchParams.set('limit', '100');
    url.searchParams.set('filter', 'posts_no_replies');
    if (cursor) url.searchParams.set('cursor', cursor);
    var res = await fetch(url);
    if (!res.ok) throw new Error('bluesky api ' + res.status + ' ' + res.statusText);
    return res.json();
}

async function main() {
    markov.load(config.corpusFile);
    var cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;
    var cursor;
    var scanned = 0;
    var trained = 0;

    while (true) {
        var data = await fetchPage(cursor);
        if (!data.feed || data.feed.length === 0) break;

        var reachedCutoff = false;
        for (var i = 0; i < data.feed.length; i++) {
            var item = data.feed[i];
            scanned++;

            // skip reposts (author feed includes them even with posts_no_replies)
            if (item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost') continue;

            var record = item.post && item.post.record;
            if (!record || !record.text) continue;
            // belt-and-suspenders: skip replies in case the filter misses any
            if (record.reply) continue;

            var createdAt = new Date(record.createdAt).getTime();
            if (createdAt < cutoff) {
                reachedCutoff = true;
                break;
            }

            markov.train(record.text);
            trained++;
        }

        if (reachedCutoff) break;
        if (!data.cursor) break;
        cursor = data.cursor;
    }

    console.log('bluesky: scanned ' + scanned + ' feed items from @' + HANDLE + ', trained on ' + trained + ' original posts from the past ' + DAYS + ' days');
    markov.save(config.corpusFile);
}

main().catch(function(e) {
    console.error('bluesky ingest failed:', e.message);
    process.exit(1);
});
