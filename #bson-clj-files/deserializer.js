"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deserialize = void 0;
var buffer_1 = require("buffer");
var binary_1 = require("../binary");
var code_1 = require("../code");
var constants = require("../constants");
var db_ref_1 = require("../db_ref");
var decimal128_1 = require("../decimal128");
var double_1 = require("../double");
var int_32_1 = require("../int_32");
var long_1 = require("../long");
var max_key_1 = require("../max_key");
var min_key_1 = require("../min_key");
var objectid_1 = require("../objectid");
var regexp_1 = require("../regexp");
var symbol_1 = require("../symbol");
var timestamp_1 = require("../timestamp");
var validate_utf8_1 = require("../validate_utf8");
// Internal long versions
var JS_INT_MAX_LONG = long_1.Long.fromNumber(constants.JS_INT_MAX);
var JS_INT_MIN_LONG = long_1.Long.fromNumber(constants.JS_INT_MIN);
var functionCache = {};


//<cljs/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//3 until 11
var cursor_buffer = [0,3,99,117,114,115,111,114,0];

function isCursorBuffer(buffer)
{
  if(buffer.length<13) return false;
  var result=false;
  var i=3;
  for(;i<12;i++)
  {
     if(buffer[i]!=cursor_buffer[(i-3)]) break;
  }
  return i==12;
}
//>cljs/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function deserialize(buffer, options, isArray,isClojure)        //cljs added 1 argument
{
    options = options == null ? {} : options;
    
    //<cljs/////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //TODO in future make it more safe like combination of flags, not just promoteLongs false
    isClojure = isClojure == null ? false : isClojure;          //cljs
    var isAggregation=false;
    if(options.hasOwnProperty('promoteLongs') && !options["promoteLongs"])   ///&& isCursorBuffer(buffer)  extra check if i want cljs only in cursors, and for safety also
    {
      isClojure=true;
      options["promoteLongs"]=true;
    }
    if(isCursorBuffer(buffer)) isAggregation=true; 

    //>cljs/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    var index = options && options.index ? options.index : 0;
    // Read the document size
    var size = buffer[index] |
        (buffer[index + 1] << 8) |
        (buffer[index + 2] << 16) |
        (buffer[index + 3] << 24);
    if (size < 5) {
        throw new Error("bson size must be >= 5, is " + size);
    }
    if (options.allowObjectSmallerThanBufferSize && buffer.length < size) {
        throw new Error("buffer length " + buffer.length + " must be >= bson size " + size);
    }
    if (!options.allowObjectSmallerThanBufferSize && buffer.length !== size) {
        throw new Error("buffer length " + buffer.length + " must === bson size " + size);
    }
    if (size + index > buffer.byteLength) {
        throw new Error("(bson size " + size + " + options.index " + index + " must be <= buffer length " + buffer.byteLength + ")");
    }
    // Illegal end value
    if (buffer[index + size - 1] !== 0) {
        throw new Error("One object, sized correctly, with a spot for an EOO, but the EOO isn't 0x00");
    }

    
    // Start deserializtion
    var object = deserializeObject_cljs(buffer, index, options, isArray,isClojure,0,isAggregation);     ///cljs
    
    //{"cursor" {"firstBatch" [ ], "id" 920500922252756915, "ns" "joy.messages"}, "ok" 1.0}
    if(isAggregation && cljs.core.map_QMARK_(object) && cljs.core.contains_QMARK_(object,cljs.core.keyword("cursor")))
    {
          var cursor_map = cljs.core.get(object,cljs.core.keyword("cursor"));
          var js_cursor_map={};
          if (cljs.core.contains_QMARK_(cursor_map,cljs.core.keyword("firstBatch")))
          {
            var documents = cljs.core.get(cursor_map,cljs.core.keyword("firstBatch"));
            js_cursor_map["firstBatch"]= documents;
          }
          else
          {
            var documents = cljs.core.get(cursor_map,cljs.core.keyword("nextBatch"));
            js_cursor_map["nextBatch"] = documents;
          }
          js_cursor_map["id"]=cljs.core.get(cursor_map,cljs.core.keyword("id"));
          js_cursor_map["ns"]=cljs.core.get(cursor_map,cljs.core.keyword("ns"));
          var cursor_ok=cljs.core.get(object,cljs.core.keyword("ok"));
          object={"cursor" : js_cursor_map , "ok" : cursor_ok}

    }
    return object;
}

