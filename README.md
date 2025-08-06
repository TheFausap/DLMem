# Simple CPU Simulator (DL_Mem)

This document provides a comprehensive overview and manual for the `cpu2m3.js` script, a simulator for a simple, vintage-style CPU. The architecture is inspired by early computers like the EDVAC and demonstrates concepts like delay-line memory, a single-address instruction set, and advanced programming techniques such as self-modifying code for subroutine calls.

The simulation is written in Javascript and is designed to be run from a Node.js environment. It includes a two-pass assembler that can handle labels, making the assembly code more readable and maintainable.

## Key Features

  * **Delay-Line Memory Simulation:** Accurately models the rotational latency of historic delay-line memory, where accessing a specific word requires waiting for it to "circulate" to the read/write head.
  * **Banked Data Memory:** Features a separate, banked memory system for data storage, distinct from the main program memory.
  * **Rich Instruction Set:** Implements a variety of instructions for arithmetic (`ADD`, `NEG`), data transfer (`LDA`, `STO`), logic (`SHL`, `SHR`), and control flow (`JMP`, `JZA`).
  * **Two-Pass Assembler:** The simulator first reads the assembly program to map all labels to their corresponding memory addresses before assembling the final machine code. This allows for forward-references in jumps and data loads.
  * **Wheeler Jump Implementation:** The example program demonstrates the "Wheeler Jump," a classic technique where a subroutine modifies its own final instruction to return to the caller.
  * **Detailed Logging:** The console output provides a tick-by-tick trace of the CPU's state, including program counter (PC) value, instruction register (IR) contents, and register states, making it an excellent tool for learning and debugging.

-----

## How to Run the Simulation

To run the simulation, you need to have **Node.js** installed on your system.

1.  Save the code as `cpu2m3.js`.
2.  Open your terminal or command prompt.
3.  Navigate to the directory where you saved the file.
4.  Run the script using the following command:
    ```bash
    node cpu2m3.js
    ```

The simulator will start, assemble the hardcoded program, and begin execution, printing detailed status updates to the console.

-----

## CPU Architecture

The simulated CPU has a simple architecture reminiscent of early computing machinery.

### Memory

The simulation uses two distinct memory systems.

  * **Main (Program) Memory:** A single `DelayLineMemory` instance with a size of **10240 bits** (`MEMORY_SIZE`). This is organized into 256 words of 40 bits each (`WORD_SIZE`). Both instructions and data can be stored here. Accessing any word requires waiting for it to align with the read/write head, which is a core part of the simulation's timing.
  * **Data Memory:** A `MemorySystem` composed of **16 banks**, with each bank containing **16 words** (40 bits each). This memory is intended for general-purpose data storage and is accessed via instructions like `STO` (Store) and `LDA` (Load).

### Registers

The CPU contains a few 40-bit registers, which are also implemented as delay-line memories.

  * `regA`: The primary accumulator. It is used for arithmetic operations and as a source/destination for data transfers.
  * `regB`: A secondary register, often used to hold the second operand for arithmetic operations like `ADD`.
  * `regS`: An internal scratchpad register used by the CPU to perform complex instructions like `SHR` (Shift Right) and `COL` (Collate). It is not directly accessible by the programmer.
  * `ir` (Instruction Register): Holds the current 40-bit instruction being executed.
  * `pc` (Program Counter): Holds the memory address of the next instruction to be fetched.
  * `baseAddress`: Used by relative jump instructions (`JMP`, `JNA`, `JZA`) to calculate the absolute jump target.

-----

## Assembly Language and Instruction Set

The simulator assembles a program written in a simple assembly language. An instruction consists of a mnemonic and, optionally, one or more operands.

### Syntax and Labels

The assembler supports labels to make writing programs easier. A label is a name followed by a colon (`:`) that marks a specific line of code.

**Example:**

```assembly
; This is a label
MY_LABEL:
    LAI, 10      ; Load 10 into Register A
    JMP, MY_LABEL ; Jump back to the line marked by MY_LABEL
```

### Addressing Modes

  * **Immediate:** The operand is a literal value (e.g., `LAI, 100`).
  * **Direct/Absolute:** The operand is a fixed memory address (e.g., `JMPA, 245`).
  * **Relative:** The operand is an offset from the `baseAddress` register. This is used for relocatable code (e.g., `JMP, 5`).
  * **Data Memory:** Operands for `STO` and `LDA` are specified as `bank, word` (e.g., `STO, 0, 1` stores Reg A into bank 0, word 1).

### Instruction Set (ISA)

The table below lists all the instructions supported by the CPU. The opcode is an 8-bit value.

