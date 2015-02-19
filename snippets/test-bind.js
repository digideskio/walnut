'use strict';

var dgram = require('dgram')
  , fs = require('fs')
  , socket
  , ssdpPort = 1900
  , sourcePort = 61900
  , ssdpAddress = '239.255.255.250'
  , myIface = '192.168.1.4'
  , mySt = 'urn:schemas-upnp-org:device:InternetGatewayDevice:1'
  ;

function broadcastSsdp() {
  var query
    ;

  query = new Buffer(
    'M-SEARCH * HTTP/1.1\r\n'
  + 'HOST: ' + ssdpAddress + ':' + ssdpPort + '\r\n'
  + 'MAN: "ssdp:discover"\r\n'
  + 'MX: 1\r\n'
  + 'ST: ' + mySt + '\r\n'
  + '\r\n'
  );
  fs.writeFileSync('upnp-search.txt', query, null);

  // Send query on each socket
  socket.send(query, 0, query.length, ssdpPort, ssdpAddress);
}

// TODO test interface.family === 'IPv4'
socket = dgram.createSocket('udp4');
socket.on('listening', function () {
  console.log('socket ready...');
  console.log(myIface + ':' + ssdpPort);

  broadcastSsdp();
});
socket.on('message', function (chunk, info) {
  var message = chunk.toString();
  console.log('[incoming] UDP message');
  console.log(message);
  console.log(info);
});

console.log('binding to', sourcePort);
socket.bind(sourcePort, myIface);
