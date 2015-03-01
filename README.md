[rest-smtp-sink](https://www.npmjs.org/package/rest-smtp-sink)
==============

Similar to [FakeSMTP](http://nilhcem.github.io/FakeSMTP/), rest-smtp-sink is a SMTP server and web server. It stores e-mails it receives in a [SQLite](http://www.sqlite.org) database, and serves them via its own web server, with a RESTful API.

## Install
```npm install -g rest-smtp-sink```

## Usage
```rest-smtp-sink```
Creates a server using the default SMTP port of 2525, HTTP port of 2526, and a database with the file name 'rest-smtp-sink.sqlite'

## Options

```-l, --listen [port]    TCP port to listen on for HTTP
-s, --smtp [port]    TCP port to listen on for SMTP
-f, --file [file]    SQLite database file
```


