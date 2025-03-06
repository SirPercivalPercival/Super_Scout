// base45.js
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

// Export the function for use in other files
window.base45Encode = base45Encode;
