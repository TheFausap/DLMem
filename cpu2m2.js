/**
 * run_cpu.js
 *
 * This version starts from the last known-good, working code that you provided.
 * It uses simple, reliable numeric registers.
 *
 * It correctly adds the `NEG B` instruction and the logic for two's complement
 * subtraction, building upon a proven, stable foundation.
 *
 * To run:
 * 1. Save this code as `run_cpu.js`.
 * 2. Run from your terminal: `node run_cpu.js`
 */

const WORD_SIZE = 40;
const MEMORY_SIZE = WORD_SIZE * 256;
const NUM_DATA_BANKS = 16;
const WORDS_PER_BANK = 16;

// --- DELAY-LINE MEMORY LIBRARY (Validated & Robust) ---
class DelayLineMemory {
    constructor(size) {
        this.size = size;
        this.enableRefresh = true;
        this._memory = new Array(this.size).fill(0);
        this._nextBitToWrite = null;
    }

    tick() {
        const bitLeavingTheLine = this._memory[0];
        let bitEnteringTheLine;

        if (this._nextBitToWrite !== null) {
            bitEnteringTheLine = this._nextBitToWrite;
            this._nextBitToWrite = null;
        } else if (this.enableRefresh) {
            bitEnteringTheLine = bitLeavingTheLine;
        } else {
            bitEnteringTheLine = 0;
        }

        for (let i = 0; i < this.size - 1; i++) {
            this._memory[i] = this._memory[i + 1];
        }
        this._memory[this.size - 1] = bitEnteringTheLine;
        return bitLeavingTheLine;
    }

    write(bit) {
        if (bit !== 0 && bit !== 1) return;
        this._nextBitToWrite = bit;
    }
    
    clear() {
        this._memory.fill(0);
        this._nextBitToWrite = null;
    }
}

// --- MEMORY SYSTEM ---
class MemorySystem {
    constructor(numBanks, wordsPerBank, wordSize) {
        this.banks = [];
        this.numBanks = numBanks;
        this.wordsPerBank = wordsPerBank;
        this.wordSize = wordSize;
        const bankSize = wordsPerBank * wordSize;
        for (let i = 0; i < numBanks; i++) {
            this.banks.push(new DelayLineMemory(bankSize));
        }
    }

    // Ticks all memory banks simultaneously
    tickAll() {
        for (const bank of this.banks) {
            bank.tick();
        }
    }
}

// --- SIMPLE CPU SIMULATOR ---
class SimpleCPU {
    constructor(memory,dataMemory) {
        this.memory = memory;
        this.dataMemory = dataMemory;     // The new memory bank system
        this.regA = new DelayLineMemory(WORD_SIZE);
        this.regB = new DelayLineMemory(WORD_SIZE);
        this.regS = new DelayLineMemory(WORD_SIZE); // internal register as scratch space
        this.OPCODES = {
            'NOP': 0b00000000, // No Operation
            'LAI': 0b00000001, // Load Immediate Value
            'LBI': 0b00000010,
            'ADD': 0b00000011,
            'PRA': 0b00000100,
            'NEG': 0b00000101,
            'STO': 0b00000110, // Store Reg A to Memory
            'STC': 0b00010000, // Store Reg A to Memory and clear Reg A
            'LDA': 0b00000111, // Load Reg A from Memory
            'SHL': 0b00001000, // Shift Left A
            'SHR': 0b00001001, // Shift Right A
            'RND': 0b00001010, // Random Number
            'MLA': 0b00001011, // Multiply Accumulator
            'HLT': 0b00001111,
        };

        this.dataMemoryClocks = new Array(this.dataMemory.numBanks).fill(0);

        this.reset();
    }

    reset() {
        this.ir = 0;
        this.state = 'RUNNING';
        this.memory.clear();
        this.regA.clear();
        this.regB.clear();
    }

