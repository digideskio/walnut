'use strict';

console.log('\n\n\n[MASTER] Welcome to WALNUT!');

var PromiseA = require('bluebird');
var cluster = require('cluster');
var numCores = require('os').cpus().length;
var securePort = process.argv[2] || 443;
var insecurePort = process.argv[3] || 80;
var secureServer;
var rootMasterKey;

var redirects = require('./redirects.json');
var path = require('path');

    // force SSL upgrade server
var certPaths = [path.join(__dirname, 'certs', 'live')];
var promiseServer;
var masterApp;

//console.log('\n.');

// Note that this function will be called async, after promiseServer is returned
// it seems like a circular dependency, but it isn't... not exactly anyway
function promiseApps() {
  if (masterApp) {
    return PromiseA.resolve(masterApp);
  }

  masterApp = promiseServer.then(function (_secureServer) {
    secureServer = _secureServer;
    console.log("[MASTER] Listening on https://localhost:" + secureServer.address().port, '\n');

    return require('./lib/unlock-device').create().then(function (result) {
      result.promise.then(function (_rootMasterKey) {
        var i;
        rootMasterKey = _rootMasterKey;

        for (i = 0; i < numCores; i += 1) {
          cluster.fork();
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
promiseServer = require('./lib/sni-server').create(certPaths, securePort, promiseApps);
//console.log('\n.');

cluster.on('online', function (worker) {
  console.log('[MASTER] Worker ' + worker.process.pid + ' is online');
  if (secureServer) {
    // NOTE: it's possible that this could survive idle for a while through keep-alive
    // should default to connection: close
    secureServer.close();
    secureServer = null;

    setTimeout(function () {
      // TODO use `id' to find user's uid / gid and set to file
      // TODO set immediately?
      process.setgid(1000);
      process.setuid(1000);
    }, 1000);
  }

  worker.send({
    type: 'init'
  , securePort: securePort
  , certPaths: certPaths
  });
  worker.on('message', function (msg) {
    console.log('message from worker');
    console.log(msg);
  });
});

cluster.on('exit', function (worker, code, signal) {
  console.log('[MASTER] Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
  cluster.fork();
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
