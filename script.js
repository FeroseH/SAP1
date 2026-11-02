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

const ADDRESS_A = 0x9; // 9H
const ADDRESS_B = 0xa; // AH
const ADDRESS_C = 0xb; // BH

const elements = {
  dataA: document.getElementById("dataA"),
  dataB: document.getElementById("dataB"),
  dataC: document.getElementById("dataC"),
  operationB: document.getElementById("operationB"),
  operationC: document.getElementById("operationC"),
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
  dataPacket: document.getElementById("dataPacket"),
  ledRow: document.getElementById("ledRow"),
  decimalOutput: document.getElementById("decimalOutput"),
  hexOutput: document.getElementById("hexOutput")
};

const busPositions = {
  pc: 8,
  mar: 20.5,
  ram: 33,
  ir: 45.5,
  a: 58,
  b: 70.5,
  alu: 83,
  output: 95.5
};

let busQueue = [];
let busBusy = false;

function toBinary(value, bits) {
  return value.toString(2).padStart(bits, "0");
}

function toHex(value) {
  return value.toString(16).toUpperCase().padStart(2, "0") + "H";
}

function clampByte(value) {
  return ((value % 256) + 256) % 256;
}

function validateData(raw, label) {
  const value = Number(raw);

  if (!Number.isInteger(value) || value < 0 || value > 255) {
    elements.status.textContent = `${label} must be an integer from 0 to 255.`;
    return null;
  }

  return value;
}

function getStation(name) {
  return document.querySelector(`.bus-station[data-node="${name}"]`);
}

function clearBusEffects() {
  document.querySelectorAll(".bus-station").forEach((station) => {
    station.classList.remove("active", "receiving");
  });
}

function animateDataTransfer(source, destination, message, callback = null) {
  busQueue.push({
    source,
    destination,
    message,
    callback
  });

  if (!busBusy) {
    processBusQueue();
  }
}

function processBusQueue() {
  if (busQueue.length === 0) {
    busBusy = false;
    return;
  }

  busBusy = true;

  const transfer = busQueue.shift();
  const packet = elements.dataPacket;
  const sourceStation = getStation(transfer.source);
  const destinationStation = getStation(transfer.destination);

  if (!packet || !sourceStation || !destinationStation) {
    processBusQueue();
    return;
  }

  clearBusEffects();
  sourceStation.classList.add("active");

  packet.classList.remove("traveling");
  packet.style.left = `${busPositions[transfer.source]}%`;
  packet.style.opacity = "1";

  setBusMessage(transfer.message);

  requestAnimationFrame(() => {
    packet.classList.add("traveling");
    packet.style.left = `${busPositions[transfer.destination]}%`;
  });

  setTimeout(() => {
    destinationStation.classList.add("active", "receiving");

    if (transfer.callback) {
      transfer.callback();
    }
  }, 800);

  setTimeout(() => {
    packet.classList.remove("traveling");
    packet.style.opacity = "0";
    processBusQueue();
  }, 1100);
}

function setBusMessage(message) {
  elements.busMessage.textContent = message;
}

