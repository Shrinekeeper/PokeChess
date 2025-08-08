// Pokémon Chess with legal move validation, en passant, check/mate popups
// Abilities: Special (adjacent vaporize after non-pawn move, cost 2), Legendary (queen ray vaporize, cost 4)
// Adds castling

const boardEl = document.getElementById("board");
const turnEl = document.getElementById("turn");
const resetBtn = document.getElementById("reset");
const modalEl = document.getElementById("modal");
const modalTextEl = document.getElementById("modalText");
const whiteTrackEl = document.getElementById("whiteTrack");
const blackTrackEl = document.getElementById("blackTrack");
const whiteCountEl = document.getElementById("whiteCount");
const blackCountEl = document.getElementById("blackCount");
const specialBtn = document.getElementById("specialBtn");
const legendBtn = document.getElementById("legendBtn");

let board = [];
let selected = null; // { r, c }
let legalTargets = new Set(); // "r,c"
let turn = "white";
let enPassant = null;
let charge = { white: 0, black: 0 };
let specialArmed = false;
let legendArmed = false;
// castling rights and moved flags
let moved = { whiteKing: false, blackKing: false, whiteRookA: false, whiteRookH: false, blackRookA: false, blackRookH: false };

const TYPES = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
const DEX = { GARDEVOIR: 282, DELPHOX: 655, ZEKROM: 644, RESHIRAM: 643, DURALUDON: 884, ARCHALUDON: 1018, GLASTRIER: 896, SPECTRIER: 897, MELTAN: 808, MORPEKO: 877 };
const pokeUrl = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
function getSpriteUrl(type, color) { const wm = { pawn: DEX.MELTAN, rook: DEX.ARCHALUDON, knight: DEX.GLASTRIER, bishop: DEX.GARDEVOIR, queen: DEX.RESHIRAM, king: DEX.MORPEKO }; const bm = { pawn: DEX.MELTAN, rook: DEX.DURALUDON, knight: DEX.SPECTRIER, bishop: DEX.DELPHOX, queen: DEX.ZEKROM, king: DEX.MORPEKO }; return pokeUrl((color === "white" ? wm : bm)[type]); }

const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const keyOf = (r, c) => `${r},${c}`;

function clearHighlights() { legalTargets.clear(); document.querySelectorAll(".sq").forEach((sq) => { sq.classList.remove("selected", "move", "capture", "ability"); }); }

function drawSquares() {
  boardEl.innerHTML = "";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const sq = document.createElement("div");
    sq.className = `sq ${(r + c) % 2 === 0 ? "light" : "dark"}`;
    sq.dataset.r = String(r); sq.dataset.c = String(c);
    sq.addEventListener("click", onSquareClick);
    boardEl.appendChild(sq);
  }
}

function drawPieces() {
  document.querySelectorAll(".sq").forEach((sq) => (sq.innerHTML = ""));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const piece = board[r][c]; if (!piece) continue; const sq = getSq(r, c);
    const img = document.createElement("img"); img.draggable = false; img.className = "piece"; if (piece.type === "pawn") img.classList.add(piece.color === "white" ? "pawn-tint-white" : "pawn-tint-black"); img.alt = `${piece.color} ${piece.type}`; img.src = getSpriteUrl(piece.type, piece.color); sq.appendChild(img);
    if (piece.type === "king") { const crown = document.createElement("div"); crown.className = `crown ${piece.color === "white" ? "white" : "black"}`; crown.textContent = "♔"; sq.appendChild(crown); }
  }
}

const getSq = (r, c) => boardEl.children[r * 8 + c];

