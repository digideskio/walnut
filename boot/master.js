'use strict';

// TODO if RAM is very low we should not fork at all,
// but use a different process altogether

console.info('pid:', process.pid);
console.info('title:', process.title);
console.info('arch:', process.arch);
console.info('platform:', process.platform);
console.info('\n\n\n[MASTER] Welcome to WALNUT!');

var path = require('path');
var cluster = require('cluster');
//var minWorkers = 2;
var numCores = 2; // Math.max(minWorkers, require('os').cpus().length);
var workers = [];
var state = { firstRun: true };

function fork() {
  if (workers.length < numCores) {
    workers.push(cluster.fork());
  }
}

cluster.on('online', function (worker) {
  console.info('[MASTER] Worker ' + worker.process.pid + ' is online');
  fork();

  var config = {
    externalPort: 443                                       // world accessible
  , externalPortInsecure: 80                                // world accessible
  // TODO externalInsecurePort?
  , locked: false // TODO XXX
    // XXX
    // TODO needs mappings from db
    // TODO autoconfig Caddy caddy
    // XXX
  , caddy: {
      conf: __dirname + '/Caddyfile'
    , bin: '/usr/local/bin/caddy'
    , sitespath: path.join(__dirname, 'sites-enabled')
    }
  };
  var useCaddy = require('fs').existsSync(config.caddy.bin);
  var caddy;

  config.localPort = process.argv[2] || (useCaddy ? 4080 : 443);   // system / local network
  config.insecurePort = process.argv[3] || (useCaddy ? 80 : 80);   // meh
  if (state.firstRun) {
    state.firstRun = false;
    if (useCaddy) {
      caddy = require('../lib/spawn-caddy').create(config);
      // relies on { localPort, locked }
      caddy.spawn(config);
    }
  }

  // TODO XXX Should these be configurable? If so, where?
  var certPaths = [
    path.join(__dirname, '..', '..', 'certs', 'live')
  , path.join(__dirname, '..', '..', 'letsencrypt', 'live')
  ];
  // TODO communicate config with environment vars?
  var info = {
    type: 'walnut.init'
  , conf: {
      protocol: useCaddy ? 'http' : 'https'
    , externalPort: config.externalPort
    , localPort: config.localPort
    , insecurePort: config.insecurePort
    , certPaths: useCaddy ? null : certPaths
    , trustProxy: useCaddy ? true : false
    }
  };

  function touchMaster(msg) {
    if ('walnut.webserver.listening' !== msg.type) {
      console.warn('[MASTER] received unexpected message from worker');
      console.warn(msg);
      return;
    }

    // calls init if init has not been called
    state.caddy = caddy;
    state.workers = workers;
    require('../lib/master').touch(config, state).then(function (results) {
      //var memstore = results.memstore;
      var sqlstore = results.sqlstore;
      info.type = 'walnut.webserver.onrequest';
      // TODO let this load after server is listening
      info.conf['org.oauth3.consumer'] = config['org.oauth3.consumer'];
      info.conf['org.oauth3.provider'] = config['org.oauth3.provider'];
      info.conf.keys = config.keys;
      info.conf.memstoreSock = config.memstoreSock;
      info.conf.sqlite3Sock = config.sqlite3Sock;
      // TODO get this from db config instead
      info.conf.privkey = config.privkey;
      info.conf.pubkey = config.pubkey;
      info.conf.redirects = [
        { "ip": false, "id": "*", "value": false } // default no-www

      , { "ip": false, "id": "daplie.domains", "value": null }
      , { "ip": false, "id": "*.daplie.domains", "value": false }
      , { "ip": false, "id": "no.daplie.domains", "value": false }
      , { "ip": false, "id": "*.no.daplie.domains", "value": false }
      , { "ip": false, "id": "ns2.daplie.domains", "value": false }

      , { "ip": true, "id": "maybe.daplie.domains", "value": null }
      , { "ip": true, "id": "*.maybe.daplie.domains", "value": null }

      , { "ip": true, "id": "www.daplie.domains", "value": null }
      , { "ip": true, "id": "yes.daplie.domains", "value": true }
      , { "ip": true, "id": "*.yes.daplie.domains", "value": true }
      , { "ip": true, "id": "ns1.daplie.domains", "value": false }
      ];
      // TODO use sqlite3 or autogenerate ?
      info.conf.privkey = require('fs').readFileSync(__dirname + '/../../' + '/nsx.redirect-www.org.key.pem', 'ascii');
      info.conf.pubkey = require('fs').readFileSync(__dirname + '/../../' + '/nsx.redirect-www.org.key.pem.pub', 'ascii');
  // keys
  // letsencrypt
  // com.example.provider
  // com.example.consumer
      worker.send(info);
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
