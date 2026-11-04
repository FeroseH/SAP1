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
  operationB: document.getElementById("operationB"),
  operationC: document.getElementById("operationC"),
  addressA: document.getElementById("addressA"),
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
  hexOutput: document.getElementById("hexOutput"),
  binaryOutput: document.getElementById("binaryOutput")
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
let busTimers = [];
let busGeneration = 0;

function scheduleBusTask(callback, delay) {
  const timer = setTimeout(callback, delay);
  busTimers.push(timer);
}

function cancelBusAnimations() {
  busGeneration++;

  busTimers.forEach(clearTimeout);
  busTimers = [];

  busQueue = [];
  busBusy = false;

  clearBusEffects();

  if (elements.dataPacket) {
    elements.dataPacket.classList.remove("traveling");
    elements.dataPacket.style.opacity = "0";
  }

  document.body.classList.remove("halt-flash");
}
function toBinary(value, bits) {
  return value.toString(2).padStart(bits, "0");
}

function formatByte(value) {
  const binary = toBinary(value, 8);

  return `${binary.slice(0, 4)} ${binary.slice(4)}`;
}

function toHex(value) {
  return value.toString(16).toUpperCase().padStart(2, "0") + "H";
}

function clampByte(value) {
  return ((value % 256) + 256) % 256;
}

function validateData(raw, label) {
  const text = String(raw).trim();

  // Accept 25, 25H, or 0x25; reject invalid or incomplete input.
  const validHex = /^(?:[0-9a-f]{1,2}h?|0x[0-9a-f]{1,2})$/i;

  if (!validHex.test(text)) {
    elements.status.textContent =
      `${label} must be hexadecimal from 00 to FF. ` +
      `Examples: 25, 25H, or 0x25.`;

    return null;
  }

  const digits = text
    .replace(/^0x/i, "")
    .replace(/h$/i, "");

  return parseInt(digits, 16);
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
    clearBusEffects();
    return;
  }

  busBusy = true;

  const transfer = busQueue.shift();
  const generation = busGeneration;

  const packet = elements.dataPacket;
  const sourceStation = getStation(transfer.source);
  const destinationStation = getStation(transfer.destination);

  if (!packet || !sourceStation || !destinationStation) {
    if (transfer.callback) {
      transfer.callback();
    }

    processBusQueue();
    return;
  }

  // Each bus transfer uses the selected duration.
  const duration = Number(elements.clockSpeed.value);
  const travelTime = Math.round(duration * 0.8);

  clearBusEffects();
  sourceStation.classList.add("active");

  packet.classList.remove("traveling");

  // Position the packet instantly at the source.
  packet.style.transition = "none";
  packet.style.left = `${busPositions[transfer.source]}%`;
  packet.style.opacity = "1";

  // Commit the starting position.
  void packet.offsetWidth;

  setBusMessage(transfer.message);

  requestAnimationFrame(() => {
    if (generation !== busGeneration) return;

    packet.classList.add("traveling");

    // Override the fixed duration from the stylesheet.
    packet.style.transition =
      `left ${travelTime}ms linear`;

    packet.style.left =
      `${busPositions[transfer.destination]}%`;

    scheduleBusTask(() => {
      if (generation !== busGeneration) return;

      destinationStation.classList.add("active", "receiving");

      if (transfer.callback) {
        transfer.callback();
      }
    }, travelTime);

    scheduleBusTask(() => {
      if (generation !== busGeneration) return;

      packet.classList.remove("traveling");
      packet.style.opacity = "0";

      clearBusEffects();
      processBusQueue();
    }, duration);
  });
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
    : `DATA ${toHex(value)} (${value} decimal)`;

    row.innerHTML = `
      <td>${address.toString(16).toUpperCase()}H</td>
<td>${formatByte(value)}</td>
      <td>${toHex(value)}</td>
      <td>${meaning}</td>
    `;

    elements.ramBody.appendChild(row);
  }
}

