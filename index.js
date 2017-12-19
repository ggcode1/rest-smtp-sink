'use strict';
const simplesmtp = require('simplesmtp');
const promisifyAll = require('es6-promisify-all');
const fs = promisifyAll(require('fs'));
const compress = require('compression');
const MailParser = require('mailparser').MailParser;
const EventEmitter = require('events').EventEmitter;
const knex = require('knex');
const inherits = require('inherits');
const _ = require('lodash');
const JSONStream = require('JSONStream');
const asyncHandler = require('express-async-handler');

module.exports = RestSmtpSink;

inherits(RestSmtpSink, EventEmitter);

function RestSmtpSink(options) {
	EventEmitter.call(this);
	const self = this;
	self.smtpport = options.smtp || 2525;
	self.httpport = options.listen || 2526;
	self.filename = options.file || 'rest-smtp-sink.sqlite';

	this.setMaxListeners(Infinity);
}

RestSmtpSink.prototype.start = async function() {
	const self = this;

	await this.createSchema();
	self.createSmtpSever();
	self.smtp.listen(self.smtpport);
	self.emit('info', 'SMTP server listening on port ' + self.smtpport);

	self.server = self.createWebServer().listen(self.httpport, function() {
		self.emit('info', 'HTTP server listening on port ' + self.httpport);
	});
}

RestSmtpSink.prototype.createSchema = async function() {
	const self = this;

	self.db = knex({
		client: 'sqlite3',
		useNullAsDefault: true,
		connection: {
			filename: self.filename
		},
	});

	try {
		await self.db.schema.createTable('emails', function(table) {
			table.increments();
			table.timestamps();
			['html', 'text', 'headers', 'subject', 'messageId', 'priority', 'from', 'to']
			.map(id => table.json(id));
		});
	} catch (err) {
		self.emit('info', err.message);
	}
}

RestSmtpSink.prototype.createSmtpSever = function() {
	const self = this;

	self.smtp = simplesmtp.createServer({
		enableAuthentication: true,
		requireAuthentication: false,
		SMTPBanner: 'rest-smtp-sink',
		disableDNSValidation: true,
	});

	self.smtp.on("startData", function(connection) {

		connection.mailparser = new MailParser();
		connection.mailparser.on("end", async function (mail_object) {
			const record = await self.db('emails').insert({
				"created_at": new Date(),
				"updated_at": new Date(),
				'html': JSON.stringify(mail_object.html),
				'text': JSON.stringify(mail_object.text),
				'headers': JSON.stringify(mail_object.headers),
				'subject': JSON.stringify(mail_object.subject),
				'messageId': JSON.stringify(mail_object.messageId),
				'priority': JSON.stringify(mail_object.priority),
				'from': JSON.stringify(connection.from),
				'to': JSON.stringify(connection.to)
			});

			const mail = await self.db('emails')
				.select('*')
				.where('id', '=', record[0]); // primary key from DB
				
			self.emit('email', self.deserialize(mail[0]));
			connection.donecallback(null, record);
		});
	});

	self.smtp.on("data", function(connection, chunk) {
		connection.mailparser.write(chunk);
	});

	self.smtp.on("dataReady", function(connection, callback) {
		connection.donecallback = callback;
		connection.mailparser.end();
	});
}

RestSmtpSink.prototype.deserialize = function(o) {
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

RestSmtpSink.prototype.createWebServer = function() {
	const self = this;
	const express = require('express');
	const app = express();

	app.use(compress());

	app.get('/', asyncHandler(async (req, res, next) => {

		res.set('Content-Type', 'text/html');


		// Yes, this is valid HTML 5! According to the specs, the <html>, <head> and <body>
		// tags can be omitted, but their respective DOM elements will still be there
		// implicitly when a browser renders that markup.

		res.write('rest-smtp-sink' + '<br><br>SMTP server listening on port ' + _.escape(self.smtpport) + '; HTTP listening on port ' + _.escape(self.httpport) + '<br>Note: This page dynamically updates as email arrives.' + '<br><br>API' + '<br><a href="/api/email">All Emails ( /api/email )</a>' + '<br><a href="/api/email">All Email, streamed, may load faster ( /api/email/stream )</a>' + '<br><a href="/api/email/latest">Last received Email</a> ( /api/email/latest )');

		res.write('<table><thead><tr><td>ID<td>Del<td>Purge<td>To<td>From<td>Subject<td>Date</thead><tbody>');

		res.flush(); // make sure the above data gets sent, so it doesn't look like the page is hanging.

		function render_item(item) {
			return '<tr><td><a href="/api/email/' + _.escape(item.id) + '">' + _.escape(item.id) + '</a>' + '<td><a href="/api/email/delete/' + _.escape(item.id) + '"> Del </a>' + '<td><a href="/api/email/purge/' + _.escape(item.id) + '"> Purge </a>' + '<td>' + _.escape(item.to) + '<td>' + _.escape(item.from) + '<td>' + _.escape(item.subject) + '<td>' + _.escape(new Date(item.created_at))
		}

		const resp = await self.db.select('*').from('emails');
		resp.forEach(self.deserialize);
		resp.forEach(function(item) {
			res.write(render_item(item));
			res.flush();
		});

		const listener = function(item) {
			res.write(render_item(item));
			res.flush();
		}

		self.on('email', listener);

		req.on('close', function() {
			self.removeListener('email', listener);
		})
	}));

	app.get('/api/email', asyncHandler(async (req, res, next) => {
		const resp = await self.db.select('*').from('emails');
		resp.forEach(self.deserialize);
		res.json(resp);
	}));
	

	app.get('/api/email/stream', asyncHandler(async (req, res, next) => {
		const stream = self.db.select('*').from('emails').stream()

		stream.pipe(JSONStream.stringify('[',
		',',
		']')).pipe(res);

		stream.on('end', function() {
			res.end();
		});
	}));

	app.get('/api/email/latest', asyncHandler(async (req, res, next) => {
		const resp = await self.db.select('*').from('emails').orderBy('id', 'desc').limit(1);
		if (resp.length < 1) {
			res.status(404).send('Not found')
		} else {
			res.json(self.deserialize(resp[0]));
		}
	}));

	app.get('/api/email/:id', asyncHandler(async (req, res, next) => {
		const resp = await self.db.select('*').from('emails').where('id', '=', req.params.id);	
		if (resp.length < 1) {
			res.status(404).send('Not found')
		} else {
			res.json(self.deserialize(resp[0]));
		}
	}));

	app.get('/api/email/delete/:id', asyncHandler(async (req, res, next) => {
		const resp = await self.db.select('*').from('emails').where('id', '=', req.params.id);
		if (resp.length < 1) {
			res.status(404).send('Not found')
		} else {
			await self.db('emails').where('id', '=', req.params.id).del();
			res.status(200).send('Removed');
		}
	}));

	app.get('/api/email/purge/:id', asyncHandler(async (req, res, next) => {
		const resp = await self.db.select('*').from('emails').where('id', '<=', req.params.id)
		if (resp.length < 1) {
			res.status(404).send('Not found')
		} else {
			await self.db('emails').where('id', '<=', req.params.id).del();
			res.status(200).send('Purged records older than ' + req.params.id);
		}
	}));

	return app;
}
