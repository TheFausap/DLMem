/**
 * run_cpu.js
 *
 * This version incorporates the user-added STC (Store and Clear) instruction
 * and implements a JMP (unconditional jump) instruction, similar to an
 * EDVAC-style "Goto" or transfer of control.
 *
 * This version FIXES the PC/memory alignment bug.
 *
 * To run:
 * 1. Save this code as `run_cpu.js`.
 * 2. Run from your terminal: `node run_cpu.js`
 */

const WORD_SIZE = 40;
const MEMORY_SIZE = WORD_SIZE * 256;
const NUM_DATA_BANKS = 16;
const WORDS_PER_BANK = 16;

// --- DELAY-LINE MEMORY LIBRARY ---
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
}

// --- SIMPLE CPU SIMULATOR ---
class SimpleCPU {
    constructor(memory,dataMemory) {
        this.memory = memory;
        this.dataMemory = dataMemory;
        this.regA = new DelayLineMemory(WORD_SIZE);
        this.regB = new DelayLineMemory(WORD_SIZE);
        this.regS = new DelayLineMemory(WORD_SIZE);

        this.OPCODES = {
            'NOP': 0b00000000, // No Operation
            'LAI': 0b00000001, // Load Immediate Value to Reg A
            'LBI': 0b00000010, // Load Immediate Value to Reg B 
            'ADD': 0b00000011, // Add Reg A and Reg B, store result in Reg A
            'PRA': 0b00000100, // Print Register A (output to console)
            'NEG': 0b00000101, // Negate Reg A (Two's Complement)
            'STO': 0b00000110, // Store Reg A to Data Memory
            'LDA': 0b00000111, // Load Data Memory to Reg A
            'SHL': 0b00001000, // Shift Left (write 0 to Reg A, shift bits left)
            'SHR': 0b00001001, // Shift Right (write 0 to Reg A, shift bits right)
            'RND': 0b00001010, // Round Reg A, clear N least significant bits
            'MLA': 0b00001011, // Multiply and Add (A = A + B, loop N times)
            'STC': 0b00010000, // Store Reg A to Data Memory and clear Reg A
            'JMP': 0b00010001, // Jump to a relative address (PC = PC + operand)
            'JMPA': 0b00011011, // Jump to an absolute address (PC = operand)
            'JZA': 0b00010010, // Jump if Reg A is Zero (PC = PC + operand)
            'JNA': 0b00010011, // Jump if Reg A is Negative (MSB=1) (PC = PC + operand)
            'COL': 0b00010100, // Collate (AND-and-add)
            'STB': 0b00010101, // Store Reg B to Data Memory
            'LDB': 0b00010110, // Load Data Memory to Reg B
            'LDP': 0b00010111, // Load Program Memory to Reg A
            'STP': 0b00011000, // Store Reg A to Program Memory
            'LEA': 0b00011001, // Load Immediate in the address part of reg A
            'LEB': 0b00011010, // Load Immediate in the address part of Reg B
            'HLT': 0b00001111, // Halt the CPU
        };

        this.dataMemoryClocks = new Array(this.dataMemory.numBanks).fill(0);
        this.reset();
    }

    reset() {
        this.pc = 0;
        this.baseAddress = 0; // *** CHANGED: Added base address property
        this.memoryClock = 0;
        this.totalTicks = 0;
        this.ir = 0;
        this.state = 'RUNNING';
        this.jumped = false;
        this.memory.clear();
        this.regA.clear();
        this.regB.clear();
    }
    
    step() {
        if (this.state !== 'RUNNING') return;
        
        const numWords = this.memory.size / WORD_SIZE;

        const targetWordPos = this.pc;
        const wordDistance = (targetWordPos - this.memoryClock + numWords) % numWords;
        const ticksToWait = wordDistance * WORD_SIZE;

        for (let i = 0; i < ticksToWait; i++) {
            this.memory.tick();
            this.totalTicks++;
        }
        this.memoryClock = targetWordPos;
        
        console.log(`\nTick ${this.totalTicks}: PC=${this.pc}. Memory aligned.`);
        
        let fetchBuffer = [];
        for(let i=0; i < WORD_SIZE; i++) {
            fetchBuffer.push(this.memory.tick());
            this.totalTicks++;
        }
        this.memoryClock = (this.memoryClock + 1) % numWords;
        this.ir = fetchBuffer.reduce((acc, bit) => (acc << 1n) | BigInt(bit), 0n);

        this.execute();

        if (this.jumped) {
            this.jumped = false;
        } else if (this.state === 'RUNNING') {
            this.pc++;
        }
    }

