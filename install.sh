#!/bin/bash

sudo mkdir -p /srv/walnut/{certs,core,lib}
sudo mkdir -p /srv/walnut/packages/{api,pages,services}
sudo chown -R $(whoami):$(whoami) /srv/walnut

#git clone git@github.com:Daplie/walnut.git
git clone https://github.com/Daplie/walnut.git /srv/walnut/core

pushd /srv/walnut/core
npm install
sudo rsync -av /srv/walnut/core/etc/init/walnut.conf /etc/init/walnut.conf

popd
mv /srv/walnut/core/node_modules /srv/walnut

sudo service walnut stop
sudo service walnut start
