'use strict';

var BPromise = require('bluebird');
var simplesmtp = require('simplesmtp');
var fs = BPromise.promisifyAll(require('fs'));
var compress = require('compression');
var MailParser = require('mailparser').MailParser;
var EventEmitter = require('events').EventEmitter;
var knex = require('knex');
var inherits = require('inherits');
var _ = require('lodash');

module.exports = RestSmtpSink;

inherits(RestSmtpSink, EventEmitter);

function RestSmtpSink(options) {
	var self = this;
	self.smtpport = options.smtp || 2525;
	self.httpport = options.listen || 2526;
	self.filename = options.file || 'rest-smtp-sink.sqlite';
}

RestSmtpSink.prototype.validateFile = function() {
	var self = this;

	return fs.openAsync(self.filename, 'r')
	.then(function (fd) {
		var buf = new Buffer(6);
		return fs.readAsync(fd, buf, 0, 6, 0)
		.then(function (obj) {
			// obj of [bytesRead, buffer]
			if (0 !== obj[1].compare(new Buffer('SQLite'))) {
				throw new Error('File does not appear to be a SQLite database, aborting');
			}
		})
	})
}

RestSmtpSink.prototype.start = function() {
	var self = this;

	// return self.validateFile().bind(self)
	// .then(self.createSchema)

	return self.createSchema()
	.then(function () {
		self.createSmtpSever();
		self.smtp.listen(self.smtpport);
		self.emit('info', 'SMTP server listening on port ' + self.smtpport);

		self.server = self.createWebServer().listen(self.httpport, function() {
			self.emit('info', 'HTTP server listening on port ' + self.httpport);
		});

		self.on('error', function (error) {
			throw error;
		});
	})
}

RestSmtpSink.prototype.createSchema = function () {
	var self = this;

	self.db = knex({
		client: 'sqlite3',
		connection: { filename: self.filename }
	});

	return self.db.schema.createTable('emails', function (table) {
		table.increments();
		table.timestamps();
		table.json('html');
		table.json('text');
		table.json('headers');
		table.json('subject');
		table.json('messageId');
		table.json('priority');
		table.json('from');
		table.json('to');
	})
	.catch(function (err) {
		if (err.message.includes('SQLITE_ERROR: table "emails" already exists')) {
			self.emit('info', err.message);
		} else {
			self.emit('error', err);
			throw err;
		}
	})
}

RestSmtpSink.prototype.createSmtpSever = function() {
	var self = this;

	self.smtp = simplesmtp.createServer({
		enableAuthentication: true,
		requireAuthentication: false,
		SMTPBanner: 'rest-smtp-sink',
		disableDNSValidation: true
	});

	self.smtp.on("startData", function(connection){
		connection.mailparser = new MailParser();
		connection.mailparser.on("end", function(mail_object){
			self.db('emails')
			.insert({
				"created_at": new Date() ,
				"updated_at": new Date() ,
				'html': JSON.stringify(mail_object.html) ,
				'text': JSON.stringify(mail_object.text) ,
				'headers': JSON.stringify(mail_object.headers) ,
				'subject': JSON.stringify(mail_object.subject) ,
				'messageId': JSON.stringify(mail_object.messageId) ,
				'priority': JSON.stringify(mail_object.priority) ,
				'from': JSON.stringify(mail_object.from) ,
				'to': JSON.stringify(mail_object.to)
			})
			.then(function (record) {
				// mail_object.id = record[0]; // primary key from DB
				self.db('emails')
				.select('*')
				.where('id', '=', record[0])
				.then(function (mail) {
					self.emit('email', mail[0]);
				});

				connection.donecallback(null, record);
			});
		});
	});

	self.smtp.on("data", function(connection, chunk){
		connection.mailparser.write(chunk);
	});

	self.smtp.on("dataReady", function(connection, callback){
		connection.donecallback = callback;
		connection.mailparser.end();
	});
}

RestSmtpSink.prototype.deserialize = function (o) {
	o.html = JSON.parse(o.html)
	o.text = JSON.parse(o.text)
	o.headers = JSON.parse(o.headers)
	o.subject = JSON.parse(o.subject)
	o.messageId = JSON.parse(o.messageId)
	o.priority = JSON.parse(o.priority)
	o.from = JSON.parse(o.from)
	o.to = JSON.parse(o.to)

	return o;
}

RestSmtpSink.prototype.createWebServer = function () {
	var self = this;
	var express = require('express');
	var app = express();

	app.use(compress());

	app.get('/', function(req, res){
		res.write('<html><body>HTTP listening on port ' + self.httpport
			+ '<br>SMTP server listening on port ' + self.smtpport
			+ '<br><br>API'
			+ '<br><a href="/api/email">All Emails ( /api/email )</a>'
			+ '<br><a href="/api/email/latest">Last received Email</a> ( /api/email/latest )'
			// + '<br><a href="/api/email/1">Email #1</a> ( /api/email/1 )'
			// + '<br><a href="/api/email/2">Email #2</a> ( /api/email/2 )'
			);

		function render_item(item) {
			return '<br><a href="/api/email/' + _.escape(item.id) + '">'
				// + JSON.stringify(item)
				+ 'Email #' + _.escape(item.id) + ' created at: ' + _.escape(new Date(item.created_at))
				+ '</a>';
		}

		self.db.select('*').from('emails')
		.then(function (resp) {
			resp.forEach(self.deserialize);
			resp.forEach(function (item) {
				res.write(render_item(item));
			});
		});

		self.on('email', function (item) {
			res.write(render_item(item));
		});
	});

	app.get('/api/email', function(req, res, next){
		self.db.select('*').from('emails')
		.then(function (resp) {
			resp.forEach(self.deserialize);
			res.json(resp);
		})
		.catch(next)
	});

	app.get('/api/email/latest', function(req, res, next){
		self.db.select('*').from('emails')
		.orderBy('id', 'desc')
		.limit(1)
		.then(function (resp) {
			if (resp.length < 1) {
				res.status(404).send('Not found')
			} else {
				res.json(self.deserialize(resp[0]));
			}
		})
		.catch(next)
	});

	app.get('/api/email/:id', function(req, res, next){
		self.db.select('*').from('emails')
		.where('id', '=', req.params.id)
		.then(function (resp) {
			if (resp.length < 1) {
				res.status(404).send('Not found')
			} else {
				res.json(self.deserialize(resp[0]));
			}
		})
		.catch(next)
	});

	return app;
}