    execute() {
        const opcode = Number(this.ir >> (BigInt(WORD_SIZE) - 8n));
        const operand = this.ir & 0xFFFFFFFFn; 
        console.log(`  EXEC: IR=0b${this.ir.toString(2).padStart(40,'0')}, Opcode=${opcode}, Operand=${operand}`);
        let carry = 0;

        switch (opcode) {
            case this.OPCODES.LAI:
            case this.OPCODES.LBI:
            case this.OPCODES.LEA:
            case this.OPCODES.LEB:
                if ((opcode === this.OPCODES.LEA) || (opcode === this.OPCODES.LEB)) {
                    // LEA (Load Immediate in the address part)
                    const targetReg = (opcode === this.OPCODES.LAI) ? this.regA : this.regB;
                    console.log(`      -> LEA: Setting base address to ${operand}`);
                    for (let i = BigInt(WORD_SIZE - 1); i >= 0n; i--) {
                        targetReg.write(Number((operand >> i) & 1n));
                        targetReg.tick(); this.totalTicks++;
                    }
                    console.log(` Reg ${targetReg === this.regA ? 'A' : 'B'} after load: ${targetReg._memory.join('')}`);
                } else {
                    // LAI or LBI (Load Immediate to Reg A or B)
                    const targetReg = (opcode === this.OPCODES.LAI) ? this.regA : this.regB;
                    console.log(`      -> Loading Immediate (${operand}) to Reg... (8 ticks)`);
                    for (let i = 0n; i < BigInt(WORD_SIZE); i++) {
                        targetReg.write(Number((operand >> i) & 1n));
                        targetReg.tick(); this.totalTicks++;
                    }
                    console.log(` Reg ${targetReg === this.regA ? 'A' : 'B'} after load: ${targetReg._memory.join('')}`);
                }
                break;
            
            case this.OPCODES.STO:
            case this.OPCODES.LDA:
            case this.OPCODES.STC:
            case this.OPCODES.STB:
            case this.OPCODES.LDB:
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
                } else if(opcode === this.OPCODES.STB) {
                    console.log("      -> Storing Reg B to Memory... (8 ticks)");
                    for(let i=0; i<WORD_SIZE; i++) {
                        targetBank.write(this.regB._memory[0]);
                        targetBank.tick();
                        this.regB.tick();
                    }
                } else if(opcode === this.OPCODES.STC) {
                    console.log("      -> Storing Reg A to Memory and clearing Reg A... (8 ticks)");
                    for(let i=0; i<WORD_SIZE; i++) {
                        targetBank.write(this.regA._memory[0]);
                        targetBank.tick();
                        this.regA.write(0); // Clear Reg A
                        this.regA.tick();
                    }
                } else if(opcode === this.OPCODES.LDB ) { // LDB
                    console.log("      -> Loading Memory to Reg B... (8 ticks)");
                    for(let i=0; i<WORD_SIZE; i++) {
                        this.regB.write(targetBank._memory[0]);
                        this.regB.tick();
                        targetBank.tick();
                    }
                    console.log(` Reg B after LDB: ${this.regB._memory.join('')}`);
                } else { // LDA
                    console.log("      -> Loading Memory to Reg A... (8 ticks)");
                    for(let i=0; i<WORD_SIZE; i++) {
                        this.regA.write(targetBank._memory[0]);
                        this.regA.tick();
                        targetBank.tick();
                    }
                    console.log(` Reg A after LDA: ${this.regA._memory.join('')}`);
                }
                this.dataMemoryClocks[bankId] = (this.dataMemoryClocks[bankId] + 1) % this.dataMemory.wordsPerBank;
                break;

            case this.OPCODES.LDP:
            case this.OPCODES.STP:
                const progMemAddr = Number(operand);
                console.log(`      -> Accessing Program Memory at absolute address ${progMemAddr}`);

                // --- Wait for the target word in program memory to arrive ---
                const numWords = this.memory.size / WORD_SIZE;
                const wordDistance = (progMemAddr - this.memoryClock + numWords) % numWords;
                const ticksToWait = wordDistance * WORD_SIZE;

                console.log(`      -> Aligning program memory. Current logical pos: ${this.memoryClock}, Target: ${progMemAddr}. Waiting ${ticksToWait} ticks.`);
                for (let i = 0; i < ticksToWait; i++) {
                    this.memory.tick();
                    this.totalTicks++;
                }
                this.memoryClock = progMemAddr;
                console.log(`      -> Word ${progMemAddr} arrived.`);

                if (opcode === this.OPCODES.LDP) {
                    console.log("      -> LDP: Loading Program Memory to Reg A...");
                    // Read the word from program memory into Register A.
                    // The delay line's natural refresh cycle will preserve the data as we read it.
                    for(let i=0; i<WORD_SIZE; i++) {
                        const bit = this.memory.tick();
                        this.regA.write(bit);
                        this.regA.tick();
                    }
                    console.log(` Reg A after LDP: ${this.regA._memory.join('')}`);
                } else { // STP
                    console.log("      -> STP: Storing Reg A to Program Memory...");
                    // To write, we must disable the refresh loop, inject our new bits,
                    // and then re-enable the refresh loop.
                    this.memory.enableRefresh = false;
                    for(let i=0; i<WORD_SIZE; i++) {
                        this.memory.write(this.regA._memory[0]);
                        this.regA.tick(); // Move to the next bit in Reg A
                        this.memory.tick(); // Move to the next bit position in memory
                    }
                    this.memory.enableRefresh = true;
                }

                // The memory head is now at the beginning of the *next* word.
                this.memoryClock = (this.memoryClock + 1) % numWords;
                break;

            case this.OPCODES.SHL:
                console.log("      -> SHL (Shift Left, 8 ticks)");
                // To shift left, we read each bit and write the previous bit.
                // The first bit written is a 0.
                this.regA.write(0); // Shift in a 0
                this.regA.tick();
                console.log(` Reg A after shift in: ${this.regA._memory.join('')}`);
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
                console.log(` Reg A after SHR: ${this.regA._memory.join('')}`);
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
                console.log(` Reg A after RND: ${this.regA._memory.join('')}`);
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
                console.log(` Reg A after MULADD: ${this.regA._memory.join('')}`);
                break;

            case this.OPCODES.ADD:
                console.log("      -> ADD... (8 ticks)");
                carry = 0;
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
                console.log(` Reg A after ADD: ${this.regA._memory.join('')}`);
                break;

            case this.OPCODES.COL: // *** NEW OPCODE LOGIC ***
                console.log("      -> COL (Collate)");
                // Phase 1: Fetch value from data memory into scratch register S
                const colBankId = Number(operand >> 4n); 
                const colWordId = Number(operand & 0x0Fn); 
                const colTargetBank = this.dataMemory.banks[colBankId];
                console.log(`         - Fetching from Mem[${colBankId},${colWordId}] into Scratch Reg`);
                while (this.dataMemoryClocks[colBankId] !== colWordId) { 
                    for (let i = 0; i < WORD_SIZE; i++) { 
                        colTargetBank.tick(); 
                    } 
                    this.dataMemoryClocks[colBankId] = (this.dataMemoryClocks[colBankId] + 1) % this.dataMemory.wordsPerBank; 
                }
                for(let i=0; i<WORD_SIZE; i++) { 
                    this.regS.write(colTargetBank._memory[0]); 
                    colTargetBank.tick(); 
                    this.regS.tick(); this.regA.tick(); this.regB.tick(); this.totalTicks++; 
                }
                this.dataMemoryClocks[colBankId] = (this.dataMemoryClocks[colBankId] + 1) % this.dataMemory.wordsPerBank;

                // Phase 2: Compute A = A + (S AND B)
                console.log("         - Computing A = A + (Scratch AND B)");
                carry = 0;
                for (let i = 0; i < WORD_SIZE; i++) {
                    const bitA = this.regA._memory[0];
                    const bitB = this.regB._memory[0];
                    const bitS = this.regS._memory[0];
                    const andResult = bitS & bitB;
                    const sum = bitA + andResult + carry;
                    this.regA.write(sum % 2);
                    carry = sum > 1 ? 1 : 0;
                    this.regA.tick(); this.regB.tick(); this.regS.tick(); this.totalTicks++;
                }
                console.log(` Reg A after COL: ${this.regA._memory.join('')}`);
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
                console.log(` Reg B after NEG: ${this.regB._memory.join('')}`);
                break;

            case this.OPCODES.JMP:
                const relativeTarget = Number(operand);
                // *** CHANGED: JMP now calculates absolute address from base address
                this.pc = this.baseAddress + relativeTarget;
                this.jumped = true;
                console.log(`      -> JMP to relative address ${relativeTarget} (absolute: ${this.pc})`);
                break;

            case this.OPCODES.JMPA: 
                this.pc = Number(operand);
                this.jumped = true;
                console.log(`      -> JMPA (Absolute) to address ${this.pc}`);
                break;


            case this.OPCODES.JZA:
                console.log("      -> JNA (Checking if A is Zero)");
                let isZero = true;
                for (let i = 0; i < WORD_SIZE; i++) { 
                    if (this.regA._memory[0] === 1) { isZero = false; } 
                    this.regA.tick(); this.totalTicks++; 
                }
                if (isZero) { this.pc = this.baseAddress + Number(operand); this.jumped = true; }
                break;

            case this.OPCODES.JNA:
                console.log("      -> JNA (Checking if A is Negative)");
                let msb = 0;
                for (let i = 0; i < WORD_SIZE; i++) {
                    const bit = this.regA._memory[0];
                    if (i === WORD_SIZE - 1) { // Is this the last bit (MSB)?
                        msb = bit;
                    }
                    this.regA.tick(); this.totalTicks++;
                }
                if (msb === 1) { 
                    this.pc = this.baseAddress + Number(operand); 
                    this.jumped = true; 
                    console.log(`      -> Condition MET (MSB=1). Jumping.`); 
                } 
                else { console.log("      -> Condition NOT MET (MSB=0). No jump."); }
                break;

            case this.OPCODES.PRA:
                let wordBuffer = [];
                for(let i=0; i<WORD_SIZE; i++) {
                    wordBuffer.push(this.regA._memory[0]);
                    this.regA.tick(); this.totalTicks++;
                }
                const valA = wordBuffer.reduce((acc, bit, i) => acc | (BigInt(bit) << BigInt(i)), 0n);
                const signBit = (valA >> BigInt(WORD_SIZE - 1)) & 1n;
                let finalValue = signBit === 1n ? -( (~valA & ((1n << BigInt(WORD_SIZE)) - 1n)) + 1n ) : valA;
                console.log(`\n>>> OUTPUT: ${finalValue}\n`);
                break;

            case this.OPCODES.NOP:
                console.log("      -> NOP");
                break;

            case this.OPCODES.HLT:
                this.state = 'HALTED';
                console.log("\n--- HALT ---");
                break;
                
            default:
                console.error(`\n! EXECUTION ERROR: Unknown Opcode ${opcode}`);
                this.state = 'HALTED';
        }
    }
}

