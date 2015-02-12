#!/usr/bin/env node
'use strict';

var https = require('https')
  , http = require('http')
  , path = require('path')
  , port = process.argv[2] || 65443
  , insecurePort = process.argv[3] || 65080
  , fs = require('fs')
  , path = require('path')
  , checkip = require('check-ip-address')
  , server
  , insecureServer
  , options
  , certsPath = path.join(__dirname, 'certs', 'server')
  , caCertsPath = path.join(__dirname, 'certs', 'ca')
  ;


//
// SSL Certificates
//
options = {
  key: fs.readFileSync(path.join(certsPath, 'my-server.key.pem'))
, ca: [ fs.readFileSync(path.join(caCertsPath, 'my-root-ca.crt.pem')) ]
, cert: fs.readFileSync(path.join(certsPath, 'my-server.crt.pem'))
, requestCert: false
, rejectUnauthorized: false
};


//
// Serve an Express App securely with HTTPS
//
server = https.createServer(options);
checkip.getExternalIp().then(function (ip) {
  var host = ip || 'local.helloworld3000.com'
    ;

  function listen(app) {
    server.on('request', app);
    server.listen(port, function () {
      port = server.address().port;
      console.log('Listening on https://127.0.0.1:' + port);
      console.log('Listening on https://local.helloworld3000.com:' + port);
      if (ip) {
        console.log('Listening on https://' + ip + ':' + port);
      }
    });
  }

  var publicDir = path.join(__dirname, 'public');
  var app = require('./app').create(server, host, port, publicDir);
  listen(app);
});


//
// Redirect HTTP ot HTTPS
//
// This simply redirects from the current insecure location to the encrypted location
//
insecureServer = http.createServer();
insecureServer.on('request', function (req, res) {
  var newLocation = 'https://'
    + req.headers.host.replace(/:\d+/, ':' + port) + req.url
    ;

  var metaRedirect = ''
    + '<html>\n'
    + '<head>\n'
    + '  <style>* { background-color: white; color: white; text-decoration: none; }</style>\n'
    + '  <META http-equiv="refresh" content="0;URL=' + newLocation + '">\n'
    + '</head>\n'
    + '<body style="display: none;">\n'
    + '  <p>You requested an insecure resource. Please use this instead: \n'
    + '    <a href="' + newLocation + '">' + newLocation + '</a></p>\n'
    + '</body>\n'
    + '</html>\n'
    ;

  // DO NOT HTTP REDIRECT
  /*
  res.setHeader('Location', newLocation);
  res.statusCode = 302;
  */

  // BAD NEWS BEARS
  //
  // When people are experimenting with the API and posting tutorials
  // they'll use cURL and they'll forget to prefix with https://
  // If we allow that, then many users will be sending private tokens
  // and such with POSTs in clear text and, worse, it will work!
  // To minimize this, we give browser users a mostly optimal experience,
  // but people experimenting with the API get a message letting them know
  // that they're doing it wrong and thus forces them to ensure they encrypt.
  res.setHeader('Content-Type', 'text/html');
  res.end(metaRedirect);
});
insecureServer.listen(insecurePort, function(){
  console.log("\nRedirecting all http traffic to https\n");
});
