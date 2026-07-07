const GRID_SIZE = 9;
const STEP_DELAY = 300;

const directionOrder = ['up', 'right', 'down', 'left'];
const directionVectors = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };
const directionRotation = { up: 0, right: 90, down: 180, left: -90 };
const cargoAssets = { none: 'robo.svg', green: 'robogreen.svg', red: 'robored.svg' };
const boxAssets = { green: 'greenbox.svg', red: 'redbox.svg' };
const BACKGROUND_FILL = '#ffd58c';
const levelPathCells = new Map();

const PROGRESS_STORAGE_KEY = 'conditionsTrainerProgressV1';
const DEBUG_UNLOCK_KEY = 'conditionsTrainerUnlockAll';

const levels = [
  { start: [4, 3], direction: 'right', pickup: [4, 4], pickupCargo: 'green', greenBox: [3, 5], redBox: null, hint: 'Возьми зелёную деталь и доставь её в зелёный финишный ящик.' },
  { start: [4, 6], direction: 'left', pickup: [4, 5], pickupCargo: 'red', greenBox: null, redBox: [4, 3], hint: 'Возьми красную деталь и доставь её в красный финишный ящик.' },
  { start: [3, 2], direction: 'right', pickup: [3, 3], greenBox: [1, 5], redBox: [3, 6], hint: 'Зелёная деталь лежит выше, красная — дальше по дороге.' },
  { start: [1, 2], direction: 'right', pickup: [1, 3], greenBox: [1, 5], redBox: [7, 4], hint: 'Одна ветка короткая, другая ведёт вниз по длинной дороге.' },
  { start: [7, 5], direction: 'up', pickup: [6, 5], greenBox: [2, 4], redBox: [4, 6], hint: 'На развилке доставь деталь в ящик её цвета.' },
  { start: [5, 3], direction: 'up', pickup: [4, 3], greenBox: [2, 1], redBox: [2, 7], hint: 'Используй условие, чтобы выбрать левую или правую верхнюю ветку.' },
  { start: [1, 7], direction: 'down', pickup: [2, 7], greenBox: [2, 3], redBox: [7, 2], hint: 'Зелёный путь уходит влево сверху, красный — к нижней коробке.' },
  { start: [3, 1], direction: 'right', pickup: [3, 2], greenBox: [1, 4], redBox: [5, 7], hint: 'Разные цвета требуют разных маршрутов по длинной дорожке.' },
  { start: [5, 1], direction: 'right', pickup: [5, 2], greenBox: [1, 7], redBox: [7, 7], hint: 'Довези деталь к верхнему или нижнему правому ящику.' },
  { start: [1, 4], direction: 'down', pickup: [2, 4], greenBox: [3, 1], redBox: [7, 7], hint: 'Зелёный ящик слева, красный — в дальнем правом углу.' },
  { start: [3, 7], direction: 'left', pickup: [3, 6], greenBox: [2, 1], redBox: [4, 5], hint: 'Финальный уровень: проверь оба варианта условия.' },
];

function getLevelName(levelIndex) { return `Уровень ${levelIndex + 1}`; }

const board = document.getElementById('board');
const levelTitle = document.getElementById('level-title');
const levelProgress = document.getElementById('level-progress');
const workspaceContainer = document.getElementById('blockly-workspace');
const runButton = document.getElementById('run-program');
const levelSelect = document.getElementById('level-select');
const levelCompleteModal = document.getElementById('level-complete-modal');
const levelCompleteTitle = document.getElementById('level-complete-title');
const levelCompleteMessage = document.getElementById('level-complete-message');
const nextLevelButton = document.getElementById('next-level-button');
const retryLevelButton = document.getElementById('retry-level-button');
const levelHint = document.getElementById('level-hint');
const levelRule = document.getElementById('level-rule');

let workspace;
let currentLevelIndex = 0;
let currentPosition = [0, 0];
let currentDirection = 'right';
let currentCargo = null;
let isProgramRunning = false;
let completedLevels = Array(levels.length).fill(false);
let deliveredCargo = null;
let pickupTaken = false;
let forcedPickupCargo = null;
let isSimulationRun = false;

