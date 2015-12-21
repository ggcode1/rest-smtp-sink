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
var JSONStream = require('JSONStream');

module.exports = RestSmtpSink;

inherits(RestSmtpSink, EventEmitter);

function RestSmtpSink(options) {
    EventEmitter.call(this);
    var self = this;
    self.smtpport = options.smtp || 2525;
    self.httpport = options.listen || 2526;
    self.filename = options.file || 'rest-smtp-sink.sqlite';

    this.setMaxListeners(Infinity);
}

RestSmtpSink.prototype.start = function() {
    var self = this;

    return self.createSchema()
        .then(function() {
            self.createSmtpSever();
            self.smtp.listen(self.smtpport);
            self.emit('info', 'SMTP server listening on port ' + self.smtpport);

            self.server = self.createWebServer().listen(self.httpport, function() {
                self.emit('info', 'HTTP server listening on port ' + self.httpport);
            });
        })
}

RestSmtpSink.prototype.createSchema = function() {
    var self = this;

    self.db = knex({
        client: 'sqlite3',
        connection: {
            filename: self.filename
        }
    });

    return self.db.schema.createTable('emails', function(table) {
            table.increments();
            table.timestamps();
            ['html', 'text', 'headers', 'subject', 'messageId', 'priority', 'from', 'to']
            .map(function(id) {
                table.json(id)
            });
        })
        .catch(function(err) {
            if (~err.message.indexOf('SQLITE_ERROR: table "emails" already exists')) {
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

    self.smtp.on("startData", function(connection) {

        connection.mailparser = new MailParser();
        connection.mailparser.on("end", function(mail_object) {
            self.db('emails')
                .insert({
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
                })
                .then(function(record) {
                    self.db('emails')
                        .select('*')
                        .where('id', '=', record[0]) // primary key from DB
                        .then(function(mail) {
                            self.emit('email', self.deserialize(mail[0]));
                        });

                    connection.donecallback(null, record);
                });
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
    var self = this;
    var express = require('express');
    var app = express();

    app.use(compress());

    app.get('/', function(req, res) {

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

        self.db.select('*').from('emails')
            .then(function(resp) {
                resp.forEach(self.deserialize);
                resp.forEach(function(item) {
                    res.write(render_item(item));
                    res.flush();
                });
            });

        var listener = function(item) {
            res.write(render_item(item));
            res.flush();
        }

        self.on('email', listener);

        req.on('close', function() {
            self.removeListener('email', listener);
        })
    });

    app.get('/api/email', function(req, res, next) {
        self.db.select('*').from('emails')
            .then(function(resp) {
                resp.forEach(self.deserialize);
                res.json(resp);
            })
            .catch(next)
    });

    app.get('/api/email/stream', function(req, res, next) {
        var stream = self.db.select('*').from('emails').stream()

        stream.pipe(JSONStream.stringify('[',
            ',',
            ']')).pipe(res);

        stream.on('end', function() {
            res.end();
        });
    });

    app.get('/api/email/latest', function(req, res, next) {
        self.db.select('*').from('emails')
            .orderBy('id', 'desc')
            .limit(1)
            .then(function(resp) {
                if (resp.length < 1) {
                    res.status(404).send('Not found')
                } else {
                    res.json(self.deserialize(resp[0]));
                }
            })
            .catch(next)
    });

    app.get('/api/email/:id', function(req, res, next) {
        self.db.select('*').from('emails')
            .where('id', '=', req.params.id)
            .then(function(resp) {
                if (resp.length < 1) {
                    res.status(404).send('Not found')
                } else {
                    res.json(self.deserialize(resp[0]));
                }
            })
            .catch(next)
    });

    app.get('/api/email/delete/:id', function(req, res, next) {
        self.db.select('*').from('emails')
            .where('id', '=', req.params.id)
            .then(function(resp) {
                if (resp.length < 1) {
                    res.status(404).send('Not found')
                } else {
                    self.db('emails')
                        .where('id', '=', req.params.id)
                        .del()
						.then(function () {
							res.status(200).send('Removed');
						})
						.catch(function (err) {
							res.status(500).send(err);
						})
                }
            })
            .catch(next)
    });

    app.get('/api/email/purge/:id', function(req, res, next) {
        self.db.select('*').from('emails')
            .where('id', '<=', req.params.id)
            .then(function(resp) {
                if (resp.length < 1) {
                    res.status(404).send('Not found')
                } else {
                    self.db('emails')
                        .where('id', '<=', req.params.id)
                        .del()
						.then(function () {
							res.status(200).send('Purged records older than ' + req.params.id);
						})
						.catch(function (err) {
							res.status(500).send(err);
						})
                }
            })
            .catch(next)
    });

    return app;
}