    // Fetches and executes one full instruction.
    // This assumes the instruction's first bit is at the read head.
    // Returns true if the CPU is still running, false if halted.
    fetchAndExecute() {
        let fetchBuffer = [];
        for(let i=0; i < WORD_SIZE; i++) {
            const readBit = this.memory.tick();
            fetchBuffer.push(readBit);
            //console.log(`  BIT FETCH ${i}: ${readBit}`);
        }
        
        //console.log(`\n>>> FETCH: IR=${fetchBuffer.join('')}`);
        this.ir = fetchBuffer.reduce((acc, bit) => (acc << 1n) | BigInt(bit), 0n);
        //console.log(`  IR: 0b${this.ir.toString(2).padStart(16,'0')}`);

        const opcode = Number(this.ir >> (BigInt(WORD_SIZE) - 8n));
        const operand = this.ir & 0xFFFFFFFFn; 
        console.log(`  EXEC: IR=0b${this.ir.toString(2).padStart(16,'0')}, Opcode=${opcode}, Operand=${operand}`);

        switch (opcode) {
            case this.OPCODES.LAI:
            case this.OPCODES.LBI:
                const targetReg = (opcode === this.OPCODES.LAI) ? this.regA : this.regB;
                console.log(`   -> Executing LOAD IMM... (8 ticks)`);
                for (let i = 0n; i < BigInt(WORD_SIZE); i++) {
                    targetReg.write(Number((operand >> i) & 1n));
                    targetReg.tick();
                }
                break;

            case this.OPCODES.STO:
            case this.OPCODES.LDA:
            case this.OPCODES.STC:
                const bankId = Number(operand >> 4n);
                const wordId = Number(operand & 0x0Fn);
                const targetBank = this.dataMemory.banks[bankId];
                console.log(`    -> Accessing Data Memory: Bank ${bankId}, Word ${wordId}`);
                console.log(`      -> Aligning bank ${bankId}. Current logical pos: ${this.dataMemoryClocks[bankId]}, Target: ${wordId}`);
                while (this.dataMemoryClocks[bankId] !== wordId) {
                    //console.log(`      -> Ticking bank ${bankId}... (${this.dataMemoryClocks[bankId]} -> ${wordId})`);
                    for (let i = 0; i < WORD_SIZE; i++) {
                        this.dataMemory.banks[bankId].tick();
                    }
                    this.dataMemoryClocks[bankId] = (this.dataMemoryClocks[bankId] + 1) % this.dataMemory.wordsPerBank;
                }
                console.log(`      -> Word ${wordId} arrived.`);

                if(opcode === this.OPCODES.STO) {
                    console.log("      -> Storing Reg A to Memory... (8 ticks)");
                    for(let i=0; i<WORD_SIZE; i++) {
                        targetBank.write(this.regA._memory[0]);
                        targetBank.tick();
                        this.regA.tick();
                    }
                } else if(opcode === this.OPCODES.STC) {
                    console.log("      -> Storing Reg A to Memory and clearing Reg A... (8 ticks)");
                    for(let i=0; i<WORD_SIZE; i++) {
                        targetBank.write(this.regA._memory[0]);
                        targetBank.tick();
                        this.regA.write(0); // Clear Reg A
                        this.regA.tick();
                    }
                } else { // LDA
                    console.log("      -> Loading Memory to Reg A... (8 ticks)");
                    for(let i=0; i<WORD_SIZE; i++) {
                        this.regA.write(targetBank._memory[0]);
                        this.regA.tick();
                        targetBank.tick();
                    }
                }
                this.dataMemoryClocks[bankId] = (this.dataMemoryClocks[bankId] + 1) % this.dataMemory.wordsPerBank;
                break;

            case this.OPCODES.SHL:
                console.log("      -> SHL (Shift Left, 8 ticks)");
                // To shift left, we read each bit and write the previous bit.
                // The first bit written is a 0.
                this.regA.write(0); // Shift in a 0
                this.regA.tick();
                break;

            case this.OPCODES.SHR:
                console.log("      -> SHR (Shift Right, 8 ticks)");
                // To shift right, we need to reverse the order of bits.
                // We'll read all bits, then write them back in shifted order.
                // Use regS as a temporary storage.
                this.regS.clear();
                for (let i = 0; i < WORD_SIZE; i++) {
                    this.regS.write(this.regA.tick());
                    this.regS.tick();
                }

                this.regA.clear();
                this.regA.write(0); // Shift in a 0
                this.regA.tick();
                for (let i = 0; i < WORD_SIZE - 1; i++) {
                    this.regA.write(this.regS.tick());
                    this.regA.tick();
                }
                break;

            case this.OPCODES.RND:
                const bitsToClear = Number(operand);
                console.log(`      -> ROUNDA, ${bitsToClear} (${WORD_SIZE} ticks)`);
                for (let i = 0; i < WORD_SIZE; i++) {
                    const currentBit = this.regA._memory[0];
                    // For the N least significant bits, write 0. Otherwise, refresh the bit.
                    if (i < bitsToClear) {
                        this.regA.write(0);
                    } else {
                        this.regA.write(currentBit);
                    }
                    this.regA.tick();
                }
                break;

            case this.OPCODES.MLA:
                const loopCount = Number(operand);
                console.log(`      -> MULADD, ${loopCount} (${WORD_SIZE * loopCount} ticks)`);
                for (let j = 0; j < loopCount; j++) {
                    let carry = 0;
                    for (let i = 0; i < WORD_SIZE; i++) {
                        const bitA = this.regA._memory[0];
                        const bitB = this.regB._memory[0];
                        const sum = bitA + bitB + carry;
                        this.regA.write(sum % 2);
                        carry = sum > 1 ? 1 : 0;
                        this.regA.tick();
                        this.regB.tick();
                    }
                }
                break;

            case this.OPCODES.ADD:
                console.log("      -> ADD... (8 ticks)");
                let carry = 0;
                for (let i = 0; i < WORD_SIZE; i++) {
                    const bitA = this.regA._memory[0];
                    const bitB = this.regB._memory[0];
                    const sum = bitA + bitB + carry;
                    this.regA.write(sum % 2);
                    carry = sum > 1 ? 1 : 0;
                    //console.log(` bits ${i}: A: ${this.regA._memory[0]}, B: ${this.regB._memory[0]}, c: ${carry}, s: ${sum}`);
                    this.regA.tick();
                    this.regB.tick();
                }
                break;

            case this.OPCODES.NEG:
                // Perform Two's Complement negation on the numeric register
                // 1. Invert the bits (~ operator)
                // 2. Add 1
                // 3. Ensure it's an 8-bit result (& 0xFF)
                console.log("      -> NEG (16 ticks)");
                for (let i = 0; i < WORD_SIZE; i++) {
                    this.regB.write(this.regB._memory[0] == 0 ? 1 : 0);
                    this.regB.tick();
                }
                //console.log(`  *** NEG OP *** CPU State -> A: ${this.regA._memory}, B: ${this.regB._memory}`);
                let incrementCarry = 1;
                for (let i = 0; i < WORD_SIZE; i++) {
                    //console.log(` b${i}: ${this.regB._memory[0]}, incrementCarry: ${incrementCarry}`);
                    const sum = this.regB._memory[0] + incrementCarry;
                    this.regB.write(sum % 2);
                    incrementCarry = sum > 1 ? 1 : 0;
                    this.regB.tick();
                }
                //console.log(`  *** NEG OP *** CPU State -> A: ${this.regA._memory}, B: ${this.regB._memory}`);
                break;

            case this.OPCODES.PRA:
                // Handle signed number display for two's complement
                console.log("      -> PRINT Reg A (8 ticks)");
                let wordBuffer = [];
                for(let i=0; i<WORD_SIZE; i++) {
                    wordBuffer.push(this.regA._memory[0]);
                    this.regA.tick();
                }
                const valA = wordBuffer.reduce((acc, bit, i) => acc | (bit << i), 0);
                const signedValA = (valA & 0x80) ? valA - 256 : valA;
                console.log(`\n>>> OUTPUT: ${signedValA}\n`);
                break;

            case this.OPCODES.HLT:
                this.state = 'HALTED';
                console.log("\n--- HALT ---");
                return false; // Stop execution

            case this.OPCODES.NOP:
                console.log("      -> NOP (No Operation, 8 ticks)");
                // No operation, just consume the ticks
                for (let i = 0; i < WORD_SIZE; i++) {
                    this.memory.tick();
                }
                break;
                
            default:
                console.error(`\n! EXECUTION ERROR: Unknown Opcode ${opcode}`);
                this.state = 'HALTED';
                return false; // Stop execution
        }
        return true; // Still running
    }
}