const defineBlocksWithJsonArray = Blockly.common?.defineBlocksWithJsonArray ?? Blockly.defineBlocksWithJsonArray;
defineBlocksWithJsonArray([
  { type: 'maze_start', message0: 'Запуск', nextStatement: null, colour: 45, deletable: false, movable: false, hat: 'cap' },
  { type: 'maze_move_forward', message0: 'Шаг вперед', previousStatement: null, nextStatement: null, colour: 340 },
  { type: 'maze_turn_left', message0: 'Повернуть налево', previousStatement: null, nextStatement: null, colour: 340 },
  { type: 'maze_turn_right', message0: 'Повернуть направо', previousStatement: null, nextStatement: null, colour: 340 },
  { type: 'maze_take_cargo', message0: 'Взять груз', previousStatement: null, nextStatement: null, colour: 120 },
  { type: 'maze_drop_cargo', message0: 'Положить груз', previousStatement: null, nextStatement: null, colour: 120 },
  { type: 'maze_repeat', message0: 'Повторить %1 раз %2 %3', args0: [{ type: 'field_number', name: 'TIMES', value: 2, min: 1, precision: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 200 },
  { type: 'maze_if_color', message0: 'Если %1, то %2 %3 иначе %4 %5', args0: [{ type: 'field_dropdown', name: 'COLOR', options: [['красный', 'red'], ['зелёный', 'green']] }, { type: 'input_dummy' }, { type: 'input_statement', name: 'THEN' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'ELSE' }], previousStatement: null, nextStatement: null, colour: 260 },
]);

function getCurrentLevel() { return levels[currentLevelIndex]; }
function getToolboxForLevel() {
  const blockTypes = ['maze_move_forward', 'maze_turn_left', 'maze_turn_right', 'maze_repeat', 'maze_take_cargo', 'maze_drop_cargo'];
  if (currentLevelIndex >= 2) blockTypes.splice(4, 0, 'maze_if_color');
  return { kind: 'flyoutToolbox', contents: blockTypes.map((type) => ({ kind: 'block', type })) };
}
function resetWorkspace() { workspace.clear(); const startBlock = workspace.newBlock('maze_start'); startBlock.initSvg(); startBlock.render(); startBlock.moveBy(36, 36); workspace.centerOnBlock(startBlock.id); }
function getBlocklyStartScale() { return window.innerHeight <= 680 ? 0.82 : 0.95; }
function initializeBlockly() { workspace = Blockly.inject(workspaceContainer, { toolbox: getToolboxForLevel(), toolboxPosition: 'start', trashcan: true, renderer: 'zelos', grid: { spacing: 24, length: 3, colour: 'rgba(124, 140, 255, 0.18)', snap: true }, zoom: { controls: true, wheel: true, startScale: getBlocklyStartScale(), maxScale: 1.4, minScale: 0.55, scaleSpeed: 1.1 }, move: { scrollbars: true, drag: true, wheel: true } }); resetWorkspace(); requestAnimationFrame(() => Blockly.svgResize(workspace)); window.addEventListener('resize', () => Blockly.svgResize(workspace)); }
function toKey(row, col) { return `${row},${col}`; }
function sameCell(a, b) { return a[0] === b[0] && a[1] === b[1]; }
function normalizeHexColor(color) { return color?.trim().toLowerCase(); }
function getSvgClassFills(svgDocument) {
  const fills = new Map();
  svgDocument.querySelectorAll('style').forEach((styleNode) => {
    const styleText = styleNode.textContent ?? '';
    for (const match of styleText.matchAll(/\.([\w-]+)\s*\{[^}]*fill\s*:\s*(#[0-9a-fA-F]{3,6})/g)) {
      fills.set(match[1], normalizeHexColor(match[2]));
    }
  });
  return fills;
}
function getRectFill(rect, classFills) {
  const directFill = rect.getAttribute('fill');
  if (directFill) return normalizeHexColor(directFill);
  const className = rect.getAttribute('class')?.split(/\s+/).find((name) => classFills.has(name));
  return className ? classFills.get(className) : null;
}
async function loadLevelPath(levelIndex) {
  if (levelPathCells.has(levelIndex)) return levelPathCells.get(levelIndex);
  const response = await fetch(`./lvl${levelIndex + 1}.svg`);
  if (!response.ok) throw new Error(`Не удалось загрузить путь уровня ${levelIndex + 1}.`);
  const svgText = await response.text();
  const svgDocument = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const classFills = getSvgClassFills(svgDocument);
  const [viewMinX, viewMinY, viewWidth, viewHeight] = (svgDocument.documentElement.getAttribute('viewBox') ?? '0 0 400 400').split(/\s+/).map(Number);
  const cellWidth = viewWidth / GRID_SIZE;
  const cellHeight = viewHeight / GRID_SIZE;
  const path = new Set();
  svgDocument.querySelectorAll('rect').forEach((rect) => {
    const fill = getRectFill(rect, classFills);
    if (!fill || fill === BACKGROUND_FILL) return;
    const x = Number(rect.getAttribute('x') ?? viewMinX);
    const y = Number(rect.getAttribute('y') ?? viewMinY);
    const width = Number(rect.getAttribute('width') ?? 0);
    const height = Number(rect.getAttribute('height') ?? 0);
    const col = Math.floor((x + width / 2 - viewMinX) / cellWidth);
    const row = Math.floor((y + height / 2 - viewMinY) / cellHeight);
    if (isInsideBoard([row, col])) path.add(toKey(row, col));
  });
  levelPathCells.set(levelIndex, path);
  return path;
}
async function isCellOnLevelPath(cell) {
  const path = await loadLevelPath(currentLevelIndex);
  return path.has(toKey(cell[0], cell[1]));
}
function loadProgress() { try { const raw = localStorage.getItem(PROGRESS_STORAGE_KEY); if (!raw) return; const parsed = JSON.parse(raw); if (Array.isArray(parsed?.completedLevels)) completedLevels = levels.map((_, idx) => Boolean(parsed.completedLevels[idx])); } catch { completedLevels = Array(levels.length).fill(false); } }
function saveProgress() { localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ completedLevels })); }
function isLevelUnlocked(index) { if (localStorage.getItem(DEBUG_UNLOCK_KEY) === '1') return true; return index === 0 || completedLevels.slice(0, index).every(Boolean); }
function renderLevelOptions() { levelSelect.innerHTML = levels.map((_, idx) => `<option value="${idx}" ${idx === currentLevelIndex ? 'selected' : ''} ${isLevelUnlocked(idx) ? '' : 'disabled'}>${isLevelUnlocked(idx) ? '' : '🔒 '}${completedLevels[idx] ? '✅ ' : ''}${getLevelName(idx)}</option>`).join(''); }
function markLevelCompleted(levelIndex) { if (!completedLevels[levelIndex]) { completedLevels[levelIndex] = true; saveProgress(); } }
function syncCurrentLevelWithProgress() { const locked = levels.findIndex((_, idx) => !isLevelUnlocked(idx)); if (locked !== -1 && currentLevelIndex >= locked) currentLevelIndex = Math.max(0, locked - 1); }

function getDeliveryColors(level) { return ['green', 'red'].filter((color) => Array.isArray(level[`${color}Box`])); }
function renderBoard() {
  const level = getCurrentLevel();
  board.style.gridTemplateColumns = `repeat(${GRID_SIZE}, minmax(0, 1fr))`;
  board.style.gridTemplateRows = `repeat(${GRID_SIZE}, minmax(0, 1fr))`;
  board.innerHTML = '';
  const boardBackground = document.createElement('div');
  boardBackground.className = 'board-background';
  boardBackground.style.backgroundImage = `url('./lvl${currentLevelIndex + 1}.svg')`;
  board.appendChild(boardBackground);
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const cell = document.createElement('div'); cell.className = 'cell';
      if (sameCell([row, col], level.pickup) && !pickupTaken) {
        if (level.pickupCargo) {
          const pickupBox = document.createElement('div'); pickupBox.className = `delivery-box ${level.pickupCargo}`; pickupBox.style.backgroundImage = `url('./${boxAssets[level.pickupCargo]}')`; cell.appendChild(pickupBox);
        } else {
          const mystery = document.createElement('div'); mystery.className = 'mystery-box'; mystery.textContent = '?'; cell.appendChild(mystery);
        }
      }
      for (const color of getDeliveryColors(level)) { if (sameCell([row, col], level[`${color}Box`])) { const box = document.createElement('div'); box.className = `delivery-box ${color}`; box.style.backgroundImage = `url('./${boxAssets[color]}')`; cell.appendChild(box); } }
      if (sameCell(currentPosition, [row, col])) { const hero = document.createElement('div'); hero.className = 'hero'; hero.style.backgroundImage = `url('./${cargoAssets[currentCargo ?? 'none']}')`; hero.style.transform = `rotate(${directionRotation[currentDirection]}deg) scale(1.25)`; cell.appendChild(hero); }
      board.appendChild(cell);
    }
  }
  levelTitle.textContent = getLevelName(currentLevelIndex); levelProgress.textContent = `${currentLevelIndex + 1} / ${levels.length}`; levelHint.textContent = ''; levelRule.textContent = ''; renderLevelOptions();
}
function resetLevelState() { const level = getCurrentLevel(); currentPosition = [...level.start]; currentDirection = level.direction; currentCargo = null; deliveredCargo = null; pickupTaken = false; renderBoard(); }
function setLevel(index) { if (index < 0 || index >= levels.length || !isLevelUnlocked(index)) { renderLevelOptions(); return; } currentLevelIndex = index; workspace.updateToolbox(getToolboxForLevel()); hideLevelCompleteModal(); resetWorkspace(); resetLevelState(); }

