import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

// Independent subject-truth check for the draft linear-algebra key: exact integer arithmetic, no model judgment.
const facts = JSON.parse(fs.readFileSync(new URL("../../verification/learning/keys/la-eigen-2x2/facts.json", import.meta.url), "utf8"));
const mul = (a, v) => [a[0][0] * v[0] + a[0][1] * v[1], a[1][0] * v[0] + a[1][1] * v[1]];
const mat = (a, b) => [0, 1].map(i => [0, 1].map(j => a[i][0] * b[0][j] + a[i][1] * b[1][j]));
const det = a => a[0][0] * a[1][1] - a[0][1] * a[1][0];
const trace = a => a[0][0] + a[1][1];
// Characteristic polynomial λ² − (tr)λ + det, rendered the way the key writes it.
const characteristic = a => {
	const t = trace(a), d = det(a);
	return `λ^2${t === 0 ? "" : t > 0 ? ` - ${t === 1 ? "" : t}λ` : ` + ${-t === 1 ? "" : -t}λ`}${d === 0 ? "" : d > 0 ? ` + ${d}` : ` - ${-d}`}`;
};
// Dimension of the null space of (A − λI) for an integer λ: 2 if zero matrix, 1 if singular, else 0.
const eigenspaceDimension = (a, value) => {
	const shifted = [[a[0][0] - value, a[0][1]], [a[1][0], a[1][1] - value]];
	if (shifted.flat().every(entry => entry === 0)) return 2;
	return det(shifted) === 0 ? 1 : 0;
};

for (const problem of facts.problems) {
	test(`${problem.id}: ${problem.role}`, () => {
		const a = problem.matrix;
		assert.equal(trace(a), problem.trace);
		assert.equal(det(a), problem.det);
		assert.equal(characteristic(a), problem.characteristic);
		const discriminant = trace(a) ** 2 - 4 * det(a);
		if (problem.realEigenvalues === false) {
			assert.ok(discriminant < 0, "no real eigenvalues means a negative discriminant");
			assert.ok(!problem.eigen);
			return;
		}
		assert.ok(discriminant >= 0);
		for (const { value, vector } of problem.eigen) {
			assert.notDeepEqual(vector, [0, 0], "an eigenvector is never the zero vector");
			assert.deepEqual(mul(a, vector), vector.map(entry => value * entry + 0), `A v = ${value} v`);
			assert.equal(value ** 2 - trace(a) * value + det(a), 0, `${value} is a root of the characteristic polynomial`);
		}
		const values = [...new Set(problem.eigen.map(item => item.value))];
		const dimensions = values.reduce((sum, value) => sum + eigenspaceDimension(a, value), 0);
		assert.equal(dimensions === 2, problem.diagonalizable, "diagonalizable exactly when the eigenspaces span the plane");
		for (const [value, dimension] of Object.entries(problem.eigenspaceDimension ?? {})) assert.equal(eigenspaceDimension(a, Number(value)), dimension);
		if (problem.diagonalizable) {
			const [first, second] = problem.eigen.length === 2 ? problem.eigen : [];
			assert.ok(first && second && det([[first.vector[0], second.vector[0]], [first.vector[1], second.vector[1]]]) !== 0, "two independent eigenvectors are listed");
		}
		for (const [power, expected] of Object.entries(problem.powers ?? {})) {
			let result = a;
			for (let index = 1; index < Number(power); index++) result = mat(result, a);
			assert.deepEqual(result, expected, `A^${power}`);
		}
	});
}

test("prerequisite checks", () => {
	const [p1, p2, p3, p4] = facts.prerequisiteChecks;
	assert.deepEqual(mul(p1.matrix, p1.vector), p1.answer);
	assert.equal(det(p2.matrix), p2.det);
	assert.equal(det(p2.matrix) === 0, p2.singular);
	assert.deepEqual(mul(p3.matrix, p3.nullVector), [0, 0]);
	assert.equal(det([[p4.vectors[0][0], p4.vectors[1][0]], [p4.vectors[0][1], p4.vectors[1][1]]]) !== 0, p4.independent);
});
