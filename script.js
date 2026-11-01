const OPCODES = {
  "0000": "LDA",
  "0001": "ADD",
  "0010": "SUB",
  "1110": "OUT",
  "1111": "HLT"
};

const CONTROL_SIGNALS = {
  "0000": "PC → MAR, RAM → IR, RAM → A",
  "0001": "RAM → B, ALU → A",
  "0010": "RAM → B, ALU(−) → A",
  "1110": "A → Output Register",
  "1111": "HALT"
};

let ram = new Array(16).fill(0);
let pc = 0;
let mar = 0;
let ir = 0;
let accumulator = 0;
let bRegister = 0;
let outputRegister = 0;
let halted = true;
let running = false;
let runTimer = null;
let awaitingFetch = true;
const elements = {
  dataA: document.getElementById("dataA"),
  dataB: document.getElementById("dataB"),
  dataC: document.getElementById("dataC"),
  loadBtn: document.getElementById("loadBtn"),
  stepBtn: document.getElementById("stepBtn"),
  runBtn: document.getElementById("runBtn"),
  resetBtn: document.getElementById("resetBtn"),
  clockSpeed: document.getElementById("clockSpeed"),
  clockLabel: document.getElementById("clockLabel"),
  status: document.getElementById("status"),
  pcValue: document.getElementById("pcValue"),
  marValue: document.getElementById("marValue"),
  irValue: document.getElementById("irValue"),
  aValue: document.getElementById("aValue"),
  bValue: document.getElementById("bValue"),
  outputValue: document.getElementById("outputValue"),
  opcodeValue: document.getElementById("opcodeValue"),
  operandValue: document.getElementById("operandValue"),
  instructionName: document.getElementById("instructionName"),
  controlSignals: document.getElementById("controlSignals"),
  ramBody: document.getElementById("ramBody"),
  busMessage: document.getElementById("busMessage"),
  ledRow: document.getElementById("ledRow"),
  decimalOutput: document.getElementById("decimalOutput"),
  hexOutput: document.getElementById("hexOutput")
};

function toBinary(value, bits) {
  return value.toString(2).padStart(bits, "0");
}

function toHex(value) {
  return value.toString(16).toUpperCase().padStart(2, "0") + "H";
}

function clampByte(value) {
  return value & 0xff;
}



function renderRam(activeAddress = null) {
  elements.ramBody.innerHTML = "";

  for (let address = 0; address < 16; address++) {
    const value = ram[address];
    const row = document.createElement("tr");

    if (address === activeAddress) row.classList.add("active");
    if (address < 5) row.classList.add("program");

    const meaning =
      address < 5
        ? OPCODES[toBinary(value >> 4, 4)] ?? "UNKNOWN"
        : `DATA ${value}`;

    row.innerHTML = `
      <td>${address.toString(16).toUpperCase()}H</td>
      <td>${toBinary(value, 8)}</td>
      <td>${toHex(value)}</td>
      <td>${meaning}</td>
    `;

    elements.ramBody.appendChild(row);
  }
}

function activateRegister(id) {
  document.querySelectorAll(".register").forEach((node) => {
    node.classList.remove("active");
  });

  if (id) {
    document.getElementById(`reg-${id}`).classList.add("active");
  }
}

function activateBusNodes(names) {
  document.querySelectorAll(".bus-node").forEach((node) => {
    node.classList.remove("active");
  });

  names.forEach((name) => {
    const node = document.querySelector(`[data-node="${name}"]`);
    if (node) node.classList.add("active");
  });
}

function setBusMessage(message) {
  elements.busMessage.textContent = message;
}

function render(activeAddress = null, activeRegister = null, busNodes = []) {
  elements.pcValue.textContent = toBinary(pc, 4);
  elements.marValue.textContent = toBinary(mar, 4);
  elements.irValue.textContent = toBinary(ir, 8);
  elements.aValue.textContent = toBinary(accumulator, 8);
  elements.bValue.textContent = toBinary(bRegister, 8);
  elements.outputValue.textContent = toBinary(outputRegister, 8);

  const opcode = toBinary(ir >> 4, 4);
  const operand = toBinary(ir & 0x0f, 4);
  const instruction = OPCODES[opcode] ?? "UNKNOWN";

  elements.opcodeValue.textContent = halted && ir === 0 ? "----" : opcode;
  elements.operandValue.textContent = halted && ir === 0 ? "--" : operand;
  elements.instructionName.textContent = halted && ir === 0 ? "IDLE" : instruction;
  elements.controlSignals.textContent =
    halted && ir === 0 ? "—" : CONTROL_SIGNALS[opcode] ?? "Unknown opcode";

  elements.decimalOutput.textContent = outputRegister;
  elements.hexOutput.textContent = toHex(outputRegister);

  document.querySelectorAll(".led").forEach((led, index) => {
    const bit = 7 - index;
    led.classList.toggle("on", Boolean((outputRegister >> bit) & 1));
  });

  renderRam(activeAddress);
  activateRegister(activeRegister);
  activateBusNodes(busNodes);
}

