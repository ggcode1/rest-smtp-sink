#!/usr/bin/env node
'use strict';

var casual = require('casual');
var pony = require('pony');
 
var mail = pony({
    host : 'localhost',
    port : 2525,
    from : casual.email,
    to : casual.email
});
mail.setHeader('content-type', 'text/plain');
mail.setHeader('subject', casual.catch_phrase);
mail.end(casual.sentences(7));
