#!/usr/bin/env node
'use strict';

var pony = require('pony');
 
var mail = pony({
    host : 'localhost',
    port : 2525,
    from : 'you@example.com',
    to : 'me@example.com',
});
mail.setHeader('content-type', 'text/plain');
mail.setHeader('subject', 'greetings');
mail.end('oh hello');