function loadProgram() {
  const a = validateData(elements.dataA.value, "Data A");
  const b = validateData(elements.dataB.value, "Data B");
  const c = validateData(elements.dataC.value, "Data C");

  if (a === null || b === null || c === null) return;

  ram = new Array(16).fill(0);
  ram[0] = 0b00001001; // LDA 9H
  ram[1] = 0b00011010; // ADD AH
  ram[2] = 0b00101011; // SUB BH
  ram[3] = 0b11101111; // OUT
  ram[4] = 0b11111111; // HLT

  ram[9] = a;  // 9H
  ram[10] = b; // AH
  ram[11] = c; // BH

  resetRegisters(false);

  elements.status.textContent =
    `Program loaded. Computing ${a} + ${b} − ${c}. Press Step or Run.`;

  render(0, "pc", ["pc"]);
}

function validateData(raw, label) {
  const value = Number(raw);

  if (!Number.isInteger(value) || value < 0 || value > 255) {
    elements.status.textContent =
      `${label} must be an integer from 0 to 255.`;
    return null;
  }

  return value;
}

function resetRegisters(clearRam = true) {
  pc = 0;
  mar = 0;
  ir = 0;
  accumulator = 0;
  bRegister = 0;
  outputRegister = 0;
  halted = false;
  awaitingFetch = true; // <-- add this line

  stopRun();

  if (clearRam) {
    ram = new Array(16).fill(0);
  }

  elements.status.textContent = "Simulator reset.";
  render(0, "pc", ["pc"]);
}

function fetchPhase() {
  mar = pc;
  ir = ram[mar];
  pc = (pc + 1) & 0x0f;

  awaitingFetch = false;

  render(mar, "ir", ["pc", "mar", "ram", "ir"]);
  setBusMessage(
    `FETCH: PC ${toBinary(mar, 4)} → MAR; RAM[${toHex(mar)}] → IR; PC incremented.`
  );
}

function executePhase() {
  const opcode = ir >> 4;
  const operand = ir & 0x0f;

  switch (opcode) {
    case 0b0000: // LDA
      mar = operand;
      accumulator = ram[mar];
      render(mar, "a", ["mar", "ram", "a"]);
      setBusMessage(`LDA: RAM[${toHex(mar)}] → W-Bus → Accumulator.`);
      break;

    case 0b0001: // ADD
      mar = operand;
      bRegister = ram[mar];
      accumulator = clampByte(accumulator + bRegister);
      render(mar, "a", ["mar", "ram", "b", "alu", "a"]);
      setBusMessage(`ADD: RAM[${toHex(mar)}] → B; ALU computes A + B → Accumulator.`);
      break;

    case 0b0010: // SUB
      mar = operand;
      bRegister = ram[mar];
      accumulator = clampByte(accumulator - bRegister);
      render(mar, "a", ["mar", "ram", "b", "alu", "a"]);
      setBusMessage(`SUB: RAM[${toHex(mar)}] → B; ALU computes A − B using 2's complement → Accumulator.`);
      break;

    case 0b1110: // OUT
      outputRegister = accumulator;
      render(null, "output", ["a", "output"]);
      setBusMessage("OUT: Accumulator → W-Bus → Output Register.");
      break;

    case 0b1111: // HLT
      halted = true;
      stopRun();
      render(null, null, []);
      setBusMessage("HLT: Processor halted.");
      elements.status.textContent =
        `Execution halted. Output: ${outputRegister} decimal, ${toHex(outputRegister)}, ${toBinary(outputRegister, 8)}.`;
      return;

    default:
      halted = true;
      stopRun();
      elements.status.textContent = `Unknown opcode ${toBinary(opcode, 4)}. Execution halted.`;
      render(null, null, []);
      return;
  }

  awaitingFetch = true;

  if (pc === 0) {
    halted = true;
    stopRun();
    elements.status.textContent = "Program counter wrapped around; execution stopped.";
  }
}




function step() {
  if (halted) {
    elements.status.textContent = "The processor is halted. Load a program or reset.";
    return;
  }

  if (awaitingFetch) {
    fetchPhase();
  } else {
    executePhase();
  }
}

function run() {
  if (halted) {
    elements.status.textContent = "Load a program before running.";
    return;
  }

  if (running) {
    stopRun();
    return;
  }

  running = true;
  elements.runBtn.textContent = "Stop";

  const delay = Number(elements.clockSpeed.value);
  runTimer = setInterval(() => {
    step();

    if (halted) {
      stopRun();
    }
  }, delay);
}

function stopRun() {
  running = false;

  if (runTimer) {
    clearInterval(runTimer);
    runTimer = null;
  }

  elements.runBtn.textContent = "Run";
}

elements.loadBtn.addEventListener("click", loadProgram);
elements.stepBtn.addEventListener("click", step);
elements.runBtn.addEventListener("click", run);
elements.resetBtn.addEventListener("click", () => resetRegisters(true));

elements.clockSpeed.addEventListener("input", () => {
  elements.clockLabel.textContent = `${elements.clockSpeed.value} ms`;

  if (running) {
    stopRun();
    run();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  render(0, "pc", ["pc"]);
});