'use strict';

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

module.exports.tplCaddyfile = tplCaddyfile;
module.exports.create = function (config) {
  var spawn = require('child_process').spawn;
  var caddypath = config.caddypath;
  var caddyfilepath = config.caddyfilepath;
  var sitespath = config.sitespath;
  var caddy;
  var fs = require('fs');

  // TODO this should be expanded to include proxies a la proxydyn
  function writeCaddyfile(conf, cb) {
    fs.readdir(sitespath, function (err, nodes) {
      if (err) {
        if (cb) {
          cb(err);
          return;
        }
        console.error('[writeCaddyFile] 0');
        console.error(err.stack);
        throw err;
      }

      conf.domains = nodes.filter(function (node) {
        return /\./.test(node) && !/(^\.)|([\/\:\\])/.test(node);
      });

      var contents = tplCaddyfile(conf);
      fs.writeFile(caddyfilepath, contents, 'utf8', function (err) {
        if (err) {
          if (cb) {
            cb(err);
            return;
          }
          console.error('[writeCaddyFile] 1');
          console.error(err.stack);
          throw err;
        }

        if (cb) { cb(null); }
      });
    });
  }

  function spawnCaddy(conf, cb) {
    console.log('[CADDY] start');
    writeCaddyfile(conf, function (err) {
      if (err) {
        console.error('[writeCaddyfile]');
        console.error(err.stack);
        throw err;
      }
      if (caddy) {
        caddy.kill('SIGUSR1');
        return caddy;

        // TODO caddy.kill('SIGKILL'); if SIGTERM fails
        // https://github.com/mholt/caddy/issues/107
        // SIGUSR1

        //caddy.kill('SIGTERM');
      }

      try {
        require('child_process').execSync('killall caddy');
      } catch(e) {
        // ignore
        // Command failed: killall caddy
        // caddy: no process found
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

      try {
        if ('function' === typeof cb) { cb(null, caddy); }
      } catch(e) {
        console.error('ERROR: [spawn-caddy.js]');
        console.error(e.stack);
      }
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
      return writeCaddyfile(conf, sighup);
    }
  , sighup: sighup
  };
};