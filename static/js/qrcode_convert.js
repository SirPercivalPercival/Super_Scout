const jsYaml = require('js-yaml');
const msgpack = require('@msgpack/msgpack');
const base45 = require('base45-js');
const zlib = require('zlib');
const fs = require('fs');

function loadSchemaFromYaml(yamlFile) {
    const fileContents = fs.readFileSync(yamlFile, 'utf8');
    return jsYaml.load(fileContents).schema;
}

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

function encodeQr(data, schema) {
    const flattened = flattenObject(data, schema);
    const packed = msgpack.encode(flattened);
    const compressed = zlib.deflateSync(packed);
    return base45.encode(compressed);
}

function decodeQr(encoded, schema) {
    const decoded = base45.decode(encoded);
    const decompressed = zlib.inflateSync(decoded);
    const unpacked = msgpack.decode(decompressed);
    const [result] = unflattenObject(unpacked, schema);
    return result;
}

module.exports = {
    loadSchemaFromYaml,
    encodeQr,
    decodeQr
};
