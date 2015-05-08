[rest-smtp-sink](https://www.npmjs.org/package/rest-smtp-sink)
==============


[![NPM Version][npm-version-image]][npm-url]
[![NPM Downloads][npm-downloads-image]][npm-url]
[![Node.js Version][node-image]][node-url]
[![Build Status][travis-image]][travis-url]
[![Dependency Status][dependencies-image]][dependencies-url]
[![Coverage Status][coveralls-image]][coveralls-url]

[![NPM][npm-image]][npm-url]


Similar to [FakeSMTP](http://nilhcem.github.io/FakeSMTP/), rest-smtp-sink is a SMTP server and web server. It stores e-mails it receives in a [SQLite](http://www.sqlite.org) database, and serves them via its own web server, with a RESTful API.

## Install

```npm install -g rest-smtp-sink```


## Usage

``rest-smtp-sink``

Creates a server using the default SMTP port of 2525, HTTP port of 2526, and a database with the file name rest-smtp-sink.sqlite

## Options

``-l, --listen [port]``

TCP port to listen on for HTTP

``-s, --smtp [port]``

TCP port to listen on for SMTP

``-f, --file [file]``

SQLite database file

[npm-version-image]: https://img.shields.io/npm/v/rest-smtp-sink.svg
[npm-downloads-image]: https://img.shields.io/npm/dm/rest-smtp-sink.svg
[npm-image]: https://nodei.co/npm/rest-smtp-sink.png?downloads=true&downloadRank=true&stars=true
[npm-url]: https://npmjs.org/package/rest-smtp-sink
[travis-image]: https://img.shields.io/travis/llambda/rest-smtp-sink/master.svg
[travis-url]: https://travis-ci.org/llambda/rest-smtp-sink
[dependencies-image]: https://david-dm.org/llambda/rest-smtp-sink.svg?style=flat
[dependencies-url]: https://david-dm.org/llambda/rest-smtp-sink
[coveralls-image]: https://img.shields.io/coveralls/llambda/rest-smtp-sink/master.svg
[coveralls-url]: https://coveralls.io/r/llambda/rest-smtp-sink?branch=master
[node-image]: https://img.shields.io/node/v/rest-smtp-sink.svg
[node-url]: http://nodejs.org/download/
[gitter-join-chat-image]: https://badges.gitter.im/Join%20Chat.svg
[gitter-channel-url]: https://gitter.im/llambda/rest-smtp-sink
[express-session-url]: https://github.com/expressjs/session
[io-url]: https://iojs.org

