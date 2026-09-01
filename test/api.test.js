var test = require('node:test');
var assert = require('node:assert');
var app = require('../api');

var server;
var base;

test.before(function (t, done) {
    // Requiring ../api pulls in the restless SDK, which loads .env into
    // process.env — so a developer's API_TOKEN would gate /train for every
    // test. The test that exercises the gate sets the token itself.
    delete process.env.API_TOKEN;

    server = app.listen(0, function () {
        base = 'http://127.0.0.1:' + server.address().port;
        done();
    });
});

test.after(function () {
    server.close();
});

test('GET /generate returns 503 when the corpus is empty', async function () {
    var res = await fetch(base + '/generate');
    assert.strictEqual(res.status, 503);
    var body = await res.json();
    assert.ok(body.error);
});

test('POST /train with no text returns 400', async function () {
    var res = await fetch(base + '/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
});

test('POST /train accepts text and returns 204', async function () {
    var res = await fetch(base + '/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello world hello world' })
    });
    assert.strictEqual(res.status, 204);
});

test('GET /generate returns text built from trained words', async function () {
    var res = await fetch(base + '/generate');
    assert.strictEqual(res.status, 200);
    var body = await res.json();
    assert.strictEqual(typeof body.text, 'string');
    body.text.split(' ').forEach(function (word) {
        assert.ok(['hello', 'world'].indexOf(word) !== -1,
            'unexpected word in output: ' + word);
    });
});

test('GET /generate?maxWords=1 returns a single word', async function () {
    var res = await fetch(base + '/generate?maxWords=1');
    assert.strictEqual(res.status, 200);
    var body = await res.json();
    assert.strictEqual(body.text.split(' ').length, 1);
});

test('POST /train requires the token when API_TOKEN is set', async function (t) {
    process.env.API_TOKEN = 'sekrit';
    t.after(function () { delete process.env.API_TOKEN; });

    var res = await fetch(base + '/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello world' })
    });
    assert.strictEqual(res.status, 401);

    res = await fetch(base + '/train', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer wrong'
        },
        body: JSON.stringify({ text: 'hello world' })
    });
    assert.strictEqual(res.status, 401);

    res = await fetch(base + '/train', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sekrit'
        },
        body: JSON.stringify({ text: 'hello world' })
    });
    assert.strictEqual(res.status, 204);
});

test('GET /stats reports words and transitions', async function () {
    var res = await fetch(base + '/stats');
    assert.strictEqual(res.status, 200);
    var body = await res.json();
    assert.strictEqual(typeof body.words, 'number');
    assert.strictEqual(typeof body.transitions, 'number');
    assert.ok(body.words > 0);
    assert.ok(body.transitions > 0);
});