| Mnemonic | Opcode (binary) | Description |
| :--- | :--- | :--- |
| `NOP` | `00000000` | No Operation. |
| `LAI` | `00000001` | **L**oad **A** **I**mmediate: `regA = operand`. |
| `LBI` | `00000010` | **L**oad **B** **I**mmediate: `regB = operand`. |
| `ADD` | `00000011` | **Add**: `regA = regA + regB`. |
| `PRA` | `00000100` | **P**rint **R**egister **A**: Prints the signed integer value of `regA`. |
| `NEG` | `00000101` | **Neg**ate: `regB = -regB` (Two's Complement). |
| `STO` | `00000110` | **Sto**re **A**: `dataMemory[bank,word] = regA`. |
| `LDA` | `00000111` | **L**oa**d** **A**: `regA = dataMemory[bank,word]`. |
| `SHL` | `00001000` | **Sh**ift **L**eft `regA` by 1 bit. |
| `SHR` | `00001001` | **Sh**ift **R**ight `regA` by 1 bit. |
| `RND` | `00001010` | **R**ou**nd** `regA`: Clears the N least significant bits of `regA`. |
| `MLA` | `00001011` | **M**u**l**tiply and **A**dd: `regA = regA + regB` for N loops. |
| `STC` | `00010000` | **St**ore and **C**lear: `dataMemory[bank,word] = regA`, then `regA = 0`. |
| `JMP` | `00010001` | **J**u**mp** (Relative): `pc = baseAddress + operand`. |
| `JMPA`| `00011011` | **J**u**mp** **A**bsolute: `pc = operand`. |
| `JZA` | `00010010` | **J**ump if **Z**ero **A**: Jumps (relative) if `regA` is zero. |
| `JNA` | `00010011` | **J**ump if **N**egative **A**: Jumps (relative) if `regA` is negative (MSB is 1). |
| `COL` | `00010100` | **Col**late: `regA = regA + (dataMemory[bank,word] AND regB)`. |
| `STB` | `00010101` | **St**ore **B**: `dataMemory[bank,word] = regB`. |
| `LDB` | `00010110` | **L**oa**d** **B**: `regB = dataMemory[bank,word]`. |
| `LDP` | `00010111` | **L**oad **P**rogram Memory: `regA = programMemory[address]`. |
| `STP` | `00011000` | **St**ore to **P**rogram Memory: `programMemory[address] = regA`. |
| `LEA` | `00011001` | **L**oad **E**ffective **A**ddress to **A**: `regA = address`. |
| `LEB` | `00011010` | **L**oad **E**ffective **A**ddress to **B**: `regB = address`. |
| `HLT` | `00001111` | **Halt**: Stops the CPU. |

-----

## The Wheeler Jump Explained

The included sample program is a demonstration of the **Wheeler Jump**, a method for handling subroutine returns that was developed by David Wheeler for the Cambridge EDSAC computer. Since the CPU lacks a modern stack for storing return addresses, the subroutine must manually construct and modify its own return instruction.

Here is a step-by-step breakdown of how the sample program uses this technique to call a subroutine that adds 42 to a number.

1.  **Setup in Main Program:**

      * `LAI, 100`: `regA` is loaded with the initial value of 100.
      * `LEB, RETURN_HERE`: The *absolute address* of the `RETURN_HERE` label is loaded into `regB`. This is where the subroutine needs to jump back to.
      * `STB, 0, 0` and `LDA, 0, 0`: The return address is passed to the subroutine via `regA`, which was a common convention.
      * `JMP, ADD_42_SUB`: The program calls the subroutine.

2.  **Execution in the Subroutine (`ADD_42_SUB`):**

      * `STO, 0, 1`: The subroutine first saves the return address (which is in `regA`) into temporary data memory at `[0,1]`.
      * `LDP, JUMP_TEMPLATE`: It loads a template instruction (`JMPA, 0`) from memory into `regA`.
      * `LDB, 0, 1`: It loads the saved return address from `[0,1]` into `regB`.
      * `ADD`: It adds `regA` and `regB`. The result is the opcode for `JMPA` combined with the `RETURN_HERE` address. `regA` now holds a fully formed instruction: `JMPA, RETURN_HERE`.

3.  **The "Wheeler Jump" Moment:**

      * `STP, SUB_JUMP_SLOT`: This is the crucial step. The `STP` (Store to Program Memory) instruction takes the `JMPA, RETURN_HERE` instruction from `regA` and writes it into the program's own memory, overwriting the `JMPA, 0` placeholder at the `SUB_JUMP_SLOT` label.

4.  **Subroutine Work and Return:**

      * The subroutine proceeds with its actual task: it loads the original value (100), adds 42, and stores the result.
      * It then reaches the `SUB_JUMP_SLOT` instruction. Because of the previous `STP` operation, this instruction is no longer `JMPA, 0`; it is now `JMPA, RETURN_HERE`.
      * Executing this modified instruction causes the CPU to jump back to the `RETURN_HERE` label in the main program.

5.  **Conclusion:**

      * `PRA`: The main program prints the value in `regA`, which is now 142.
      * `HLT`: The simulation halts.

This technique of self-modifying code was essential for implementing fundamental programming structures on early computer architectures that lacked more advanced hardware features.