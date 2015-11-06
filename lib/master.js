'use strict';

var cluster = require('cluster');
var PromiseA = require('bluebird');
var memstore;
// TODO
// var rootMasterKey;

function updateIps() {
  console.log('[UPDATE IP]');
  require('./ddns-updater').update().then(function (results) {
    results.forEach(function (result) {
      if (result.error) {
        console.error(result);
      } else {
        console.log('[SUCCESS]', result.service.hostname);
      }
    });
  }).error(function (err) {
    console.error('[UPDATE IP] ERROR');
    console.error(err);
  });
}

function init(conf/*, state*/) {
  if (!conf.ipcKey) {
    conf.ipcKey = require('crypto').randomBytes(16).toString('base64');
  }

  var memstoreOpts = {
    sock: conf.memstoreSock || '/tmp/memstore.sock'

    // If left 'null' or 'undefined' this defaults to a similar memstore
    // with no special logic for 'cookie' or 'expires'
  , store: cluster.isMaster && null //new require('express-session/session/memory')()

    // a good default to use for instances where you might want
    // to cluster or to run standalone, but with the same API
  , serve: cluster.isMaster
  , connect: cluster.isWorker
  //, standalone: (1 === numCores) // overrides serve and connect
    // TODO implement
  , key: conf.ipcKey
  };
  try {
    require('fs').unlinkSync(memstoreOpts.sock);
  } catch(e) {
    if ('ENOENT' !== e.code) {
      console.error(e.stack);
      console.error(JSON.stringify(e));
    }
    // ignore
  }

  var cstore = require('cluster-store');
  var memstorePromise = cstore.create(memstoreOpts).then(function (_memstore) {
    memstore = _memstore;
  });

  // TODO check the IP every 5 minutes and update it every hour
  setInterval(updateIps, 60 * 60 * 1000);
  // we don't want this to load right away (extra procesing time)
  setTimeout(updateIps, 1);

  return memstorePromise;
}

function touch(conf, state) {
  if (!state.initialize) {
    state.initialize = init(conf, state);
  }

  // TODO if no xyz worker, start on xyz worker (unlock, for example)
  return state.initialize.then(function () {
    // TODO conf.locked = true|false;
    conf.initialized = true;
    return conf;
  });

  /*
  setInterval(function () {
    console.log('SIGUSR1 to caddy');
    return caddy.update(caddyConf);
  }, 10 * 60 * 1000);
  */
}

  //var config = require('./device.json');

  // require('ssl-root-cas').inject();

  /*
  function phoneHome() {
    var holepunch = require('./holepunch/beacon');
    var ports;

    ports = [
      { private: 65022
      , public: 65022
      , protocol: 'tcp'
      , ttl: 0
      , test: { service: 'ssh' }
      , testable: false
      }
    , { private: 650443
      , public: 650443
      , protocol: 'tcp'
      , ttl: 0
      , test: { service: 'https' }
      }
    , { private: 65080
      , public: 65080
      , protocol: 'tcp'
      , ttl: 0
      , test: { service: 'http' }
      }
    ];

    // TODO return a middleware
    holepunch.run(require('./redirects.json').reduce(function (all, redirect) {
      if (!all[redirect.from.hostname]) {
        all[redirect.from.hostname] = true;
        all.push(redirect.from.hostname);
      }
      if (!all[redirect.to.hostname]) {
        all[redirect.to.hostname] = true;
        all.push(redirect.to.hostname);
      }

      return all;
    }, []), ports).catch(function () {
      console.error("Couldn't phone home. Oh well");
    });
  }
  */

module.exports.init = init;
module.exports.touch = touch;
