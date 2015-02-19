var acme = require("node-acme");
var acmeServer = "www.letsencrypt-demo.org";
var desiredIdentifier = "testssl.coolaj86.com";
var authzURL = "https://" + acmeServer + "/acme/new-authz";
var certURL = "https://" + acmeServer + "/acme/new-cert";

acme.getMeACertificate(authzURL, certURL, desiredIdentifier, function(x) {
  console.log("Result of getMeACertificate:");
  console.log(x);
  /*
  if (acmeServer.match(/localhost/)) {
    server.close();
  }
  */
});

/*
if (acmeServer.match(/localhost/)) {
  // TODO for internal peers?
  acme.enableLocalUsage();
}
*/


