# WasmView.github.io

## [Video Demo](https://youtu.be/kjKxL7L7zxI)

## [Source Code](https://github.com/wasmview/wasmview.github.io/tree/master/)
The source code for the WasmView system is in this folder.


### Local Setup

To get the system running locally, you will need to the following installed:
* Node.js

You will need to run `npm install` install up the dependencies. You can modify the `config.json` file if desired to change settings such as the server listening port or the amount of time a Chromium instance should wait. Next, run `npm run build` to generate the server pages.

To run the server, use the `npm run prod` or set the NODE_ENV environment variable to `production` and then run `node server.js`.

The UI can then be loaded at http://localhost:4000, and a URL can be entered for processing.