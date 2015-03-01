var net = require('net');

var StringDecoder = require('string_decoder').StringDecoder;
var decoder = new StringDecoder('utf8');

function sendTestMail() {
	var client = net.connect(2525, 'localhost', function() { //'connect' listener
    console.log('connected to server!');
    client.write('HELO client.example.com\r\n');
    client.write('MAIL from: <sender@example.com>\r\n');
    client.write('RCPT to: <receiver@example.com>\r\n');
    client.write('DATA\r\n');
    client.write('boop ' + new Date() + '\n\n');
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

setInterval(sendTestMail, 1);