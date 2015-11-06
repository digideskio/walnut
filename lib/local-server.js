'use strict';

// Note the odd use of callbacks (instead of promises) here
// It's to avoid loading bluebird yet (see sni-server.js for explanation)
module.exports.create = function (certPaths, port, serverCallback) {
  function initServer(err, server) {
    var app;
    var promiseApp;

    if (err) {
      serverCallback(err);
      return;
    }

    server.on('error', serverCallback);
    server.listen(port, function () {
      // is it even theoritically possible for
      // a request to come in before this callback has fired?
      // I'm assuming this event must fire before any request event
      promiseApp = serverCallback(null, server);
    });

    // Get up and listening as absolutely quickly as possible
    server.on('request', function (req, res) {
      // this is a hot piece of code, so we cache the result
      if (app) {
        app(req, res);
        return;
      }

      promiseApp.then(function (_app) {
        app = _app;
        app(req, res);
      });
    });
  }

  if (certPaths) {
    require('./sni-server').create(certPaths, port, initServer);
  } else {
    initServer(null, require('http').createServer());
  }
};
