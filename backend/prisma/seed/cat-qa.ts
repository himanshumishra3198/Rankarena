// CAT Quantitative Ability: every question is computed from its parameters,
// so the answer keys are right by construction. CAT is sat in English only,
// so nothing here is translated. About a third are type-in (TITA), as on the
// real paper, and a few use LaTeX so the maths renderer has something to do.
import type { Difficulty } from "../../src/generated/prisma/enums";
import { between, gcd, inr, mcq, nearBy, OPTIONS, p, pick, rand, shuffle, unique, type CatDraft, type Option } from "./lib";

const ARITH = "Arithmetic";
const ALGEBRA = "Algebra";
const GEOMETRY = "Geometry & Mensuration";
const NUMBERS = "Number System";
const MODERN = "Modern Maths";

function choice(
  topic: string, subtopic: string, difficulty: Difficulty,
  text: string, right: string, wrong: string[], solution?: string,
): CatDraft {
  const { options, correct } = mcq(right, wrong);
  return { type: "STANDARD", topic, subtopic, difficulty, text: p(text), options, correct, solution: solution && p(solution) };
}

function typeIn(
  topic: string, subtopic: string, difficulty: Difficulty,
  text: string, answer: number, solution?: string,
): CatDraft {
  return {
    type: "TITA", topic, subtopic, difficulty, text: p(text),
    tita: { kind: "NUMERIC", accepted: [String(answer)] }, solution: solution && p(solution),
  };
}

const nums = (n: number) => [n, nearBy(n)] as const;
const withSuffix = (n: number, wrong: number[], suffix: string) => [`${n}${suffix}`, wrong.map((w) => `${w}${suffix}`)] as const;

const C = (n: number, r: number): number => (r < 0 || r > n ? 0 : r === 0 ? 1 : (C(n - 1, r - 1) * n) / r);

function modPow(base: number, exp: number, mod: number): number {
  let r = 1n, b = BigInt(base) % BigInt(mod), e = BigInt(exp);
  const m = BigInt(mod);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return Number(r);
}

const PER_FAMILY = 3;

