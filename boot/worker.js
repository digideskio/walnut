'use strict';

module.exports.create = function (opts) {
  var id = '0';
  var promiseApp;

  function createAndBindInsecure(lex, conf, getOrCreateHttpApp) {
    // TODO conditional if 80 is being served by caddy

    var appPromise = null;
    var app = null;
    var http = require('http');
    var insecureServer = http.createServer();

    function onRequest(req, res) {
      if (app) {
        app(req, res);
        return;
      }

      if (!appPromise) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end('{ "error": { "code": "E_SANITY_FAIL", "message": "should have an express app, but didn\'t" } }');
        return;
      }

      appPromise.then(function (_app) {
        appPromise = null;
        app = _app;
        app(req, res);
      });
    }

    insecureServer.listen(conf.insecurePort, function () {
      console.info("#" + id + " Listening on http://"
        + insecureServer.address().address + ":" + insecureServer.address().port, '\n');
      appPromise = getOrCreateHttpApp(null, insecureServer);

      if (!appPromise) {
        throw new Error('appPromise returned nothing');
      }
    });

    insecureServer.on('request', onRequest);
  }

  function walkLe(domainname) {
    var PromiseA = require('bluebird');
    var fs = PromiseA.promisifyAll(require('fs'));
    var path = require('path');
    var parts = domainname.split('.'); //.replace(/^www\./, '').split('.');
    var configname = parts.join('.') + '.json';
    var configpath = path.join(__dirname, '..', '..', 'config', configname);

    if (parts.length < 2) {
      return PromiseA.resolve(null);
    }

    // TODO configpath a la varpath
    return fs.readFileAsync(configpath, 'utf8').then(function (text) {
      var data = JSON.parse(text);
      data.name = configname;
      return data;
    }, function (/*err*/) {
      parts.shift();
      return walkLe(parts.join('.'));
    });
  }

  function createLe(lexConf, conf) {
    var LEX = require('letsencrypt-express');
    var lex = LEX.create({
      configDir: lexConf.configDir // i.e. __dirname + '/letsencrypt.config'
    , approveRegistration: function (hostname, cb) {
        // TODO cache/report unauthorized
        if (!hostname) {
          cb(new Error("[lex.approveRegistration] undefined hostname"), null);
          return;
        }

        walkLe(hostname).then(function (leAuth) {
          // TODO should still check dns for hostname (and mx for email)
          if (leAuth && leAuth.email && leAuth.agreeTos) {
            cb(null, {
              domains: [hostname]                 // TODO handle www and bare on the same cert
            , email: leAuth.email
            , agreeTos: leAuth.agreeTos
            });
          }
          else {
            // TODO report unauthorized
            cb(new Error("Valid LetsEncrypt config with email and agreeTos not found for '" + hostname + "'"), null);
          }
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
    conf.letsencrypt = lex.letsencrypt;
    conf.lex = lex;
    conf.walkLe = walkLe;

    return lex;
  }

  function createAndBindServers(conf, getOrCreateHttpApp) {
    var lex;

    if (conf.lexConf) {
      lex = createLe(conf.lexConf, conf);
    }

    // NOTE that message.conf[x] will be overwritten when the next message comes in
    require('./local-server').create(lex, conf.certPaths, conf.localPort, conf, function (err, webserver) {
      if (err) {
        console.error('[ERROR] worker.js');
        console.error(err.stack);
        throw err;
      }

      console.info("#" + id + " Listening on " + conf.protocol + "://" + webserver.address().address + ":" + webserver.address().port, '\n');

      // we don't need time to pass, just to be able to return
      process.nextTick(function () {
        createAndBindInsecure(lex, conf, getOrCreateHttpApp);
      });

      // we are returning the promise result to the caller
      return getOrCreateHttpApp(null, null, webserver, conf);
    });
  }

  //
  // Worker Mode
  //
  function waitForConfig(realMessage) {
    if ('walnut.init' !== realMessage.type) {
      console.warn('[Worker] 0 got unexpected message:');
      console.warn(realMessage);
      return;
    }

    var conf = realMessage.conf;
    process.removeListener('message', waitForConfig);

    // NOTE: this callback must return a promise for an express app

    function getExpressApp(err, insecserver, webserver/*, newMessage*/) {
      var PromiseA = require('bluebird');

      if (promiseApp) {
        return promiseApp;
      }

      promiseApp = new PromiseA(function (resolve) {
        function initHttpApp(srvmsg) {
          if ('walnut.webserver.onrequest' !== srvmsg.type) {
            console.warn('[Worker] [onrequest] unexpected message:');
            console.warn(srvmsg);
            return;
          }

          process.removeListener('message', initHttpApp);

          if (srvmsg.conf) {
            Object.keys(srvmsg.conf).forEach(function (key) {
              conf[key] = srvmsg.conf[key];
            });
          }

          resolve(require('../lib/worker').create(webserver, conf));
        }

        process.send({ type: 'walnut.webserver.listening' });
        process.on('message', initHttpApp);
      }).then(function (app) {
        console.info('[Worker Ready]');
        return app;
      });

      return promiseApp;
    }

    createAndBindServers(conf, getExpressApp);
  }

  //
  // Standalone Mode
  //
  if (opts) {
    // NOTE: this callback must return a promise for an express app
    createAndBindServers(opts, function (err, insecserver, webserver/*, conf*/) {
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
