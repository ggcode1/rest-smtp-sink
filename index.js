var simplesmtp = require('simplesmtp');
var fs = require('fs');

var smtpport = process.env.SMTPPORT || 2525;
var httpport = process.env.HTTPPORT || 2526;
var compress = require('compression');

var MailParser = require("mailparser").MailParser;

var db = require('knex')({
	client: 'sqlite3',
	connection: {
		filename: './rest-smtp-sink.sqlite'
	}
});

db.schema.createTable('emails', function (table) {
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
}).then(function (resp) {
	console.log(resp);
})
.catch(function (err) {
	console.error(err);
})

var smtp = simplesmtp.createServer({
	enableAuthentication: true,
	requireAuthentication: false,
	SMTPBanner: 'rest-smtp-sink',
	disableDNSValidation: true
});
smtp.listen(smtpport);
console.log('SMTP server listening on port ' + smtpport);

smtp.on("startData", function(connection){
	connection.mailparser = new MailParser();
	connection.mailparser.on("end", function(mail_object){
		db('emails')
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
		.then(function (res) {
			connection.donecallback(null, res); // ABC1 is the queue id to be advertised to the client
		});
	});
});

function deserialize(o) {
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


smtp.on("data", function(connection, chunk){
	connection.mailparser.write(chunk);
});

smtp.on("dataReady", function(connection, callback){
	connection.donecallback = callback;
	connection.mailparser.end();
});


var express = require('express');
var app = express();

app.use(compress());

app.get('/', function(req, res){
	res.send('<html><body>HTTP listening on port ' + server.address().port
	+ '<br>SMTP server listening on port ' + smtpport
	+ '<br><br>API'
	+ '<br><a href="/api/email">All Emails ( /api/email )</a>'
	+ '<br><a href="/api/email/latest">Last received Email</a> ( /api/email/latest )'
	+ '<br><a href="/api/email/1">Email #1</a> ( /api/email/1 )'
	+ '<br><a href="/api/email/2">Email #2</a> ( /api/email/2 )'
	+ '</body></html>'
	)
});

app.get('/api/email', function(req, res, next){
	db.select('*').from('emails')
	.then(function (resp) {
		resp.forEach(deserialize);
		res.json(resp);
	})
	.catch(next)
});

app.get('/api/email/latest', function(req, res, next){
	db.select('*').from('emails')
	.orderBy('id', 'desc')
	.limit(1)
	.then(function (resp) {
		if (resp.length < 1) {
			res.status(404).send('Not found')
		} else {
			res.json(deserialize(resp[0]));
		}
	})
	.catch(next)
});

app.get('/api/email/:id', function(req, res, next){
	db.select('*').from('emails')
	.where('id', '=', req.params.id)
	.then(function (resp) {
		if (resp.length < 1) {
			res.status(404).send('Not found')
		} else {
			res.json(deserialize(resp[0]));
		}
	})
	.catch(next)
});

var server = app.listen(httpport, function() {
    console.log('HTTP server listening on port %d', server.address().port);
});
