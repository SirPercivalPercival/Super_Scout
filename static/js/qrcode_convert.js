// qrcode_convert.js
window.global = window;
window.process = { env: {} };

// Define base45Encode function
function base45Encode(input) {
    const BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

    // Convert input to a Uint8Array if it's a string
    if (typeof input === 'string') {
        input = new TextEncoder().encode(input);
    }

    let output = '';

    // Process the input in chunks of 2 bytes
    for (let i = 0; i < input.length; i += 2) {
        // Get two bytes (16 bits)
        const byte1 = input[i];
        const byte2 = i + 1 < input.length ? input[i + 1] : 0; // Pad with 0 if odd number of bytes

        // Combine the two bytes into a single 16-bit integer
        const value = (byte1 << 8) + byte2;

        // Encode the 16-bit value into Base45
        if (value < 45) {
            output += BASE45_CHARSET[value];
        } else {
            const remainder = value % 45;
            const quotient = Math.floor(value / 45);
            output += BASE45_CHARSET[quotient] + BASE45_CHARSET[remainder];
        }
    }

    return output;
}

// Define base45Decode function
function base45Decode(encoded) {
    const BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
    const charToValue = {};
    for (let i = 0; i < BASE45_CHARSET.length; i++) {
        charToValue[BASE45_CHARSET[i]] = i;
    }

    let output = new Uint8Array(Math.floor(encoded.length * 2 / 3));
    let outputIndex = 0;

    for (let i = 0; i < encoded.length; i += 2) {
        const char1 = encoded[i];
        const char2 = i + 1 < encoded.length ? encoded[i + 1] : '0'; // Pad with '0' if odd

        const value1 = charToValue[char1];
        const value2 = charToValue[char2];

        const combined = value1 * 45 + value2;

        output[outputIndex++] = (combined >> 8) & 0xFF; // High byte
        output[outputIndex++] = combined & 0xFF;       // Low byte
    }

    // Remove padding if necessary
    if (encoded.length % 3 === 1) {
        output = output.slice(0, -1);
    }

    return output;
}

// Attach base45Encode and base45Decode to the window object for global access
window.base45Encode = base45Encode;
window.base45Decode = base45Decode;

// Load dependencies asynchronously
async function loadDependencies() {
    try {
        window.pako = await import('https://cdn.skypack.dev/pako@2.1.0').then(m => m.default || m);
        window.jsYaml = await import('https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.mjs').then(m => m.default || m);
        window.msgpack = await import('https://cdn.jsdelivr.net/npm/@msgpack/msgpack@2.8.0/+esm').then(m => m.default || m);

        console.log('Dependencies loaded successfully');
        return true;
    } catch (error) {
        console.error("Failed to load dependencies:", error);
        throw error;
    }
}

// Load dependencies and initialize QrGenerator
loadDependencies().then(() => {
    console.log('All dependencies are loaded');
}).catch(err => {
    console.error("Failed to initialize dependencies:", err);
});

// Function to load schema from YAML
window.loadSchemaFromYaml = async function(yamlUrl) {
    try {
        console.log("Fetching schema from:", yamlUrl);
        const response = await fetch(yamlUrl);
        if (!response.ok) throw new Error(`Failed to fetch schema: ${response.statusText}`);
        const yamlText = await response.text();
        return window.jsYaml.load(yamlText);
    } catch (error) {
        console.error("Error loading YAML schema:", error);
        return null;
    }
};

// Function to encode data into a QR code
window.encodeQr = function(data, schema, dataType) {
    try {
        console.log('Data to encode:', data);
        console.log('Schema:', schema);

        const flattened = flattenObject(data, schema);
        console.log('Flattened data:', flattened);

        const packed = window.msgpack.encode(flattened);
        console.log('Packed data:', packed);

        const compressed = window.pako.deflate(packed);
        console.log('Compressed data:', compressed);

        const encoded = base45Encode(compressed);
        console.log('Base45 encoded data:', encoded);

        // Format the encoded data for the scanner: "data_type|encoded_data"
        const formattedData = `${dataType}|${encoded}`;
        console.log('Formatted data:', formattedData);

        return formattedData;
    } catch (error) {
        console.error("Error in encodeQr:", error);
        throw error;
    }
};

