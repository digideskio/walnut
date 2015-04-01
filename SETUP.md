# secure the server with https://coolaj86.com/articles/securing-your-vps-for-the-semi-paranoid.html

# install walnut
sudo mkdir /srv/walnut
sudo chown walnut:walnut -R /srv/walnut
pushd /srv/walnut
git init
git remote origin add git@github.com:daplie/walnut.git
git pull
npm install

# copy uid and guid to ./walnut.js
id
vim walnut.js

# configure redirects
rsync -av redirects.sample.json redirects.json

# create and start upstart service
sudo rsync -av upstart-walnut /etc/init/walnut.conf
# for init.d: sudo rsync -av init.d-walnut /etc/init.d/walnut
sudo service walnut restart
