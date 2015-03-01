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
server.ee.on('info', function (info) {
	console.log('info: ' + info);
})

server.start();