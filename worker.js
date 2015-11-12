'use strict';

var cluster = require('cluster');
var id = cluster.worker.id.toString();

function waitForInit(message) {
  if ('com.daplie.walnut.init' !== message.type) {
    console.warn('[Worker] 0 got unexpected message:');
    console.warn(message);
    return;
  }

  var msg = message.conf;
  process.removeListener('message', waitForInit);

  require('./lib/local-server').create(msg.certPaths, msg.localPort, function (err, webserver) {
    if (err) {
      console.error('[ERROR] worker.js');
      console.error(err.stack);
      throw err;
    }

    console.log("#" + id + " Listening on " + msg.protocol + "://" + webserver.address().address + ":" + webserver.address().port, '\n');

    var PromiseA = require('bluebird');
    return new PromiseA(function (resolve) {
      function initWebServer(srvmsg) {
        if ('com.daplie.walnut.webserver.onrequest' !== srvmsg.type) {
          console.warn('[Worker] 1 got unexpected message:');
          console.warn(srvmsg);
          return;
        }

        process.removeListener('message', initWebServer);
        resolve(require('./lib/worker').create(webserver, srvmsg));
      }
      process.send({ type: 'com.daplie.walnut.webserver.listening' });
      process.on('message', initWebServer);
    });
  });
}

// We have to wait to get the configuration from the master process
// before we can start our webserver
console.log('[Worker #' + id + '] online!');
process.on('message', waitForInit);

//
// Debugging
//
process.on('exit', function (code) {
  // only sync code can run here
  console.log('uptime:', process.uptime());
  console.log(process.memoryUsage());
  console.log('[exit] process.exit() has been called (or master has killed us).');
  console.log(code);
});
process.on('beforeExit', function (msg) {
  // async can be scheduled here
  console.log('[beforeExit] Event Loop is empty. Process will end.');
  console.log(msg);
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
