Small and Fast
==============

We're targetting very tiny systems, so we have to
be really small and really fast.

We want to get from 0 to a listening socket as quickly
as possible, so we have this little folder of boot
code that uses no external modules and as few internal
modules as reasonably possible.

* fs.readFileSync is fast (< 1ms)
* v8's parser is pretty fast
* v8's fast compiler is slow
* v8's optimizer happens just-in-time

Master
======

Master has a few jobs:

* spin up the reverse proxy (caddy in this case)
* spin up the workers (as many as CPU cores)
* manage shared key/value store
* manage shared sqlite3
* perform one-off processes once boot is complete
  * SIGUSR1 (normally SIGHUP) to caddy
  * watch and update ip address
  * watch and update router unpn / pmp-nat
  * watch and update Reverse VPN

Worker
======

Workers are the ones that master spins up to do the hard
core stuff. They run the apis of the apps.

Low Mem
=======

We need to profile very low memory devices and see if
it is better to have just one process, or if master and
worker is still okay over time.

The working suspision is that by occasionally starting
up a new worker and killing the old one when memory usage
starts to rise should fair pretty well and keeping
the system stable.
