'use strict';

module.exports.create = function (webserver, info, state) {
  if (!state) {
    state = {};
  }

  var PromiseA = state.Promise || require('bluebird');
  var path = require('path');
  //var vhostsdir = path.join(__dirname, 'vhosts');
  var express = require('express-lazy');
  var app = express();
  var memstore;
  var sqlstores = {};
  var models = {};
  var systemFactory = require('sqlite3-cluster/client').createClientFactory({
      dirname: path.join(__dirname, '..', '..', 'var') // TODO info.conf
    , prefix: 'com.example.'
    //, dbname: 'config'
    , suffix: ''
    , ext: '.sqlite3'
    , sock: info.conf.sqlite3Sock
    , ipcKey: info.conf.ipcKey
  });
  var clientFactory = require('sqlite3-cluster/client').createClientFactory({
      algorithm: 'aes'
    , bits: 128
    , mode: 'cbc'
    , dirname: path.join(__dirname, '..', '..', 'var') // TODO info.conf
    , prefix: 'com.example.'
    //, dbname: 'cluster'
    , suffix: ''
    , ext: '.sqlcipher'
    , sock: info.conf.sqlite3Sock
    , ipcKey: info.conf.ipcKey
  });
  var cstore = require('cluster-store');
  var redirectives;

  app.disable('x-powered-by');
  if (info.conf.trustProxy) {
    console.info('[Trust Proxy]');
    app.set('trust proxy', ['loopback']);
    //app.set('trust proxy', function (ip) { console.log('[ip]', ip); return true; });
  } else {
    console.info('[DO NOT trust proxy]');
    // TODO make sure the gzip module loads if there isn't a proxy gzip-ing for us
    // app.use(compression())
  }

  /*
  function unlockDevice(conf, state) {
    return require('./lib/unlock-device').create().then(function (result) {
      result.promise.then(function (_rootMasterKey) {
        process.send({
          type: 'walnut.keys.root'
          conf: {
            rootMasterKey: _rootMasterkey
          }
        });
        conf.locked = false;
        if (state.caddy) {
          state.caddy.update(conf);
        }
        conf.rootMasterKey = _rootMasterKey;
      });

      return result.app;
    });
  }
  */

  // TODO handle insecure to actual redirect
  // blog.coolaj86.com -> coolaj86.com/blog
  // hmm... that won't really matter with hsts
  // I guess I just needs letsencrypt

  function scrubTheDub(req, res, next) {
    var host = req.hostname;

    if (!host || 'string' !== typeof host) {
      next();
      return;
    }

    // TODO test if this is even necessary
    host = host.toLowerCase();

    // TODO this should be hot loadable / changeable
    if (!redirectives && info.conf.redirects) {
      redirectives = require('./hostname-redirects').compile(info.conf.redirects);
    }

    if (!/^www\./.test(host) && !redirectives) {
      next();
      return;
    }

    // TODO misnomer, handles all exact redirects
    if (!require('./no-www').scrubTheDub(req, res, redirectives)) {
      next();
      return;
    }
  }

  function caddyBugfix(req, res, next) {
    // workaround for Caddy
    // https://github.com/mholt/caddy/issues/341
    if (app.get('trust proxy')) {
      if (req.headers['x-forwarded-proto']) {
        req.headers['x-forwarded-proto'] = (req.headers['x-forwarded-proto'] || '').split(/,\s+/g)[0] || undefined;
      }
      if (req.headers['x-forwarded-host']) {
        req.headers['x-forwarded-host'] = (req.headers['x-forwarded-host'] || '').split(/,\s+/g)[0] || undefined;
      }
    }

    next();
  }

  // TODO misnomer, this can handle nowww, yeswww, and exact hostname redirects
  app.use('/', scrubTheDub);
  app.use('/', caddyBugfix);

  return PromiseA.all([
    // TODO security on memstore
    // TODO memstoreFactory.create
    cstore.create({
      sock: info.conf.memstoreSock
    , connect: info.conf.memstoreSock
      // TODO implement
    , key: info.conf.ipcKey
    }).then(function (_memstore) {
      memstore = _memstore;
      return memstore;
    })
    // TODO mark a device as lost, stolen, missing in DNS records
    // (and in turn allow other devices to lock it, turn on location reporting, etc)
  , systemFactory.create({
        init: true
      , dbname: 'config'
    })
  , clientFactory.create({
        init: true
      , key: '00000000000000000000000000000000'
      // TODO only complain if the values are different
      //, algo: 'aes'
      , dbname: 'auth'
    })
  , clientFactory.create({
        init: false
      , dbname: 'system'
    })
  ]).then(function (args) {
    memstore = args[0];
    sqlstores.config = args[1];
    sqlstores.auth = args[2];
    sqlstores.system = args[3];
    sqlstores.create = clientFactory.create;

    return require('../lib/schemes-config').create(sqlstores.config).then(function (tables) {
      models.Config = tables;
      return models.Config.Config.get().then(function (vhostsMap) {
        // TODO the core needs to be replacable in one shot
        // rm -rf /tmp/walnut/; tar xvf -C /tmp/walnut/; mv /srv/walnut /srv/walnut.{{version}}; mv /tmp/walnut /srv/
        // this means that any packages must be outside, perhaps /srv/walnut/{boot,core,packages}
        var pkgConf = {
          pagespath: path.join(__dirname, '..', '..', 'packages', 'pages') + path.sep
        , apipath: path.join(__dirname, '..', '..', 'packages', 'apis') + path.sep
        , servicespath: path.join(__dirname, '..', '..', 'packages', 'services')
        , vhostsMap: vhostsMap
        , vhostPatterns: null
        , server: webserver
        , externalPort: info.conf.externalPort
        , primaryNameserver: info.conf.primaryNameserver
        , nameservers: info.conf.nameservers
        , privkey: info.conf.privkey
        , pubkey: info.conf.pubkey
        , redirects: info.conf.redirects
        , apiPrefix: '/api'
        , 'org.oauth3.consumer': info.conf['org.oauth3.consumer']
        , 'org.oauth3.provider': info.conf['org.oauth3.provider']
        , keys: info.conf.keys
        };
        var pkgDeps = {
          memstore: memstore
        , sqlstores: sqlstores
        , clientSqlFactory: clientFactory
        , systemSqlFactory: systemFactory
        //, handlePromise: require('./lib/common').promisableRequest;
        //, handleRejection: require('./lib/common').rejectableRequest;
        //, localPort: info.conf.localPort
        , Promise: PromiseA
        , express: express
        , app: app
        };
        var Services = require('./services-loader').create(pkgConf, {
          memstore: memstore
        , sqlstores: sqlstores
        , clientSqlFactory: clientFactory
        , systemSqlFactory: systemFactory
        , Promise: PromiseA
        });
        var recase = require('connect-recase')({
          // TODO allow explicit and or default flag
          explicit: false
        , default: 'snake'
        , prefixes: ['/api']
          // TODO allow exclude
        //, exclusions: [config.oauthPrefix]
        , exceptions: {}
        //, cancelParam: 'camel'
        });

        function handlePackages(req, res, next) {
          // TODO move to caddy parser?
          if (/(^|\.)proxyable\./.test(req.hostname)) {
            // device-id-12345678.proxyable.myapp.mydomain.com => myapp.mydomain.com
            // proxyable.myapp.mydomain.com => myapp.mydomain.com
            // TODO myapp.mydomain.com.example.proxyable.com => myapp.mydomain.com
            req.hostname = req.hostname.replace(/.*\.?proxyable\./, '');
          }

          require('./package-server').mapToApp({
            config: pkgConf
          , deps: pkgDeps
          , services: Services
          }, req, res, next);
        }

        // TODO recase

        //
        // Generic Template API
        //
        app
          .use('/api', require('body-parser').json({
            strict: true // only objects and arrays
          , inflate: true
            // limited to due performance issues with JSON.parse and JSON.stringify
            // http://josh.zeigler.us/technology/web-development/how-big-is-too-big-for-json/
          //, limit: 128 * 1024
          , limit: 1.5 * 1024 * 1024
          , reviver: undefined
          , type: 'json'
          , verify: undefined
          }))
          // DO NOT allow urlencoded at any point, it is expressly forbidden
          //.use(require('body-parser').urlencoded({
          //  extended: true
          //, inflate: true
          //, limit: 100 * 1024
          //, type: 'urlencoded'
          //, verify: undefined
          //}))
          .use(require('connect-send-error').error())
          ;

        app.use('/api', recase);

        app.use('/', handlePackages);
        app.use('/', function (err, req, res, next) {
          console.error('[Error Handler]');
          console.error(err.stack);
          if (req.xhr) {
            res.send({ error: { message: "kinda unknownish error" } });
          } else {
            res.send('<html><head><title>ERROR</title></head><body>Error</body></html>');
          }

          // sadly express uses arity checking
          // so the fourth parameter must exist
          if (false) {
            next();
          }
        });

        return app;
      });
    });
  });
};
