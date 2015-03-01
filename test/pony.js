#!/usr/bin/env node
'use strict';

var casual = require('casual');
var pony = require('pony');
 
var mail = pony({
    host : 'localhost',
    port : 2525,
    from : 'you@example.com',
    to : 'me@example.com',
});
mail.setHeader('content-type', 'text/plain');
mail.setHeader('subject', casual.sentence);
mail.end(casual.sentences(7));