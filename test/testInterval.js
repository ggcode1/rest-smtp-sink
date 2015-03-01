#!/usr/bin/env node
'use strict';

var net = require('net');
var casual = require('casual');
var pony = require('pony');

var StringDecoder = require('string_decoder').StringDecoder;
var decoder = new StringDecoder('utf8');

function ponyTest() {

  var mail = pony({
      host : 'localhost',
      port : 2525,
      from : casual.email,
      to : casual.email
  });
  mail.setHeader('content-type', 'text/plain');
  mail.setHeader('subject', casual.catch_phrase);
  mail.end(casual.sentences(7));

  // mail.on('error', console.error);
}

function rawTest() {
	var client = net.connect(2525, 'localhost', function() { //'connect' listener
    console.log('connected to server!');
    client.write('HELO client.example.com\r\n');
    client.write('MAIL from: <' + casual.email + '>\r\n');
    client.write('RCPT to: <' + casual.email + '>\r\n');
    client.write('DATA\r\n');
    client.write('boop ' + casual.sentences(16) + '\n\n');
    client.write('\r\n.\r\n');
    client.write('\r\nQUIT\r\n');
  });

  client.on('data', function (data) {
    console.log(decoder.write(data));
  });

  client.on('error', function (error) {
    console.error(error);
  })

}

setInterval(ponyTest, 1);
