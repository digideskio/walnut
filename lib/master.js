'use strict';

var cluster = require('cluster');
var PromiseA = require('bluebird');
var memstore;
var sqlstore;
var config;
// TODO
// var rootMasterKey;

function updateIps() {
  console.log('[UPDATE IP]');
  var allMap = {};
  var hostnames = config.redirects.reduce(function (all, redirect) {
    if (redirect.ip && !allMap[redirect.id]) {
      allMap[redirect.id] = true;
      all.push(redirect.id);
    }

    return all;
  }, []);

  require('./ddns-updater').update(
    config.ddns.services
  , hostnames
  , config.ddns.token
  ).then(function (results) {
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
  config = conf;
  if (!conf.ipcKey) {
    conf.ipcKey = require('crypto').randomBytes(16).toString('base64');
  }
  if (!conf.sqlite3Sock) {
    conf.sqlite3Sock = '/tmp/sqlite3.' + require('crypto').randomBytes(4).toString('hex') + '.sock';
  }
  if (!conf.memstoreSock) {
    conf.memstoreSock = '/tmp/memstore.' + require('crypto').randomBytes(4).toString('hex') + '.sock';
  }

  try {
    require('fs').unlinkSync(conf.memstoreSock);
  } catch(e) {
    if ('ENOENT' !== e.code) {
      console.error(e.stack);
      console.error(JSON.stringify(e));
    }
    // ignore
  }
  try {
    require('fs').unlinkSync(conf.sqlite3Sock);
  } catch(e) {
    if ('ENOENT' !== e.code) {
      console.error(e.stack);
      console.error(JSON.stringify(e));
    }
    // ignore
  }

  var cstore = require('cluster-store');
  var sqlite3 = require('sqlite3-cluster/server');
  var promise = PromiseA.all([
    cstore.create({
      sock: conf.memstoreSock
    , serve: cluster.isMaster && conf.memstoreSock
    , store: cluster.isMaster && null //new require('express-session/session/memory')()
      // TODO implement
    , key: conf.ipcKey
    }).then(function (_memstore) {
      memstore = _memstore;
      return memstore;
    })
  , sqlite3.createServer({
      verbose: null
    , sock: conf.sqlite3Sock
    , ipcKey: conf.ipcKey
    }).then(function (_sqlstore) {
      sqlstore = _sqlstore;
      return sqlstore;
    })
  ]).then(function (/*args*/) {
    return conf;
    /*
    {
      conf: conf
    , memstore: memstore // args[0]
    , sqlstore: sqlstore // args[1]
    };
    */
  });

  // TODO check the IP every 5 minutes and update it every hour
  setInterval(updateIps, 60 * 60 * 1000);
  // we don't want this to load right away (extra procesing time)
  setTimeout(updateIps, 1);

  return promise;
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

module.exports.init = init;
module.exports.touch = touch;
