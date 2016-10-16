#!/usr/bin/env node

'use strict';

var program = require('commander');
var packagejson = require('./package.json');
var path = require('path');

program
.version(packagejson.version)
.option('-l, --listen [port]', 'TCP port to listen on for HTTP', parseInt)
.option('-s, --smtp [port]', 'TCP port to listen on for SMTP', parseInt)
.option('-f, --file [file]', 'File to save SQLite database in')
.parse(process.argv);

var RestSmtpSink = require('./index');

var server = new RestSmtpSink(program);
server.on('info', function(info) {
	console.log('info: ' + info);
})

server.start();

var interval = 1000; // how often to refresh our measurement

var monitor = require('event-loop-monitor');

// data event will fire every 4 seconds
monitor.on('data', function(latency) {
	console.log(latency); // { p50: 1026, p90: 1059, p95: 1076, p99: 1110, p100: 1260 }
});

monitor.resume(); // to start measuring
