'use strict';

var staticHandlers = {};

function loadPages(pkgConf, packagedPage, req, res, next) {
  var PromiseA = require('bluebird');
  var fs = require('fs');
  var path = require('path');
  var pkgpath = path.join(pkgConf.pagespath, (packagedPage.package || packagedPage.id), (packagedPage.version || ''));

  // TODO special cases for /.well_known/ and similar (oauth3.html, oauth3.json, webfinger, etc)

  function handlePromise(p) {
    p.then(function (app) {
      app(req, res, next);
      packagedPage._page = app;
    }, function (err) {
      console.error('[App Promise Error]');
      next(err);
    });
  }

  if (staticHandlers[pkgpath]) {
    packagedPage._page = staticHandlers[pkgpath];
    packagedPage._page(req, res, next);
    return;
  }

  if (!packagedPage._promise_page) {
    packagedPage._promise_page = new PromiseA(function (resolve, reject) {
      fs.exists(pkgpath, function (exists) {
        var staticServer;

        if (!exists) {
          reject(new Error("package '" + pkgpath + "' is registered but does not exist"));
          return;
        }

        //console.log('[static mount]', pkgpath);
        // https://github.com/expressjs/serve-static/issues/54
        // https://github.com/pillarjs/send/issues/91
        // https://example.com/.well-known/acme-challenge/xxxxxxxxxxxxxxx
        staticServer = require('serve-static')(pkgpath, { dotfiles: undefined });
        resolve(staticServer);
      });
    });
  }

  handlePromise(packagedPage._promise_page);
}

function layerItUp(pkgConf, router, req, res, next) {
  var nexti = -1;
  // Layers exist so that static apps can use them like a virtual filesystem
  // i.e. oauth3.html isn't in *your* app but you may use it and want it mounted at /.well-known/oauth3.html
  // or perhaps some dynamic content (like application cache)
  function nextify(err) {
    var packagedPage;
    nexti += 1;

    if (err) {
      next(err);
      return;
    }

    // shortest to longest
    //route = packages.pop();
    // longest to shortest
    packagedPage = router.packagedPages[nexti];
    if (!packagedPage) {
      next();
      return;
    }

    if (packagedPage._page) {
      packagedPage._page(req, res, nextify);
      return;
    }

    // could attach to req.{ pkgConf, pkgDeps, Services}
    loadPages(pkgConf, packagedPage, req, res, next);
  }

  nextify();
}

module.exports.layerItUp = layerItUp;
