// Minimal Pokémon Chess with legal move validation, en passant, and check/checkmate popups
// Both sides full color sprites; pawns tinted via CSS classes

const boardEl = document.getElementById("board");
const turnEl = document.getElementById("turn");
const resetBtn = document.getElementById("reset");
const modalEl = document.getElementById("modal");
const modalTextEl = document.getElementById("modalText");

// Board state: 8x8 of null or { type, color }
let board = [];
let selected = null; // { r, c }
let legalTargets = new Set(); // "r,c"
let turn = "white";
let enPassant = null; // { r, c, eligible: "white" | "black" } available for next move only

const TYPES = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

// National Dex IDs per mapping
const DEX = {
  GARDEVOIR: 282, // white bishops
  DELPHOX: 655,   // black bishops
  ZEKROM: 644,    // black queen
  RESHIRAM: 643,  // white queen
  DURALUDON: 884, // black rooks
  ARCHALUDON: 1018,// white rooks
  GLASTRIER: 896, // white knights
  SPECTRIER: 897, // black knights
  MELTAN: 808,    // both pawns
  MORPEKO: 877,   // both kings
};

function pokeUrl(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

function getSpriteUrl(type, color) {
  const whiteMap = {
    pawn: DEX.MELTAN,
    rook: DEX.ARCHALUDON,
    knight: DEX.GLASTRIER,
    bishop: DEX.GARDEVOIR,
    queen: DEX.RESHIRAM,
    king: DEX.MORPEKO,
  };
  const blackMap = {
    pawn: DEX.MELTAN,
    rook: DEX.DURALUDON,
    knight: DEX.SPECTRIER,
    bishop: DEX.DELPHOX,
    queen: DEX.ZEKROM,
    king: DEX.MORPEKO,
  };
  const id = (color === "white" ? whiteMap : blackMap)[type];
  return pokeUrl(id);
}

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function keyOf(r, c) { return `${r},${c}`; }

function clearHighlights() {
  legalTargets.clear();
  document.querySelectorAll(".sq").forEach((sq) => {
    sq.classList.remove("selected", "move", "capture");
  });
}

function drawSquares() {
  boardEl.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement("div");
      sq.className = `sq ${(r + c) % 2 === 0 ? "light" : "dark"}`;
      sq.dataset.r = String(r);
      sq.dataset.c = String(c);
      sq.addEventListener("click", onSquareClick);
      boardEl.appendChild(sq);
    }
  }
}

function drawPieces() {
  // Clear all
  document.querySelectorAll(".sq").forEach((sq) => (sq.innerHTML = ""));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const sq = getSq(r, c);

      // Image sprite
      const img = document.createElement("img");
      img.draggable = false;
      img.className = "piece";
      if (piece.type === "pawn") {
        img.classList.add(piece.color === "white" ? "pawn-tint-white" : "pawn-tint-black");
      }
      img.alt = `${piece.color} ${piece.type}`;
      img.src = getSpriteUrl(piece.type, piece.color);
      sq.appendChild(img);

      // Crown for kings
      if (piece.type === "king") {
        const crown = document.createElement("div");
        crown.className = `crown ${piece.color === "white" ? "white" : "black"}`;
        crown.textContent = "♔"; // simple crown symbol
        sq.appendChild(crown);
      }
    }
  }
}

function getSq(r, c) { return boardEl.children[r * 8 + c]; }

function setupInitialPosition() {
  board = Array.from({ length: 8 }, () => Array(8).fill(null));
  enPassant = null;
  // Black pieces (top)
  for (let c = 0; c < 8; c++) board[1][c] = { type: "pawn", color: "black" };
  TYPES.forEach((t, c) => (board[0][c] = { type: t, color: "black" }));
  // White pieces (bottom)
  for (let c = 0; c < 8; c++) board[6][c] = { type: "pawn", color: "white" };
  TYPES.forEach((t, c) => (board[7][c] = { type: t, color: "white" }));
}

function isEmpty(r, c) { return inBounds(r, c) && board[r][c] === null; }
function isEnemy(r, c, color) { return inBounds(r, c) && board[r][c] && board[r][c].color !== color; }

function cloneBoard(src) {
  return src.map((row) => row.map((cell) => (cell ? { type: cell.type, color: cell.color } : null)));
}

