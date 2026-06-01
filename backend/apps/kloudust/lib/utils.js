/**
 * utils.js - Utility functions for Kloudust
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

/**
 * Wraps all object functions to execute inside the given global context
 * @param {Object} object The object whose functions to wrap
 * @param {Object} globalNew The new Global context
 * @param {boolean} isAsync The wrapped function is async
 * @returns The wrapped object.
 */
exports.wrapObjectInNewContext = (object, globalNew) => {
    const _wrappedFunction = (functionToWrap, contextNew, isAsync=true) => {
        function functionWrappedCall() {
            const savedGlobal = {};
            for (const [key, val] of Object.entries(contextNew)) {savedGlobal[key] = global[key]; global[key] = val;}
            if (isAsync) return new Promise(async resolve => {
                const returnVal = await functionToWrap(...arguments); 
                for (const [key, val] of Object.entries(savedGlobal)) global[key] = val;
                resolve(returnVal);
            }); else {
                const returnVal = functionToWrap(...arguments);
                for (const [key, val] of Object.entries(savedGlobal)) global[key] = val;
                return returnVal;
            }
        }
        return functionWrappedCall;
    }

    const wrappedObject = {...object};
    for (const [functionName, functionToWrap] of Object.entries(object)) if (functionToWrap instanceof Function)
        wrappedObject[functionName] = _wrappedFunction(functionToWrap, globalNew, 
            functionToWrap.constructor.name === "AsyncFunction");
    return wrappedObject;
} 

/**
 * Parses incoming string, and returns an array of parsed arguments. The arguments
 * can be split by spaces, or have spaces included if quoted. Quotes can be escaped by
 * \\" and slashes can be escaped by \\ i.e. \\\\ = \ and \\" = " 
 * 
 * And yes I have no idea what the heck this is, but it works. 
 * 
 * From: https://stackoverflow.com/questions/4031900/split-a-string-by-whitespace-keeping-quoted-segments-allowing-escaped-quotes
 * 
 * Bug: Will eat and combine multiple spaces into one i.e. "Dream     Rock" will become "Dream Rock"
 * 
 * @param {string} cmd 
 * @return Parsed array of arguments
 */
exports.parseArgs = cmd => { 
    return cmd.match(/\\?.|^$/g).reduce((p, c) => {
        if(c === '"') p.quote ^= 1;
        else if(!p.quote && c === ' ')p.a.push('');
        else p.a[p.a.length-1] += c.replace(/\\(.)/,"$1");
        return  p;
    }, {a: ['']}).a;
}

exports.nanoid = prefix => {
    const epochBase36 = Date.now().toString(36);    // 8 characters
    const randomChar = Math.random().toString(36).substring(2, 3);
    return (prefix||"u")+randomChar+epochBase36;
}