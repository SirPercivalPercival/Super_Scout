window.global = window;
window.process = { env: {} };

async function loadDependencies() {
    window.pako = await import('https://cdn.skypack.dev/pako@2.1.0').then(m => m.default || m);
    window.jsYaml = await import('https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.mjs').then(m => m.default || m);
    window.msgpack = await import('https://cdn.jsdelivr.net/npm/@msgpack/msgpack@2.8.0/+esm').then(m => m.default || m);

    console.log('Dependencies loaded successfully');
}

loadDependencies().catch(err => console.error("Failed to load dependencies:", err));

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

window.encodeQr = function(data, schema) {
    const flattened = flattenObject(data, schema);
    const packed = window.msgpack.encode(flattened);
    const compressed = window.pako.deflate(packed);
    return base45Encode(compressed);  // Use custom Base45 encoding
};

window.decodeQr = function(encoded, schema) {
    const decoded = base45Decode(encoded);  // Use custom Base45 decoding
    const decompressed = window.pako.inflate(decoded);
    const unpacked = window.msgpack.decode(decompressed);
    const [result] = unflattenObject(unpacked, schema);
    return result;  // Ensure this is inside the function body
};

window.QrGenerator = {
    encodeQr: window.encodeQr,
    decodeQr: window.decodeQr,
    loadSchemaFromYaml: window.loadSchemaFromYaml
};

console.log('encodeQr exists:', typeof window.encodeQr === 'function');
console.log('loadSchemaFromYaml exists:', typeof window.loadSchemaFromYaml === 'function');

// Helper functions (unchanged)
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
}
export { encodeQr, decodeQr, loadSchemaFromYaml };