// --- DEBUGGING DUMP UTILITY ---
function dumpState(cpu) {
    console.log(`\n--- STATE DUMP ---`);
    
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
function runSimulation(program) {
    const memory = new DelayLineMemory(MEMORY_SIZE);
    const dataMemory = new MemorySystem(NUM_DATA_BANKS, WORDS_PER_BANK, WORD_SIZE);
    const cpu = new SimpleCPU(memory,dataMemory);

    // --- PHASE 1: ASSEMBLE & LOAD (REVISED) ---
    console.log("--- Assembling and Loading Program ---");
    const originalLines = program.trim().split('\n').map(l => l.split(';')[0].trim()).filter(l => l);

    // --- PASS 1: Pre-processing and Label Mapping ---
    const labelMap = {};
    const instructions = [];
    let nextInstructionIndex = 0;

    originalLines.forEach(line => {
        const parts = line.split(':');
        const labelPart = parts[0].trim().toUpperCase();

        if (parts.length > 1) { // A label is present
            if (labelMap[labelPart]) {
                console.error(`\n! ASSEMBLY ERROR: Duplicate label '${labelPart}' defined.`);
                return;
            }
            // The label points to the *next* actual instruction that will be added.
            labelMap[labelPart] = nextInstructionIndex;
            console.log(`  Found label '${labelPart}' pointing to instruction index ${nextInstructionIndex}`);
        }

        const instructionPart = (parts.length > 1 ? parts[1] : parts[0]).trim();
        if (instructionPart) { // If there's an actual instruction on the line...
            instructions.push(instructionPart);
            nextInstructionIndex++;
        }
    });

    // --- PASS 2: Assemble using the clean instruction list and map ---
    const numInstructions = instructions.length;
    const numWords = memory.size / WORD_SIZE;
    const programBaseAddress = numWords - numInstructions;
    console.log(`--- Label Map Complete ---`, labelMap);
    console.log(`Program has ${numInstructions} instructions. Base address: ${programBaseAddress}`);

    const programLengthInBits = numInstructions * WORD_SIZE;
    let initialTicks = 0;
    memory.enableRefresh = false;

    instructions.forEach((line, index) => {
        const absoluteAddress = programBaseAddress + index;
        const parts = line.trim().split(/[\s,]+/);
        let instructionWord = 0n;
        const op = parts[0].toUpperCase();

        // (The code for assembling the instruction word is the same, but we show it for completeness)
        if (!cpu.OPCODES[op]) {
            console.error(`\n! ASSEMBLY ERROR: Unknown Instruction '${op}'`);
            return;
        }
        const opcode = BigInt(cpu.OPCODES[op]);
        let operand = 0n;
        let word = 0n;

        if (['JMP', 'JMPA', 'JNA', 'JZA', 'LDP', 'STP'].includes(op)) {
            const operandStr = parts[1] ? parts[1].toUpperCase() : '0';
            if (labelMap[operandStr] !== undefined) {
                const labelIndex = labelMap[operandStr];
                if (['JMP', 'JNA', 'JZA'].includes(op)) {
                    operand = BigInt(labelIndex);
                    console.log(`    [${absoluteAddress}] Assembling ${op} to label ${operandStr} (index ${labelIndex}) -> relative offset ${operand}`);
                } else {
                    const labelAbsoluteAddr = programBaseAddress + labelIndex;
                    operand = BigInt(labelAbsoluteAddr);
                    console.log(`    [${absoluteAddress}] Assembling ${op} to label ${operandStr} (index ${labelIndex}) -> absolute address ${operand}`);
                }
            } else {
                operand = BigInt(parseInt(operandStr));
            }
            instructionWord = (opcode << BigInt(WORD_SIZE - 8)) | operand;
        } else if (['STO', 'LDA', 'STC', 'COL'].includes(op)) {
            operand = BigInt(parts[1] ? parseInt(parts[1]) : 0);
            word = BigInt(parts[2] ? parseInt(parts[2]) : 0);
            const combinedAddress = (operand << 4n) | word;
            instructionWord = (opcode << BigInt(WORD_SIZE-8)) | combinedAddress;
        } else if (['LAI', 'LBI', 'RND', 'MLA', 'LEA', 'LEB'].includes(op)) {
            const operandStr = parts[1] ? parts[1].toUpperCase() : '0';
            if (labelMap[operandStr] !== undefined) {
                const labelIndex = labelMap[operandStr];
                const labelAbsoluteAddr = programBaseAddress + labelIndex;
                operand = BigInt(labelAbsoluteAddr);
                console.log(`    [${absoluteAddress}] Assembling ${op} to label ${operandStr} (index ${labelIndex}) -> absolute address ${operand}`);
            } else {
                operand = BigInt(parseInt(operandStr));
                console.log(`    [${absoluteAddress}] Assembling ${op} with immediate value ${operand}`);
            }
            instructionWord = (opcode << BigInt(WORD_SIZE - 8)) | operand;
        } else {
            instructionWord = opcode << BigInt(WORD_SIZE - 8);
        }

        for (let i = BigInt(WORD_SIZE - 1); i >= 0n; i--) {
            memory.write(Number((instructionWord >> i) & 1n));
            memory.tick();
            initialTicks++;
        }
    });
    memory.enableRefresh = true;
    console.log(`Program loaded in ${initialTicks} ticks. Physical base address: Word ${programBaseAddress}`);

    dumpState(cpu);

    // --- PHASE 2: WAIT FOR LATENCY (unchanged) ---
    const ticksToWaitForData = MEMORY_SIZE - programLengthInBits;
    console.log(`\n--- Waiting for memory stabilisation (${ticksToWaitForData} ticks)... ---`);
    for (let i = 0; i < ticksToWaitForData; i++) {
        memory.tick();
        initialTicks++;
    }
    console.log("Wait complete. Memory ready for execution.");

    // --- PHASE 3: EXECUTION (unchanged) ---
    cpu.baseAddress = programBaseAddress;
    cpu.pc = programBaseAddress;
    cpu.memoryClock = programBaseAddress;
    cpu.totalTicks = initialTicks;

    console.log("\n--- Starting Execution ---");
    let cycleLimit = 40; // Increased limit
    while (cpu.state === 'RUNNING' && cycleLimit > 0) {
        cpu.step();
        cycleLimit--;
    }

    if (cycleLimit === 0) {
        console.log("\n--- Cycle limit reached. Halting simulation. ---");
    }

    console.log("\n\n=== SIMULATION FINISHED ===");
    console.log(`Total Ticks: ${cpu.totalTicks}`);
}

// Program with a label for an infinite loop
const program = `
    ; --- Wheeler Jump Demonstration ---
        ; Goal: Call a subroutine that adds 42 to the value in Reg A.
        ; The subroutine will use the Wheeler Jump to return.

        ; --- Main Program ---
        LAI, 100               ; Load 100 into Register A to start.
        STO, 0, 2              ; Store Reg A to temp memory [0,2] for subroutine use.
        LEB, RETURN_HERE       ; Load the ABSOLUTE ADDRESS of our return point into Reg B.
        
        ; Store return address from B into A, which is the convention for the call
        STB, 0, 0              ; Store B to temp memory
        LDA, 0, 0              ; Load it back to A
        
        JMP, ADD_42_SUB        ; Call the subroutine.

    RETURN_HERE:
        PRA                    ; Upon return, print the result. Should be 142.
        HLT                    ; Halt.

        ; --- Subroutine: ADD_42_SUB ---
        ; Expects the return address in Register A.
    ADD_42_SUB:
        STO, 0, 1              ; Save the return address (from A) into temp memory [0,1].
        
        ; Now, construct the return instruction.
        LDP, JUMP_TEMPLATE     ; Load the 'JMP 0' instruction into Reg A.
        LDB, 0, 1              ; Load the return address from temp memory into Reg B.
        ADD                    ; Reg A = (JMP 0 opcode) + (return address). A now holds 'JMP RETURN_HERE'.
        
        STP, SUB_JUMP_SLOT     ; *** THE WHEELER JUMP ***
                               ; Overwrite the subroutine's own final instruction.

        ; --- Actual work of the subroutine ---
        LDA, 0, 2              ; Load original value (100) back into A
        LBI, 42                ; Load 42 into B
        ADD                    ; A = A + B (100 + 42)
        STO, 0, 2              ; Store result (142) in temp memory
        
    SUB_JUMP_SLOT:
        JMPA, 0                 ; This instruction will be modified to become 'JMP RETURN_HERE'.

        ; --- Data / Template for the subroutine ---
    JUMP_TEMPLATE:
        JMPA, 0                 ; A template instruction the subroutine can use to build its return jump.
`;

runSimulation(program);