function setupInitialPosition() {
  board = Array.from({ length: 8 }, () => Array(8).fill(null));
  enPassant = null; charge.white = 0; charge.black = 0; updateChargeUI();
  moved = { whiteKing: false, blackKing: false, whiteRookA: false, whiteRookH: false, blackRookA: false, blackRookH: false };
  for (let c = 0; c < 8; c++) board[1][c] = { type: "pawn", color: "black" };
  TYPES.forEach((t, c) => (board[0][c] = { type: t, color: "black" }));
  for (let c = 0; c < 8; c++) board[6][c] = { type: "pawn", color: "white" };
  TYPES.forEach((t, c) => (board[7][c] = { type: t, color: "white" }));
}

const isEmpty = (r, c) => inBounds(r, c) && board[r][c] === null;
const isEnemy = (r, c, color) => inBounds(r, c) && board[r][c] && board[r][c].color !== color;

const cloneBoard = (src) => src.map((row) => row.map((cell) => (cell ? { type: cell.type, color: cell.color } : null)));
function findKing(b, color) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = b[r][c]; if (p && p.type === "king" && p.color === color) return { r, c }; } return null; }

function isSquareAttacked(b, r, c, byColor) {
  const pawnDir = byColor === "white" ? -1 : 1; for (const dc of [-1, 1]) { const pr = r - pawnDir, pc = c - dc; if (inBounds(pr, pc)) { const p = b[pr][pc]; if (p && p.color === byColor && p.type === "pawn") return true; } }
  const kD = [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]]; for (const [dr, dc] of kD) { const nr = r + dr, nc = c + dc; if (!inBounds(nr, nc)) continue; const p = b[nr][nc]; if (p && p.color === byColor && p.type === "knight") return true; }
  for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) { let nr = r + dr, nc = c + dc; while (inBounds(nr, nc)) { const p = b[nr][nc]; if (p) { if (p.color === byColor && (p.type === "bishop" || p.type === "queen")) return true; break; } nr += dr; nc += dc; } }
  for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) { let nr = r + dr, nc = c + dc; while (inBounds(nr, nc)) { const p = b[nr][nc]; if (p) { if (p.color === byColor && (p.type === "rook" || p.type === "queen")) return true; break; } nr += dr; nc += dc; } }
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr || dc) { const nr = r + dr, nc = c + dc; if (!inBounds(nr, nc)) continue; const p = b[nr][nc]; if (p && p.color === byColor && p.type === "king") return true; } }
  return false;
}

function isInCheck(b, color) { const k = findKing(b, color); return k ? isSquareAttacked(b, k.r, k.c, color === "white" ? "black" : "white") : false; }

function simulateMove(b, fr, fc, tr, tc) { const nb = cloneBoard(b); const moving = nb[fr][fc]; const dir = moving && moving.color === "white" ? -1 : 1; if (moving && moving.type === "pawn" && nb[tr][tc] === null && fc !== tc) { const capR = tr - dir; nb[capR][tc] = null; } nb[tr][tc] = moving; nb[fr][fc] = null; return nb; }

function filterLegalMoves(fr, fc, moves, color) { const out = []; for (const m of moves) { const nb = simulateMove(board, fr, fc, m.r, m.c); if (!isInCheck(nb, color)) out.push(m); } return out; }

