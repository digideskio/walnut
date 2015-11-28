'use strict';

// TODO if RAM is very low we should not fork at all,
// but use a different process altogether

console.info('pid:', process.pid);
console.info('title:', process.title);
console.info('arch:', process.arch);
console.info('platform:', process.platform);
console.info('\n\n\n[MASTER] Welcome to WALNUT!');

var cluster = require('cluster');
var path = require('path');
//var minWorkers = 2;
var numCores = 2; // Math.max(minWorkers, require('os').cpus().length);
var workers = [];
var config = require('../../config');
var useCaddy = require('fs').existsSync(config.caddy.bin);
var conf = {
  localPort: process.argv[2] || (useCaddy ? 4080 : 443)   // system / local network
, insecurePort: process.argv[3] || (useCaddy ? 80 : 80)   // meh
, externalPort: 443                                       // world accessible
, externalPortInsecure: 80                                // world accessible
// TODO externalInsecurePort?
, locked: false // TODO XXX
, ipcKey: null
, caddyfilepath: config.caddy.conf
, sitespath: path.join(__dirname, '..', '..', 'sites-enabled')
};
var state = {};
var caddy;

if (useCaddy) {
  conf.caddypath = caddypath;
}

function fork() {
  if (workers.length < numCores) {
    workers.push(cluster.fork());
  }
}

cluster.on('online', function (worker) {
  var path = require('path');
  // TODO XXX Should these be configurable? If so, where?
  var certPaths = [path.join(__dirname, '..', '..', 'certs', 'live')];
  var info;
  conf.ddns = config.ddns;
  conf.redirects = config.redirects;

  console.info('[MASTER] Worker ' + worker.process.pid + ' is online');
  fork();

  // TODO communicate config with environment vars?
  info = {
    type: 'walnut.init'
  , conf: {
      protocol: useCaddy ? 'http' : 'https'
    , externalPort: conf.externalPort
    , localPort: conf.localPort
    , insecurePort: conf.insecurePort
    , trustProxy: useCaddy ? true : false
    , certPaths: useCaddy ? null : certPaths
    , ipcKey: null
      // TODO let this load after server is listening
    , redirects: config.redirects
    , ddns: config.ddns
    }
  };
  worker.send(info);

  function touchMaster(msg) {
    if ('walnut.webserver.listening' !== msg.type) {
      console.warn('[MASTER] received unexpected message from worker');
      console.warn(msg);
      return;
    }

    // calls init if init has not been called
    state.caddy = caddy;
    state.workers = workers;
    require('../lib/master').touch(conf, state).then(function () {
      info.type = 'walnut.webserver.onrequest';
      info.conf.ipcKey = conf.ipcKey;
      info.conf.memstoreSock = conf.memstoreSock;
      info.conf.sqlite3Sock = conf.sqlite3Sock;
      // TODO get this from db config instead
      var config = require('../../config');
      info.conf.primaryNameserver = config.ddns.primaryNameserver;
      info.conf.nameservers = config.ddns.nameservers;
      // TODO get this from db config instead
      info.conf.privkey = config.privkey;
      info.conf.pubkey = config.pubkey;
      info.conf.redirects = config.redirects;
      info.conf.ddns = config.ddns;
      worker.send(info);
    });
  }
  worker.on('message', touchMaster);
});

cluster.on('exit', function (worker, code, signal) {
  console.info('[MASTER] Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);

  workers = workers.map(function (w) {
    if (worker !== w) {
      return w;
    }
    return null;
  }).filter(function (w) {
    return w;
  });

  //console.log('WARNING: worker spawning turned off for debugging ');
  fork();
});

fork();

if (useCaddy) {
  caddy = require('../lib/spawn-caddy').create(conf);
  // relies on { localPort, locked }
  caddy.spawn(conf);
}