// Function to decode QR code data
window.decodeQr = function(encoded, schema) {
    try {
        console.log('Encoded data to decode:', encoded);

        const decoded = base45Decode(encoded);
        console.log('Base45 decoded data:', decoded);

        const decompressed = window.pako.inflate(decoded);
        console.log('Decompressed data:', decompressed);

        const unpacked = window.msgpack.decode(decompressed);
        console.log('Unpacked data:', unpacked);

        const [result] = unflattenObject(unpacked, schema);
        console.log('Unflattened result:', result);

        return result;
    } catch (error) {
        console.error("Error in decodeQr:", error);
        throw error;
    }
};

// Attach functions to the window object
window.QrGenerator = {
    encodeQr: window.encodeQr,
    decodeQr: window.decodeQr,
    loadSchemaFromYaml: window.loadSchemaFromYaml
};

console.log('encodeQr exists:', typeof window.encodeQr === 'function');
console.log('loadSchemaFromYaml exists:', typeof window.loadSchemaFromYaml === 'function');

// Helper functions for flattening and unflattening objects
function flattenObject(data, schema) {
    const result = [];
    const properties = schema.properties || {};

    for (const [key, prop] of Object.entries(properties)) {
        const dataType = prop.type;
        const childData = data[key];

        if (dataType === 'object') {
            const nested = flattenObject(childData || {}, prop);
            result.push(nested.length);
            result.push(...nested);
        } else if (dataType === 'array') {
            const processed = flattenArray(childData || [], prop.items || {});
            result.push(processed.length);
            result.push(...processed);
        } else if (prop.enum) {
            const index = prop.enum.indexOf(childData);
            result.push(index !== -1 ? index : -1);
            if (index === -1) result.push(childData);
        } else {
            result.push(childData);
        }
    }
    return result;
}

function flattenArray(data, schema) {
    const result = [];
    const schemaType = schema.type;

    for (const item of data) {
        if (schemaType === 'object') {
            const processed = flattenObject(item, schema);
            result.push(processed.length);
            result.push(...processed);
        } else if (schemaType === 'array') {
            const processed = flattenArray(item, schema.items || {});
            result.push(processed.length);
            result.push(...processed);
        } else if (schema.enum) {
            const index = schema.enum.indexOf(item);
            result.push(index !== -1 ? index : -1);
            if (index === -1) result.push(item);
        } else {
            result.push(item);
        }
    }
    return result;
}

function unflattenObject(data, schema, startIdx = 0) {
    const result = {};
    let idx = startIdx;
    const properties = schema.properties || {};

    for (const [key, prop] of Object.entries(properties)) {
        const schemaType = prop.type;

        if (schemaType === 'object') {
            const length = data[idx++];
            const [obj, newIdx] = unflattenObject(data, prop, idx);
            result[key] = obj;
            idx = newIdx;
        } else if (schemaType === 'array') {
            const length = data[idx++];
            const [arr, newIdx] = unflattenArray(data, prop.items || {}, idx, length);
            result[key] = arr;
            idx = newIdx;
        } else if (prop.enum) {
            const value = data[idx++];
            result[key] = (value >= 0 && value < prop.enum.length) 
                ? prop.enum[value] 
                : data[idx++];
        } else {
            result[key] = data[idx++];
        }
    }
    return [result, idx];
}

function unflattenArray(data, schema, startIdx, length) {
    const result = [];
    let idx = startIdx;
    const endIdx = startIdx + length;

    while (idx < endIdx) {
        const schemaType = schema.type;

        if (schemaType === 'object') {
            const itemLength = data[idx++];
            const [obj, newIdx] = unflattenObject(data, schema, idx);
            result.push(obj);
            idx = newIdx;
        } else if (schemaType === 'array') {
            const itemLength = data[idx++];
            const [arr, newIdx] = unflattenArray(data, schema.items || {}, idx, itemLength);
            result.push(arr);
            idx = newIdx;
        } else if (schema.enum) {
            const value = data[idx++];
            result.push((value >= 0 && value < schema.enum.length)
                ? schema.enum[value]
                : data[idx++]);
        } else {
            result.push(data[idx++]);
        }
    }
    return [result, idx];
}window.loadSchemaFromYaml === 'function';
