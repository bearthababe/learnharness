import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

// Independent subject-truth check for the draft linear-algebra key: exact integer arithmetic, no model judgment.
const facts = JSON.parse(fs.readFileSync(new URL("../../verification/learning/keys/la-eigen-2x2/facts.json", import.meta.url), "utf8"));
const mul = (a, v) => [a[0][0] * v[0] + a[0][1] * v[1], a[1][0] * v[0] + a[1][1] * v[1]].map(entry => entry + 0);
const mat = (a, b) => [0, 1].map(i => [0, 1].map(j => a[i][0] * b[0][j] + a[i][1] * b[1][j] + 0));
const det = a => a[0][0] * a[1][1] - a[0][1] * a[1][0];
const trace = a => a[0][0] + a[1][1];
const characteristic = a => {
	const t = trace(a), d = det(a);
	return `λ^2${t === 0 ? "" : t > 0 ? ` - ${t === 1 ? "" : t}λ` : ` + ${-t === 1 ? "" : -t}λ`}${d === 0 ? "" : d > 0 ? ` + ${d}` : ` - ${-d}`}`;
};
// Real roots of λ² − tλ + d, derived independently of the listed eigenvalues (integer fixtures only).
const realRoots = a => {
	const t = trace(a), discriminant = t * t - 4 * det(a);
	if (discriminant < 0) return [];
	const root = Math.sqrt(discriminant);
	assert.ok(Number.isInteger(root), "fixtures use integer eigenvalues");
	return [...new Set([(t + root) / 2, (t - root) / 2])].sort((x, y) => x - y);
};
// Dimension of the null space of (A − λI): 2 if it is the zero matrix, 1 if singular, else 0.
const eigenspaceDimension = (a, value) => {
	const shifted = [[a[0][0] - value, a[0][1]], [a[1][0], a[1][1] - value]];
	if (shifted.flat().every(entry => entry === 0)) return 2;
	return det(shifted) === 0 ? 1 : 0;
};
// Reduced row echelon form: an invertible 2x2 matrix always row-reduces to I; singular fixtures are not row-reduced here.
const rref = a => {
	assert.notEqual(det(a), 0, "only invertible fixtures are row-reduced");
	return [[1, 0], [0, 1]];
};

for (const problem of facts.problems) {
	test(`${problem.id}: ${problem.role}`, () => {
		const a = problem.matrix;
		assert.equal(trace(a), problem.trace);
		assert.equal(det(a), problem.det);
		assert.equal(characteristic(a), problem.characteristic);
		const listed = [...new Set(problem.eigen.map(item => item.value))].sort((x, y) => x - y);
		assert.deepEqual(listed, realRoots(a), "listed eigenvalues are exactly the real characteristic roots");
		for (const { value, vector } of problem.eigen) {
			assert.notDeepEqual(vector, [0, 0], "an eigenvector is never the zero vector");
			assert.deepEqual(mul(a, vector), vector.map(entry => value * entry + 0), `A v = ${value} v`);
		}
		const span = listed.reduce((sum, value) => sum + eigenspaceDimension(a, value), 0);
		assert.equal(span === 2, problem.diagonalizable, "diagonalizable over the reals exactly when real eigenspaces span the plane");
		for (const [value, dimension] of Object.entries(problem.eigenspaceDimension ?? {})) assert.equal(eigenspaceDimension(a, Number(value)), dimension);
		if (problem.diagonalizable) {
			assert.equal(problem.eigen.length, 2, "two eigenvectors are listed");
			const p = [[problem.eigen[0].vector[0], problem.eigen[1].vector[0]], [problem.eigen[0].vector[1], problem.eigen[1].vector[1]]];
			const d = [[problem.eigen[0].value, 0], [0, problem.eigen[1].value]];
			assert.notEqual(det(p), 0, "the listed eigenvectors are independent");
			assert.deepEqual(mat(a, p), mat(p, d), "A P = P D, so A = P D P⁻¹");
		}
		if (problem.rowReducedEchelonForm) {
			assert.deepEqual(rref(a), problem.rowReducedEchelonForm);
			assert.notDeepEqual(realRoots(problem.rowReducedEchelonForm), listed, "row reduction changed the eigenvalues");
		}
	});
}

test("the key's prose covers only fixtures that exist", () => {
	const key = fs.readFileSync(new URL("../../verification/learning/keys/la-eigen-2x2/key.md", import.meta.url), "utf8");
	const ids = new Set(facts.problems.map(problem => problem.id));
	for (const reference of key.match(/\bR\d+\b/g) ?? []) assert.ok(ids.has(reference), `key.md cites ${reference}, which facts.json lacks`);
});
