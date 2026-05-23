var Anthropic = require('@anthropic-ai/sdk').default;
var config = require('config');

var client;
try {
    client = new Anthropic();
} catch (e) {
    console.log('polish: claude sdk init failed (' + e.message + '); polish disabled, falling back to raw markov');
    client = null;
}

var SYSTEM_PROMPT = [
    'You take incoherent markov-chain text and rewrite it as a short, surreal, deadpan one-line post in the voice of @dailydunston on BlueSky.',
    'Preserve the weird non-sequiturs and unhinged energy of the input. Do not sanitize. Do not explain.',
    '',
    'Voice reference (study the rhythm, tone, and absurdism):',
    '"Dunston grasps the armrest. \'me not your type, i prefer chimp...you bony...i\'m ape.\' He then attempts to shovel spaghetti into his face."',
    '"in defiance of God and all that is holy, Dunston Forms a Punitively Evil Alliance with a Clown"',
    '"After no small amount of antics, Dunston finally breaks into your home and gets your mail!"',
    '"Dunston\'s top 10 tips to snatching boobs from the other side of the world"',
    '"Dunston posts to his tumblr page frequently: sometimes, it\'s a picture of a buttock...but always, it\'s an insipid caption like \'dunstonic bananas\'"',
    '"Dunston opens a web browser and immediately searches for \'bodypart exchange\'"',
    '"Dunston grimaces - this is going to hurt. He\'s bitten an electrical wire in self defence, and it\'s hot, sticky, and badly twisted."',
    '"At the park, Dunston will happily climb onto your lap and cuddle up for a nap."',
    '"Today, Dunston is doing product reviews. \'The Chud... they make out OK. My granny smell like weed.\'"',
    '',
    'Rules:',
    '- Output ONLY the rewritten post. No preamble, no quotes around it, no commentary.',
    '- One sentence or a tight two-sentence vignette. Under ~250 characters when possible.',
    '- Do NOT mention Dunston unless the input does.',
    '- Keep weird specifics from the input (proper nouns, odd phrases, weird verbs). Don\'t smooth them out.',
    '- If the input is too incoherent to salvage, write a new short post in the voice that vaguely riffs on a fragment of the input.'
].join('\n');

async function polish(markovText) {
    if (!client) return null;
    try {
        var response = await client.messages.create({
            model: config.polishModel,
            max_tokens: 200,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' }
                }
            ],
            messages: [
                { role: 'user', content: 'Rewrite this in the voice above:\n\n' + markovText }
            ]
        });

        for (var i = 0; i < response.content.length; i++) {
            var block = response.content[i];
            if (block.type === 'text') {
                return block.text.trim();
            }
        }
        return null;
    } catch (e) {
        console.log('polish: claude call failed (' + e.message + '); falling back to raw markov');
        return null;
    }
}

module.exports = { polish: polish };
