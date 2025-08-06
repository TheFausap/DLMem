/**
 * @class DelayLineMemory
 * @description
 * Simulates a delay-line memory, a form of sequential-access computer memory used in early computers.
 * This class encapsulates the core logic of storing data as pulses circulating through a medium.
 * It can be instantiated and controlled by a larger simulator (e.g., a CPU simulation).
 */
class DelayLineMemory {
    /**
     * Creates an instance of DelayLineMemory.
     * @param {number} size The total number of bits the delay line can hold. This is the length of the line.
     * @param {object} [options={}] Configuration options for the memory.
     * @param {boolean} [options.enableRefresh=true] If true, the bit read at the end of the line is automatically re-written at the beginning (the refresh cycle).
     */
    constructor(size, options = {}) {
        if (!Number.isInteger(size) || size <= 0) {
            throw new Error('Memory size must be a positive integer.');
        }

        // --- Public Properties ---
        this.size = size;
        this.enableRefresh = options.enableRefresh !== undefined ? options.enableRefresh : true;

        // --- Private Internal State ---
        // An array representing the bits in the delay line. `null` signifies an empty space.
        // Index 0 is the "read head", and index `size - 1` is the "write head".
        this._memory = new Array(this.size).fill(null);

        // Stores a bit that has been explicitly sent to the write head, to be injected on the next clock tick.
        // This takes precedence over the refresh cycle.
        this._nextBitToWrite = null;
    }

    /**
     * Advances the simulation by one clock cycle.
     * This is the main method that drives the memory's operation.
     * It simulates the movement of all bits down the line by one position.
     * @returns {number|null} The bit that was just read from the read head (the value at index 0 before the tick).
     */
    tick() {
        // 1. Read the bit at the end of the line (the read head). This is the output for this cycle.
        const readBit = this._memory[0];

        // 2. Shift all bits one position "down the line" (towards the read head).
        for (let i = 0; i < this.size - 1; i++) {
            this._memory[i] = this._memory[i + 1];
        }

        // 3. Determine the new bit to inject at the write head.
        let bitToInject = null;

        if (this._nextBitToWrite !== null) {
            // An explicit write operation takes precedence.
            bitToInject = this._nextBitToWrite;
            this._nextBitToWrite = null; // The bit is now in the line, so clear the buffer.
        } else if (this.enableRefresh && readBit !== null) {
            // If the refresh cycle is active, the read bit is re-injected.
            bitToInject = readBit;
        }

        // 4. Place the new bit at the start of the line (the write head).
        this._memory[this.size - 1] = bitToInject;

        // 5. Return the bit that was read at the start of this tick.
        return readBit;
    }

    /**
     * Schedules a bit to be written into the memory on the next clock tick.
     * This simulates sending a pulse to the write transducer.
     * @param {number} bit The bit to write (must be 0 or 1).
     */
    write(bit) {
        if (bit !== 0 && bit !== 1) {
            console.error(`Invalid write value: ${bit}. Must be 0 or 1.`);
            return;
        }
        this._nextBitToWrite = bit;
    }

    /**
     * "Peeks" at the value currently at the read head without advancing the clock.
     * @returns {number|null} The bit at the read head (index 0).
     */
    peekReadHead() {
        return this._memory[0];
    }

    /**
     * "Peeks" at the value currently at the write head.
     * @returns {number|null} The bit at the write head (index size - 1).
     */
    peekWriteHead() {
        return this._memory[this.size - 1];
    }

    /**
     * Returns a copy of the current memory state for debugging or visualization.
     * @returns {Array<number|null>} An array representing the bits in the line.
     */
    getMemoryState() {
        return [...this._memory];
    }

    /**
     * Clears the memory, resetting all bits to null.
     */
    clear() {
        this._memory.fill(null);
        this._nextBitToWrite = null;
    }
}


// --- EXAMPLE USAGE ---
// This demonstrates how a hypothetical simulator could use the DelayLineMemory class.

function runExample() {
    console.log("--- Delay-Line Memory API Example ---");

    // In a UNIVAC, a "word" was 12 characters, and each character was 6 bits, plus a parity bit.
    // A delay line often held 10 words. So, 10 words * 12 chars/word * 7 bits/char = 840 bits.
    // We'll use a smaller size for this example.
    const WORD_SIZE = 8; // Let's define a word as 8 bits for simplicity.
    const MEMORY_CAPACITY = 4 * WORD_SIZE; // A memory that can hold 4 words (32 bits).

    console.log(`Initializing a ${MEMORY_CAPACITY}-bit delay line.`);
    const mainMemory = new DelayLineMemory(MEMORY_CAPACITY);

    // --- Writing a word into memory ---
    const wordToWrite = [1, 0, 1, 1, 0, 1, 0, 1];
    console.log(`\nAttempting to write the word: [${wordToWrite.join(', ')}]`);

    // To write a word, you must time it perfectly, writing one bit per clock cycle.
    for (let i = 0; i < wordToWrite.length; i++) {
        mainMemory.write(wordToWrite[i]);
        console.log(`Tick ${i}: Writing ${wordToWrite[i]}. Read out: ${mainMemory.tick()}`);
    }

    // Let the memory circulate for a bit. The word is now "inside" the line.
    console.log(`\nWord written. Current memory state: [${mainMemory.getMemoryState().join(', ')}]`);
    console.log("Letting memory circulate for a few cycles...");
    for (let i = 0; i < 5; i++) {
        mainMemory.tick();
    }
    console.log(`After 5 cycles, state: [${mainMemory.getMemoryState().join(', ')}]`);


    // --- Reading a word from memory ---
    // To read, you must wait until the first bit of the word reaches the read head.
    // A real CPU would have a counter to know when the desired word is available.
    // We'll simulate this by ticking until we see the first bit (1).
    console.log("\nSearching for the start of the word to read it back...");
    let readWord = [];
    let cyclesToFind = 0;
    while (mainMemory.peekReadHead() !== 1) {
        mainMemory.tick();
        cyclesToFind++;
    }
    console.log(`Found the start of the word after ${cyclesToFind} cycles.`);

    // Now, read the next 8 bits as they come out of the read head.
    for (let i = 0; i < WORD_SIZE; i++) {
        readWord.push(mainMemory.tick());
    }

    console.log(`Word read from memory: [${readWord.join(', ')}]`);
    console.log(`Original word:         [${wordToWrite.join(', ')}]`);
    console.log("Match:", JSON.stringify(readWord) === JSON.stringify(wordToWrite));
}

// To run the example in a browser console or Node.js environment:
runExample();

