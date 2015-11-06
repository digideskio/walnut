'use strict';

console.log('\n\n\n[MASTER] Welcome to WALNUT!');

var PromiseA = require('bluebird');
var fs = PromiseA.promisifyAll(require('fs'));
var cluster = require('cluster');
var numForks = 0;
var numCores = Math.min(2, require('os').cpus().length);
var securePort = process.argv[2] || 443; // 443
var insecurePort = process.argv[3] || 80; // 80
var localPort = securePort;
var caddy;
var masterServer;
var rootMasterKey;

var redirects = require('./redirects.json');
var path = require('path');

    // force SSL upgrade server
var certPaths = [path.join(__dirname, 'certs', 'live')];
var promiseServer;
var masterApp;
var caddyConf = { localPort: 4080, locked: true };

//console.log('\n.');

function fork() {
  if (numForks < numCores) {
    numForks += 1;
    cluster.fork();
  }
}

// Note that this function will be called async, after promiseServer is returned
// it seems like a circular dependency, but it isn't... not exactly anyway
function promiseApps() {
  if (masterApp) {
    return PromiseA.resolve(masterApp);
  }

  masterApp = promiseServer.then(function (_masterServer) {
    masterServer = _masterServer;
    console.log("[MASTER] Listening on https://localhost:" + masterServer.address().port, '\n');

    return require('./lib/unlock-device').create().then(function (result) {
      result.promise.then(function (_rootMasterKey) {
        var i;
        caddyConf.locked = false;
        if (caddy) {
          caddy.update(caddyConf);
        }
        rootMasterKey = _rootMasterKey;

        if (numCores <= 2) {
          // we're on one core, stagger the remaning
          fork();
          return;
        }

        for (i = 0; i < numCores; i += 1) {
          fork();
        }
      });

      masterApp = result.app;
      return result.app;
    });
  });

  return masterApp;
}

// TODO have a fallback server than can download and apply an update?
require('./lib/insecure-server').create(securePort, insecurePort, redirects);
//console.log('\n.');
promiseServer = fs.existsAsync('/usr/local/bin/caddy').then(function () {
  console.log("Caddy is not present");
  // Caddy DOES NOT exist, use our node sni-server
  return require('./lib/sni-server').create(certPaths, localPort, promiseApps);
}, function () {
  console.log("Caddy is present (assumed running)");
  // Caddy DOES exist, use our http server without sni
  localPort = caddyConf.localPort;
  caddy = require('./lib/spawn-caddy').create();

  return caddy.spawn(caddyConf).then(function () {
    console.log("caddy has spawned");
  //return caddy.update(caddyConf).then(function () {
  //  console.log("caddy is updating");

    setInterval(function () {
      console.log('SIGUSR1 to caddy');
      return caddy.update(caddyConf);
    }, 60 * 1000);

    return require('./lib/local-server').create(localPort, promiseApps);
  //});
  });
});

//console.log('\n.');

cluster.on('online', function (worker) {
  console.log('[MASTER] Worker ' + worker.process.pid + ' is online');
  fork();

  if (masterServer) {
    // NOTE: it's possible that this could survive idle for a while through keep-alive
    // should default to connection: close
    masterServer.close();
    masterServer = null;

    setTimeout(function () {
      // TODO use `id' to find user's uid / gid and set to file
      // TODO set immediately?
      if (!caddy) {
        // TODO what about caddy
        process.setgid(1000);
        process.setuid(1000);
      }
    }, 1000);
  }

  console.log("securePort", securePort);
  worker.send({
    type: 'init'
  , securePort: localPort
  , certPaths: caddy ? null : certPaths
  });

  worker.on('message', function (msg) {
    console.log('message from worker');
    console.log(msg);
  });
});

cluster.on('exit', function (worker, code, signal) {
  numForks -= 1;
  console.log('[MASTER] Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
  fork();
});

// TODO delegate to workers
function updateIps() {
  console.log('[UPDATE IP]');
  require('./lib/ddns-updater').update().then(function (results) {
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
// TODO check the IP every 5 minutes and update it every hour
setInterval(updateIps, 60 * 60 * 1000);
// we don't want this to load right away (extra procesing time)
setTimeout(updateIps, 1);

/*
worker.send({
  insecurePort: insecurePort
});
*/


/*
var fs = require('fs');
var daplieReadFile = fs.readFileSync;
var time = 0;

fs.readFileSync = function (filename) {
  var now = Date.now();
  var data = daplieReadFile.apply(fs, arguments);
  var t;

  t = (Date.now() - now);
  time += t;
  console.log('loaded "' + filename + '" in ' + t + 'ms (total ' + time + 'ms)');

  return data;
};
*/

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
