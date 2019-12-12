//Initialize wabt.js
var wabt;
WabtModule()
    .then(function (wabtInstance) {
        wabt = wabtInstance;
    })

//Data store for call logging
self.WebAssemblyCallLocations = {
    instantiate: [],
    instantiateFileHashes:[],
    instantiateStreaming: [],
    instantiateStreamingFileHashes:[],
    exportCalls: {},
    importCalls: {},
    altered: false,
    WasmFiles: {},
    addExport: function(name, stack){
        if (!this.exportCalls[name]) {
            this.exportCalls[name] = [];
        }

        if(this.exportCalls[name].length > 3){
            return;
        }
        this.exportCalls[name].push(stack);
    },
    addImport: function(name, stack){
        if (!this.importCalls[name]) {
            this.importCalls[name] = [];
        }

        if(this.importCalls[name].length > 3){
            return;
        }
        this.importCalls[name].push(stack);
    },
    addInstantiate: function(stack){
        if(this.instantiate.length > 3){
            return;
        }

        this.instantiate.push(stack);
    },
    addInstantiateHash: function(stack){
        if(this.instantiateFileHashes.length > 3){
            return;
        }

        this.instantiateFileHashes.push(stack);
    },
    addInstantiateStreaming: function(stack){
        if(this.instantiateStreaming.length > 3){
            return;
        }

        this.instantiateStreaming.push(stack);
    },

    addWasmFileReference: function(wasmFileHashString){

        if(this.WasmFiles[wasmFileHashString] != null){
            return;
        }

        this.WasmFiles[wasmFileHashString] = {
            instantiate: [],
            instantiateStreaming: [],
            exportCalls: {},
            importCalls: {},
            functionNameObjects: [],
            addExport: function(name, stack){
                if (!this.exportCalls[name]) {
                    this.exportCalls[name] = [];
                }
        
                if(this.exportCalls[name].length > 3){
                    return;
                }
                this.exportCalls[name].push(stack);
            },
            addImport: function(name, stack){
                if (!this.importCalls[name]) {
                    this.importCalls[name] = [];
                }
        
                if(this.importCalls[name].length > 3){
                    return;
                }
                this.importCalls[name].push(stack);
            },
            addInstantiate: function(stack){
                if(this.instantiate.length > 3){
                    return;
                }
        
                this.instantiate.push(stack);
            },
            addInstantiateHash: function(stack){
                if(this.instantiateFileHashes.length > 3){
                    return;
                }
        
                this.instantiateFileHashes.push(stack);
            },
            addInstantiateStreaming: function(stack){
                if(this.instantiateStreaming.length > 3){
                    return;
                }
        
                this.instantiateStreaming.push(stack);
            },   
            addFunctionNames: function(functionNameObjects){
                this.functionNameObjects = functionNameObjects;
            }
        }
    }

    
}

/** Function used for .wat text processing  */
function getLineFromIndex(text, startIndex){
    const nextNewlineIndex = text.indexOf('\n', startIndex) + 1;
    const substring = text.substring(nextNewlineIndex , text.indexOf('\n', nextNewlineIndex));
    return substring;
}