function genMovesFor(r, c) {
  const piece = board[r][c]; if (!piece) return []; const { type, color } = piece; const moves = [];
  const push = (nr, nc) => { if (!inBounds(nr, nc)) return false; if (isEmpty(nr, nc)) { moves.push({ r: nr, c: nc, capture: false }); return true; } if (isEnemy(nr, nc, color)) { moves.push({ r: nr, c: nc, capture: true }); } return false; };
  const dir = color === "white" ? -1 : 1;
  switch (type) {
    case "pawn": {
      if (isEmpty(r + dir, c)) moves.push({ r: r + dir, c, capture: false });
      const baseRow = color === "white" ? 6 : 1; if (r === baseRow && isEmpty(r + dir, c) && isEmpty(r + 2 * dir, c)) moves.push({ r: r + 2 * dir, c, capture: false });
      for (const dc of [-1, 1]) { const nr = r + dir, nc = c + dc; if (isEnemy(nr, nc, color)) moves.push({ r: nr, c: nc, capture: true }); }
      if (enPassant && enPassant.eligible === color) { for (const dc of [-1, 1]) { const epR = r + dir, epC = c + dc; if (inBounds(epR, epC) && epR === enPassant.r && epC === enPassant.c && isEmpty(epR, epC)) moves.push({ r: epR, c: epC, capture: true, enPassant: true }); } }
      break;
    }
    case "knight": { const deltas = [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]]; for (const [dr, dc] of deltas) { const nr = r + dr, nc = c + dc; if (!inBounds(nr, nc)) continue; if (isEmpty(nr, nc) || isEnemy(nr, nc, color)) moves.push({ r: nr, c: nc, capture: !!board[nr][nc] }); } break; }
    case "bishop": { for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) { let nr = r + dr, nc = c + dc; while (push(nr, nc)) { nr += dr; nc += dc; } } break; }
    case "rook": { for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) { let nr = r + dr, nc = c + dc; while (push(nr, nc)) { nr += dr; nc += dc; } } break; }
    case "queen": { for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) { let nr = r + dr, nc = c + dc; while (push(nr, nc)) { nr += dr; nc += dc; } } break; }
    case "king": {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr || dc) { const nr = r + dr, nc = c + dc; if (!inBounds(nr, nc)) continue; if (isEmpty(nr, nc) || isEnemy(nr, nc, color)) moves.push({ r: nr, c: nc, capture: !!board[nr][nc] }); } }
      if (!isInCheck(board, color)) {
        const row = color === "white" ? 7 : 0;
        const kingMoved = color === "white" ? moved.whiteKing : moved.blackKing;
        if (!kingMoved) {
          const opp = color === "white" ? "black" : "white";
          const rookSquareH = board[row][7]; const rookMovedH = color === "white" ? moved.whiteRookH : moved.blackRookH;
          if (rookSquareH && rookSquareH.type === "rook" && rookSquareH.color === color && !rookMovedH && isEmpty(row, 5) && isEmpty(row, 6) && !isSquareAttacked(board, row, 5, opp) && !isSquareAttacked(board, row, 6, opp)) moves.push({ r: row, c: 6, castling: "king" });
          const rookSquareA = board[row][0]; const rookMovedA = color === "white" ? moved.whiteRookA : moved.blackRookA;
          if (rookSquareA && rookSquareA.type === "rook" && rookSquareA.color === color && !rookMovedA && isEmpty(row, 1) && isEmpty(row, 2) && isEmpty(row, 3) && !isSquareAttacked(board, row, 2, opp) && !isSquareAttacked(board, row, 3, opp)) moves.push({ r: row, c: 2, castling: "queen" });
        }
      }
      break;
    }
  }
  return filterLegalMoves(r, c, moves, color);
}

function highlightSelection(r, c, moves) { clearHighlights(); getSq(r, c).classList.add("selected"); for (const m of moves) { const sq = getSq(m.r, m.c); sq.classList.add(m.capture ? "capture" : "move"); legalTargets.add(keyOf(m.r, m.c)); } abilityTargetHints(r, c); }

function abilityTargetHints() { document.querySelectorAll(".sq").forEach((sq) => sq.classList.remove("ability")); if (legendArmed) { for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) { const p = board[rr][cc]; if (p && p.color === turn && p.type === "queen") getSq(rr, cc).classList.add("ability"); } } else if (specialArmed) { for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) { const p = board[rr][cc]; if (p && p.color === turn && p.type !== "pawn") getSq(rr, cc).classList.add("ability"); } } }

