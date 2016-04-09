'use strict';

// TODO if RAM is very low we should not fork at all,
// but use a different process altogether

console.info('pid:', process.pid);
console.info('title:', process.title);
console.info('arch:', process.arch);
console.info('platform:', process.platform);
console.info('\n\n\n[MASTER] Welcome to WALNUT!');

function tryConf(pathname, def) {
  try {
    return require(pathname);
  } catch(e) {
    return def;
  }
}

var path = require('path');
var cluster = require('cluster');
//var minWorkers = 2;
var numCores = 2; // Math.max(minWorkers, require('os').cpus().length);
var workers = [];
var state = { firstRun: true };
// TODO Should these be configurable? If so, where?
// TODO communicate config with environment vars?
var walnut = tryConf(
  path.join('..', '..', 'config.walnut')
, { externalPort: 443
  , externalInsecurePort: 80
  , certspath: path.join(__dirname, '..', '..', 'certs', 'live')
  }
);
var caddy = tryConf(
  path.join('..', '..', 'config.caddy')
, { conf: path.join(__dirname, '..', '..', 'Caddyfile')
  , bin: null         // '/usr/local/bin/caddy'
  , sitespath: null   // path.join(__dirname, 'sites-enabled')
  , locked: false     // true
  }
);
var letsencrypt = tryConf(
  path.join('..', '..', 'config.letsencrypt')
, { configDir: path.join(__dirname, '..', '..', 'letsencrypt')
  , email: null
  , agreeTos: false
  }
);
var useCaddy = caddy.bin && require('fs').existsSync(caddy.bin);
var info = {
  type: 'walnut.init'
, conf: {
    protocol: useCaddy ? 'http' : 'https'
  , externalPort: walnut.externalPort
  , externalPortInsecure: walnut.externalInsecurePort         // TODO externalInsecurePort
  , localPort: walnut.localPort || (useCaddy ? 4080 : 443)    // system / local network
  , insecurePort: walnut.insecurePort || (useCaddy ? 80 : 80) // meh
  , certPaths: useCaddy ? null : [
      walnut.certspath
    , path.join(letsencrypt.configDir, 'live')
    ]
  , trustProxy: useCaddy ? true : false
  , lexConf: letsencrypt
  , varpath: path.join(__dirname, '..', '..', 'var')
  }
};

function fork() {
  if (workers.length < numCores) {
    workers.push(cluster.fork());
  }
}

cluster.on('online', function (worker) {
  console.info('[MASTER] Worker ' + worker.process.pid + ' is online');
  fork();

  if (state.firstRun) {
    state.firstRun = false;
    if (useCaddy) {
      caddy = require('../lib/spawn-caddy').create(caddy);
      // relies on { localPort, locked }
      caddy.spawn(caddy);
    }
    // TODO dyndns in master?
  }

  function touchMaster(msg) {
    if ('walnut.webserver.listening' !== msg.type) {
      console.warn('[MASTER] received unexpected message from worker');
      console.warn(msg);
      return;
    }

    state.caddy = caddy;
    state.workers = workers;
    // calls init if init has not been called
    require('../lib/master').touch(info.conf, state).then(function (newConf) {
      worker.send({ type: 'walnut.webserver.onrequest', conf: newConf });
    });
  }

  worker.send(info);
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