function getAllFunctionDeclarations(watText, includeImport = true){
    let functions = [];
    let importIndices = [];
    if(includeImport){
        importIndices = findAllImportIndices(watText);
    
    }
    let funcIndices = findAllFuncIndices(watText);
    functions = [...importIndices, ...funcIndices]
    const functionLines = functions.map(idx => {
        return getLineFromIndex(watText, idx);
    });
    let i = 0;
    const funcRegEx = /\s*\(func\s(.*)?\s*\(type/;
    const functionUniqueMapping = new Array(functionLines.length);
    for(const functionLine of functionLines){
        const funcName = functionLine.match(funcRegEx);
        if(funcName != null){
            functionUniqueMapping[i] = funcName[1].trim();
            i += 1;
        } 
    }
    return functionUniqueMapping;
}

function findAllFuncIndices(watText) {
    let funcMatch;
    const funcMatchIndicies = [];

    const funcRegEx = /\n\s*\(func\s/g
    while ((funcMatch = funcRegEx.exec(watText)) !== null) {
        funcMatchIndicies.push(funcMatch.index);
    }
    return funcMatchIndicies;
}

function findAllTypeIndices(watText) {
    let typeMatch;
    const typeMatchIndicies = [];

    const typeRegEx = /\n\s*\(type\s/g;
    while ((typeMatch = typeRegEx.exec(watText)) !== null) {
        typeMatchIndicies.push(typeMatch.index);
    }
    return typeMatchIndicies;
}

function findAllImportIndices(watText) {
    let importMatch;
    const importMatchIndicies = [];

    const importRegEx = /\n\s*\(import\s/g;
    while ((importMatch = importRegEx.exec(watText)) !== null) {
        importMatchIndicies.push(importMatch.index);
    }
    return importMatchIndicies;
}


/* Replacing WebAssembly methods with instrumented versions */
var ogWaI = WebAssembly.instantiate;
var ogWaIS = WebAssembly.instantiateStreaming;

WebAssembly.instantiate = function (buff, imp) {
    const newImports  = {};

    self.WebAssemblyCallLocations.altered = true;

    const stackLocation = new Error().stack;
    self.WebAssemblyCallLocations.addInstantiate(stackLocation);

    let itemToDigestForHash;
    if(buff instanceof WebAssembly.Module){
        //buff is a Module, so cannot use Wabt or generate hash string
        const encoder = new TextEncoder();
        itemToDigestForHash = encoder.encode(buff.toString());
    } else {
        itemToDigestForHash = buff;
    }



    //Get the hash of the Wasm file for logging
    return crypto.subtle.digest('SHA-256', itemToDigestForHash)
    .then(wasmHash => {
        //Get the hash as a hex string
        const wasmHashString = Array.from(new Uint8Array(wasmHash)).map(b => b.toString(16).padStart(2, '0')).join('');
        
        //Record the wasmHash and the instantiate call
        self.WebAssemblyCallLocations.addWasmFileReference(wasmHashString);
        self.WebAssemblyCallLocations.WasmFiles[wasmHashString].addInstantiate(stackLocation);
        
        if(!(buff instanceof WebAssembly.Module)){
            //Try to retrieve the wat from the given wasm bytes to extract the real function names
            try{
                const wabtModule =  wabt.readWasm(buff, { readDebugNames: true });
                wabtModule.generateNames();
                wabtModule.resolveNames();
                wabtModule.applyNames();
                const wast = wabtModule.toText({ foldExprs: false, inlineExport: false });
                const wastAnalysisResults = getAllFunctionDeclarations(wast);
                self.WebAssemblyCallLocations.WasmFiles[wasmHashString].addFunctionNames(wastAnalysisResults)

            }catch(e){
                console.error(e);
            }
        }
        
        
        //Instrument the Imported JavaScript functions
        for(const key in imp){
            newImports[key] = {}
            const keyObject = imp[key];
            if(keyObject != null && keyObject.toString() === "[object Math]" ){
                newImports[key] = keyObject;
            }
            for( const name in keyObject){
                if(typeof(keyObject[name]) === 'function'){
                    const originalImportFunction = keyObject[name];
                    newImports[key][name] = (function () {
                        const na = name;
                        const wasmHashStr = wasmHashString;

                        return function () {
                            let frames = new Error().stack;
                            self.WebAssemblyCallLocations.addImport(na,frames)
                            self.WebAssemblyCallLocations.WasmFiles[wasmHashStr].addImport(na,frames)
                            
                            return originalImportFunction.apply(null, arguments);
                        };
                    })()
                } else {
                    newImports[key][name] = keyObject[name];
                }
            }

        }
    

        
        //Call the original .instantiate function to get the Result Object 
        return ogWaI(buff, newImports)
            .then(function (re) {
                //Depending on whether * buff * param was bytes or a Module,
                //return of .instantiate can be either the Instance or a ResultObject
                //containing a Module and Instance
                if (re.module === undefined) {
                    //re is Instance only
                    
                    //Make new instance object containing instrumented versions of
                    //export calls
                    const newInstance = {
                        exports: {}
                    };

                    //Instrument Export functions
                    const exportNames = Object.keys(re.exports);
                    for (const name of exportNames) {
                        const ogFunction = re.exports[name];
    
                        if(typeof(re.exports[name]) == 'function' ){
                            //Define a closure function to record which file and function was called
                            newInstance.exports[name] = (function () {
                                const na = name;
 
                                const wasmHashStr = wasmHashString;

                                const closureReturn = function () {
                                    let frames = new Error().stack;
                                    self.WebAssemblyCallLocations.addExport(na,frames)   
                                    self.WebAssemblyCallLocations.WasmFiles[wasmHashStr].addExport(na,frames)   
    
                                    return ogFunction.apply(this, arguments);
                                };
                                Object.defineProperty(closureReturn, "length", { value: ogFunction.length })
                                return closureReturn;
    
                            })()
                        }
                        else {
                            newInstance.exports[name] = re.exports[name];
                        }
    
                    }
                    Object.setPrototypeOf(newInstance, Object.getPrototypeOf(re))
                    
                    return newInstance;
                } else {
                    //re is ResultObject

                    //Make new ResultObject containing modified Instance objects
                    const newResultObject = {
                        module: re.module,
                        instance: null
                    };

                    //Make new instance object containing instrumented versions of
                    //export calls
                    const newInstance = {
                        exports: {}
                    };

                    //Instrument export functions
                    const exportNames = Object.keys(re.instance.exports);
                    for (const name of exportNames) {
                        if(typeof(re.instance.exports[name]) == 'function' ){

                            const ogFunction = re.instance.exports[name];
                            //Define a closure function to record which file and function was called
                            newInstance.exports[name] = (function () {
                                const na = name;
                                const wasmHashStr = wasmHashString;


                                const closureReturn = function () {
                                    let frames = new Error().stack;
                                    self.WebAssemblyCallLocations.addExport(na,frames)   
                                    self.WebAssemblyCallLocations.WasmFiles[wasmHashStr].addExport(na,frames)   

                                    return ogFunction.apply(this, arguments);
                                };
                                Object.defineProperty(closureReturn, "length", { value: ogFunction.length })

                                return closureReturn;
                            })()

                        }else {
                            newInstance.exports[name] = re.instance.exports[name];
                        }
                    }
    
                    Object.setPrototypeOf(newInstance, WebAssembly.Instance)
                    newResultObject.instance = newInstance;
                    return newResultObject;
                }
            });
    })

};

WebAssembly.instantiateStreaming = function (source, imp) {
    const stackLocation = new Error().stack;
    self.WebAssemblyCallLocations.addInstantiateStreaming(stackLocation)
    self.WebAssemblyCallLocations.altered = true;

    return source.then( sourceResponse => {
        return sourceResponse.arrayBuffer()
        .then(arrayBuffer => {
            return crypto.subtle.digest('SHA-256', arrayBuffer)
            .then(wasmHash => {
                const wasmHashString = Array.from(new Uint8Array(wasmHash)).map(b => b.toString(16).padStart(2, '0')).join('');
                self.WebAssemblyCallLocations.addWasmFileReference(wasmHashString);
                self.WebAssemblyCallLocations.WasmFiles[wasmHashString].addInstantiateStreaming(stackLocation);
                const newImports  = {};

                //Try to retrieve the wat from the given wasm bytes to extract the real function names
                try{
                    const uint8View = new Uint8Array(arrayBuffer); 
                    const wabtModule =  wabt.readWasm(uint8View, { readDebugNames: true });
                    wabtModule.generateNames();
                    wabtModule.resolveNames();
                    wabtModule.applyNames();
                    const wast = wabtModule.toText({ foldExprs: false, inlineExport: false });
                    const wastAnalysisResults = getAllFunctionDeclarations(wast);
                    self.WebAssemblyCallLocations.WasmFiles[wasmHashString].addFunctionNames(wastAnalysisResults)

                }catch(e){
                    console.error(e);
                }


                for(const key in imp){
                    newImports[key] = {}
                    const keyObject = imp[key];
                    if(keyObject != null && keyObject.toString() === "[object Math]" ){
                        newImports[key] = keyObject;
                    }
                    for(const name in keyObject){
                        if(typeof(keyObject[name]) === 'function' ){
                            const originalImportFunction = keyObject[name];
            
                            newImports[key][name] = (function () {
                                const na = name;
                                const wasmHashStr = wasmHashString;

                                return function () {
                                    let frames = new Error().stack;
                                    self.WebAssemblyCallLocations.addImport(na,frames)
                                    self.WebAssemblyCallLocations.WasmFiles[wasmHashStr].addImport(na,frames)
                                    return originalImportFunction.apply(null, arguments);
                                };
                            })()
                        } else {
                            newImports[key][name] = keyObject[name];
                        }
                    }
                }
            
                return ogWaI(arrayBuffer, newImports)
                    .then(function (re) {
                        const newResultObject = {
                            module: re.module,
                            instance: null
                        };
            
                        const newInstance = {
                            exports: {}
                        };
                        const exportNames = Object.keys(re.instance.exports);
            
                        for (const name of exportNames) {

                            if(typeof(re.instance.exports[name]) == 'function' ){

                                const ogFunction = re.instance.exports[name];
                
                                newInstance.exports[name] = (function () {
                                    const na = name;
                                    const wasmHashStr = wasmHashString;

                                    const closureReturn = function () {
                                        let frames = new Error().stack;
                                        self.WebAssemblyCallLocations.addExport(na,frames)   
                                        self.WebAssemblyCallLocations.WasmFiles[wasmHashStr].addExport(na,frames)
                                        return ogFunction.apply(this, arguments);
                                    };
                                    Object.defineProperty(closureReturn, "length", { value: ogFunction.length })
                
                                    return closureReturn;
                                })()
                            }
                        };
            
                        newResultObject.instance = newInstance;
                        return newResultObject;
                    });
            })
        });
    });

};

console.log(`

__        __               __     ___               
\\ \\      / /_ _ ___ _ __ __\\ \\   / (_) _____      __
 \\ \\ /\\ / / _\` / __| '_ \` _ \\ \\ / /| |/ _ \\ \\ /\\ / /
  \\ V  V / (_| \\__ \\ | | | | \\ V / | |  __/\\ V  V / 
   \\_/\\_/ \\__,_|___/_| |_| |_|\\_/  |_|\\___| \\_/\\_/  
                                                    

`)
console.log('WebAssembly instrumented!')