function commandsFromBlock(block) { const commands = []; let currentBlock = block; while (currentBlock) { const type = currentBlock.type; if (type === 'maze_move_forward') commands.push({ type: 'move' }); else if (type === 'maze_turn_left') commands.push({ type: 'turn-left' }); else if (type === 'maze_turn_right') commands.push({ type: 'turn-right' }); else if (type === 'maze_take_cargo') commands.push({ type: 'take' }); else if (type === 'maze_drop_cargo') commands.push({ type: 'drop' }); else if (type === 'maze_repeat') commands.push({ type: 'repeat', times: Number(currentBlock.getFieldValue('TIMES')) || 0, body: commandsFromBlock(currentBlock.getInputTargetBlock('DO')) }); else if (type === 'maze_if_color') commands.push({ type: 'if', color: currentBlock.getFieldValue('COLOR'), thenBranch: commandsFromBlock(currentBlock.getInputTargetBlock('THEN')), elseBranch: commandsFromBlock(currentBlock.getInputTargetBlock('ELSE')) }); currentBlock = currentBlock.getNextBlock(); } return commands; }
function getExecutionTree() { const startBlock = workspace.getBlocksByType('maze_start', false)[0]; return startBlock ? commandsFromBlock(startBlock.getNextBlock()) : []; }
function rotateDirection(direction, turn) { const index = directionOrder.indexOf(direction); return directionOrder[(index + (turn === 'turn-left' ? -1 : 1) + 4) % 4]; }
function isInsideBoard([row, col]) { return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE; }
function showLevelCompleteModal(message, canProceed, title = 'Молодец!') { levelCompleteTitle.textContent = title; levelCompleteMessage.textContent = message; nextLevelButton.hidden = !canProceed; retryLevelButton.hidden = false; levelCompleteModal.classList.remove('hidden'); }
function hideLevelCompleteModal() { levelCompleteModal.classList.add('hidden'); }
function fail(message, title = 'Ошибка') { if (!isSimulationRun) showLevelCompleteModal(message, false, title); throw new Error(message); }
function checkWin() { const level = getCurrentLevel(); if (!deliveredCargo) return false; return (deliveredCargo === 'green' && Array.isArray(level.greenBox) && sameCell(currentPosition, level.greenBox)) || (deliveredCargo === 'red' && Array.isArray(level.redBox) && sameCell(currentPosition, level.redBox)); }
async function pauseAndRender() { if (isSimulationRun) return; renderBoard(); await new Promise((resolve) => setTimeout(resolve, STEP_DELAY)); }
async function executeCommands(commands) { await loadLevelPath(currentLevelIndex); for (const command of commands) { if (command.type === 'repeat') { for (let i = 0; i < command.times; i += 1) await executeCommands(command.body); continue; } if (command.type === 'if') { await executeCommands(currentCargo === command.color ? command.thenBranch : command.elseBranch); continue; } await pauseAndRender(); const level = getCurrentLevel(); if (command.type === 'move') { const [dr, dc] = directionVectors[currentDirection]; const nextPos = [currentPosition[0] + dr, currentPosition[1] + dc]; if (!isInsideBoard(nextPos)) fail('Робот вышел за границы поля 9×9. Попробуй снова.'); if (!(await isCellOnLevelPath(nextPos))) fail('Робот сошёл с нарисованной оранжевой дорожки. Попробуй снова.'); currentPosition = nextPos; } else if (command.type === 'turn-left' || command.type === 'turn-right') currentDirection = rotateDirection(currentDirection, command.type); else if (command.type === 'take') { if (!sameCell(currentPosition, level.pickup)) fail('Груз можно взять только из коробочки с деталью.'); if (pickupTaken) fail('Коробочка с деталью уже пуста.'); if (currentCargo) fail('У робота уже есть груз.'); pickupTaken = true; currentCargo = level.pickupCargo ?? forcedPickupCargo ?? (Math.random() < 0.5 ? 'green' : 'red'); } else if (command.type === 'drop') { if (!currentCargo) fail('У робота нет груза, который можно положить.'); deliveredCargo = currentCargo; currentCargo = null; } if (!isSimulationRun) renderBoard(); } }