function renderRam(activeAddress = null) {
  elements.ramBody.innerHTML = "";

  for (let address = 0; address < 16; address++) {
    const value = ram[address];
    const row = document.createElement("tr");

    if (address === activeAddress) {
      row.classList.add("active");
    }

    if (address < 5) {
      row.classList.add("program");
    }

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

function render(activeAddress = null, activeRegister = null) {
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

  document.querySelectorAll(".register").forEach((node) => {
    node.classList.remove("active");
  });

  if (activeRegister) {
    document.getElementById(`reg-${activeRegister}`).classList.add("active");
  }
}

function loadProgram() {
  const a = validateData(elements.dataA.value, "Data A");
  const b = validateData(elements.dataB.value, "Data B");
  const c = validateData(elements.dataC.value, "Data C");

  const operationB = elements.operationB.value;
  const operationC = elements.operationC.value;

  if (a === null || b === null || c === null) {
    return;
  }

  ram = new Array(16).fill(0);

  ram[0] = (0b0000 << 4) | ADDRESS_A; // LDA 9H

  ram[1] = operationB === "ADD"
    ? (0b0001 << 4) | ADDRESS_B // ADD AH
    : (0b0010 << 4) | ADDRESS_B; // SUB AH

  ram[2] = operationC === "ADD"
    ? (0b0001 << 4) | ADDRESS_C // ADD BH
    : (0b0010 << 4) | ADDRESS_C; // SUB BH

  ram[3] = 0b11101111; // OUT
  ram[4] = 0b11111111; // HLT

  ram[ADDRESS_A] = a;
  ram[ADDRESS_B] = b;
  ram[ADDRESS_C] = c;

  resetRegisters(false);

  const symbolB = operationB === "ADD" ? "+" : "−";
  const symbolC = operationC === "ADD" ? "+" : "−";

  elements.status.textContent =
    `Program loaded: ${a} ${symbolB} ${b} ${symbolC} ${c}. Press Step or Run.`;

  render(0, "pc");
}

function resetRegisters(clearRam = true) {
  pc = 0;
  mar = 0;
  ir = 0;
  accumulator = 0;
  bRegister = 0;
  outputRegister = 0;
  halted = false;
  awaitingFetch = true;

  stopRun();
  clearBusEffects();

  busQueue = [];
  busBusy = false;

  if (elements.dataPacket) {
    elements.dataPacket.classList.remove("traveling");
    elements.dataPacket.style.opacity = "0";
    elements.dataPacket.style.left = `${busPositions.pc}%`;
  }

  if (clearRam) {
    ram = new Array(16).fill(0);
  }

  elements.status.textContent = "Simulator reset.";
  render(0, "pc");
}

function fetchPhase() {
  mar = pc;
  ir = ram[mar];
  pc = (pc + 1) & 0x0f;
  awaitingFetch = false;

  render(mar, "ir");

  animateDataTransfer(
    "pc",
    "mar",
    `FETCH: PC sends address ${toBinary(mar, 4)} to MAR.`,
    () => {
      animateDataTransfer(
        "ram",
        "ir",
        `FETCH: RAM[${toHex(mar)}] sends instruction ${toBinary(ir, 8)} to IR.`
      );
    }
  );
}

function executePhase() {
  const opcode = ir >> 4;
  const operand = ir & 0x0f;

  switch (opcode) {
    case 0b0000: // LDA
      mar = operand;
      accumulator = ram[mar];
      render(mar, "a");

      animateDataTransfer(
        "ram",
        "a",
        `LDA: RAM[${toHex(mar)}] sends ${accumulator} to the Accumulator.`
      );
      break;

    case 0b0001: // ADD
      mar = operand;
      bRegister = ram[mar];
      accumulator = clampByte(accumulator + bRegister);
      render(mar, "a");

      animateDataTransfer(
        "ram",
        "b",
        `ADD: RAM[${toHex(mar)}] sends ${bRegister} to the B Register.`,
        () => {
          animateDataTransfer(
            "alu",
            "a",
            `ALU sends ${accumulator} to the Accumulator.`
          );
        }
      );
      break;

    case 0b0010: // SUB
      mar = operand;
      bRegister = ram[mar];
      accumulator = clampByte(accumulator - bRegister);
      render(mar, "a");

      animateDataTransfer(
        "ram",
        "b",
        `SUB: RAM[${toHex(mar)}] sends ${bRegister} to the B Register.`,
        () => {
          animateDataTransfer(
            "alu",
            "a",
            `ALU sends ${accumulator} to the Accumulator.`
          );
        }
      );
      break;

    case 0b1110: // OUT
      outputRegister = accumulator;
      render(null, "output");

      animateDataTransfer(
        "a",
        "output",
        `OUT: Accumulator sends ${outputRegister} to the Output Register.`
      );
      break;

    case 0b1111: // HLT
      halted = true;
      stopRun();
      render(null, null);
      setBusMessage("HLT: Processor halted.");

      document.body.classList.add("halt-flash");

      setTimeout(() => {
        document.body.classList.remove("halt-flash");
      }, 850);

      elements.status.textContent =
        `Execution halted. Output: ${outputRegister} decimal, ${toHex(outputRegister)}, ${toBinary(outputRegister, 8)}.`;
      return;

    default:
      halted = true;
      stopRun();
      elements.status.textContent = `Unknown opcode ${toBinary(opcode, 4)}. Execution halted.`;
      render(null, null);
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
  render(0, "pc");
});