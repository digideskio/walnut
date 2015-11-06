'use strict';

module.exports.create = function (/*config*/) {
  var PromiseA = require('bluebird');
  var spawn = require('child_process').spawn;
  var path = require('path');
  var caddypath = '/usr/local/bin/caddy';
  var caddyfilepath = path.join(__dirname, '..', 'Caddyfile');
  var sitespath = path.join(__dirname, '..', 'sites-enabled');
  var caddy;
  var fs = require('fs');


  // TODO this should be expanded to include proxies a la proxydyn
  function writeCaddyfile(conf) {
    return new PromiseA(function (resolve, reject) {
      fs.readdir(sitespath, function (err, nodes) {
        if (err) {
          reject(err);
          return;
        }

        conf.domains = nodes.filter(function (node) {
          return /\./.test(node) && !/(^\.)|([\/\:\\])/.test(node);
        });

        var contents = tplCaddyfile(conf);
        fs.writeFile(caddyfilepath, contents, 'utf8', function (err) {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      });
    });
  }

  function tplCaddyfile(conf) {
    var contents = [];

    conf.domains.forEach(function (hostname) {
      var content = "";

      content+= "https://" + hostname + " {\n"
        + "  gzip\n"
        + "  tls "
            + "/srv/walnut/certs/live/" + hostname + "/fullchain.pem "
            + "/srv/walnut/certs/live/" + hostname + "/privkey.pem\n"
      ;

      if (conf.locked) {
        content += "  root /srv/walnut/init.public/\n";
      } else {
        content += "  root /srv/walnut/sites-enabled/" + hostname + "/\n";
      }

      content += 
        "  proxy /api http://localhost:" + conf.localPort.toString() + "\n"
        // # TODO internal
      + "}";

      contents.push(content);
    });

    return contents.join('\n\n');
  }

  function spawnCaddy(conf) {
    console.log('[CADDY] start');
    return writeCaddyfile(conf).then(function () {
      if (caddy) {
        caddy.kill('SIGUSR1');
        return;

        // TODO caddy.kill('SIGKILL'); if SIGTERM fails
        // https://github.com/mholt/caddy/issues/107
        // SIGUSR1

        //caddy.kill('SIGTERM');
      }

      caddy = spawn(caddypath, ['-conf', caddyfilepath],  { stdio: ['ignore', 'pipe', 'pipe'] });
      caddy.stdout.on('data', function (str) {
        console.error('[Caddy]', str.toString('utf8'));
      });

      caddy.stderr.on('data', function (errstr) {
        console.error('[Caddy]', errstr.toString('utf8'));
      });

      caddy.on('close', function (code, signal) {
        // TODO catch if caddy doesn't exist
        console.log('[Caddy]');
        console.log(code, signal);
        caddy = null;
        setTimeout(function () {
          spawnCaddy(conf);
        }, 1 * 1000);
      });

      return caddy;
    });
  }

  function sighup() {
    if (caddy) {
      caddy.kill('SIGUSR1');
      return;
    }

    // sudo kill -s SIGUSR1 `cat caddy.pid`
    fs.readFileAsync('/srv/walnut/caddy.pid', 'utf8').then(function (pid) {
      console.log('[caddy] pid', pid);
      caddy = spawn('/bin/kill', ['-s', 'SIGUSR1', pid]);
    });
  }

  return {
    spawn: spawnCaddy
  , update: function (conf) {
      return writeCaddyfile(conf).then(sighup);
    }
  , sighup: sighup
  };
};
