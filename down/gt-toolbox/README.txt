gt-toolbox
==========

Two browser tools for Guardian Tales, bundled with a small local helper
server so they can talk to the data source.

    site/gt.html              stat/gear calculator
    site/new44/index.html     circular colosseum simulator

    site/new44/name-index.bin offline player-name index (encrypted, ~3.6 MB)

Searching by player name uses the bundled offline index, so a name lookup
needs no network request at all; only fetching the player's card does.


HOW TO RUN
----------

  1. Install Node.js 18 or newer  ->  https://nodejs.org/
     (Only needed once. The launcher checks the version for you.)

  2. Double-click  launch.bat

  3. A console window opens and your browser opens both tools.
     Keep the console window open while using the tools.
     Close it (or press Ctrl+C) to stop.


WHY DOES IT NEED A LOCAL SERVER
-------------------------------

The pages fetch player data from a public API. That API only answers
requests that carry an allowed Referer header, and a script running in a
page is not allowed to set that header. So the request has to leave from
a server that can set it - that is what the bundled launcher does.

Opening the pages directly from disk (file://) does NOT work: without a
known origin the API sends no CORS headers, so the browser cannot read
the response. This is a browser security rule, not a bug here.

The launcher runs two listeners, both on 127.0.0.1 only:

    8000   static files (the two pages)
    8799   API proxy (adds the Referer the API requires)

The pages detect that they are served from localhost and send their API
calls to 8799 automatically, so no configuration is needed.


CONFIGURATION
-------------

  Different port (default 8000; if it is busy the launcher tries 8001,
  8002, ... up to 8020 automatically, so you normally do not need this):

      node launcher.mjs --port 8100

  The launcher listens on 127.0.0.1 only - it is not exposed to your
  network. It deliberately ignores the PORT environment variable, because
  some environments set that globally and it would collide with an
  unrelated service.

  The API proxy always uses port 8799, because the bundled pages expect
  it there.


TROUBLESHOOTING
---------------

  "Node.js not found"
      Install Node.js 18+ from https://nodejs.org/ and run launch.bat again.

  Console shows "port 8000 already in use"
      Another copy is already running. Close it, or use the PORT setting
      shown above.

  Pages load but say no player was found
      The API may be temporarily unreachable, or it changed and this
      bundle is out of date. Check the console window for [api] lines.

  Buttons do nothing / page looks broken
      Make sure the console window from launch.bat is still open.
