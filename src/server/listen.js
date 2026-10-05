'use strict';

// Listen on `port`/`bind`. Resolves { port } on success, rejects on any error.
// A taken port is a config problem, not something to paper over by silently
// moving: EADDRINUSE rejects with a message pointing at `port` in config.json.
function listen(server, { port, bind }) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE') {
        return reject(
          new Error(`port ${port} is already in use — stop what is holding it, or set a different "port" in config.json`)
        );
      }
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve({ port });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, bind);
  });
}

module.exports = { listen };