export function catQaFamilies(): CatDraft[][] {
  return [
    unique(PER_FAMILY, () => {
      const [x, ans] = pick([[25, 20], [100, 50], [150, 60], [300, 75], [400, 80], [900, 90]] as const);
      const [r, w] = withSuffix(ans, [...nearBy(ans), x], "%");
      return choice(ARITH, "Percentages", "EASY",
        `A's monthly income is ${x}% more than B's. By what percentage is B's income less than A's?`, r, w,
        `If B earns 100, A earns ${100 + x}. B is ${x} less on ${100 + x}, i.e. ${x}/${100 + x} × 100 = ${ans}%.`);
    }),
    unique(PER_FAMILY, () => {
      const [m, d, ans] = pick([[50, 20, 20], [40, 25, 5], [60, 25, 20], [80, 25, 35], [50, 10, 35], [20, 10, 8], [60, 10, 44], [75, 20, 40]] as const);
      return typeIn(ARITH, "Profit, Loss & Discount", "MEDIUM",
        `A shopkeeper marks an article ${m}% above its cost price and then allows a discount of ${d}% on the marked price. What is his profit percentage?`, ans,
        `On a cost of 100 the marked price is ${100 + m}, and the selling price ${100 + m} × ${100 - d}/100 = ${100 + ans}. Profit = ${ans}%.`);
    }),
    unique(PER_FAMILY, () => {
      const [a, b] = pick([[40, 60], [30, 60], [60, 90], [20, 30], [45, 90], [36, 45], [50, 75]] as const);
      const ans = (2 * a * b) / (a + b);
      const [r, w] = withSuffix(ans, [...nearBy(ans), (a + b) / 2], " km/h");
      return choice(ARITH, "Time, Speed & Distance", "MEDIUM",
        `A car travels the first half of a journey at ${a} km/h and the second half at ${b} km/h. What is its average speed for the whole journey?`, r, w,
        `For equal distances the average speed is 2ab/(a + b) = 2 × ${a} × ${b}/${a + b} = ${ans} km/h — not the simple average.`);
    }),
    unique(PER_FAMILY, () => {
      const [a, b] = pick([[12, 24], [10, 15], [20, 30], [6, 12], [15, 30], [21, 42], [12, 36], [14, 35]] as const);
      const ans = (a * b) / (a + b);
      const [r, w] = withSuffix(ans, nearBy(ans), " days");
      return choice(ARITH, "Time & Work", "EASY",
        `A can finish a piece of work in ${a} days and B can finish it in ${b} days. Working together, in how many days will they finish it?`, r, w,
        `Together they do 1/${a} + 1/${b} = ${a + b}/${a * b} of the work a day, so they take ${a * b}/${a + b} = ${ans} days.`);
    }),
    unique(PER_FAMILY, () => {
      const [pp, q] = pick([[2, 3], [3, 5], [4, 7], [3, 4], [5, 8], [2, 5]] as const);
      const m = between(3, 9), k = between(1, 4) * 5;
      const a = pp * m + k, b = q * m + k, g = gcd(a, b);
      return typeIn(ARITH, "Ratio & Proportion", "MEDIUM",
        `Two numbers are in the ratio ${pp} : ${q}. If ${k} is added to each, the ratio becomes ${a / g} : ${b / g}. What is the smaller number?`, pp * m,
        `Let the numbers be ${pp}x and ${q}x. Then (${pp}x + ${k})/(${q}x + ${k}) = ${a / g}/${b / g} gives x = ${m}, so the smaller number is ${pp * m}.`);
    }),
    unique(PER_FAMILY, () => {
      let P = 0, r = 0, diff = 0.5;
      while (!Number.isInteger(diff)) {
        P = pick([5000, 8000, 10000, 12000, 20000, 25000]);
        r = pick([4, 5, 8, 10, 20]);
        diff = (P * r * r) / 10000;
      }
      const [rr, w] = [inr(diff), nearBy(diff).map(inr)];
      return choice(ARITH, "Simple & Compound Interest", "MEDIUM",
        `What is the difference between the compound interest (compounded annually) and the simple interest on ${inr(P)} for 2 years at ${r}% per annum?`, rr, w,
        `For 2 years the difference is P(r/100)² = ${P} × (${r}/100)² = ${inr(diff)}.`);
    }),
    unique(PER_FAMILY, () => {
      let a = 0, b = 0, c = 0;
      while (b - c === c - a) {
        a = between(30, 60); b = a + between(12, 40); c = between(a + 1, b - 1);
      }
      const x = b - c, y = c - a, g = gcd(x, y);
      const ratio = (u: number, v: number) => `${u / gcd(u, v)} : ${v / gcd(u, v)}`;
      return choice(ARITH, "Averages, Mixtures & Alligation", "MEDIUM",
        `In what ratio must rice costing ${inr(a)} per kg be mixed with rice costing ${inr(b)} per kg so that the mixture costs ${inr(c)} per kg?`,
        ratio(x, y), [ratio(y, x), ratio(x + g, y), ratio(x, y + g), ratio(x + y, y)],
        `By alligation, cheaper : dearer = (${b} − ${c}) : (${c} − ${a}) = ${ratio(x, y)}.`);
    }),
    unique(PER_FAMILY, () => {
      const x = between(15, 60), y = between(3, x - 2);
      const [r, w] = nums(x * y);
      return choice(ALGEBRA, "Linear Equations", "EASY",
        `The sum of two numbers is ${x + y} and their difference is ${x - y}. What is their product?`, String(r), w.map(String),
        `The numbers are (${x + y} + ${x - y})/2 = ${x} and (${x + y} − ${x - y})/2 = ${y}, so the product is ${x * y}.`);
    }),
    unique(PER_FAMILY, () => {
      const a = between(2, 8), b = between(a + 1, 11);
      return typeIn(ALGEBRA, "Quadratic Equations", "MEDIUM",
        `If \\(\\alpha\\) and \\(\\beta\\) are the roots of \\(x^2 - ${a + b}x + ${a * b} = 0\\), what is the value of \\(\\alpha^2 + \\beta^2\\)?`, a * a + b * b,
        `\\(\\alpha^2 + \\beta^2 = (\\alpha + \\beta)^2 - 2\\alpha\\beta = ${a + b}^2 - 2 \\times ${a * b} = ${a * a + b * b}\\).`);
    }),
    unique(PER_FAMILY, () => {
      const a = pick([2, 3]), t = pick([2, 4, 6]);
      return typeIn(ALGEBRA, "Logarithms", "MEDIUM",
        `If \\(\\log_{${a}} x + \\log_{${a * a}} x = ${(3 * t) / 2}\\), what is the value of x?`, a ** t,
        `\\(\\log_{${a * a}} x = \\tfrac{1}{2}\\log_{${a}} x\\), so \\(\\tfrac{3}{2}\\log_{${a}} x = ${(3 * t) / 2}\\), giving \\(\\log_{${a}} x = ${t}\\) and x = ${a ** t}.`);
    }),
    unique(PER_FAMILY, () => {
      const a = between(2, 15), d = between(2, 7), n = between(10, 20);
      const sum = (n * (2 * a + (n - 1) * d)) / 2;
      return typeIn(ALGEBRA, "Progressions", "MEDIUM",
        `The 3rd term of an arithmetic progression is ${a + 2 * d} and its 7th term is ${a + 6 * d}. What is the sum of its first ${n} terms?`, sum,
        `4d = ${4 * d}, so d = ${d} and the first term is ${a}. The sum is ${n}/2 × (2 × ${a} + ${n - 1} × ${d}) = ${sum}.`);
    }),
    unique(PER_FAMILY, () => {
      const a = between(-6, 9), b = between(3, 12);
      const inner = a === 0 ? "x" : a > 0 ? `x − ${a}` : `x + ${-a}`;
      return choice(ALGEBRA, "Inequalities", "EASY",
        `How many integers x satisfy |${inner}| &lt; ${b}?`, String(2 * b - 1), [2 * b, 2 * b + 1, b, 2 * b - 2].map(String),
        `${a - b} &lt; x &lt; ${a + b}, which holds for the ${2 * b - 1} integers from ${a - b + 1} to ${a + b - 1}.`);
    }),
    unique(PER_FAMILY, () => {
      const m = between(2, 5), c = between(1, 9);
      const ans = m * (2 * m + c) + c;
      const [r, w] = nums(ans);
      return choice(ALGEBRA, "Functions & Graphs", "EASY",
        `If f(x) = ${m}x + ${c}, what is the value of f(f(2))?`, String(r), w.map(String),
        `f(2) = ${2 * m + c}, so f(f(2)) = ${m} × ${2 * m + c} + ${c} = ${ans}.`);
    }),
    unique(PER_FAMILY, () => {
      const [a, b, c, area] = pick([[13, 14, 15, 84], [5, 12, 13, 30], [9, 10, 17, 36], [10, 13, 13, 60], [7, 15, 20, 42], [13, 20, 21, 126], [11, 13, 20, 66]] as const);
      const [r, w] = withSuffix(area, nearBy(area), " sq cm");
      return choice(GEOMETRY, "Triangles", "MEDIUM",
        `The sides of a triangle are ${a} cm, ${b} cm and ${c} cm. What is its area?`, r, w,
        `s = ${(a + b + c) / 2}. By Heron's formula the area is √(s(s − a)(s − b)(s − c)) = ${area} sq cm.`);
    }),
    unique(PER_FAMILY, () => {
      const [h, d, r] = pick([[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13], [8, 6, 10], [6, 8, 10], [8, 15, 17], [7, 24, 25]] as const);
      return typeIn(GEOMETRY, "Circles", "MEDIUM",
        `A chord of length ${2 * h} cm is at a distance of ${d} cm from the centre of a circle. What is the diameter of the circle, in cm?`, 2 * r,
        `The perpendicular from the centre bisects the chord, so r² = ${h}² + ${d}² = ${r * r}, r = ${r} and the diameter is ${2 * r} cm.`);
    }),
    unique(PER_FAMILY, () => {
      const [dx, dy, dist] = pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]] as const);
      const x1 = between(-5, 5), y1 = between(-5, 5);
      const x2 = x1 + (rand() < 0.5 ? dx : -dx), y2 = y1 + (rand() < 0.5 ? dy : -dy);
      const [r, w] = nums(dist);
      return choice(GEOMETRY, "Coordinate Geometry", "EASY",
        `What is the distance between the points (${x1}, ${y1}) and (${x2}, ${y2})?`, String(r), [...w, dx + dy].map(String),
        `√(${dx}² + ${dy}²) = √${dist * dist} = ${dist}.`);
    }),
    unique(PER_FAMILY, () => {
      const b = between(1, 3), k = between(2, 5);
      const [r, w] = nums(k ** 3);
      return choice(GEOMETRY, "Solid Geometry", "EASY",
        `A solid metal cube of edge ${b * k} cm is melted and recast into cubes of edge ${b} cm each. How many cubes are formed?`, String(r), [...w, k * k, 3 * k].map(String),
        `Volume ratio = (${b * k}/${b})³ = ${k}³ = ${k ** 3}.`);
    }),
    unique(PER_FAMILY, () => {
      const a = between(1, 4), b = between(1, 3), c = between(0, 2);
      const n = 2 ** a * 3 ** b * 5 ** c, ans = (a + 1) * (b + 1) * (c + 1);
      const [r, w] = nums(ans);
      return choice(NUMBERS, "Factors & Multiples", "MEDIUM",
        `How many positive factors does ${n} have?`, String(r), w.map(String),
        `${n} = 2^${a} × 3^${b}${c ? ` × 5^${c}` : ""}, so it has ${a + 1} × ${b + 1}${c ? ` × ${c + 1}` : ""} = ${ans} factors.`);
    }),
    unique(PER_FAMILY, () => {
      let base = 0, mod = 0;
      while (gcd(base, mod) !== 1) { base = pick([2, 3, 5, 7]); mod = pick([7, 9, 11, 13]); }
      const exp = between(25, 120);
      let cycle = 1;
      while (modPow(base, cycle, mod) !== 1) cycle++;
      const ans = modPow(base, exp, mod);
      return typeIn(NUMBERS, "Remainders", "HARD",
        `What is the remainder when \\(${base}^{${exp}}\\) is divided by ${mod}?`, ans,
        `\\(${base}^{${cycle}}\\) leaves remainder 1 on division by ${mod}, so the remainders repeat every ${cycle} powers. ${exp} = ${cycle} × ${Math.floor(exp / cycle)} + ${exp % cycle}, so the remainder is that of \\(${base}^{${exp % cycle}}\\), which is ${ans}.`);
    }),
    unique(PER_FAMILY, () => {
      const k = between(4, 8);
      const d = [between(1, k - 1), between(0, k - 1), between(0, k - 1)];
      const ans = d[0] * k * k + d[1] * k + d[2];
      const [r, w] = nums(ans);
      return choice(NUMBERS, "Base Systems", "EASY",
        `What is the decimal value of \\((${d.join("")})_{${k}}\\)?`, String(r), [...w, Number(d.join(""))].map(String),
        `${d[0]} × ${k}² + ${d[1]} × ${k} + ${d[2]} = ${ans}.`);
    }),
    unique(PER_FAMILY, () => {
      const m = between(4, 7), w = between(3, 5), r = between(3, 4);
      const ans = C(m + w, r) - C(m, r);
      return typeIn(MODERN, "Permutation & Combination", "MEDIUM",
        `A committee of ${r} is to be chosen from ${m} men and ${w} women. In how many ways can this be done if the committee must include at least one woman?`, ans,
        `All committees minus those with no woman: C(${m + w}, ${r}) − C(${m}, ${r}) = ${C(m + w, r)} − ${C(m, r)} = ${ans}.`);
    }),
    unique(PER_FAMILY, () => {
      const s = between(2, 12);
      const frac = (sum: number) => {
        const ways = 6 - Math.abs(sum - 7), g = gcd(ways, 36);
        return `${ways / g}/${36 / g}`;
      };
      const wrong = [...new Set([2, 3, 4, 5, 6, 7].map(frac))].filter((f) => f !== frac(s));
      return choice(MODERN, "Probability", "EASY",
        `Two fair dice are thrown together. What is the probability that the numbers shown add up to ${s}?`, frac(s), wrong,
        `${6 - Math.abs(s - 7)} of the 36 equally likely outcomes give a sum of ${s}, so the probability is ${frac(s)}.`);
    }),
    unique(PER_FAMILY, () => {
      const both = between(5, 15), onlyTea = between(8, 30), onlyCoffee = between(8, 30), neither = between(3, 20);
      const n = both + onlyTea + onlyCoffee + neither;
      const [r, w] = nums(neither);
      return choice(MODERN, "Set Theory", "EASY",
        `In a group of ${n} people, ${onlyTea + both} drink tea, ${onlyCoffee + both} drink coffee and ${both} drink both. How many drink neither?`, String(r), w.map(String),
        `Tea or coffee: ${onlyTea + both} + ${onlyCoffee + both} − ${both} = ${n - neither}. Neither: ${n} − ${n - neither} = ${neither}.`);
    }),
  ];
}