//<cljs/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
var deserializeCljs = function (buffer,options,isArray,isClojure)
                      {
                        return deserialize(buffer,options,isArray,isClojure);
                      }
//>cljs/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function deserializeObject_cljs(buffer, index, options, isArray,isClojure,level,isAggregation)    //cljs
{
    isClojure = isClojure == null ? false : isClojure;                                       //cljs

    if (isArray === void 0) { isArray = false; }
    var evalFunctions = options['evalFunctions'] == null ? false : options['evalFunctions'];
    var cacheFunctions = options['cacheFunctions'] == null ? false : options['cacheFunctions'];
    var fieldsAsRaw = options['fieldsAsRaw'] == null ? null : options['fieldsAsRaw'];
    // Return raw bson buffer instead of parsing it
    var raw = options['raw'] == null ? false : options['raw'];
    // Return BSONRegExp objects instead of native regular expressions
    var bsonRegExp = typeof options['bsonRegExp'] === 'boolean' ? options['bsonRegExp'] : false;
    // Controls the promotion of values vs wrapper classes
    var promoteBuffers = options['promoteBuffers'] == null ? false : options['promoteBuffers'];
    var promoteLongs = options['promoteLongs'] == null ? true : options['promoteLongs'];
    var promoteValues = options['promoteValues'] == null ? true : options['promoteValues'];
    // Set the start index
    var startIndex = index;
    // Validate that we have at least 4 bytes of buffer
    if (buffer.length < 5)
        throw new Error('corrupt bson message < 5 bytes long');
    // Read the document size
    var size = buffer[index++] | (buffer[index++] << 8) | (buffer[index++] << 16) | (buffer[index++] << 24);
    // Ensure buffer is valid size
    if (size < 5 || size > buffer.length)
        throw new Error('corrupt bson message');

    //<cljs/////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Create holding object
    var object;
    var isVector=false;
    var nextClojure=isClojure;

    if(isClojure)
    {
        if(isArray)
        {
          if(isAggregation && level==2)
          {
            object=[];
            isVector=false;
            isClojure=false;
            nextClojure=true;
          }
          else
          {
            object=cljs.core.transient$(cljs.core.PersistentVector.EMPTY);
            isVector=true;
          }
        }
        else
        {
           object=cljs.core.transient$(cljs.core.PersistentArrayMap.EMPTY);
        }
    }
    else
    {
        object = isArray ? [] : {};
    }
    //>cljs/////////////////////////////////////////////////////////////////////////////////////////////////////////////


    // Used for arrays to skip having to perform utf8 decoding
    var arrayIndex = 0;
    var done = false;
    // While we have more left data left keep parsing
    while (!done)
    {
        // Read the type
        var elementType = buffer[index++];
        // If we get a zero it's the last byte, exit
        if (elementType === 0)
            break;
        // Get the start search index
        var i = index;
        // Locate the end of the c string
        while (buffer[i] !== 0x00 && i < buffer.length) {
            i++;
        }
        // If are at the end of the buffer there is a problem with the document
        if (i >= buffer.byteLength)
            throw new Error('Bad BSON Document: illegal CString');
        var name = isArray ? arrayIndex++ : buffer.toString('utf8', index, i);
        var value = void 0;
        index = i + 1;

        if (elementType === constants.BSON_DATA_STRING) {
            var stringSize = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            if (stringSize <= 0 ||
                stringSize > buffer.length - index ||
                buffer[index + stringSize - 1] !== 0)
                throw new Error('bad string length in bson');
            if (!validate_utf8_1.validateUtf8(buffer, index, index + stringSize - 1)) {
                throw new Error('Invalid UTF-8 string in BSON document');
            }

            value = buffer.toString('utf8', index, index + stringSize - 1);
            index = index + stringSize;
        }
        else if (elementType === constants.BSON_DATA_OID) {
            var oid = buffer_1.Buffer.alloc(12);
            buffer.copy(oid, 0, index, index + 12);
            value = new objectid_1.ObjectId(oid);
            index = index + 12;
        }
        else if (elementType === constants.BSON_DATA_INT && promoteValues === false) {
            value = new int_32_1.Int32(buffer[index++] | (buffer[index++] << 8) | (buffer[index++] << 16) | (buffer[index++] << 24));
        }
        else if (elementType === constants.BSON_DATA_INT) {
            value =
                buffer[index++] |
                    (buffer[index++] << 8) |
                    (buffer[index++] << 16) |
                    (buffer[index++] << 24);
        }
        else if (elementType === constants.BSON_DATA_NUMBER && promoteValues === false) {
            value = new double_1.Double(buffer.readDoubleLE(index));
            index = index + 8;
        }
        else if (elementType === constants.BSON_DATA_NUMBER) {
            value = buffer.readDoubleLE(index);
            index = index + 8;
        }
        else if (elementType === constants.BSON_DATA_DATE) {
            var lowBits = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            var highBits = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            value = new Date(new long_1.Long(lowBits, highBits).toNumber());
        }
        else if (elementType === constants.BSON_DATA_BOOLEAN) {
            if (buffer[index] !== 0 && buffer[index] !== 1)
                throw new Error('illegal boolean type value');
            value = buffer[index++] === 1;
        }
        else if (elementType === constants.BSON_DATA_OBJECT) {
            var _index = index;
            var objectSize = buffer[index] |
                (buffer[index + 1] << 8) |
                (buffer[index + 2] << 16) |
                (buffer[index + 3] << 24);
            if (objectSize <= 0 || objectSize > buffer.length - index)
                throw new Error('bad embedded document length in bson');
            // We have a raw value
            if (raw) {
                value = buffer.slice(index, index + objectSize);
            }
            else {
                value = deserializeObject_cljs(buffer, _index, options, false,nextClojure,(level+1),isAggregation);
            }
            index = index + objectSize;
        }
        else if (elementType === constants.BSON_DATA_ARRAY) {
            var _index = index;
            var objectSize = buffer[index] |
                (buffer[index + 1] << 8) |
                (buffer[index + 2] << 16) |
                (buffer[index + 3] << 24);
            var arrayOptions = options;
            // Stop index
            var stopIndex = index + objectSize;
            // All elements of array to be returned as raw bson
            if (fieldsAsRaw && fieldsAsRaw[name]) {
                arrayOptions = {};
                for (var n in options) {
                    arrayOptions[n] = options[n];
                }
                arrayOptions['raw'] = true;
            }
            value = deserializeObject_cljs(buffer, _index, arrayOptions, true,nextClojure,(level+1),isAggregation);
            index = index + objectSize;
            if (buffer[index - 1] !== 0)
                throw new Error('invalid array terminator byte');
            if (index !== stopIndex)
                throw new Error('corrupted array bson');
        }
        else if (elementType === constants.BSON_DATA_UNDEFINED) {
            value = undefined;
        }
        else if (elementType === constants.BSON_DATA_NULL) {
            value = null;
        }
        else if (elementType === constants.BSON_DATA_LONG) {
            // Unpack the low and high bits
            var lowBits = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            var highBits = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            var long = new long_1.Long(lowBits, highBits);
            // Promote the long if possible
            if (promoteLongs && promoteValues === true) {
                value =
                    long.lessThanOrEqual(JS_INT_MAX_LONG) && long.greaterThanOrEqual(JS_INT_MIN_LONG)
                        ? long.toNumber()
                        : long;
            }
            else {
                value = long;
            }
        }
        else if (elementType === constants.BSON_DATA_DECIMAL128) {
            // Buffer to contain the decimal bytes
            var bytes = buffer_1.Buffer.alloc(16);
            // Copy the next 16 bytes into the bytes buffer
            buffer.copy(bytes, 0, index, index + 16);
            // Update index
            index = index + 16;
            // Assign the new Decimal128 value
            var decimal128 = new decimal128_1.Decimal128(bytes);
            // If we have an alternative mapper use that
            if ('toObject' in decimal128 && typeof decimal128.toObject === 'function') {
                value = decimal128.toObject();
            }
            else {
                value = decimal128;
            }
        }
        else if (elementType === constants.BSON_DATA_BINARY) {
            var binarySize = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            var totalBinarySize = binarySize;
            var subType = buffer[index++];
            // Did we have a negative binary size, throw
            if (binarySize < 0)
                throw new Error('Negative binary type element size found');
            // Is the length longer than the document
            if (binarySize > buffer.byteLength)
                throw new Error('Binary type size larger than document size');
            // Decode as raw Buffer object if options specifies it
            if (buffer['slice'] != null) {
                // If we have subtype 2 skip the 4 bytes for the size
                if (subType === binary_1.Binary.SUBTYPE_BYTE_ARRAY) {
                    binarySize =
                        buffer[index++] |
                            (buffer[index++] << 8) |
                            (buffer[index++] << 16) |
                            (buffer[index++] << 24);
                    if (binarySize < 0)
                        throw new Error('Negative binary type element size found for subtype 0x02');
                    if (binarySize > totalBinarySize - 4)
                        throw new Error('Binary type with subtype 0x02 contains too long binary size');
                    if (binarySize < totalBinarySize - 4)
                        throw new Error('Binary type with subtype 0x02 contains too short binary size');
                }
                if (promoteBuffers && promoteValues) {
                    value = buffer.slice(index, index + binarySize);
                }
                else {
                    value = new binary_1.Binary(buffer.slice(index, index + binarySize), subType);
                }
            }
            else {
                var _buffer = buffer_1.Buffer.alloc(binarySize);
                // If we have subtype 2 skip the 4 bytes for the size
                if (subType === binary_1.Binary.SUBTYPE_BYTE_ARRAY) {
                    binarySize =
                        buffer[index++] |
                            (buffer[index++] << 8) |
                            (buffer[index++] << 16) |
                            (buffer[index++] << 24);
                    if (binarySize < 0)
                        throw new Error('Negative binary type element size found for subtype 0x02');
                    if (binarySize > totalBinarySize - 4)
                        throw new Error('Binary type with subtype 0x02 contains too long binary size');
                    if (binarySize < totalBinarySize - 4)
                        throw new Error('Binary type with subtype 0x02 contains too short binary size');
                }
                // Copy the data
                for (i = 0; i < binarySize; i++) {
                    _buffer[i] = buffer[index + i];
                }
                if (promoteBuffers && promoteValues) {
                    value = _buffer;
                }
                else {
                    value = new binary_1.Binary(_buffer, subType);
                }
            }
            // Update the index
            index = index + binarySize;
        }
        else if (elementType === constants.BSON_DATA_REGEXP && bsonRegExp === false) {
            // Get the start search index
            i = index;
            // Locate the end of the c string
            while (buffer[i] !== 0x00 && i < buffer.length) {
                i++;
            }
            // If are at the end of the buffer there is a problem with the document
            if (i >= buffer.length)
                throw new Error('Bad BSON Document: illegal CString');
            // Return the C string
            var source = buffer.toString('utf8', index, i);
            // Create the regexp
            index = i + 1;
            // Get the start search index
            i = index;
            // Locate the end of the c string
            while (buffer[i] !== 0x00 && i < buffer.length) {
                i++;
            }
            // If are at the end of the buffer there is a problem with the document
            if (i >= buffer.length)
                throw new Error('Bad BSON Document: illegal CString');
            // Return the C string
            var regExpOptions = buffer.toString('utf8', index, i);
            index = i + 1;
            // For each option add the corresponding one for javascript
            var optionsArray = new Array(regExpOptions.length);
            // Parse options
            for (i = 0; i < regExpOptions.length; i++) {
                switch (regExpOptions[i]) {
                    case 'm':
                        optionsArray[i] = 'm';
                        break;
                    case 's':
                        optionsArray[i] = 'g';
                        break;
                    case 'i':
                        optionsArray[i] = 'i';
                        break;
                }
            }
            value = new RegExp(source, optionsArray.join(''));
        }
        else if (elementType === constants.BSON_DATA_REGEXP && bsonRegExp === true) {
            // Get the start search index
            i = index;
            // Locate the end of the c string
            while (buffer[i] !== 0x00 && i < buffer.length) {
                i++;
            }
            // If are at the end of the buffer there is a problem with the document
            if (i >= buffer.length)
                throw new Error('Bad BSON Document: illegal CString');
            // Return the C string
            var source = buffer.toString('utf8', index, i);
            index = i + 1;
            // Get the start search index
            i = index;
            // Locate the end of the c string
            while (buffer[i] !== 0x00 && i < buffer.length) {
                i++;
            }
            // If are at the end of the buffer there is a problem with the document
            if (i >= buffer.length)
                throw new Error('Bad BSON Document: illegal CString');
            // Return the C string
            var regExpOptions = buffer.toString('utf8', index, i);
            index = i + 1;
            // Set the object
            value = new regexp_1.BSONRegExp(source, regExpOptions);
        }
        else if (elementType === constants.BSON_DATA_SYMBOL) {
            var stringSize = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            if (stringSize <= 0 ||
                stringSize > buffer.length - index ||
                buffer[index + stringSize - 1] !== 0)
                throw new Error('bad string length in bson');
            var symbol = buffer.toString('utf8', index, index + stringSize - 1);
            value = promoteValues ? symbol : new symbol_1.BSONSymbol(symbol);
            index = index + stringSize;
        }
        else if (elementType === constants.BSON_DATA_TIMESTAMP) {
            var lowBits = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            var highBits = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            value = new timestamp_1.Timestamp(lowBits, highBits);
        }
        else if (elementType === constants.BSON_DATA_MIN_KEY) {
            value = new min_key_1.MinKey();
        }
        else if (elementType === constants.BSON_DATA_MAX_KEY) {
            value = new max_key_1.MaxKey();
        }
        else if (elementType === constants.BSON_DATA_CODE) {
            var stringSize = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            if (stringSize <= 0 ||
                stringSize > buffer.length - index ||
                buffer[index + stringSize - 1] !== 0)
                throw new Error('bad string length in bson');
            var functionString = buffer.toString('utf8', index, index + stringSize - 1);
            // If we are evaluating the functions
            if (evalFunctions) {
                // If we have cache enabled let's look for the md5 of the function in the cache
                if (cacheFunctions) {
                    // Got to do this to avoid V8 deoptimizing the call due to finding eval
                    value = isolateEval(functionString, functionCache, object);
                }
                else {
                    value = isolateEval(functionString);
                }
            }
            else {
                value = new code_1.Code(functionString);
            }
            // Update parse index position
            index = index + stringSize;
        }
        else if (elementType === constants.BSON_DATA_CODE_W_SCOPE) {
            var totalSize = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            // Element cannot be shorter than totalSize + stringSize + documentSize + terminator
            if (totalSize < 4 + 4 + 4 + 1) {
                throw new Error('code_w_scope total size shorter minimum expected length');
            }
            // Get the code string size
            var stringSize = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            // Check if we have a valid string
            if (stringSize <= 0 ||
                stringSize > buffer.length - index ||
                buffer[index + stringSize - 1] !== 0)
                throw new Error('bad string length in bson');
            // Javascript function
            var functionString = buffer.toString('utf8', index, index + stringSize - 1);
            // Update parse index position
            index = index + stringSize;
            // Parse the element
            var _index = index;
            // Decode the size of the object document
            var objectSize = buffer[index] |
                (buffer[index + 1] << 8) |
                (buffer[index + 2] << 16) |
                (buffer[index + 3] << 24);
            // Decode the scope object
            var scopeObject = deserializeObject_cljs(buffer, _index, options, false,nextClojure,(level+1),isAggregation);
            // Adjust the index
            index = index + objectSize;
            // Check if field length is too short
            if (totalSize < 4 + 4 + objectSize + stringSize) {
                throw new Error('code_w_scope total size is too short, truncating scope');
            }
            // Check if totalSize field is too long
            if (totalSize > 4 + 4 + objectSize + stringSize) {
                throw new Error('code_w_scope total size is too long, clips outer document');
            }
            // If we are evaluating the functions
            if (evalFunctions) {
                // If we have cache enabled let's look for the md5 of the function in the cache
                if (cacheFunctions) {
                    // Got to do this to avoid V8 deoptimizing the call due to finding eval
                    value = isolateEval(functionString, functionCache, object);
                }
                else {
                    value = isolateEval(functionString);
                }
                value.scope = scopeObject;
            }
            else {
                value = new code_1.Code(functionString, scopeObject);
            }
        }
        else if (elementType === constants.BSON_DATA_DBPOINTER) {
            // Get the code string size
            var stringSize = buffer[index++] |
                (buffer[index++] << 8) |
                (buffer[index++] << 16) |
                (buffer[index++] << 24);
            // Check if we have a valid string
            if (stringSize <= 0 ||
                stringSize > buffer.length - index ||
                buffer[index + stringSize - 1] !== 0)
                throw new Error('bad string length in bson');
            // Namespace
            if (!validate_utf8_1.validateUtf8(buffer, index, index + stringSize - 1)) {
                throw new Error('Invalid UTF-8 string in BSON document');
            }
            var namespace = buffer.toString('utf8', index, index + stringSize - 1);
            // Update parse index position
            index = index + stringSize;
            // Read the oid
            var oidBuffer = buffer_1.Buffer.alloc(12);
            buffer.copy(oidBuffer, 0, index, index + 12);
            var oid = new objectid_1.ObjectId(oidBuffer);
            // Update the index
            index = index + 12;
            // Upgrade to DBRef type
            value = new db_ref_1.DBRef(namespace, oid);
        }
        else {
            throw new Error('Detected unknown BSON type ' + elementType.toString(16) + ' for fieldname "' + name + '"');
        }
        if (name === '__proto__') {
            Object.defineProperty(object, name, {
                value: value,
                writable: true,
                enumerable: true,
                configurable: true
            });
        }
        else   //cljs  after we have the value,we check if we have to added on clojureVector else we added to js default
        {
            if(isClojure)
            {
              if(isVector) object=cljs.core.conj_BANG_(object,value);
              else
              {
                 name=new cljs.core.Keyword(null,name,name,null);
                 object=cljs.core.assoc_BANG_(object,name,value);
              }
            }
            else object[name] = value;
        }
    }
    // Check if the deserialization was against a valid array/object
    if (size !== index - startIndex) {
        if (isArray)
            throw new Error('corrupt array bson');
        throw new Error('corrupt object bson');
    }

    //TODO re-write this code for clojure-maps also
    if(!isClojure)  //cljs  because the object is normal javascript object (not clojure-map),bellow code works unchanged
    {
      // check if object's $ keys are those of a DBRef
          var dollarKeys = Object.keys(object).filter(function (k) { return k.startsWith('$'); });
          var valid = true;
          dollarKeys.forEach(function (k) {
              if (['$ref', '$id', '$db'].indexOf(k) === -1)
                  valid = false;
          });
          // if a $key not in "$ref", "$id", "$db", don't make a DBRef
          if (!valid)
              return object;
          if (db_ref_1.isDBRefLike(object)) {
              var copy = Object.assign({}, object);
              delete copy.$ref;
              delete copy.$id;
              delete copy.$db;
              object = new db_ref_1.DBRef(object.$ref, object.$id, object.$db, copy);
          }
    }

    if(isClojure && isVector) return cljs.core.persistent_BANG_(object);
    else if(isClojure) return cljs.core.persistent_BANG_(object);
    else return object;
}
/**
 * Ensure eval is isolated, store the result in functionCache.
 *
 * @internal
 */
function isolateEval(functionString, functionCache, object) {
    if (!functionCache)
        return new Function(functionString);
    // Check for cache hit, eval if missing and return cached function
    if (functionCache[functionString] == null) {
        functionCache[functionString] = new Function(functionString);
    }
    // Set the object
    return functionCache[functionString].bind(object);
}

exports.deserializeCljs = deserializeCljs;               //cljs , this will be added on bson.js to be used
exports.deserialize=deserialize;                         //the default that existed

//# sourceMappingURL=deserializer.js.map