function onSquareClick(e) {
  const r = Number(e.currentTarget.dataset.r); const c = Number(e.currentTarget.dataset.c); const piece = board[r][c];
  if (selected && legalTargets.has(keyOf(r, c))) { const capture = !!board[r][c]; movePiece(selected.r, selected.c, r, c, capture); selected = null; clearHighlights(); return; }
  if (legendArmed) { if (piece && piece.color === turn && piece.type === "queen") { startLegendaryRaySelect(r, c); } return; }
  if (specialArmed) { if (piece && piece.color === turn && piece.type !== "pawn") { selected = { r, c }; const moves = genMovesFor(r, c); highlightSelection(r, c, moves); return; } }
  if (piece && piece.color === turn) { selected = { r, c }; const moves = genMovesFor(r, c); highlightSelection(r, c, moves); } else { selected = null; clearHighlights(); }
}

function vapourAt(r, c) { const sq = getSq(r, c); const img = sq.querySelector(".piece"); if (img) { img.classList.add("vapour"); setTimeout(() => { if (img && img.parentElement) img.parentElement.removeChild(img); }, 280); } }

function movePiece(fr, fc, tr, tc, wasDirectCapture = false) {
  const piece = board[fr][fc]; if (!piece) return; const color = piece.color; const dir = color === "white" ? -1 : 1;
  if (piece.type === "king") { if (color === "white") moved.whiteKing = true; else moved.blackKing = true; }
  if (piece.type === "rook") { if (color === "white") { if (fr === 7 && fc === 0) moved.whiteRookA = true; if (fr === 7 && fc === 7) moved.whiteRookH = true; } else { if (fr === 0 && fc === 0) moved.blackRookA = true; if (fr === 0 && fc === 7) moved.blackRookH = true; } }
  if (piece.type === "king" && fr === (color === "white" ? 7 : 0) && (tc === 2 || tc === 6)) { const rr = color === "white" ? 7 : 0; if (tc === 6) { board[rr][5] = board[rr][7]; board[rr][7] = null; } else { board[rr][3] = board[rr][0]; board[rr][0] = null; } }
  let nextEnPassant = null; if (piece.type === "pawn" && Math.abs(tr - fr) === 2) nextEnPassant = { r: fr + dir, c: fc, eligible: color === "white" ? "black" : "white" };
  const isDiag = fc !== tc; const isEnPassantCapture = piece.type === "pawn" && isDiag && board[tr][tc] === null && enPassant && enPassant.r === tr && enPassant.c === tc; if (isEnPassantCapture) { const capR = tr - dir; vapourAt(capR, tc); board[capR][tc] = null; wasDirectCapture = true; }
  if (board[tr][tc]) { vapourAt(tr, tc); wasDirectCapture = true; }
  board[tr][tc] = piece; board[fr][fc] = null;
  if (piece.type === "pawn") { if ((color === "white" && tr === 0) || (color === "black" && tr === 7)) piece.type = "queen"; }
  if (wasDirectCapture) { charge[color] += 1; updateChargeUI(); }
  drawPieces();
  if (specialArmed) { doSpecialAdjacent(tr, tc, piece); specialArmed = false; updateButtons(); }
  switchTurn(); enPassant = nextEnPassant; try { showStatusIfNeeded(); } catch (_) {}
}

function switchTurn() {
  turn = turn === "white" ? "black" : "white";
  if (turnEl) turnEl.textContent = `Turn: ${turn[0].toUpperCase()}${turn.slice(1)}`;
  updateButtons();
}

function doSpecialAdjacent(r, c, movedPiece) { if (!movedPiece || movedPiece.type === "pawn") return; if (charge[movedPiece.color] < 2) return; const dirs = [[1,0],[-1,0],[0,1],[0,-1]]; for (const [dr, dc] of dirs) { const nr = r + dr, nc = c + dc; if (!inBounds(nr, nc)) continue; if (isEnemy(nr, nc, movedPiece.color)) { vapourAt(nr, nc); board[nr][nc] = null; charge[movedPiece.color] -= 2; updateChargeUI(); drawPieces(); return; } } }