/**
 * Multiple-select questions. Not on the current CAT pattern, so they go into
 * practice mocks and the bank, never a contest — but the format is
 * supported and needs something to exercise it.
 */
export function catQaMsq(): CatDraft[] {
  const isPrime = (n: number) => n > 1 && Array.from({ length: Math.floor(Math.sqrt(n)) - 1 }, (_, i) => i + 2).every((d) => n % d !== 0);
  const make = (
    text: string, pool: number[], test: (n: number) => boolean, subtopic: string, solution: (picked: number[]) => string,
  ): CatDraft => {
    // One to three right answers: all four right, or none, leaves nothing to choose.
    let picked: number[] = [];
    while (true) {
      picked = shuffle(pool).slice(0, 4);
      const hits = picked.filter(test).length;
      if (hits >= 1 && hits <= 3) break;
    }
    const msq = picked.flatMap((n, i) => (test(n) ? [OPTIONS[i]] : [])) as Option[];
    return {
      type: "MSQ", topic: NUMBERS, subtopic, difficulty: "MEDIUM", text: p(text),
      options: picked.map(String) as [string, string, string, string], msq, solution: p(solution(picked)),
    };
  };
  return [
    make("Which of the following numbers are prime? Select all that apply.",
      [51, 53, 57, 59, 61, 87, 89, 91, 97, 119, 121, 127, 133, 143], isPrime, "Factors & Multiples",
      (ns) => ns.map((n) => (isPrime(n) ? `${n} is prime` : `${n} is not`)).join("; ") + "."),
    make("Which of the following numbers are divisible by 6? Select all that apply.",
      [114, 126, 134, 146, 156, 178, 186, 194, 204, 212, 222, 238], (n) => n % 6 === 0, "Factors & Multiples",
      (ns) => "A number is divisible by 6 when it is even and its digits add up to a multiple of 3: " +
        ns.map((n) => `${n} ${n % 6 === 0 ? "is" : "is not"}`).join(", ") + "."),
  ];
}