function render(activeAddress = null, activeRegister = null) {
  elements.pcValue.textContent = toBinary(pc, 4);
elements.marValue.textContent = toBinary(mar, 4);

elements.irValue.textContent = formatByte(ir);
elements.aValue.textContent = formatByte(accumulator);
elements.bValue.textContent = formatByte(bRegister);
elements.outputValue.textContent = formatByte(outputRegister);

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
elements.binaryOutput.textContent = formatByte(outputRegister);

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

  if (a === null || b === null || c === null) {
    return;
  }

  const operationB = elements.operationB.value;
  const operationC = elements.operationC.value;

  if (
    !["ADD", "SUB"].includes(operationB) ||
    !["ADD", "SUB"].includes(operationC)
  ) {
    elements.status.textContent = "Choose ADD or SUB for both operations.";
    return;
  }

  // Dropdown values must be decimal strings:
  // value="10" means address AH.
  const addressA = Number(elements.addressA.value);
  const addressB = addressA + 1;
  const addressC = addressA + 2;

  // 0H–4H contain the five instructions.
  // Three consecutive data bytes must fit within 5H–FH.
  if (
    !Number.isInteger(addressA) ||
    addressA < 5 ||
    addressA > 13
  ) {
    elements.status.textContent =
      "Choose a Data A address from 5H to DH. " +
      "Addresses 0H–4H contain the program.";
    return;
  }

  resetRegisters(true);

  ram[0] = addressA; // LDA <addressA>

  ram[1] =
    ((operationB === "ADD" ? 0b0001 : 0b0010) << 4) |
    addressB;

  ram[2] =
    ((operationC === "ADD" ? 0b0001 : 0b0010) << 4) |
    addressC;

  ram[3] = 0b11101111; // OUT
  ram[4] = 0b11111111; // HLT

  ram[addressA] = a;
  ram[addressB] = b;
  ram[addressC] = c;

  halted = false;

  const symbolB = operationB === "ADD" ? "+" : "−";
  const symbolC = operationC === "ADD" ? "+" : "−";

  elements.status.textContent =
    `Program loaded: ${toHex(a)} ${symbolB} ${toHex(b)} ` +
    `${symbolC} ${toHex(c)}. ` +
    `Data starts at ${addressA.toString(16).toUpperCase()}H. ` +
    `Press Step or Run.`;

  setBusMessage("W-Bus ready.");
  render(0, "pc");
}

function resetRegisters(clearRam = true) {
  stopRun();
  cancelBusAnimations();

  pc = 0;
  mar = 0;
  ir = 0;
  accumulator = 0;
  bRegister = 0;
  outputRegister = 0;

  awaitingFetch = true;

  // An empty RAM is not a loaded program.
  halted = clearRam;

  if (clearRam) {
    ram = new Array(16).fill(0);
  }

  elements.status.textContent =
    clearRam
      ? "Simulator reset. Load a program to begin."
      : "Registers reset.";

  setBusMessage("W-Bus idle.");
  render();
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
  // Wait until every transfer for the current phase finishes.
  if (busBusy || busQueue.length > 0) {
    return;
  }

  if (halted) {
    elements.status.textContent =
      "Load a program before running, or reload after HLT.";
    return;
  }

  if (awaitingFetch) {
    fetchPhase();
  } else {
    executePhase();
  }
}

function run() {
  if (running) {
    stopRun();
    return;
  }

  if (halted) {
    elements.status.textContent =
      "Load a program before running.";
    return;
  }

  running = true;
  elements.runBtn.textContent = "Stop";

  runTimer = setInterval(() => {
    if (halted) {
      stopRun();
      return;
    }

    if (!busBusy && busQueue.length === 0) {
      step();
    }
  }, 20);
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
  elements.clockLabel.textContent =
    `${elements.clockSpeed.value} ms / transfer`;
});

elements.clockLabel.textContent =
  `${elements.clockSpeed.value} ms / transfer`;

document.addEventListener("DOMContentLoaded", () => {
  render(0, "pc");
});