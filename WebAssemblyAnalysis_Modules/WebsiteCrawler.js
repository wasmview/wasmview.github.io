const fs = require('fs');
const {
    promisify
} = require('util');

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const puppeteer = require('puppeteer');
const path = require('path');

const uuidv1 = require('uuid/v1');

const CONFIG = require('../config.json');
const TIME_TO_WAIT = CONFIG.time_to_wait;
const NUM_SCREENSHOTS = CONFIG.number_of_screenshots;
const OUTPUT_DIRECTORY = CONFIG.output_folder;

const dev = process.env.NODE_ENV !== 'production'

const preloadFile = fs.readFileSync(path.join(__dirname, './instrumentationCode.js'), 'utf8');
// const binaryenJSFile = fs.readFileSync(path.join(__dirname, './binaryen.js'), 'utf8');
const wabtJSFile = fs.readFileSync(path.join(__dirname, './wabt.js'), 'utf8');


class Queue {
    // Retrieved from : https://www.geeksforgeeks.org/implementation-queue-javascript/
    // Array is used to implement a Queue
    constructor() {
        this.items = [];
    }

    enqueue(element) {
        // adding element to the queue
        this.items.push(element);
    }

    dequeue() {
        // removing element from the queue
        // returns underflow when called
        // on empty queue
        if (this.isEmpty()) return null;
        return this.items.shift();
    }

    isEmpty() {
        // return true if the queue is empty.
        return this.items.length == 0;
    }

    numberOfItems() {
        return this.items.length;
    }
}

function waitFor(seconds) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve()
        }, seconds * 1000);
    })
}

class Crawler {
    constructor() {
        this.capturedRequests = {};
        this.browser = null;
    }