// --- DEBUGGING DUMP UTILITY ---
function dumpState(cpu, tickCount) {
    console.log(`\n--- STATE DUMP @ TOTAL TICK ${tickCount} ---`);
    
    const memState = cpu.memory._memory;
    const numWords = cpu.memory.size / WORD_SIZE;
    console.log("  Main Memory (non-zero words):");
    for (let i = 0; i < numWords; i++) {
        const wordBits = memState.slice(i * WORD_SIZE, (i + 1) * WORD_SIZE);
        if (wordBits.some(b => b === 1)) {
            console.log(`    Word ${i}: ${wordBits.join('')}`);
        }
    }

    const regAState = cpu.regA._memory.join('');
    const regBState = cpu.regB._memory.join('');
    console.log(`  Register A: ${regAState}`);
    console.log(`  Register B: ${regBState}`);
    console.log("--------------------------");
}

// --- MAIN EXECUTION ---

function runSimulation() {
    const program = `
        LAI, 20
        LBI, 7
        NEG
        ADD
        STO, 0, 1
        LAI, 99
        STO, 0, 2
        LDA, 0, 1
        PRA
        LDA, 0, 2
        SHL
        PRA
        HLT
    `;
    const memory = new DelayLineMemory(MEMORY_SIZE);
    const dataMemory = new MemorySystem(NUM_DATA_BANKS, WORDS_PER_BANK, WORD_SIZE);
    const cpu = new SimpleCPU(memory,dataMemory);
    let totalTicks = 0;

    // --- PHASE 1: ASSEMBLE & LOAD ---
    console.log("--- Assembling and Loading Program ---");
    const lines = program.trim().split('\n').filter(l => l.trim());
    const programLengthInBits = lines.length * WORD_SIZE;
    
    memory.enableRefresh = false;
    for (const line of lines) {
        const parts = line.trim().split(/[\s,]+/);
        let instructionWord = 0;
        const op = parts[0].toUpperCase();
        const operand = BigInt(parts[1] ? parseInt(parts[1]) : 0);
        const word = BigInt(parts[2] ? parseInt(parts[2]) : 0);

        // Convert opcodes to BigInt for shifting
        const opcode = BigInt(cpu.OPCODES[op]);

        switch (op) {
            case 'LAI':
            case 'LBI':
            case 'RND':
            case 'MLA':
                instructionWord = opcode << BigInt(WORD_SIZE-8) | operand;
                break;
            case 'STO':
            case 'LDA':
                const combinedAddress = (operand << 4n) | word;
                instructionWord = opcode << BigInt(WORD_SIZE-8) | combinedAddress;
                break;
            case 'ADD': 
            case 'PRA': 
            case 'NEG': 
            case 'HLT': 
            case 'SHL': 
            case 'SHR': 
                instructionWord = opcode << BigInt(WORD_SIZE-8); break;
            default:
                console.error(`\n! ASSEMBLY ERROR: Unknown Instruction ${op}`);
                return;
        }

        console.log(` Writing operand ${op} to instruction word: ${instructionWord.toString(2).padStart(WORD_SIZE, '0')}`);
        for (let i = BigInt(WORD_SIZE - 1); i >= 0n; i--) {
            const bit = (instructionWord >> i) & 1n;
            memory.write(Number(bit));
            memory.tick();
            totalTicks++;
        }
    }
    memory.enableRefresh = true;
    const programBaseAddress = (MEMORY_SIZE - programLengthInBits) / WORD_SIZE;
    console.log(`Program loaded in ${totalTicks} ticks. Physical base address: Word ${programBaseAddress}`);

    dumpState(cpu, totalTicks);

    // --- PHASE 2: WAIT FOR LATENCY ---
    const ticksToWaitForData = MEMORY_SIZE - programLengthInBits;
    console.log(`\n--- Waiting for memory stabilisation (${ticksToWaitForData} ticks)... ---`);
    for (let i = 0; i < ticksToWaitForData; i++) {
        memory.tick();
        totalTicks++;
    }
    console.log("Wait complete. Memory ready.");

    dumpState(cpu, totalTicks);

    // --- PHASE 3: EXECUTION LOOP ---
    console.log("\n--- Starting Execution ---");
    let programCounter = 0;
    while(cpu.state === 'RUNNING') {
        console.log(`\nTick ${totalTicks}: Executing instruction at PC=${programCounter}`);
        const stillRunning = cpu.fetchAndExecute();
        // Each instruction takes 8 ticks to fetch from memory.
        totalTicks += WORD_SIZE;
        programCounter++;
        console.log(`  CPU State -> A: ${cpu.regA._memory}, B: ${cpu.regB._memory}`);
        if (!stillRunning) break;
    }

    console.log("\n\n=== SIMULATION FINISHED ===");
    console.log(`Total Ticks: ${totalTicks}`);
    console.log(`Final Registers -> A: ${cpu.regA._memory}, B: ${cpu.regB._memory}`);
}

runSimulation();
