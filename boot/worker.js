'use strict';

module.exports.create = function (opts) {
  var id = '0';
  var promiseApp;

  function createAndBindInsecure(lex, message, cb) {
    // TODO conditional if 80 is being served by caddy
    require('../lib/insecure-server').create(lex, message.conf.externalPort, message.conf.insecurePort, message, function (err, webserver) {
      console.info("#" + id + " Listening on http://" + webserver.address().address + ":" + webserver.address().port, '\n');

      // we are returning the promise result to the caller
      return cb(null, webserver, null, message);
    });
  }

  function createLe(conf) {
    var LEX = require('letsencrypt-express');
    var lex = LEX.create({
      configDir: conf.letsencrypt.configDir // i.e. __dirname + '/letsencrypt.config'
    , approveRegistration: function (hostname, cb) {
        cb(null, {
          domains: [hostname]                 // TODO handle www and bare on the same cert
        , email: conf.letsencrypt.email
        , agreeTos: conf.letsencrypt.agreeTos
        });
        /*
        letsencrypt.getConfig({ domains: [domain] }, function (err, config) {
          if (!(config && config.checkpoints >= 0)) {
            cb(err, null);
            return;
          }

          cb(null, {
            email: config.email
                // can't remember which it is, but the pyconf is different that the regular variable
          , agreeTos: config.tos || config.agree || config.agreeTos
          , server: config.server || LE.productionServerUrl
          , domains: config.domains || [domain]
          });
        });
        */
      }
    });
    //var letsencrypt = lex.letsencrypt;

    return lex;
  }

  function createAndBindServers(message, cb) {
    var lex;

    if (message.conf.letsencrypt) {
      lex = createLe(message.conf);
    }

    // NOTE that message.conf[x] will be overwritten when the next message comes in
    require('../lib/local-server').create(lex, message.conf.certPaths, message.conf.localPort, message, function (err, webserver) {
      if (err) {
        console.error('[ERROR] worker.js');
        console.error(err.stack);
        throw err;
      }

      console.info("#" + id + " Listening on " + message.conf.protocol + "://" + webserver.address().address + ":" + webserver.address().port, '\n');

      // we don't need time to pass, just to be able to return
      process.nextTick(function () {
        createAndBindInsecure(lex, message, cb);
      });

      // we are returning the promise result to the caller
      return cb(null, null, webserver, message);
    });
  }

  //
  // Worker Mode
  //
  function waitForConfig(message) {
    if ('walnut.init' !== message.type) {
      console.warn('[Worker] 0 got unexpected message:');
      console.warn(message);
      return;
    }

    process.removeListener('message', waitForConfig);

    // NOTE: this callback must return a promise for an express app
    createAndBindServers(message, function (err, insecserver, webserver, oldMessage) {
      // TODO deep merge new message into old message
      Object.keys(message.conf).forEach(function (key) {
        oldMessage.conf[key] = message.conf[key];
      });
      var PromiseA = require('bluebird');
      if (promiseApp) {
        return promiseApp;
      }
      promiseApp = new PromiseA(function (resolve) {
        function initWebServer(srvmsg) {
          if ('walnut.webserver.onrequest' !== srvmsg.type) {
            console.warn('[Worker] 1 got unexpected message:');
            console.warn(srvmsg);
            return;
          }

          process.removeListener('message', initWebServer);

          resolve(require('../lib/worker').create(webserver, srvmsg));
        }

        process.send({ type: 'walnut.webserver.listening' });
        process.on('message', initWebServer);
      }).then(function (app) {
        console.info('[Worker Ready]');
        return app;
      });
      return promiseApp;
    });
  }

  //
  // Standalone Mode
  //
  if (opts) {
    // NOTE: this callback must return a promise for an express app
    createAndBindServers(opts, function (err, insecserver, webserver/*, message*/) {
      var PromiseA = require('bluebird');
      if (promiseApp) {
        return promiseApp;
      }
      promiseApp = new PromiseA(function (resolve) {
        opts.getConfig(function (srvmsg) {
          resolve(require('../lib/worker').create(webserver, srvmsg));
        });
      }).then(function (app) {
        console.info('[Standalone Ready]');
        return app;
      });
      return promiseApp;
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
