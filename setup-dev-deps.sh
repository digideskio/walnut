#!/bin/bash

pushd node_modules/authentication-microservice/ || git clone git@github.com:coolaj86/node-authentication-microservice node_modules/authentication-microservice
  git pull
popd

pushd node_modules/oauthclient-microservice/ || git clone git@github.com:OAuth3/node-oauth3clients.git node_modules/oauthclient-microservice
  git pull
popd

pushd node_modules/oauthcommon/ || git clone git@github.com:coolaj86/node-oauthcommon.git node_modules/oauthcommon
  git pull
popd