    cleanDomain(domain){
        return domain.replace(/\//g, '__').replace(/:/g, '').replace(/\./g, '___').slice(0, 50);
    }

    formatStackTrace(stackTrace, wasmDebugFunctionNames = null) {
        let stackTraceFrames = stackTrace.replace('Error\n ', '')
            .replace(/Object\./g, '')
            .split(/at(.*)(\(.*\))?/g)
            .filter(str => {
                return str !== undefined && str.match(/\S/g) != null
            });
        stackTraceFrames = stackTraceFrames.map((frame, index) => {
                // frame = frame.replace(/Object\.newInstance\.exports\.<computed> \[as (.*)\]/g, "$1")
                frame = frame.replace('Module.', '')
                if (frame.includes('__puppeteer_evaluation_script__')) {
                    return null;
                }

                if (frame.match(/<anonymous>:.*/)) {
                    return null;
                }

                if (frame.includes('closureReturn')) {
                    return null;
                }

                if(wasmDebugFunctionNames != null){
                    const frameRegexResult = frame.match(/wasm-function\[(.*)?\]:(.*)?/);

                    if(frameRegexResult != null){
                        const functionIndex = frameRegexResult[1];
                        let realName = wasmDebugFunctionNames[functionIndex]
                        if (realName != null) {
                            realName = realName.replace('$','');
                            frame = `wasm-function___${realName}`;
                        }
                    }
                }

                frame = frame.replace(/(\(.*\))/g, "");
                if (index === 0) {
                    frame = frame.trim();
                    frame = frame.replace(/^Object\./, '');

                }
                frame = frame.trim();

                return frame;
            })
            .filter(str => str != null);

        return stackTraceFrames;
    }


    formatInstrumentFileObject(wasmFileObject, wasmDebugFunctionNames = null) {
        if (wasmFileObject == null) {
            return null;
        }

        if (wasmFileObject.instantiate != null) {
            wasmFileObject.instantiate = wasmFileObject.instantiate.map(this.formatStackTrace);
        }

        if (wasmFileObject.instantiateStreaming != null) {
            wasmFileObject.instantiateStreaming = wasmFileObject.instantiateStreaming.map(this.formatStackTrace);
        }

        if (wasmFileObject.exportCalls != null) {
            let newObj = {};
            for (let funcName in wasmFileObject.exportCalls) {
                let stacks = wasmFileObject.exportCalls[funcName];

                newObj[funcName] = stacks.map((stack) => {
                    const formattedTraces = this.formatStackTrace(stack, wasmDebugFunctionNames);
                    formattedTraces.unshift(funcName);
                    return formattedTraces;
                });
            }

            wasmFileObject.exportCalls = newObj;
        }

        if (wasmFileObject.importCalls != null) {
            let newObj = {};
            for (let funcName in wasmFileObject.importCalls) {
                let stacks = wasmFileObject.importCalls[funcName];

                newObj[funcName] = stacks.map((stack) => {
                    const formattedTraces = this.formatStackTrace(stack, wasmDebugFunctionNames);
                    formattedTraces.unshift(funcName);
                    return formattedTraces;
                });
            }

            wasmFileObject.importCalls = newObj;
        }
    }

    formatInstrumentObject(webassemblyObject) {

        if(webassemblyObject == null){
            return;
        }
        this.formatInstrumentFileObject(webassemblyObject);

        const wasmFileHashes = Object.keys(webassemblyObject.WasmFiles);

        for (const wasmHash of wasmFileHashes) {
            const wasmFileObject = webassemblyObject.WasmFiles[wasmHash];
            const debugFunctionNames = wasmFileObject.functionNameObjects;
            this.formatInstrumentFileObject(wasmFileObject, debugFunctionNames);
        }
    }

    scanPage(domain) {
        this.capturedRequests = {};

        return new Promise(async (resolve, reject) => {
            let crawlResults = null;
            let stopCrawling = false;
            let page;
            let timeout;
            let currentURL;
            let currentDepth;
            let windowWebAssemblyHandle;
            let targetArr = [];
            let webAssemblyWorkers = [];
            let allRecordedWorkers = [];

            const cleanedURL = this.cleanDomain(domain);
            const outputDomainDirectoryName = `${cleanedURL}-${uuidv1().substring(0,11)}`;
            const resolvedOutputPath = path.resolve(OUTPUT_DIRECTORY, outputDomainDirectoryName)
            try{
                await mkdir(resolvedOutputPath);
            } catch(e){
                console.error(e);
            }

            const pagesToVisit = new Queue();
            pagesToVisit.enqueue([domain, 1]);

            page = await this.browser.newPage();

            await page.evaluateOnNewDocument(wabtJSFile)
            await page.evaluateOnNewDocument(preloadFile)
            page.on('workercreated', async worker => {
                try {
                    await worker.evaluate(wabtJSFile)
                    await worker.evaluate(preloadFile)
                    await worker.evaluate(() => {
                        setTimeout(() => {
                            console.log(self.WebAssemblyCallLocations);
                        }, 2000)
                    })

                    // await waitFor(3);

                    var currentWorkerWebAssembly = await worker.evaluateHandle(() => {
                        return self.WebAssemblyCallLocations;
                    })

    
                    webAssemblyWorkers.push(currentWorkerWebAssembly);
                } catch (err) {
                    console.error('Worker Eval', err)
                }
            });


            page.on('error', async (error) => {
                console.error('Page crash', error);
                try {
                    await page.close()
                    page = await this.browser.newPage();
                } finally {
                    reject()
                }
            });

            page.setDefaultNavigationTimeout(15000)

            while (!pagesToVisit.isEmpty() && !stopCrawling) {
                try {
                    [currentURL, currentDepth] = pagesToVisit.dequeue()
                    this.capturedRequests[currentURL] = [];
                    console.log(currentURL)
                    timeout = setTimeout(() => {

                        resolve(crawlResults)

                    }, 45 * 1000)

                    await page.goto(currentURL, {
                        waitUntil: 'load'
                    });


                    const timeIntervalToWaitBetweenShots = Math.floor((TIME_TO_WAIT - 1) / NUM_SCREENSHOTS);
                    for(let i = 1; i <= NUM_SCREENSHOTS; i++ ){
                        try{
                            const screenshotOutputPath = path.resolve(resolvedOutputPath,`Screenshot_${i}.png`);
                            await page.screenshot({
                                path: screenshotOutputPath,
                                fullPage: false
                            })

                            

                            try {
                                const windowCallsJSHandle = await page.evaluateHandle(() => window.WebAssemblyCallLocations)
                                windowWebAssemblyHandle = await windowCallsJSHandle.jsonValue();
                                this.formatInstrumentObject(windowWebAssemblyHandle);
                            } catch(windowHandleError) {
                                console.error(windowHandleError);
                            }
    
    
    
                            if (webAssemblyWorkers.length > 0) {
                                const workerWebAssemblyJson = await Promise.all(webAssemblyWorkers.map(async x => {
                                    try {
                                        let workerObject = await x.jsonValue();
                                        this.formatInstrumentObject(workerObject);
                                        return workerObject;
                                    } catch (err) {
                                        return null
                                    }
                                }, this));
                                allRecordedWorkers.push(...workerWebAssemblyJson)
                                allRecordedWorkers = allRecordedWorkers.filter(x => x != null)
                            }

                            const logDetails = {
                                window: windowWebAssemblyHandle,
                                workers: allRecordedWorkers
                            }

                            try{
                                writeFile(path.resolve(resolvedOutputPath, `log_${i}.json`), JSON.stringify(logDetails));
                            } catch(writeLogError){
                                console.error(writeLogError);
                            }

                            windowWebAssemblyHandle = null;
                            allRecordedWorkers = [];


                            await page.waitFor(timeIntervalToWaitBetweenShots * 1000);
                        } catch(screenshotErr){
                            console.error(screenshotErr)
                        }
                    }

                    try {

                        try {
                            const windowCallsJSHandle = await page.evaluateHandle(() => window.WebAssemblyCallLocations)
                            windowWebAssemblyHandle = await windowCallsJSHandle.jsonValue();
                            this.formatInstrumentObject(windowWebAssemblyHandle);
                        } catch(windowHandleError) {
                            console.error(windowHandleError);
                        }



                        if (webAssemblyWorkers.length > 0) {
                            const workerWebAssemblyJson = await Promise.all(webAssemblyWorkers.map(async x => {
                                try {
                                    let workerObject = await x.jsonValue();
                                    this.formatInstrumentObject(workerObject);
                                    return workerObject;
                                } catch (err) {
                                    return null
                                }
                            }, this));
                            allRecordedWorkers.push(...workerWebAssemblyJson)
                            allRecordedWorkers = allRecordedWorkers.filter(x => x != null)
                        }


                        if ((windowWebAssemblyHandle != null && windowWebAssemblyHandle.altered === true) || allRecordedWorkers.length > 0) {
                            stopCrawling = true;

                            const graphDetails = {
                                window: windowWebAssemblyHandle,
                                workers: allRecordedWorkers
                            }
                            let files = [];

                            const requestsForPage = this.capturedRequests[currentURL];
                            const targetFiles = files;
                            crawlResults = {
                                wasmFilePaths: targetFiles,
                                pageFound: currentURL,
                                domain: domain,
                                possibleWrapperFiles: requestsForPage,
                                graphDetails: graphDetails
                            }

                            try{
                                writeFile(path.resolve(resolvedOutputPath, 'logs.json'), JSON.stringify(graphDetails));
                            } catch(writeLogError){
                                console.error(writeLogError);
                            }
                        }
                    } catch (crawlErr) {
                        console.error('Crawl process error', crawlErr);
                    }

                } catch (err) {
                    console.error('Navigation error', err);

                } finally {
                    try {
                        await page.close();

                        page = await this.browser.newPage();

                    } finally {
                        continue;

                    }
                }
            }
            clearTimeout(timeout);

            resolve(crawlResults);
        })
    }



    async startBrowser() {
        if (this.browser != null) {
            return;
        }
        this.browser = await puppeteer.launch({
            devtools: true,
            // dumpio: dev,
            args:[
            ]

        });
    }

    async closeBrowser() {
        await this.browser.close();
    }

    async main(urlToCrawl) {

        if (!urlToCrawl.match(/http(s)?\:\/\//)) {
            urlToCrawl = 'http://' + urlToCrawl
        }
        let crawlResults = null;
        await this.startBrowser();
        try {
            crawlResults = await this.scanPage(urlToCrawl);
        } catch (e) {
            console.error(e)
        } finally {
            try {
                await this.closeBrowser();
            } finally {

            }
        }
        return crawlResults
    }
}

module.exports = Crawler;