function captureLevelState() { return { position: [...currentPosition], direction: currentDirection, cargo: currentCargo, delivered: deliveredCargo, taken: pickupTaken, forced: forcedPickupCargo, simulation: isSimulationRun }; }
function restoreLevelState(state) { currentPosition = [...state.position]; currentDirection = state.direction; currentCargo = state.cargo; deliveredCargo = state.delivered; pickupTaken = state.taken; forcedPickupCargo = state.forced; isSimulationRun = state.simulation; }
async function testProgramForCargo(commands, cargo) { const savedState = captureLevelState(); const level = getCurrentLevel(); currentPosition = [...level.start]; currentDirection = level.direction; currentCargo = null; deliveredCargo = null; pickupTaken = false; forcedPickupCargo = cargo; isSimulationRun = true; try { await executeCommands(commands); return checkWin(); } catch { return false; } finally { restoreLevelState(savedState); } }
async function choosePickupCargoForRun(commands) { const level = getCurrentLevel(); if (level.pickupCargo) return level.pickupCargo; const colors = getDeliveryColors(level); if (colors.length !== 2) return Math.random() < 0.5 ? 'green' : 'red'; const results = []; for (const color of colors) results.push([color, await testProgramForCargo(commands, color)]); const failedColors = results.filter(([, isCorrect]) => !isCorrect).map(([color]) => color); return failedColors.length === 1 ? failedColors[0] : colors[Math.floor(Math.random() * colors.length)]; }
async function runProgram() { if (isProgramRunning) return; const commands = getExecutionTree(); resetLevelState(); if (!commands.length) return; isProgramRunning = true; runButton.disabled = true; try { forcedPickupCargo = await choosePickupCargoForRun(commands); resetLevelState(); await executeCommands(commands); if (!checkWin()) { showLevelCompleteModal('Груз нужно положить в коробочку такого же цвета.', false, 'Почти!'); return; } markLevelCompleted(currentLevelIndex); renderLevelOptions(); showLevelCompleteModal('Деталь доставлена в правильную коробочку!', currentLevelIndex < levels.length - 1 && isLevelUnlocked(currentLevelIndex + 1), 'Победа!'); } catch (error) { if (!levelCompleteModal.classList.contains('hidden')) return; showLevelCompleteModal(error.message, false, 'Ошибка'); } finally { forcedPickupCargo = null; isSimulationRun = false; isProgramRunning = false; runButton.disabled = false; } }

runButton.addEventListener('click', runProgram);
levelSelect.addEventListener('change', (event) => setLevel(Number(event.target.value)));
nextLevelButton.addEventListener('click', () => setLevel(Math.min(currentLevelIndex + 1, levels.length - 1)));
retryLevelButton.addEventListener('click', () => { hideLevelCompleteModal(); resetLevelState(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideLevelCompleteModal(); if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) runProgram(); });

loadProgress(); syncCurrentLevelWithProgress(); initializeBlockly(); setLevel(currentLevelIndex);
