'use strict';

function tplCaddyfile(caddyConf) {
  var contents = [];

  caddyConf.domains.forEach(function (hostname) {
    var content = "";
    var pagesname = hostname;

    // TODO prefix
    content += "https://" + hostname + " {\n"
      + "  gzip\n"
      + "  tls "
          + "/srv/walnut/certs/live/" + hostname + "/fullchain.pem "
          + "/srv/walnut/certs/live/" + hostname + "/privkey.pem\n"
    ;

    if (caddyConf.locked) {
      content += "  root /srv/walnut/init.public/\n";
    } else {
      content += "  root " + caddyConf.sitespath + "/" + pagesname + "/\n";
    }

    content +=
      "  proxy /api http://localhost:" + caddyConf.localPort.toString() + " {\n"
    + "    proxy_header Host {host}\n"
    + "    proxy_header X-Forwarded-Host {host}\n"
    + "    proxy_header X-Forwarded-Proto {scheme}\n"
      // # TODO internal
    + "  }\n"
    + "}";

    contents.push(content);
  });

  return contents.join('\n\n');
}

module.exports.tplCaddyfile = tplCaddyfile;
module.exports.create = function (caddyConf) {
  var spawn = require('child_process').spawn;
  var caddyBin = caddyConf.bin;
  var caddyfilePath = caddyConf.conf;
  // TODO put up a booting / lock screen on boot
  // and wait for all to be grabbed from db
  // NOTE caddy cannot yet support multiple roots
  // (needed for example.com/appname instead of appname.example.com)
  var caddy;
  var fs = require('fs');

  // TODO this should be expanded to include proxies a la proxydyn
  function writeCaddyfile(caddyConf, cb) {
    fs.readdir(caddyConf.sitespath, function (err, nodes) {
      if (err) {
        if (cb) {
          cb(err);
          return;
        }
        console.error('[writeCaddyFile] 0');
        console.error(err.stack);
        throw err;
      }

      caddyConf.domains = nodes.filter(function (node) {
        return /\./.test(node) && !/(^\.)|([\/\:\\])/.test(node);
      });

      var contents = tplCaddyfile(caddyConf);
      fs.writeFile(caddyfilePath, contents, 'utf8', function (err) {
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

  function spawnCaddy(caddyConf, cb) {
    console.log('[CADDY] start');
    writeCaddyfile(caddyfilePath, function (err) {
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
      caddy = spawn(caddyBin, ['-conf', caddyfilePath],  { stdio: ['ignore', 'pipe', 'pipe'] });
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
          spawnCaddy(caddyConf);
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
  , update: function (caddyConf) {
      return writeCaddyfile(caddyConf, sighup);
    }
  , sighup: sighup
  };
};
