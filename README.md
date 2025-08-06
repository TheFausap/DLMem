# DL Memory

## **1. Architecture**

* **40-bit Word Size**: The `WORD_SIZE` constant has been increased from 8 to 40. All registers (`regA`, `regB`, `regS`) and memory words are now 40 bits long.
* **Program Memory**: The program memory (256W) is separated from the data memory.
* **Data Memory**: 16 banks of 16W of external memory
* **Instruction Format**: Despite the larger word size, the instruction format retains a familiar structure. An instruction is a 40-bit word where:
    * The **Opcode** occupies the 8 most significant bits.
    * The **Operand** space consists of the remaining 32 bits. This provides a large range for immediate values or memory addresses.

## **2. The Assembler and Instruction Set**

The built-in assembler, located within the `runSimulation` function, has been updated to handle the new architecture and instructions. It correctly constructs the 40-bit instruction words by shifting the 8-bit opcode to the correct position and combining it with the operands.

| Mnemonic | Opcode | Description | Operand Format |
| :--- | :--- | :--- | :--- |
| `LAI value` | `0b00000001` | **Load A Immediate**: Loads a value into register A. | `value` (up to 32 bits) |
| `LBI value` | `0b00000010` | **Load B Immediate**: Loads a value into register B. | `value` (up to 32 bits) |
| `ADD` | `0b00000011` | **Add**: Adds register B to register A. The result is in A. | None |
| `PRA` | `0b00000100` | **Print A**: Prints the value of register A. | None |
| `NEG` | `0b00000101` | **Negate**: Negates the value of register B using two's complement. | None |
| `STO bank, word` | `0b00000110` | **Store A**: Saves the value of register A to data memory. | `bank` (4 bits), `word` (4 bits) |
| `LDA bank, word` | `0b00000111` | **Load A**: Loads a value from data memory into register A. | `bank` (4 bits), `word` (4 bits) |
| `SHL` | `0b00001000` | **Shift Left A**: Performs a logical left shift on register A. | None |
| `SHR` | `0b00001001` | **Shift Right A**: Performs a logical right shift on register A. | None |
| `HLT` | `0b00001111` | **Halt**: Stops the program's execution. | None |

## **3. Execution Logic (`fetchAndExecute`)**

* **Fetch**: The CPU reads a full 40 bits from the main `DelayLineMemory` to fetch one instruction.
* **Decode**: The fetched 40-bit `BigInt` is parsed to extract the 8-bit opcode and the 32-bit operand.
* **Execute**: The logic for each instruction now operates on 40-bit data. The new shift instructions are of particular interest:
    * `SHL` (Shift Left): This instruction is implemented very efficiently. By writing a `0` to the register and then performing a single `tick()`, it uses the natural behavior of the delay line to shift all bits one position to the left and introduce a zero at the least significant bit position.
    * `SHR` (Shift Right): A right shift is more complex for a simple delay line. The CPU uses the internal scratch register (`regS`) to first read and temporarily store all bits from `regA`. It then clears `regA`, shifts in a `0`, and writes the bits from `regS` back into `regA`, effectively reversing their order to simulate a right shift. This demonstrates a clever workaround for a hardware limitation.
    * `PRA` (Print A): The logic for printing a signed number appears to contain a bug or an artifact from the previous 8-bit version. It checks the 8th bit (`valA & 0x80`) to determine if the number is negative, which is incorrect for a 40-bit value. For small positive numbers, this will work, but it will fail to correctly print large or negative 40-bit numbers.

## **4. Analysis of the Example Program**

The example program provided in `runSimulation` demonstrates the use of the new instructions.

1.  `LAI, 20` / `LBI, 7`: Loads 20 into `regA` and 7 into `regB`.
2.  `NEG`: Negates `regB`, making it -7.
3.  `ADD`: Adds `regB` to `regA`, resulting in `A = 13`.
4.  `STO, 0, 1`: Stores the value `13` into data memory at bank 0, word 1.
5.  `LAI, 99` / `STO, 0, 2`: Loads `99` into `regA` and stores it at bank 0, word 2.
6.  `LDA, 0, 1` / `PRA`: Loads `13` back into `regA` and prints it. **Output: `13`**.
7.  `LDA, 0, 2`: Loads `99` back into `regA`.
8.  `SHL`: Shifts `regA` left by one bit. The value `99` (`0b1100011`) becomes `198` (`0b11000110`).
9.  `PRA`: Prints the new value of `regA`. **Output: `198`**.
10. `HLT`: Halts the simulation.

