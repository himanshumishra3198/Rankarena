// Quantitative Aptitude: templates with the answer computed, so every
// question is correct by construction. Distractors are near misses or the
// usual mistake for that kind of problem.
import {
  between, Draft, gcd, inr, lcm, mcqOf, nearBy, numeric, p, pick, unique, type Four,
} from "./lib";

const PCT = "Percentage";
const PLD = "Profit, Loss & Discount";
const RATIO = "Ratio, Proportion & Partnership";
const AVG = "Average & Mixture";
const TSD = "Time, Speed & Distance";
const WORK = "Time & Work, Pipes & Cisterns";
const INTEREST = "Simple & Compound Interest";
const ALG = "Algebra";
const GEO = "Geometry & Mensuration";
const TRIG = "Trigonometry & Height and Distance";
const NUM = "Number System & Simplification";

const nums = (xs: number[], f: (n: number) => string = String) => xs.map(f);
const pct = (n: number) => `${n}%`;

export function quantFamilies(): Draft[][] {
  return [
    unique(14, () => {
      const pc = pick([5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 60, 75]);
      const n = (100 / gcd(pc, 100)) * between(2, 30);
      const ans = (pc * n) / 100;
      return numeric(PCT, "EASY", `What is ${pc}% of ${n}?`, `${n} का ${pc}% कितना है?`,
        String(ans), nums(nearBy(ans)), `${n} × ${pc}/100 = ${ans}.`);
    }),

    unique(10, () => {
      const pc = pick([10, 20, 25, 40, 50, 60, 75, 80]);
      const n = (100 / gcd(pc, 100)) * between(3, 40);
      const v = (pc * n) / 100;
      return numeric(PCT, "EASY", `If ${pc}% of a number is ${v}, what is the number?`,
        `यदि किसी संख्या का ${pc}%, ${v} है, तो वह संख्या क्या है?`,
        String(n), nums([...nearBy(n), (v * pc) / 100].filter((x) => Number.isInteger(x))), `Number = ${v} × 100/${pc} = ${n}.`);
    }),

    unique(8, () => {
      let b: number, pc: number;
      do {
        b = pick([20, 25, 40, 50, 80, 200, 250, 400, 500]);
        pc = pick([10, 20, 25, 40, 50, 60, 75, 80]);
      } while (!Number.isInteger((b * pc) / 100));
      const a = (b * pc) / 100;
      return numeric(PCT, "EASY", `${a} is what percent of ${b}?`, `${a}, ${b} का कितना प्रतिशत है?`,
        pct(pc), nums([pc - 10, pc - 5, pc + 5, pc + 10].filter((x) => x > 0), pct), `${a}/${b} × 100 = ${pc}%.`);
    }),

    [[10, 10], [20, 10], [30, 20], [50, 20], [20, 25], [40, 25], [10, 20], [25, 20], [50, 50], [60, 25]].map(([a, b]) => {
      const net = a - b - (a * b) / 100;
      const label = (n: number) => ({
        en: n === 0 ? "No change" : `${Math.abs(n)}% ${n > 0 ? "increase" : "decrease"}`,
        hi: n === 0 ? "कोई परिवर्तन नहीं" : `${Math.abs(n)}% ${n > 0 ? "वृद्धि" : "कमी"}`,
      });
      const { items, correct } = mcqOf(label(net), [a - b, -net, net - 2, net + 2, a + b].filter((x) => x !== net).map(label), (o) => o.en);
      return {
        topic: PCT, difficulty: "MEDIUM" as const, correct,
        text: p(`A price is increased by ${a}% and then decreased by ${b}%. What is the net change?`),
        options: items.map((o) => o.en) as Four,
        solution: p(`Net change = ${a} − ${b} − (${a} × ${b})/100 = ${net}%.`),
        hi: {
          text: p(`किसी मूल्य में ${a}% की वृद्धि और फिर ${b}% की कमी की जाती है। कुल परिवर्तन क्या है?`),
          options: items.map((o) => o.hi) as Four,
        },
      };
    }),

    unique(14, () => {
      const P = between(2, 20) * 1000, R = pick([4, 5, 6, 8, 10, 12]), T = between(2, 5);
      const si = (P * R * T) / 100;
      return numeric(INTEREST, "EASY",
        `Find the simple interest on ${inr(P)} at ${R}% per annum for ${T} years.`,
        `${inr(P)} पर ${R}% वार्षिक दर से ${T} वर्ष का साधारण ब्याज ज्ञात कीजिए।`,
        inr(si), nums([(P * R * (T - 1)) / 100, (P * R * (T + 1)) / 100, ...nearBy(si)], inr),
        `SI = P × R × T / 100 = ${P} × ${R} × ${T} / 100 = ${inr(si)}.`);
    }),

    unique(8, () => {
      const P = pick([4000, 8000, 10000, 12000, 16000, 20000]), R = pick([5, 10, 20]);
      const ci = (P * (200 * R + R * R)) / 10000;
      const si = (P * 2 * R) / 100;
      return numeric(INTEREST, "MEDIUM",
        `Find the compound interest on ${inr(P)} at ${R}% per annum for 2 years, compounded annually.`,
        `${inr(P)} पर ${R}% वार्षिक दर से 2 वर्ष का चक्रवृद्धि ब्याज (वार्षिक संयोजित) ज्ञात कीजिए।`,
        inr(ci), nums([si, ci + (P * R * R) / 10000, ci + 100, ci - 50], inr),
        `Amount = ${P} × (1 + ${R}/100)² = ${inr(P + ci)}, so CI = ${inr(ci)}.`);
    }),

    [4, 5, 8, 10, 20, 25].map((n) => {
      const r = 100 / n;
      return numeric(INTEREST, "MEDIUM",
        `At what rate of simple interest does a sum double itself in ${n} years?`,
        `साधारण ब्याज की किस दर से कोई राशि ${n} वर्षों में दोगुनी हो जाती है?`,
        pct(r), nums([r * 2, r / 2, r + 5, r + 2.5], pct), `Interest = principal, so R = 100/${n} = ${r}%.`);
    }),

    unique(10, () => {
      const cp = between(2, 10) * 100, pr = pick([10, 20, 25, 40, 50]);
      const sp = (cp * (100 + pr)) / 100;
      return numeric(PLD, "EASY",
        `An article bought for ${inr(cp)} is sold for ${inr(sp)}. What is the profit percentage?`,
        `${inr(cp)} में खरीदी गई वस्तु ${inr(sp)} में बेची जाती है। लाभ प्रतिशत क्या है?`,
        pct(pr), nums([pr - 5, pr + 5, Math.round((100 * (sp - cp)) / sp), pr + 10], pct),
        `Profit = ${inr(sp - cp)} on ${inr(cp)}, so ${sp - cp}/${cp} × 100 = ${pr}%.`);
    }),

    unique(8, () => {
      const cp = between(4, 20) * 100, l = pick([5, 10, 20, 25]);
      const sp = (cp * (100 - l)) / 100;
      return numeric(PLD, "MEDIUM",
        `An item is sold for ${inr(sp)} at a loss of ${l}%. What was its cost price?`,
        `एक वस्तु ${inr(sp)} में ${l}% की हानि पर बेची जाती है। उसका क्रय मूल्य क्या था?`,
        inr(cp), nums([Math.round((sp * (100 + l)) / 100), cp + 100, cp - 100, cp + 50], inr),
        `CP = SP × 100/(100 − ${l}) = ${inr(cp)}.`);
    }),

    unique(8, () => {
      const mp = between(5, 50) * 100, d = pick([10, 15, 20, 25, 30, 40]);
      const sp = (mp * (100 - d)) / 100;
      return numeric(PLD, "EASY",
        `The marked price of an item is ${inr(mp)} and a discount of ${d}% is given. What is the selling price?`,
        `किसी वस्तु का अंकित मूल्य ${inr(mp)} है और उस पर ${d}% की छूट दी जाती है। विक्रय मूल्य क्या है?`,
        inr(sp), nums([(mp * d) / 100, ...nearBy(sp)], inr), `SP = ${mp} × (100 − ${d})/100 = ${inr(sp)}.`);
    }),

    unique(8, () => {
      const v = pick([10, 15, 20, 25]), t = between(6, 20);
      const kmh = (v * 18) / 5;
      return numeric(TSD, "MEDIUM",
        `A train ${v * t} m long passes a pole in ${t} seconds. What is its speed in km/h?`,
        `${v * t} मीटर लंबी एक रेलगाड़ी एक खंभे को ${t} सेकंड में पार करती है। उसकी चाल किमी/घंटा में क्या है?`,
        String(kmh), nums([kmh - 18, kmh + 18, v, kmh + 9]),
        `Speed = ${v * t}/${t} = ${v} m/s = ${v} × 18/5 = ${kmh} km/h.`);
    }),

    unique(6, () => {
      const v = pick([10, 15, 20]), l1 = between(2, 6) * 50, t = between(Math.ceil((l1 + 50) / v), 40);
      const l2 = v * t - l1;
      return numeric(TSD, "HARD",
        `A train ${l1} m long running at ${(v * 18) / 5} km/h crosses a platform ${l2} m long. How many seconds does it take?`,
        `${l1} मीटर लंबी एक रेलगाड़ी ${(v * 18) / 5} किमी/घंटा की चाल से ${l2} मीटर लंबे प्लेटफ़ॉर्म को पार करती है। इसमें कितने सेकंड लगेंगे?`,
        String(t), nums([Math.round(l1 / v), Math.round(l2 / v), t + 5, t - 3, t + 2].filter((x) => x > 0)),
        `Distance = ${l1} + ${l2} = ${v * t} m at ${v} m/s, so ${t} s.`);
    }),

    [[40, 60], [30, 60], [20, 30], [60, 90], [10, 15], [36, 45], [12, 24], [45, 90]].map(([a, b]) => {
      const avg = (2 * a * b) / (a + b);
      return numeric(TSD, "MEDIUM",
        `A man goes to a place at ${a} km/h and returns at ${b} km/h. What is his average speed for the whole journey?`,
        `एक व्यक्ति किसी स्थान पर ${a} किमी/घंटा की चाल से जाता है और ${b} किमी/घंटा की चाल से लौटता है। पूरी यात्रा में उसकी औसत चाल क्या है?`,
        `${avg} km/h`, nums([(a + b) / 2, avg - 4, avg + 4, avg + 2], (n) => `${n} km/h`),
        `Average speed = 2ab/(a + b) = 2 × ${a} × ${b}/${a + b} = ${avg} km/h.`);
    }),

    unique(6, () => {
      const s = pick([30, 40, 45, 50, 60, 72, 80]), t = between(2, 6);
      return numeric(TSD, "EASY",
        `A car travels at ${s} km/h for ${t} hours. How far does it go?`,
        `एक कार ${s} किमी/घंटा की चाल से ${t} घंटे चलती है। वह कितनी दूरी तय करती है?`,
        `${s * t} km`, nums(nearBy(s * t), (n) => `${n} km`));
    }),

    [[12, 24], [20, 30], [6, 12], [4, 12], [15, 30], [10, 40], [18, 36], [8, 24], [21, 42], [30, 60]].map(([a, b]) => {
      const d = (a * b) / (a + b);
      return numeric(WORK, "MEDIUM",
        `A can finish a piece of work in ${a} days and B in ${b} days. In how many days can they finish it together?`,
        `A किसी काम को ${a} दिन में और B ${b} दिन में पूरा कर सकता है। दोनों मिलकर उसे कितने दिनों में पूरा करेंगे?`,
        String(d), nums([(a + b) / 2, d + 1, d - 1, d + 2].filter((x) => x > 0 && Number.isInteger(x))),
        `Together: 1/${a} + 1/${b} = 1/${d} of the work per day.`);
    }),

    [[4, 6], [3, 6], [10, 15], [12, 18], [4, 12], [8, 24], [6, 10], [10, 30]].map(([a, b]) => {
      const t = (a * b) / (b - a);
      return numeric(WORK, "HARD",
        `Pipe A can fill a tank in ${a} hours and pipe B can empty it in ${b} hours. If both are opened together, in how many hours will the empty tank be filled?`,
        `पाइप A एक टंकी को ${a} घंटे में भर सकता है और पाइप B उसे ${b} घंटे में खाली कर सकता है। दोनों को एक साथ खोलने पर खाली टंकी कितने घंटे में भरेगी?`,
        String(t), nums([(a * b) / (a + b), t + 2, t - 2, b - a].filter((x) => x > 0 && Number.isInteger(x))),
        `Net rate = 1/${a} − 1/${b} = 1/${t}.`);
    }),

    unique(6, () => {
      const m1 = between(4, 20), d1 = between(6, 30);
      const work = m1 * d1;
      const options = Array.from({ length: 40 }, (_, i) => i + 2).filter((m) => m !== m1 && work % m === 0 && work / m > 1);
      const m2 = pick(options);
      const d2 = work / m2;
      return numeric(WORK, "EASY",
        `${m1} men can finish a job in ${d1} days. How many days will ${m2} men take to finish it?`,
        `${m1} व्यक्ति किसी काम को ${d1} दिनों में पूरा करते हैं। ${m2} व्यक्ति उसे कितने दिनों में पूरा करेंगे?`,
        String(d2), nums(nearBy(d2)), `${m1} × ${d1} = ${m2} × d, so d = ${d2}.`);
    }),

    unique(10, () => {
      const [a, b] = pick([[2, 3], [3, 5], [4, 5], [5, 7], [3, 7], [1, 4], [7, 8], [5, 9]]);
      const n = (a + b) * 100 * between(1, 6);
      const big = (n * b) / (a + b), small = (n * a) / (a + b);
      return numeric(RATIO, "EASY",
        `${inr(n)} is divided in the ratio ${a} : ${b}. What is the larger share?`,
        `${inr(n)} को ${a} : ${b} के अनुपात में बाँटा जाता है। बड़ा भाग कितना है?`,
        inr(big), nums([small, n / 2, big + n / (a + b), big - n / (a + b) / 2].filter((x) => x !== big), inr),
        `Larger share = ${n} × ${b}/${a + b} = ${inr(big)}.`);
    }),

    unique(6, () => {
      const r1 = between(1, 5), r2 = pick([1, 2, 3, 4, 5].filter((r) => r !== r1));
      const x = r1 * 5000, y = r2 * 5000, profit = (r1 + r2) * 1000 * between(1, 6);
      const share = (profit * r1) / (r1 + r2);
      return numeric(RATIO, "MEDIUM",
        `A invests ${inr(x)} and B invests ${inr(y)} for the same period. Out of a profit of ${inr(profit)}, what is A's share?`,
        `A ${inr(x)} और B ${inr(y)} समान अवधि के लिए निवेश करते हैं। ${inr(profit)} के लाभ में A का हिस्सा कितना है?`,
        inr(share), nums([profit - share, profit / 2, share + 1000, share + 500, share - 500, share + 1500].filter((v) => v > 0 && v !== share), inr),
        `Profit is shared ${r1} : ${r2}, so A gets ${inr(share)}.`);
    }),

    unique(5, () => {
      const a = between(2, 9), b = a * between(2, 5), c = between(2, 12) * a;
      const d = (b * c) / a;
      return numeric(RATIO, "MEDIUM", `Find the fourth proportional to ${a}, ${b} and ${c}.`,
        `${a}, ${b} और ${c} का चतुर्थानुपाती ज्ञात कीजिए।`, String(d), nums(nearBy(d)), `a : b = c : d, so d = ${b} × ${c}/${a} = ${d}.`);
    }),

    unique(8, () => {
      const xs = Array.from({ length: 5 }, () => between(10, 90));
      xs[4] += (5 - (xs.reduce((s, x) => s + x, 0) % 5)) % 5;
      const avg = xs.reduce((s, x) => s + x, 0) / 5;
      return numeric(AVG, "EASY", `What is the average of ${xs.join(", ")}?`, `${xs.join(", ")} का औसत क्या है?`,
        String(avg), nums(nearBy(avg)), `Sum = ${avg * 5}, divided by 5 = ${avg}.`);
    }),

    unique(6, () => {
      const m = between(20, 60);
      let x = between(10, 90);
      while ((5 * m - x) % 4 !== 0) x++;
      const rest = (5 * m - x) / 4;
      return numeric(AVG, "MEDIUM",
        `The average of 5 numbers is ${m}. If one number, ${x}, is removed, what is the average of the remaining numbers?`,
        `5 संख्याओं का औसत ${m} है। यदि एक संख्या ${x} हटा दी जाए, तो शेष संख्याओं का औसत क्या होगा?`,
        String(rest), nums([m, ...nearBy(rest)]), `Total = ${5 * m}; without ${x} it is ${5 * m - x}, over 4 numbers = ${rest}.`);
    }),

    unique(5, () => {
      const a = between(20, 40), b = a + between(10, 30), c = between(a + 2, b - 2);
      const g1 = gcd(b - c, c - a);
      const r = (x: number, y: number) => `${x} : ${y}`;
      const right = r((b - c) / g1, (c - a) / g1);
      const g2 = gcd(c - a, b - a), g3 = gcd(b - c, b - a);
      return numeric(AVG, "HARD",
        `In what ratio must rice at ${inr(a)}/kg be mixed with rice at ${inr(b)}/kg to get a mixture worth ${inr(c)}/kg?`,
        `${inr(a)}/किग्रा और ${inr(b)}/किग्रा वाले चावल को किस अनुपात में मिलाया जाए कि मिश्रण ${inr(c)}/किग्रा का हो?`,
        right, [r((c - a) / g1, (b - c) / g1), r((c - a) / g2, (b - a) / g2), r((b - c) / g3, (b - a) / g3), r(1, 1), r(2, 1), r(1, 2), r(3, 2), r(2, 3)],
        `By alligation: (${b} − ${c}) : (${c} − ${a}) = ${right}.`);
    }),

    unique(6, () => {
      const a = between(4, 30);
      const b = pick(Array.from({ length: 27 }, (_, i) => i + 4).filter((x) => x !== a));
      const l = lcm(a, b);
      return numeric(NUM, "EASY", `What is the LCM of ${a} and ${b}?`, `${a} और ${b} का लघुत्तम समापवर्त्य (LCM) क्या है?`,
        String(l), nums([gcd(a, b), a * b, l * 2, l + a].filter((x) => x !== l)));
    }),

    unique(6, () => {
      const g = between(2, 15), m = between(2, 9);
      const a = g * m, b = g * pick([2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== m));
      const h = gcd(a, b);
      return numeric(NUM, "EASY", `What is the HCF of ${a} and ${b}?`, `${a} और ${b} का महत्तम समापवर्तक (HCF) क्या है?`,
        String(h), nums([h * 2, Math.max(1, h / 2), lcm(a, b), h + 1, h + 3].filter((x) => Number.isInteger(x) && x !== h)));
    }),

    unique(8, () => {
      const e = between(2, 9), d = e * between(2, 12), a = between(5, 40), b = between(2, 12), c = between(2, 12);
      const ans = a + b * c - d / e;
      const leftToRight = ((a + b) * c - d) / e;
      return numeric(NUM, "EASY", `Simplify: ${a} + ${b} × ${c} − ${d} ÷ ${e}`, `सरल कीजिए: ${a} + ${b} × ${c} − ${d} ÷ ${e}`,
        String(ans), nums([leftToRight, ans + 2, ans - 3, ans + 5].filter((x) => Number.isInteger(x) && x > 0)),
        `Multiply and divide first: ${a} + ${b * c} − ${d / e} = ${ans}.`);
    }),

    unique(5, () => {
      const b = pick([2, 3, 7, 8, 9]), n = between(10, 99);
      const ans = Number((BigInt(b) ** BigInt(n) % 10n).toString());
      return numeric(NUM, "MEDIUM", `What is the unit digit of ${b}<sup>${n}</sup>?`, `${b}<sup>${n}</sup> का इकाई अंक क्या है?`,
        String(ans), nums([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== ans)),
        `Unit digits of powers of ${b} repeat every 4; ${n} mod 4 gives ${ans}.`);
    }),

    [2, 4, 5, 6, 7, 8].map((k) =>
      numeric(ALG, "HARD", `If x + 1/x = ${k}, what is the value of x<sup>2</sup> + 1/x<sup>2</sup>?`,
        `यदि x + 1/x = ${k}, तो x<sup>2</sup> + 1/x<sup>2</sup> का मान क्या है?`,
        String(k * k - 2), nums([k * k, k * k + 2, k * k - 1, 2 * k]),
        `Square both sides: x² + 2 + 1/x² = ${k * k}, so x² + 1/x² = ${k * k - 2}.`)),

    unique(8, () => {
      const x = between(2, 15), a = between(2, 9), b = between(1, 20);
      return numeric(ALG, "EASY", `If ${a}x − ${b} = ${a * x - b}, what is the value of x?`,
        `यदि ${a}x − ${b} = ${a * x - b}, तो x का मान क्या है?`, String(x), nums(nearBy(x)),
        `${a}x = ${a * x}, so x = ${x}.`);
    }),

    unique(5, () => {
      const a = between(1, 9), b = between(1, 9);
      const s = a + b, pr = a * b;
      return numeric(ALG, "MEDIUM", `If a + b = ${s} and ab = ${pr}, find the value of a<sup>2</sup> + b<sup>2</sup>.`,
        `यदि a + b = ${s} और ab = ${pr}, तो a<sup>2</sup> + b<sup>2</sup> का मान ज्ञात कीजिए।`,
        String(s * s - 2 * pr), nums([s * s, s * s + 2 * pr, s * s - pr, s * s - 2 * pr + 2].filter((x) => x !== s * s - 2 * pr)),
        `a² + b² = (a + b)² − 2ab = ${s * s} − ${2 * pr} = ${s * s - 2 * pr}.`);
    }),

    [7, 14, 21, 28, 35, 42].map((r) =>
      numeric(GEO, "EASY", `What is the area of a circle of radius ${r} cm? (Take π = 22/7)`,
        `${r} सेमी त्रिज्या वाले वृत्त का क्षेत्रफल क्या है? (π = 22/7 लीजिए)`,
        `${(22 * r * r) / 7} cm²`, nums([(44 * r) / 7, (22 * r * r) / 7 + 22, (22 * 4 * r * r) / 7, (22 * r * r) / 7 - 44], (n) => `${n} cm²`),
        `Area = 22/7 × ${r} × ${r} = ${(22 * r * r) / 7} cm².`)),

    [7, 14, 21, 35].map((r) =>
      numeric(GEO, "EASY", `What is the circumference of a circle of radius ${r} cm? (Take π = 22/7)`,
        `${r} सेमी त्रिज्या वाले वृत्त की परिधि क्या है? (π = 22/7 लीजिए)`,
        `${(44 * r) / 7} cm`, nums([(22 * r) / 7, (22 * r * r) / 7, (44 * r) / 7 + 11, (44 * r) / 7 - 11], (n) => `${n} cm`),
        `Circumference = 2 × 22/7 × ${r} = ${(44 * r) / 7} cm.`)),

    unique(6, () => {
      const l = between(8, 40), b = between(3, l - 1);
      return pick([true, false])
        ? numeric(GEO, "EASY", `A rectangle is ${l} m long and ${b} m wide. What is its perimeter?`,
            `एक आयत ${l} मीटर लंबा और ${b} मीटर चौड़ा है। उसका परिमाप क्या है?`,
            `${2 * (l + b)} m`, nums([l + b, l * b, 2 * (l + b) + 4, 2 * (l + b) - 2], (n) => `${n} m`))
        : numeric(GEO, "EASY", `A rectangle is ${l} m long and ${b} m wide. What is its area?`,
            `एक आयत ${l} मीटर लंबा और ${b} मीटर चौड़ा है। उसका क्षेत्रफल क्या है?`,
            `${l * b} m²`, nums([2 * (l + b), l * b + l, l * b - b, l * b + 10], (n) => `${n} m²`));
    }),

    [3, 4, 5, 6, 8].map((a) =>
      numeric(GEO, "EASY", `What is the volume of a cube with an edge of ${a} cm?`, `${a} सेमी भुजा वाले घन का आयतन क्या है?`,
        `${a ** 3} cm³`, nums([a * a, 6 * a * a, a ** 3 + a, 3 * a], (n) => `${n} cm³`), `Volume = ${a}³ = ${a ** 3} cm³.`)),

    unique(4, () => {
      const b = between(2, 15) * 2, h = between(3, 20);
      return numeric(GEO, "EASY", `What is the area of a triangle with base ${b} cm and height ${h} cm?`,
        `${b} सेमी आधार और ${h} सेमी ऊँचाई वाले त्रिभुज का क्षेत्रफल क्या है?`,
        `${(b * h) / 2} cm²`, nums([b * h, (b * h) / 2 + h, b + h, (b * h) / 2 - b].filter((x) => x > 0), (n) => `${n} cm²`),
        `Area = ½ × ${b} × ${h} = ${(b * h) / 2} cm².`);
    }),

    ([
      ["sin 30°", "1/2"], ["cos 0°", "1"], ["tan 60°", "√3"], ["sin 60°", "√3/2"],
      ["tan 30°", "1/√3"], ["sec 60°", "2"], ["sin 45°", "1/√2"], ["cos 90°", "0"],
    ] as const).map(([expr, ans]) =>
      numeric(TRIG, "EASY", `What is the value of ${expr}?`, `${expr} का मान क्या है?`,
        ans, ["0", "1/2", "1", "√3/2", "√3", "1/√3", "2", "1/√2"].filter((x) => x !== ans))),

    [10, 20, 30, 40, 50].map((d) =>
      numeric(TRIG, "MEDIUM",
        `From a point ${d} m from the foot of a tower, the angle of elevation of its top is 45°. How tall is the tower?`,
        `किसी मीनार के आधार से ${d} मीटर दूर स्थित एक बिंदु से उसके शिखर का उन्नयन कोण 45° है। मीनार की ऊँचाई कितनी है?`,
        `${d} m`, [`${d}√3 m`, `${d / 2} m`, `${2 * d} m`, `${d}/√3 m`], `tan 45° = 1, so height = distance = ${d} m.`)),
  ];
}
