'use strict';

var cluster = require('cluster');
var id = cluster.worker.id.toString();
var path = require('path');
var vhostsdir = path.join(__dirname, 'vhosts');

console.log('[Worker #' + id + '] online!');

function init(info) {
  var promiseServer;
  var workerApp;

  function promiseApps() {
    var PromiseA = require('bluebird');

    if (workerApp) {
      return PromiseA.resolve(workerApp); 
    }

    workerApp = promiseServer.then(function (secureServer) {
      //secureServer = _secureServer;
      console.log("#" + id + " Listening on https://localhost:" + secureServer.address().port, '\n');

      return require('./lib/vhost-sni-server').create(info.securePort, vhostsdir).create(secureServer).then(function (app) {
        workerApp = app;

        return app;
      });
    });

    return workerApp;
  }

  promiseServer = require('./lib/sni-server').create(info.certPaths, info.securePort, promiseApps);
}

process.on('message', function (msg) {
  if ('init' === msg.type) {
    init(msg);
    return;
  }

  console.log('[Worker] got unexpected message:');
  console.log(msg);
});
