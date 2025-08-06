/**
 * test_loader.js
 *
 * A focused script to test ONLY the program loading mechanism of the
 * delay-line memory. It loads a program and then immediately dumps the
 * memory state to verify the data is written correctly.
 *
 * This isolates the loader from any potential bugs in the CPU's
 * fetch/execute cycle.
 *
 * To run:
 * 1. Save this code as `test_loader.js`.
 * 2. Run from your terminal: `node test_loader.js`
 */

// --- DELAY-LINE MEMORY LIBRARY ---
class DelayLineMemory {
    constructor(size) {
        this.size = size;
        this.enableRefresh = true; // Refresh is on by default
        // Memory is a medium of 0s (no pulse)
        this._memory = new Array(this.size).fill(0);
        this._nextBitToWrite = null;
    }

    tick() {
        const readBit = this._memory[0];
        for (let i = 0; i < this.size - 1; i++) {
            this._memory[i] = this._memory[i + 1];
        }

        let bitToInject = 0; // Default to writing a 0
        if (this._nextBitToWrite !== null) {
            // An explicit write takes highest priority
            bitToInject = this._nextBitToWrite;
            this._nextBitToWrite = null; // Consume the bit
        } else if (this.enableRefresh) {
            // Otherwise, if refresh is on, re-circulate the read bit
            bitToInject = readBit;
        }
        // If refresh is off and there's no write, a 0 is injected.

        this._memory[this.size - 1] = bitToInject;
        return readBit;
    }

    write(bit) {
        if (bit !== 0 && bit !== 1) return;
        this._nextBitToWrite = bit;
    }

    getMemoryState() {
        return [...this._memory];
    }
}

// --- TEST SETUP ---
const WORD_SIZE = 8;
const MEMORY_WORDS = 32; // A smaller memory for a clearer dump
const MEMORY_SIZE = WORD_SIZE * MEMORY_WORDS;

const OPCODES = {
    'LOAD_A': 0b0001,
    'LOAD_B': 0b0010,
    'ADD': 0b0011,
    'PRINT_A': 0b0100,
    'HALT': 0b1111,
};

const program = `
    LOAD A, 5
    LOAD B, 10
    ADD
    PRINT A
    HALT
`;

// --- ASSEMBLER ---
function assemble(programCode) {
    const lines = programCode.trim().split('\n');
    let machineCode = [];

    for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/[\s,]+/);
        const instruction = parts[0].toUpperCase();
        let instructionWord = 0;

        switch (instruction) {
            case 'LOAD':
                const reg = parts[1].toUpperCase();
                const val = parseInt(parts[2]);
                const opcode = (reg === 'A') ? OPCODES.LOAD_A : OPCODES.LOAD_B;
                instructionWord = (opcode << 4) | (val & 0x0F);
                break;
            case 'ADD':
                instructionWord = OPCODES.ADD << 4;
                break;
            case 'PRINT':
                instructionWord = OPCODES.PRINT_A << 4;
                break;
            case 'HALT':
                instructionWord = OPCODES.HALT << 4;
                break;
        }

        for (let i = WORD_SIZE - 1; i >= 0; i--) {
            machineCode.push((instructionWord >> i) & 1);
        }
    }
    return machineCode;
}

// --- MEMORY DUMP UTILITY ---
function dumpMemory(memoryState) {
    console.log("\n--- Memory State Dump ---");
    console.log(`Total bits: ${memoryState.length}`);
    for (let i = 0; i < MEMORY_WORDS; i++) {
        const start = i * WORD_SIZE;
        const end = start + WORD_SIZE;
        const wordBits = memoryState.slice(start, end);
        const wordString = wordBits.join('');
        const wordHex = parseInt(wordString, 2).toString(16).toUpperCase().padStart(2, '0');

        // Highlight non-zero words for clarity
        if (wordBits.some(bit => bit === 1)) {
            console.log(`\x1b[33mWord ${String(i).padStart(2)} (bits ${start}-${end-1}): ${wordString} [0x${wordHex}]\x1b[0m`);
        } else {
            // Comment out to reduce noise, or leave in for full dump
            // console.log(`Word ${String(i).padStart(2)} (bits ${start}-${end-1}): ${wordString} [0x${wordHex}]`);
        }
    }
    console.log("-------------------------\n");
}


// --- MAIN EXECUTION ---
function main() {
    console.log("Step 1: Assembling program...");
    const machineCode = assemble(program);
    console.log(`Assembly complete. Program is ${machineCode.length} bits long.`);
    console.log("Expected Machine Code (first 8 bits for LOAD A, 5): 00010101");
    console.log(`Actual first 8 bits:                                ${machineCode.slice(0, 8).join('')}`);


    console.log("\nStep 2: Initializing memory...");
    const memory = new DelayLineMemory(MEMORY_SIZE);
    // Turn off refresh during the write to prevent read bits from interfering
    memory.enableRefresh = false;

    console.log("\nStep 3: Writing program to memory, one bit per tick...");
    for (const bit of machineCode) {
        memory.write(bit);
        memory.tick();
    }
    console.log("Write complete.");

    // The memory state *after* the final tick of the write process
    const finalMemoryState = memory.getMemoryState();

    console.log("\nStep 4: Dumping final memory state.");
    dumpMemory(finalMemoryState);

    console.log("Verification:");
    console.log("Check the memory dump above. The program data should appear at the END of the memory,");
    console.log("because each 'write' and 'tick' pushes the data one step further down the line.");
}

main();