function findKing(b, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p && p.type === "king" && p.color === color) return { r, c };
    }
  }
  return null;
}

function isSquareAttacked(b, r, c, byColor) {
  // Pawns (attack diagonally forward)
  const pawnDir = byColor === "white" ? -1 : 1;
  for (const dc of [-1, 1]) {
    const pr = r - pawnDir; // reverse because we're checking attackers
    const pc = c - dc;
    if (inBounds(pr, pc)) {
      const p = b[pr][pc];
      if (p && p.color === byColor && p.type === "pawn") return true;
    }
  }
  // Knights
  const kD = [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]];
  for (const [dr, dc] of kD) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const p = b[nr][nc];
    if (p && p.color === byColor && p.type === "knight") return true;
  }
  // Bishops / Queens (diagonals)
  for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = b[nr][nc];
      if (p) { if (p.color === byColor && (p.type === "bishop" || p.type === "queen")) return true; break; }
      nr += dr; nc += dc;
    }
  }
  // Rooks / Queens (straight)
  for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = b[nr][nc];
      if (p) { if (p.color === byColor && (p.type === "rook" || p.type === "queen")) return true; break; }
      nr += dr; nc += dc;
    }
  }
  // King
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const p = b[nr][nc];
      if (p && p.color === byColor && p.type === "king") return true;
    }
  }
  return false;
}

function isInCheck(b, color) {
  const king = findKing(b, color);
  if (!king) return false;
  return isSquareAttacked(b, king.r, king.c, color === "white" ? "black" : "white");
}

function simulateMove(b, fr, fc, tr, tc, enPassantSquare) {
  const nb = cloneBoard(b);
  const moving = nb[fr][fc];
  const dir = moving && moving.color === "white" ? -1 : 1;
  // en passant capture case (destination empty but diagonal move by pawn to enPassant square)
  if (moving && moving.type === "pawn" && nb[tr][tc] === null && fc !== tc) {
    // remove the pawn that's passed
    const capR = tr - dir; // the pawn being captured sits behind the target square
    nb[capR][tc] = null;
  }
  nb[tr][tc] = moving;
  nb[fr][fc] = null;
  return nb;
}

function filterLegalMoves(fr, fc, moves, color) {
  const out = [];
  for (const m of moves) {
    const nb = simulateMove(board, fr, fc, m.r, m.c, enPassant);
    if (!isInCheck(nb, color)) out.push(m);
  }
  return out;
}

function genMovesFor(r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const { type, color } = piece;
  const moves = [];

  const push = (nr, nc) => {
    if (!inBounds(nr, nc)) return false;
    if (isEmpty(nr, nc)) { moves.push({ r: nr, c: nc, capture: false }); return true; }
    if (isEnemy(nr, nc, color)) { moves.push({ r: nr, c: nc, capture: true }); }
    return false;
  };

  const dir = color === "white" ? -1 : 1; // white moves up

  switch (type) {
    case "pawn": {
      // one forward
      if (isEmpty(r + dir, c)) moves.push({ r: r + dir, c, capture: false });
      // two forward from base
      const baseRow = color === "white" ? 6 : 1;
      if (r === baseRow && isEmpty(r + dir, c) && isEmpty(r + 2 * dir, c)) moves.push({ r: r + 2 * dir, c, capture: false });
      // normal captures
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (isEnemy(nr, nc, color)) moves.push({ r: nr, c: nc, capture: true });
      }
      // en passant capture
      if (enPassant && enPassant.eligible === color) {
        for (const dc of [-1, 1]) {
          const epR = r + dir, epC = c + dc;
          if (inBounds(epR, epC) && epR === enPassant.r && epC === enPassant.c && isEmpty(epR, epC)) {
            moves.push({ r: epR, c: epC, capture: true, enPassant: true });
          }
        }
      }
      break;
    }
    case "knight": {
      const deltas = [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]];
      for (const [dr, dc] of deltas) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        if (isEmpty(nr, nc) || isEnemy(nr, nc, color)) moves.push({ r: nr, c: nc, capture: !!board[nr][nc] });
      }
      break;
    }
    case "bishop": {
      for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
        let nr = r + dr, nc = c + dc; while (push(nr, nc)) { nr += dr; nc += dc; }
      }
      break;
    }
    case "rook": {
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        let nr = r + dr, nc = c + dc; while (push(nr, nc)) { nr += dr; nc += dc; }
      }
      break;
    }
    case "queen": {
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        let nr = r + dr, nc = c + dc; while (push(nr, nc)) { nr += dr; nc += dc; }
      }
      break;
    }
    case "king": {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          if (isEmpty(nr, nc) || isEnemy(nr, nc, color)) moves.push({ r: nr, c: nc, capture: !!board[nr][nc] });
        }
      }
      break;
    }
  }

  // Filter out moves that leave own king in check
  return filterLegalMoves(r, c, moves, color);
}

