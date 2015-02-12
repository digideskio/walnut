'use strict';

var https = require('https');
var path = require('path');
var fs = require('fs');
var PromiseA = global.Promise || require('bluebird').Promise;

exports.create = function (ip, localPort, externalPort) {
  return new PromiseA(function (resolve, reject) {
    var token = Math.random().toString(16).split('.')[1];
    var tokenPath = Math.random().toString(16).split('.')[1];
    var options;
    var server;
    var options;
    var certsPath = path.join(__dirname, 'certs', 'server');
    var caCertsPath = path.join(__dirname, 'certs', 'ca');


    function testConnection() {
      var awesome = false;
      var timetok;
      var webreq;
      var options = {
        // not hostname because we set headers.host on our own
        host: ip
      , headers: {
          // whatever's on the fake cert
          'Host': 'redirect-www.org'
        }
      , port: externalPort
      , path: '/' + tokenPath
      , ca: fs.readFileSync(path.join(caCertsPath, 'my-root-ca.crt.pem'))
      };
      options.agent = new https.Agent(options);

      timetok = setTimeout(function () {
        reject(new Error("timed out while testing NAT loopback for port " + externalPort));
      }, 2000);

      function finishHim(err) {
        clearTimeout(timetok);
        server.close(function () {
          if (!err && awesome) {
            resolve();
          }
        });

        if (err || !awesome) {
          if (err) {
            reject(err);
          }
          else if (!awesome) {
            reject(new Error("loopback failed. Why? here's my best guess: "
              + "the ssl cert matched, so you've probably got two boxes and this isn't the right one"));
          }
          return;
        }
      }

      webreq = https.request(options, function(res) {
        res.on('data', function (resToken) {
          if (resToken.toString() === token) {
            awesome = true;
            return;
          }
        });
        res.on('error', function (err) {
          console.error('[ERROR] https.request.response');
          console.error(err);
          finishHim(new Error("loopback failed. Why? here's my best guess: "
            + "the connection was interrupted"));
          });
        res.on('end', function () {
          finishHim();
        });
      });

      webreq.on('error', function (err) {
        console.error('[ERROR] https.request');
        console.error(err);
        if (/ssl|cert|chain/i.test(err.message || err.toString())) {
          finishHim(new Error("loopback failed. Why? here's my best guess: "
            + "the ssl cert validation may have failed (might port-forward to the wrong box)"));
        } else {
          finishHim(new Error("loopback failed. Why? here's my best guess: "
            + "port forwarding isn't configured for " + ip + ":" + externalPort + " to " + localPort));
        }
      });
      webreq.end();
    }

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
    function listen(app) {
      server.on('request', app);
      server.listen(localPort, function () {
        localPort = server.address().port;
        setTimeout(testConnection, 2000);
      });
    }

    listen(function (req, res) {
      if (('/' + tokenPath) === req.url) {
        res.end(token);
        return;
      }

      res.end('loopback failure');
    });
  });
};
