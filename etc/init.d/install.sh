#!/bin/bash

sudo rsync -v walnut /etc/init.d/
sudo chmod 755 /etc/init.d/walnut
sudo update-rc.d walnut defaults
