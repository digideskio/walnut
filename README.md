walnut
======

Small, light, and secure iot application framework.

Features
------

* IOT Application server written in [Node.js](https://nodejs.org)
* Small memory footprint
* Secure
  * Uses JWT, not Cookies\*
  * HTTPS-only
  * AES, RSA, and ECDSA encryption and signing
  * Safe against CSRF, XSS, and SQL injection
  * Safe against Compression attacks
* Multi-Tentated Application Management
* Built-in OAuth2 & OAuth3 support
  * Facebook Connect
  * Google Plus

\*Cookies are used only for GETs and only where using a token would be less secure
such as images which would otherwise require the token to be passed into the img src.
They are also scoped such that CSRF attacks are not possible.

In Progress
-----------

* Static Asset Serving via [Caddy](https://caddyserver.org)
* HTTPS Certificates provisioned via [Let's Encrypt](https://letsencrypt.org)
* HTTPS Key Pinning
* Heroku (pending completion of PostgreSQL support)
* [GunDB](https://gundb.io) Support
* OpenID support

Structure
=====

Currently being tested with Ubuntu, Raspbian, and Debian on Digital Ocean, Raspberry Pi, and Heroku.

```
/srv/walnut/
├── setup.sh (in-progress)
├── core
│   ├── bin
│   ├── boot
│   ├── holepunch
│   └── lib
├── node_modules
├── packages
│   ├── apis
│   ├── pages
│   └── services
├── certs
|   └── live
│       └── example.com
│           ├── fullchain.pem
│           └── privkey.pem
└── var
```

* `core` contains all walnut code
* `node_modules` is a flat installation of all dependencies
* `certs` is a directory for Let's Encrypt (or custom) certificates
* `var` is a directory for database files and such
* `packages` contains 3 types of packages

LICENSE
-------

Apache-2.0

See LICENSE