function startLegendaryRaySelect(qr, qc) {
  if (charge[turn] < 4) { legendArmed = false; updateButtons(); return; }
  getSq(qr, qc).classList.add("ability");
  const blocker = (ev) => ev.stopPropagation();
  boardEl.addEventListener("click", blocker, true);
  const onPick = (ev) => {
    ev.stopPropagation();
    const tr = Number(ev.currentTarget.dataset.r), tc = Number(ev.currentTarget.dataset.c);
    document.querySelectorAll(".sq").forEach((sq) => sq.removeEventListener("click", onPick));
    boardEl.removeEventListener("click", blocker, true);
    const dr = Math.sign(tr - qr), dc = Math.sign(tc - qc);
    if (!((dr === 0 && dc !== 0) || (dc === 0 && dr !== 0) || (Math.abs(dr) === 1 && Math.abs(dc) === 1))) { legendArmed = false; updateButtons(); clearHighlights(); return; }
    let nr = qr + dr, nc = qc + dc; let cleared = 0; while (inBounds(nr, nc)) { if (board[nr][nc]) { vapourAt(nr, nc); board[nr][nc] = null; cleared++; } nr += dr; nc += dc; }
    if (cleared > 0) { charge[turn] -= 4; updateChargeUI(); drawPieces(); showModal(`${turn[0].toUpperCase()+turn.slice(1)} used Legendary! Cleared ${cleared}.`); switchTurn(); try { showStatusIfNeeded(); } catch (_) {} }
    legendArmed = false; updateButtons(); clearHighlights();
  };
  document.querySelectorAll(".sq").forEach((sq) => sq.addEventListener("click", onPick));
}

function updateChargeUI() {
  whiteCountEl.textContent = String(charge.white); blackCountEl.textContent = String(charge.black);
  const fillTrack = (el, count) => { el.innerHTML = ""; for (let i = 0; i < 8; i++) { const seg = document.createElement("div"); seg.className = "seg" + (i < count ? " filled" : ""); el.appendChild(seg); } };
  fillTrack(whiteTrackEl, Math.min(charge.white, 8)); fillTrack(blackTrackEl, Math.min(charge.black, 8)); updateButtons();
}

function updateButtons() { const my = charge[turn]; specialBtn.disabled = my < 2; specialBtn.classList.toggle("armed", specialArmed); legendBtn.disabled = my < 4; legendBtn.classList.toggle("armed", legendArmed); }

specialBtn.addEventListener("click", () => { if (charge[turn] < 2) return; specialArmed = !specialArmed; legendArmed = false; updateButtons(); abilityTargetHints(); });
legendBtn.addEventListener("click", () => { if (charge[turn] < 4) return; legendArmed = !legendArmed; specialArmed = false; updateButtons(); abilityTargetHints(); });

function showModal(message) { modalTextEl.textContent = message; modalEl.style.display = "flex"; }
function hideModal() { modalEl.style.display = "none"; }
modalEl.addEventListener("click", hideModal);

function hasAnyLegalMoves(color) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = board[r][c]; if (!p || p.color !== color) continue; const m = genMovesFor(r, c); if (m.length) return true; } return false; }
function showStatusIfNeeded() { const inCheck = isInCheck(board, turn); const anyMoves = hasAnyLegalMoves(turn); if (inCheck && !anyMoves) { const winner = turn === "white" ? "Black" : "White"; showModal(`Checkmate! ${winner} wins.`); } else if (!inCheck && !anyMoves) { showModal("Stalemate!"); } else if (inCheck) { const side = turn[0].toUpperCase()+turn.slice(1); showModal(`Check! ${side} is in check.`); } }

function resetGame() { turn = "white"; turnEl.textContent = "Turn: White"; selected = null; legalTargets.clear(); clearHighlights(); setupInitialPosition(); drawPieces(); enPassant = null; hideModal(); updateButtons(); }

(function init() { drawSquares(); setupInitialPosition(); drawPieces(); resetBtn.addEventListener("click", resetGame); updateButtons(); })();
