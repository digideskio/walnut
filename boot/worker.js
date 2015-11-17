'use strict';

module.exports.create = function (opts) {
  var id = '0';

  function createAndBindServers(message, cb) {
    var msg = message.conf;

    require('../lib/local-server').create(msg.certPaths, msg.localPort, function (err, webserver) {
      if (err) {
        console.error('[ERROR] worker.js');
        console.error(err.stack);
        throw err;
      }

      console.info("#" + id + " Listening on " + msg.protocol + "://" + webserver.address().address + ":" + webserver.address().port, '\n');

      return cb(webserver);
    });

    // TODO conditional if 80 is being served by caddy
    require('../lib/insecure-server').create(msg.externalPort, msg.insecurePort);
  }

  //
  // Worker Mode
  //
  function waitForConfig(message) {
    if ('com.daplie.walnut.init' !== message.type) {
      console.warn('[Worker] 0 got unexpected message:');
      console.warn(message);
      return;
    }

    process.removeListener('message', waitForConfig);

    // NOTE: this callback must return a promise for an express app
    createAndBindServers(message, function (webserver) {
      var PromiseA = require('bluebird');
      return new PromiseA(function (resolve) {
        function initWebServer(srvmsg) {
          if ('com.daplie.walnut.webserver.onrequest' !== srvmsg.type) {
            console.warn('[Worker] 1 got unexpected message:');
            console.warn(srvmsg);
            return;
          }

          process.removeListener('message', initWebServer);

          resolve(require('../lib/worker').create(webserver, srvmsg));
        }

        process.send({ type: 'com.daplie.walnut.webserver.listening' });
        process.on('message', initWebServer);
      }).then(function (app) {
        console.info('[Worker Ready]');
        return app;
      });
    });
  }

  //
  // Standalone Mode
  //
  if (opts) {
    // NOTE: this callback must return a promise for an express app
    createAndBindServers(opts, function (webserver) {
      var PromiseA = require('bluebird');
      return new PromiseA(function (resolve) {
        opts.getConfig(function (srvmsg) {
          resolve(require('../lib/worker').create(webserver, srvmsg));
        });
      }).then(function (app) {
        console.info('[Standalone Ready]');
        return app;
      });
    });
  } else {
    // we are in cluster mode, as opposed to standalone mode
    id = require('cluster').worker.id.toString();
    // We have to wait to get the configuration from the master process
    // before we can start our webserver
    console.info('[Worker #' + id + '] online!');
    process.on('message', waitForConfig);
  }

  //
  // Debugging
  //
  process.on('exit', function (code) {
    // only sync code can run here
    console.info('uptime:', process.uptime());
    console.info(process.memoryUsage());
    console.info('[exit] process.exit() has been called (or master has killed us).');
    console.info(code);
  });
  process.on('beforeExit', function () {
    // async can be scheduled here
    console.info('[beforeExit] Event Loop is empty. Process will end.');
  });
  process.on('unhandledRejection', function (err) {
    // this should always throw
    // (it means somewhere we're not using bluebird by accident)
    console.error('[caught] [unhandledRejection]');
    console.error(Object.keys(err));
    console.error(err);
    console.error(err.stack);
  });
  process.on('rejectionHandled', function (msg) {
    console.error('[rejectionHandled]');
    console.error(msg);
  });
};
