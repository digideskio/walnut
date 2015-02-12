'use strict';

var PromiseA = require('bluebird').Promise
  , natpmp = require('nat-pmp')
  , exec = require('child_process').exec
  ;

exports.pmpForward = function (port) {
  return new PromiseA(function (resolve, reject) {
    exec('ip route show default', function (err, stdout, stderr) {
      var gw
        ;

      if (err || stderr) { reject(err || stderr); return; }
      
      // default via 192.168.1.1 dev eth0
      gw = stdout.replace(/^default via (\d+\.\d+\.\d+\.\d+) dev[\s\S]+/m, '$1');
      console.log('Possible PMP gateway is', gw);

      // create a "client" instance connecting to your local gateway
      var client = natpmp.connect(gw);

      function setPortForward() {
        // setup a new port mapping
        client.portMapping({
          private: port.private || port.public
        , public: port.public || port.private
        , ttl: port.ttl || 0 // 600
        }, function (err, info) {
          if (err) {
            reject(err);
            return;
          }

          console.log(info);
          // {
          //   type: 'tcp',
          //   epoch: 8922109,
          //   private: 22,
          //   public: 2222,
          //   ...
          // }
          resolve();
        });
      }

      // explicitly ask for the current external IP address
      setTimeout(function () {
        client.externalIp(function (err, info) {
          if (err) throw err;
          console.log('Current external IP address: %s', info.ip.join('.'));
          setPortForward();
        });
      });
    });
  });
};
