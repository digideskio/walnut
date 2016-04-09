#!/bin/bash

sudo mkdir -p /srv/walnut/{certs,core,letsencrypt,lib,config}
sudo mkdir -p /srv/walnut/packages/{api,pages,services}
sudo chown -R $(whoami):$(whoami) /srv/walnut

#git clone git@github.com:Daplie/walnut.git
git clone https://github.com/Daplie/walnut.git /srv/walnut/core

pushd /srv/walnut/core
npm install
popd

sudo rsync -a /srv/walnut/core/etc/init/walnut.conf /etc/init/walnut.conf
rsync -a /srv/walnut/core/etc/letsencrypt/ /srv/walnut/certs/
mv /srv/walnut/core/node_modules /srv/walnut

echo -n "Enter an email address to use for LetsEncrypt and press [ENTER]: "
read LE_EMAIL
node -e "
  'use strict';

  require('fs').writeFileSync('/srv/walnut/config.letsencrypt.json', JSON.stringify({
    configDir: '/srv/walnut/letsencrypt'
  , email: '$LE_EMAIL'
  , agreeTos: true
  }, null, '  '));
"

sudo service walnut stop
sudo service walnut start
