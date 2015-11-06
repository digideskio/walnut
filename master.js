'use strict';

// TODO if RAM is very low we should not fork at all,
// but use a different process altogether

console.log('pid:', process.pid);
console.log('title:', process.title);
console.log('arch:', process.arch);
console.log('platform:', process.platform);
console.log('\n\n\n[MASTER] Welcome to WALNUT!');

var cluster = require('cluster');
var path = require('path');
var minWorkers = 2;
var numCores = Math.max(minWorkers, require('os').cpus().length);
var workers = [];
var caddypath = '/usr/local/bin/caddy';
var useCaddy = require('fs').existsSync(caddypath);
var conf = {
  localPort: process.argv[2] || (useCaddy ? 4080 : 443)   // system / local network
, insecurePort: process.argv[3] || (useCaddy ? 80 : 80)   // meh
, externalPort: 443                                       // world accessible
// TODO externalInsecurePort?
, locked: false // TODO XXX
, ipcKey: null
, caddyfilepath: path.join(__dirname, 'Caddyfile')
, sitespath: path.join(__dirname, 'sites-enabled')
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
  var certPaths = [path.join(__dirname, 'certs', 'live')];
  var info;

  console.log('[MASTER] Worker ' + worker.process.pid + ' is online');
  fork();

  info = {
    type: 'com.daplie.walnut.init'
  , conf: {
      protocol: useCaddy ? 'http' : 'https'
    , externalPort: conf.externalPort
    , localPort: conf.localPort
    , insecurePort: conf.insecurePort
    , trustProxy: useCaddy ? true : false
    , certPaths: useCaddy ? null : certPaths
    , ipcKey: null
    }
  };
  worker.send(info);

  function touchMaster(msg) {
    if ('com.daplie.walnut.webserver.listening' !== msg.type) {
      console.warn('[MASTER] received unexpected message from worker');
      console.warn(msg);
      return;
    }

    // calls init if init has not been called
    state.caddy = caddy;
    state.workers = workers;
    require('./lib/master').touch(conf, state).then(function () {
      info.type = 'com.daplie.walnut.webserver.onrequest';
      info.conf.ipcKey = conf.ipcKey;
      worker.send(info);
    });
  }
  worker.on('message', touchMaster);
});

cluster.on('exit', function (worker, code, signal) {
  console.log('[MASTER] Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);

  workers = workers.map(function (w) {
    if (worker !== w) {
      return w;
    }
    return null;
  }).filter(function (w) {
    return w;
  });

  fork();
});

fork();

if (useCaddy) {
  caddy = require('./lib/spawn-caddy').create(conf);
  // relies on { localPort, locked }
  caddy.spawn(conf);
}