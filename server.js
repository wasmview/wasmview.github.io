const fs = require('fs');
const {
    promisify
} = require('util');
const readDirAsync = promisify(fs.readdir);
const express = require('express');
const next = require('next')
const {
    join,
    basename,
    resolve
} = require('path');
const cors = require('cors');
const bodyParser = require('body-parser')
const http = require('http');

const Crawler = require('./WebAssemblyAnalysis_Modules/WebsiteCrawler');
const CONFIG = require('./config.json');


let node_server_port = process.env.NODE_SERVER_PORT || CONFIG.node_server_port

if (typeof (node_server_port) == 'string') {
    node_server_port = parseInt(node_server_port);
}

const dev = process.env.NODE_ENV !== 'production'
const app = next({
    dev
})
const handle = app.getRequestHandler()



app.prepare()
    .then(() => {
        const server = express();

        server.use(bodyParser.urlencoded({
            extended: false
        }))
        server.use(bodyParser.json())
        server.use('/', express.static('public'))

        server.get('/results', (req, res) => {
            return res.redirect('/');
        })

        server.get('/statistic/:purpose/:stat/:metric', (req, res) => {
            app.render(req, res, '/statistic', req.params)
        })

        server.get('*', (req, res) => {
            return handle(req, res)
        })


        server.post('/scan', async (req, res, next) => {

            const {
                action,
                urlToScan
            } = req.body;
            let features = [];

            let crawlResults;
            let wasmFilePaths;
            try {
                const crawly = new Crawler();
                crawlResults = await crawly.main(urlToScan)

                if (crawlResults == null) {
                    return res.json({
                        fileResults: features,
                        error: 'crawlResults null'
                    });
                }

                wasmFilePaths = crawlResults.wasmFilePaths;
                return res.json({
                    fileResults: features,
                    pageFound: crawlResults ? crawlResults.pageFound : null,
                    graphDetails: crawlResults ? crawlResults.graphDetails : null,
                    wasmFilePaths: wasmFilePaths

                });

            } catch (e) {
                console.error(e);

                return res.json({
                    fileResults: features,
                    errorText: 'Exception null',
                    error: e,
                    wasmFilePaths: wasmFilePaths

                });
            }




        });

        const httpServer = http.createServer(server);

        httpServer.listen(node_server_port, function () {

            console.log(`HTTP Server running on port ${node_server_port}\nServer can be accessed at http://localhost:${node_server_port}`);
        });
        

        // setTimeout(() => {
        //     // mqConnector.init()
        // }, 10000);

    })
    .catch((ex) => {
        console.error(ex.stack)
        process.exit(1)
    })