function highlightSelection(r, c, moves) {
  clearHighlights();
  getSq(r, c).classList.add("selected");
  for (const m of moves) {
    const sq = getSq(m.r, m.c);
    sq.classList.add(m.capture ? "capture" : "move");
    legalTargets.add(keyOf(m.r, m.c));
  }
}

function onSquareClick(e) {
  const r = Number(e.currentTarget.dataset.r);
  const c = Number(e.currentTarget.dataset.c);
  const piece = board[r][c];

  if (selected && legalTargets.has(keyOf(r, c))) {
    movePiece(selected.r, selected.c, r, c);
    selected = null;
    clearHighlights();
    return;
  }

  if (piece && piece.color === turn) {
    selected = { r, c };
    const moves = genMovesFor(r, c);
    highlightSelection(r, c, moves);
  } else if (piece && piece.color !== turn) {
    return;
  } else {
    selected = null;
    clearHighlights();
  }
}

function movePiece(fr, fc, tr, tc) {
  const piece = board[fr][fc];
  if (!piece) return;

  const color = piece.color;
  const dir = color === "white" ? -1 : 1;

  // Determine next enPassant availability (for the opponent)
  let nextEnPassant = null;
  if (piece.type === "pawn" && Math.abs(tr - fr) === 2) {
    nextEnPassant = { r: fr + dir, c: fc, eligible: color === "white" ? "black" : "white" };
  }

  // Handle en passant capture
  const isDiag = fc !== tc;
  const isEnPassantCapture = piece.type === "pawn" && isDiag && board[tr][tc] === null && enPassant && enPassant.r === tr && enPassant.c === tc;
  if (isEnPassantCapture) {
    const capR = tr - dir;
    board[capR][tc] = null;
  }

  // Perform move
  board[tr][tc] = piece;
  board[fr][fc] = null;

  // Promotion to queen
  if (piece.type === "pawn") {
    if ((color === "white" && tr === 0) || (color === "black" && tr === 7)) piece.type = "queen";
  }

  drawPieces();

  // Switch turn, set en passant availability for next player only
  switchTurn();
  enPassant = nextEnPassant; // valid only for this next move

  // Post-move status: check / checkmate
  showStatusIfNeeded();
}

function switchTurn() {
  turn = turn === "white" ? "black" : "white";
  turnEl.textContent = `Turn: ${turn[0].toUpperCase()}${turn.slice(1)}`;
}

function hasAnyLegalMoves(color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      const moves = genMovesFor(r, c);
      if (moves.length > 0) return true;
    }
  }
  return false;
}

function showModal(message) {
  modalTextEl.textContent = message;
  modalEl.style.display = "flex";
}

function hideModal() {
  modalEl.style.display = "none";
}

modalEl.addEventListener("click", hideModal);

function showStatusIfNeeded() {
  const inCheck = isInCheck(board, turn);
  const anyMoves = hasAnyLegalMoves(turn);
  if (inCheck && !anyMoves) {
    const winner = turn === "white" ? "Black" : "White";
    showModal(`Checkmate! ${winner} wins.`);
  } else if (!inCheck && !anyMoves) {
    showModal("Stalemate!");
  } else if (inCheck) {
    const side = turn[0].toUpperCase() + turn.slice(1);
    showModal(`Check! ${side} is in check.`);
  }
}

function resetGame() {
  turn = "white";
  turnEl.textContent = "Turn: White";
  selected = null;
  legalTargets.clear();
  clearHighlights();
  setupInitialPosition();
  drawPieces();
  enPassant = null;
  hideModal();
}

// Init
(function init() {
  drawSquares();
  setupInitialPosition();
  drawPieces();
  resetBtn.addEventListener("click", resetGame);
})();
