// Small 2D truss solver — direct stiffness method with Gaussian elimination.
// nodes: [{x, y, fixX, fixY}] (metres) · members: [{a, b, E, A}] (Pa, m²) · loads: Float64Array(2n) (N)
// Returns { ok, singular, u (displacements, m), forces (N, +tension), reactions }.
export function solveTruss(nodes, members, loads) {
  const n = nodes.length, dof = 2 * n;
  const K = new Float64Array(dof * dof);
  const geo = members.map(m => {
    const dx = nodes[m.b].x - nodes[m.a].x, dy = nodes[m.b].y - nodes[m.a].y, L = Math.hypot(dx, dy);
    return { L, c: dx / L, s: dy / L, k: m.E * m.A / L };
  });
  members.forEach((m, i) => {
    const { c, s, k } = geo[i];
    const ke = [c * c, c * s, s * s];
    const idx = [2 * m.a, 2 * m.a + 1, 2 * m.b, 2 * m.b + 1];
    const kk = [[ke[0], ke[1], -ke[0], -ke[1]], [ke[1], ke[2], -ke[1], -ke[2]], [-ke[0], -ke[1], ke[0], ke[1]], [-ke[1], -ke[2], ke[1], ke[2]]];
    for (let r = 0; r < 4; r++) for (let cc = 0; cc < 4; cc++) K[idx[r] * dof + idx[cc]] += k * kk[r][cc];
  });
  const free = [];
  nodes.forEach((nd, i) => { if (!nd.fixX) free.push(2 * i); if (!nd.fixY) free.push(2 * i + 1); });
  const nf = free.length;
  const A = new Float64Array(nf * nf), b = new Float64Array(nf);
  for (let r = 0; r < nf; r++) { b[r] = loads[free[r]]; for (let c = 0; c < nf; c++) A[r * nf + c] = K[free[r] * dof + free[c]]; }
  // scale for pivot tolerance
  let maxDiag = 0; for (let r = 0; r < nf; r++) maxDiag = Math.max(maxDiag, Math.abs(A[r * nf + r]));
  const tol = Math.max(1e-12, maxDiag * 1e-10);
  let singular = false;
  const x = new Float64Array(nf);
  // Gaussian elimination with partial pivoting
  for (let col = 0; col < nf; col++) {
    let piv = col, best = Math.abs(A[col * nf + col]);
    for (let r = col + 1; r < nf; r++) { const v = Math.abs(A[r * nf + col]); if (v > best) { best = v; piv = r; } }
    if (best < tol) { singular = true; break; }
    if (piv !== col) { for (let c = 0; c < nf; c++) { const t = A[col * nf + c]; A[col * nf + c] = A[piv * nf + c]; A[piv * nf + c] = t; } const t = b[col]; b[col] = b[piv]; b[piv] = t; }
    for (let r = col + 1; r < nf; r++) { const f = A[r * nf + col] / A[col * nf + col]; if (f === 0) continue; for (let c = col; c < nf; c++) A[r * nf + c] -= f * A[col * nf + c]; b[r] -= f * b[col]; }
  }
  if (singular) return { ok: false, singular: true, u: null, forces: null, reactions: null };
  for (let r = nf - 1; r >= 0; r--) { let s = b[r]; for (let c = r + 1; c < nf; c++) s -= A[r * nf + c] * x[c]; x[r] = s / A[r * nf + r]; }
  const u = new Float64Array(dof); free.forEach((d, i) => { u[d] = x[i]; });
  const forces = members.map((m, i) => { const { c, s, k } = geo[i]; return k * ((u[2 * m.b] - u[2 * m.a]) * c + (u[2 * m.b + 1] - u[2 * m.a + 1]) * s); });
  const reactions = new Float64Array(dof);
  for (let r = 0; r < dof; r++) { let s = 0; for (let c = 0; c < dof; c++) s += K[r * dof + c] * u[c]; reactions[r] = s - loads[r]; }
  return { ok: true, singular: false, u, forces, reactions };
}

// Quick sanity: a member is "connected enough" if the structure has no free node with < 2 members
export function looseNodes(nodes, members) {
  const deg = nodes.map(() => 0);
  members.forEach(m => { deg[m.a]++; deg[m.b]++; });
  return nodes.map((n, i) => ({ i, deg: deg[i] })).filter(o => !(nodes[o.i].fixX && nodes[o.i].fixY) && o.deg < 2);
}
