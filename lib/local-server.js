'use strict';

module.exports.create = function (port, promiseApp) {
  var PromiseA = require('bluebird');

  return new PromiseA(function (resolve, reject) {
    var server = require('http').createServer();

    server.on('error', reject);
    server.listen(port, 'localhost', function () {
      console.log("Listening", server.address());
      resolve(server);
    });

    // Get up and listening as absolutely quickly as possible
    server.on('request', function (req, res) {
      // TODO move to caddy parser?
      if (/(^|\.)proxyable\./.test(req.headers.host)) {
        // device-id-12345678.proxyable.myapp.mydomain.com => myapp.mydomain.com
        // proxyable.myapp.mydomain.com => myapp.mydomain.com
        // TODO myapp.mydomain.com.proxyable.com => myapp.mydomain.com
        req.headers.host = req.headers.host.replace(/.*\.?proxyable\./, '');
      }

      promiseApp().then(function (app) {
        app(req, res);
      });
    });
  });
};
